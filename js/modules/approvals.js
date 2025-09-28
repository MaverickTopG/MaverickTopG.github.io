import { appState } from './state.js';
import { showMessage, triggerListAnimation } from './ui.js';
import { db } from './firebase.js';
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { editVolunteerHours } from './volunteerOps.js';

const SECTION_ID = 'approvalsSection';

const approvalsState = {
  filters: {
    person: 'all',
    status: 'all',
    startDate: '',
    endDate: ''
  },
  expandedIds: new Set(),
  initialized: false,
  eventsBound: false
};

export function initApprovalsModule() {
  renderApprovalQueue();
  bindApprovalEvents();
}

export function renderApprovalQueue(options = {}) {
  const host = document.getElementById(SECTION_ID);
  if (!host) {
    return;
  }

  ensureBaseLayout(host);
  const dataset = buildApprovalsDataset();
  pruneSelections(dataset.filteredLogs);
  updateFiltersUI(dataset);
  updateSummary(dataset);
  updateTable(dataset, options);
}

function ensureBaseLayout(host) {
  if (approvalsState.initialized) {
    return;
  }

  host.innerHTML = `
    <div class="approvals-shell">
      <div class="approvals-summary">
        <div class="summary-text" id="approvalsSummaryText">Total Hours: 0h 00m</div>
        <div class="summary-actions">
        </div>
      </div>
      <div class="approvals-filters-row">
        <div class="filter-field">
          <label for="approvalPeopleFilter">People</label>
          <select id="approvalPeopleFilter"></select>
        </div>
        <div class="filter-field">
          <label for="approvalStatusFilter">Status</label>
          <select id="approvalStatusFilter">
            <option value="all">All statuses</option>
            <option value="pending">Pending only</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
            <option value="changes-requested">Needs changes</option>
          </select>
        </div>
      </div>
      <div class="approvals-table-wrapper">
        <table class="approvals-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Hours</th>
              <th>Status</th>
              <th>Event</th>
              <th>Host</th>
              <th class="centered-header">Actions</th>
            </tr>
          </thead>
          <tbody id="approvalsTableBody"></tbody>
        </table>
      </div>
    </div>
  `;

  approvalsState.initialized = true;
}

function buildApprovalsDataset() {
  const allLogs = (appState.activityData || [])
    .filter((log) => log && log.id)
    .map((log) => ({ ...log }));

  const peopleIndex = buildPeopleIndex(allLogs);
  const filteredLogs = applyFilters(allLogs, approvalsState.filters);

  filteredLogs.sort((a, b) => {
    const dateA = getLogTimestamp(b);
    const dateB = getLogTimestamp(a);
    return dateA - dateB;
  });

  const totalHours = filteredLogs.reduce((sum, log) => sum + getLogHours(log), 0);

  return {
    allLogs,
    filteredLogs,
    peopleIndex,
    totalHours
  };
}

function buildPeopleIndex(logs) {
  const map = new Map();

  logs.forEach((log) => {
    const volunteerId = getVolunteerId(log);
    if (!volunteerId) {
      return;
    }

    if (!map.has(volunteerId)) {
      const volunteer = appState.volunteersData.find((member) => member.id === volunteerId);
      const fallbackEmail = log.volunteer_email || log.email || '';
      const fallbackName = volunteer ? volunteer.firstName : log.volunteer_name || (fallbackEmail.includes('@') ? fallbackEmail.split('@')[0] : fallbackEmail || 'Volunteer');
      map.set(volunteerId, {
        id: volunteerId,
        name: volunteer ? (volunteer.firstName || volunteer.email || fallbackName) : fallbackName,
        email: volunteer ? (volunteer.email || fallbackEmail) : fallbackEmail,
        pendingCount: 0,
        pendingHours: 0,
        totalHours: 0
      });
    }

    const entry = map.get(volunteerId);
    const hours = getLogHours(log);
    entry.totalHours += hours;

    const status = normalizeStatus(log.approve);
    if (status === 'pending') {
      entry.pendingCount += 1;
      entry.pendingHours += hours;
    }
  });

  return map;
}

function applyFilters(logs, filters) {
  const startDate = filters.startDate ? new Date(filters.startDate) : null;
  const endDate = filters.endDate ? new Date(filters.endDate) : null;

  if (startDate) {
    startDate.setHours(0, 0, 0, 0);
  }
  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  return logs.filter((log) => {
    const status = normalizeStatus(log.approve);
    const volunteerId = getVolunteerId(log);
    const timestamp = getLogTimestamp(log);

    if (filters.person !== 'all' && volunteerId !== filters.person) {
      return false;
    }

    if (filters.status === 'pending' && status !== 'pending') {
      return false;
    }
    if (filters.status === 'approved' && status !== 'approved') {
      return false;
    }
    if (filters.status === 'denied' && status !== 'denied') {
      return false;
    }
    if (filters.status === 'changes-requested' && status !== 'changes-requested') {
      return false;
    }

    if (startDate && (!timestamp || timestamp < startDate)) {
      return false;
    }
    if (endDate && (!timestamp || timestamp > endDate)) {
      return false;
    }

    return true;
  });
}

function updateFiltersUI(dataset) {
  const peopleSelect = document.getElementById('approvalPeopleFilter');
  if (peopleSelect) {
    const options = buildPeopleOptions(dataset.peopleIndex);
    peopleSelect.innerHTML = options.markup;
    if (!options.values.includes(approvalsState.filters.person)) {
      approvalsState.filters.person = 'all';
    }
    peopleSelect.value = approvalsState.filters.person;
  }

  const statusSelect = document.getElementById('approvalStatusFilter');
  if (statusSelect) {
    statusSelect.value = approvalsState.filters.status;
  }

  const startInput = document.getElementById('approvalStartDate');
  if (startInput) {
    startInput.value = approvalsState.filters.startDate;
  }

  const endInput = document.getElementById('approvalEndDate');
  if (endInput) {
    endInput.value = approvalsState.filters.endDate;
  }
}

function buildPeopleOptions(peopleIndex) {
  const values = ['all'];
  let markup = '<option value="all">All People</option>';

  const entries = Array.from(peopleIndex.values()).sort((a, b) => a.name.localeCompare(b.name));
  entries.forEach((entry) => {
    values.push(entry.id);
    const pendingTag = entry.pendingCount ? ` (${entry.pendingCount} pending)` : '';
    markup += `<option value="${entry.id}">${escapeHtml(entry.name)}${pendingTag}</option>`;
  });

  return { markup, values };
}

function updateSummary(dataset) {
  const summaryElement = document.getElementById('approvalsSummaryText');
  if (!summaryElement) {
    return;
  }

  const totalHours = dataset.totalHours;
  let label = 'Total Hours';

  if (approvalsState.filters.status === 'pending') {
    label = 'Total Pending Hours';
  } else if (approvalsState.filters.status === 'approved') {
    label = 'Total Approved Hours';
  } else if (approvalsState.filters.status === 'denied') {
    label = 'Total Denied Hours';
  } else if (approvalsState.filters.status === 'changes-requested') {
    label = 'Total Hours Needing Changes';
  }

  if (approvalsState.filters.person !== 'all') {
    const personEntry = dataset.peopleIndex.get(approvalsState.filters.person);
    const personName = personEntry ? personEntry.name : 'Volunteer';
    label += ` for ${personName}`;
  }

  summaryElement.textContent = `${label}: ${formatHourDuration(totalHours)}`;
}

function updateTable(dataset, options = {}) {
  const tbody = document.getElementById('approvalsTableBody');
  if (!tbody) {
  }

  if (!dataset.filteredLogs.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-table-row">No submissions match your filters yet.</td></tr>';
    const selectAll = document.getElementById('approvalSelectAll');
    if (selectAll) {
      selectAll.checked = false;
    }
    return;
  }

  const rows = dataset.filteredLogs.map((log) => renderApprovalRow(log)).join('');
  tbody.innerHTML = rows;

  // Trigger animation unless explicitly skipped (e.g., after an approval action).
  if (!options.skipAnimation) {
    triggerListAnimation('#approvalsTableBody .approval-row');
  }
}

function renderApprovalRow(log) {
  const logId = log.id;
  const status = normalizeStatus(log.approve);  
  const isExpanded = approvalsState.expandedIds.has(logId);
  const timestamp = getLogTimestamp(log);
  const displayDate = timestamp ? timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const displayTime = timestamp ? timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  const hoursLabel = formatHourDuration(getLogHours(log));
  const statusLabel = formatStatusLabel(status);
  const source = log.source || log.entry_source || 'Portal';
  const volunteerName = getVolunteerDisplayName(log);
  const eventName = log.event || log.event_name || log.site || '—';
  const hostName = getHostName(log);
  const hostInitials = computeInitials(hostName);
  const rowClasses = [`approval-row`, `status-${status}`];
  if (isExpanded) {
    rowClasses.push('expanded');
  }

  return `
    <tr class="${rowClasses.join(' ')}" data-log-id="${logId}">
      <td>
        <div class="when-cell">
          <div class="when-text">
            <div class="when-date">${escapeHtml(displayDate)}</div>
            <div class="when-time">${escapeHtml(displayTime)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(volunteerName)}</td>
      <td>${hoursLabel}</td>
      <td><span class="status-chip status-${status}">${statusLabel}</span></td>
      <td>${escapeHtml(eventName)}</td>
      <td>
        <div class="host-meta">
          <span class="host-avatar">${hostInitials}</span>
          <span>${escapeHtml(hostName)}</span>
        </div>
      </td>
      <td>
        <div class="approval-actions">
          <button class="btn-icon" type="button" data-action="approve-row" data-log-id="${logId}" title="Approve">
            <i class="fas fa-check"></i>
          </button>
          <button class="btn-icon" type="button" data-action="deny-row" data-log-id="${logId}" title="Deny">
            <i class="fas fa-ban"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function gatherNotes(log) {
  if (log.notes) {
    return log.notes;
  }
  if (log.comment) {
    return log.comment;
  }
  if (log.submitted_note) {
    return log.submitted_note;
  }
  return '';
}

function renderAttachments(attachments) {
  const safeList = attachments
    .filter((item) => item)
    .map((item, index) => {
      const label = typeof item === 'string' ? item : (item.name || `Attachment ${index + 1}`);
      const href = typeof item === 'string' ? item : (item.url || '#');
      const safeLabel = escapeHtml(label);
      const safeHref = encodeURI(href);
      return `<li><a href="${safeHref}" target="_blank" rel="noopener">${safeLabel}</a></li>`;
    });

  if (!safeList.length) {
    return '';
  }

  return `<div><strong>Attachments:</strong><ul>${safeList.join('')}</ul></div>`;
}

function pruneSelections(filteredLogs) {
  const validIds = new Set(filteredLogs.map((log) => log.id));
  const expandedToRemove = [];
  approvalsState.expandedIds.forEach((id) => {
    if (!validIds.has(id)) {
      expandedToRemove.push(id);
    }
  });
  expandedToRemove.forEach((id) => approvalsState.expandedIds.delete(id));
}

function bindApprovalEvents() {
  if (approvalsState.eventsBound) {
    return;
  }

  const host = document.getElementById(SECTION_ID);
  if (!host) {
    return;
  }

  host.addEventListener('change', handleApprovalsChange);
  host.addEventListener('click', handleApprovalsClick);

  approvalsState.eventsBound = true;
}

function handleApprovalsChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.id === 'approvalPeopleFilter') {
    approvalsState.filters.person = target.value || 'all';
    renderApprovalQueue();
    return;
  }

  if (target.id === 'approvalStatusFilter') {
    approvalsState.filters.status = target.value || 'all';
    renderApprovalQueue();
    return;
  }
}

function handleApprovalsClick(event) {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  if (action === 'toggle-details') {
    const logId = button.dataset.logId;
    if (logId) {
      toggleDetails(logId);
    }
    return;
  }

  const logId = button.dataset.logId;
  if (!logId) {
    return;
  }

  if (action === 'approve-row') {
    updateApproval(logId, 'approved');
    return;
  }

  if (action === 'deny-row') {
    updateApproval(logId, 'denied');
  }
}

function toggleDetails(logId) {
  if (approvalsState.expandedIds.has(logId)) {
    approvalsState.expandedIds.delete(logId);
  } else {
    approvalsState.expandedIds.add(logId);
  }
  renderApprovalQueue();
}

async function updateApproval(logId, status, note = '', options = {}) {
  if (!logId) {
    return;
  }

  const normalizedStatus = normalizeStatus(status);
  const dbStatus = normalizedStatus === 'approved' ? 'accepted' : normalizedStatus;
  const currentAdmin = appState.currentAdmin || {};
  const timestamp = new Date().toISOString();
  const historyEntry = {
    status: dbStatus,
    note,
    by: currentAdmin.email || 'Admin',
    at: timestamp
  };

  try {
    await updateDoc(doc(db, 'volunteer_logs', logId), {
      approve: dbStatus,
      approvalNote: note,
      approvalUpdatedAt: serverTimestamp(),
      approvalUpdatedBy: currentAdmin.uid || null,
      approvalHistory: arrayUnion(historyEntry)
    });

    applyLocalApprovalUpdate(logId, dbStatus, note, historyEntry);
    approvalsState.expandedIds.delete(logId);

    if (options.silent !== true) {
      const messageLabel = normalizedStatus === 'approved'
        ? 'approved'
        : normalizedStatus === 'denied'
          ? 'denied'
          : normalizedStatus === 'changes-requested'
            ? 'flagged for changes'
            : normalizedStatus;
      const messageType = normalizedStatus === 'approved' ? 'success' : normalizedStatus === 'denied' ? 'error' : 'info';
      renderApprovalQueue({ skipAnimation: true });
      showMessage(`Log ${messageLabel}.`, messageType);
    }
  } catch (error) {
    console.error('Failed to update approval status', error);
    showMessage('Failed to update approval status. Try again later.', 'error');
    throw error;
  }
}

function applyLocalApprovalUpdate(logId, status, note, historyEntry) {
  const log = appState.activityData.find((item) => item.id === logId);
  if (!log) {
    return;
  }
  log.approve = status;
  if (typeof note === 'string') {
    log.approvalNote = note;
  }
  log.approvalUpdatedBy = (appState.currentAdmin && appState.currentAdmin.uid) || log.approvalUpdatedBy || null;
  log.approvalUpdatedAt = historyEntry.at;
  if (Array.isArray(log.approvalHistory)) {
    log.approvalHistory = [...log.approvalHistory, historyEntry];
  } else {
    log.approvalHistory = [historyEntry];
  }
}

function getVolunteerId(log) {
  if (!log) {
    return '';
  }
  if (log.user_id) {
    return log.user_id;
  }
  if (log.volunteer_id) {
    return log.volunteer_id;
  }
  if (log.volunteer_email) {
    return log.volunteer_email;
  }
  if (log.email) {
    return log.email;
  }
  return '';
}

function getVolunteerDisplayName(log) {
  const volunteerId = getVolunteerId(log);
  if (volunteerId) {
    const volunteer = appState.volunteersData.find((member) => member.id === volunteerId);
    if (volunteer) {
      return volunteer.firstName || volunteer.email || volunteerId;
    }
  }
  return log.volunteer_name || log.firstName || log.volunteer_email || log.email || 'Volunteer';
}

function getHostName(log) {
  if (log.host) {
    return log.host;
  }
  if (log.host_name) {
    return log.host_name;
  }
  if (appState.currentAdmin && appState.currentAdmin.organizationName) {
    return appState.currentAdmin.organizationName;
  }
  return 'NexoLink';
}

function getLogTimestamp(log) {
  if (!log) {
    return null;
  }

  if (log.created_at && typeof log.created_at.toDate === 'function') {
    return log.created_at.toDate();
  }

  if (log.submitted_at && typeof log.submitted_at.toDate === 'function') {
    return log.submitted_at.toDate();
  }

  if (log.timestamp && typeof log.timestamp.toDate === 'function') {
    return log.timestamp.toDate();
  }

  if (log.date) {
    const date = new Date(log.date);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

function getLogHours(log) {
  return parseFloat(log.hours_contributed || log.hours) || 0;
}

function normalizeStatus(status) {
  const raw = (status || 'pending').toString().toLowerCase();
  if (raw === 'accepted' || raw.startsWith('approved by') || raw === 'approved' || raw === 'success') {
    return 'approved';
  }
  if (raw === 'denied' || raw.startsWith('denied by') || raw === 'rejected') {
    return 'denied';
  }
  if (raw.startsWith('awaiting')) {
    return 'pending';
  }
  if (raw === 'changes-requested' || raw === 'needs-changes' || raw === 'requested') {
    return 'changes-requested';
  }
  return 'pending';
}

function formatStatusLabel(status) {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'denied':
      return 'Denied';
    case 'changes-requested':
      return 'Needs Changes';
    case 'pending':
    default:
      return 'Pending';
  }
}

function formatHourDuration(totalHours) {
  const hoursValue = Number(totalHours) || 0;
  const wholeHours = Math.floor(hoursValue);
  const minutes = Math.round((hoursValue - wholeHours) * 60);
  return `${wholeHours}h ${String(minutes).padStart(2, '0')}m`;
}

function computeInitials(name) {
  if (!name) {
    return 'N';
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${(parts[0][0] || '').toUpperCase()}${(parts[parts.length - 1][0] || '').toUpperCase()}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInputValue(id) {
  const input = document.getElementById(id);
  return input ? input.value : '';
}