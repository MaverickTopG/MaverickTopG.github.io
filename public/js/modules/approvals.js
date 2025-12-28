import { appState } from './state.js';
import { showMessage, triggerListAnimation } from './ui.js';
import { db } from './firebase.js';
import {
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { editVolunteerHours, notifyVolunteersUpdate } from './volunteerOps.js';

const SECTION_ID = 'approvalsSection';

const approvalsState = {
  filters: {
    person: 'all',
    status: 'pending',
    startDate: '',
    endDate: ''
  },
  expandedIds: new Set(),
  initialized: false,
  eventsBound: false,
  defaultShareActive: false,
};

export function initApprovalsModule() {
  loadDefaultShareRequests();
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
  renderDefaultShareRequests(dataset.shareRequests);
  toggleDefaultShareView();
  updateTable(dataset, options);
  bindDefaultShareEvents();
}

function ensureBaseLayout(host) {
  if (approvalsState.initialized) {
    return;
  }

  host.innerHTML = `
    <div class="approvals-summary">
      <div class="summary-text" id="approvalsSummaryText">Pending hours awaiting review: 0h 00m</div>
      <div class="summary-actions">
        <button type="button" class="btn-primary default-share-btn" id="defaultShareModalBtn">
          <i class="fas fa-share-nodes"></i>
          <span class="btn-label" id="defaultShareBtnLabel">Default Sharing</span>
          <span class="count-pill" id="defaultShareCount" hidden>0</span>
        </button>
      </div>
    </div>
    <div class="approvals-table-wrapper" id="approvalsTableWrapper">
      <table class="approvals-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Hours</th>
            <th>Status</th>
            <th>Event</th>
            <th>Host</th>
            <th>Checked In</th>
            <th class="centered-header">Actions</th>
          </tr>
        </thead>
        <tbody id="approvalsTableBody"></tbody>
      </table>
    </div>
    <section class="default-share-panel" id="defaultSharePanel" hidden>
      <header class="default-share-header">
        <div>
          <h2>Default Sharing Requests</h2>
          <p id="defaultShareSubtitle">Volunteers can ask to auto-share their approved hours.</p>
        </div>
      </header>
      <div id="defaultShareQueue" class="share-requests-list"></div>
    </section>
  `;

  approvalsState.initialized = true;
}

function buildApprovalsDataset() {
  const actionableLogs = (appState.activityData || [])
    .filter((log) => log && log.id)
    .map((log) => ({ ...log }));

  const pendingLogs = actionableLogs.filter((log) => normalizeStatus(log.approve) === 'pending');
  const peopleIndex = buildPeopleIndex(pendingLogs);
  const filteredLogs = applyFilters(pendingLogs, approvalsState.filters);

  filteredLogs.sort((a, b) => {
    const dateA = getLogTimestamp(b);
    const dateB = getLogTimestamp(a);
    return dateA - dateB;
  });

  const totalHours = filteredLogs.reduce((sum, log) => sum + getLogHours(log), 0);

  const shareRequests = buildShareRequestsDataset();

  return {
    actionableLogs,
    filteredLogs,
    peopleIndex,
    totalHours,
    shareRequests,
  };
}

function buildShareRequestsDataset() {
  const records = Array.isArray(appState.defaultShareRequests)
    ? appState.defaultShareRequests.map((request) => ({ ...request }))
    : [];

  records.sort((a, b) => parseRequestTimestamp(b) - parseRequestTimestamp(a));

  const pending = records.filter((request) => normalizeShareRequestStatus(request.status) === 'pending');
  const resolved = records.filter((request) => normalizeShareRequestStatus(request.status) !== 'pending');

  return {
    all: records,
    pending,
    resolved,
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
      const fallbackEmail = (log.volunteer_email || log.email || '').trim();
      const fallbackName = volunteer
        ? volunteer.firstName
        : log.volunteer_name || fallbackEmail || 'Volunteer';
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

    if (status !== 'pending') {
      return false;
    }

    if (filters.person !== 'all' && volunteerId !== filters.person) {
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
  const startInput = document.getElementById('approvalStartDate');
  if (startInput) {
    startInput.value = approvalsState.filters.startDate;
  }

  const endInput = document.getElementById('approvalEndDate');
  if (endInput) {
    endInput.value = approvalsState.filters.endDate;
  }
}

function updateSummary(dataset) {
  const summaryElement = document.getElementById('approvalsSummaryText');
  if (!summaryElement) {
    return;
  }

  const totalHours = dataset.totalHours;
  let label = 'Pending hours awaiting review';

  if (approvalsState.filters.person !== 'all') {
    const personEntry = dataset.peopleIndex.get(approvalsState.filters.person);
    const personName = personEntry ? personEntry.name : 'Volunteer';
    label = `Pending hours for ${personName}`;
  }

  const shareRequestCount = dataset.shareRequests
    ? dataset.shareRequests.pending.length
    : 0;
  const shareSuffix = shareRequestCount
    ? ` • Default sharing requests: ${shareRequestCount}`
    : '';

  summaryElement.textContent = `${label}: ${formatHourDuration(totalHours)}${shareSuffix}`;
}

function renderDefaultShareRequests(shareDataset = { pending: [], resolved: [] }) {
  const list = document.getElementById('defaultShareQueue');
  const subtitle = document.getElementById('defaultShareSubtitle');
  const countBadge = document.getElementById('defaultShareCount');
  if (!list) {
    return;
  }

  const pending = Array.isArray(shareDataset.pending) ? shareDataset.pending : [];
  if (countBadge) {
    if (pending.length > 0) {
      countBadge.hidden = false;
      countBadge.textContent = `${pending.length}`;
    } else {
      countBadge.hidden = true;
      countBadge.textContent = '0';
    }
  }

  if (subtitle) {
    subtitle.textContent = pending.length
      ? `${pending.length} pending request${pending.length === 1 ? '' : 's'} awaiting review.`
      : 'All caught up — no pending requests right now.';
  }

  const pendingMarkup = pending.length
    ? pending.map((request) => renderShareRequestCard(request, { resolved: false })).join('')
    : '<div class="empty-share-request">No pending requests.</div>';

  list.innerHTML = `
    <div class="share-request-pending">
      ${pendingMarkup}
    </div>
  `;
}

function toggleDefaultShareView() {
  const tableWrapper = document.getElementById('approvalsTableWrapper');
  const sharePanel = document.getElementById('defaultSharePanel');
  const defaultShareBtn = document.getElementById('defaultShareModalBtn');
  const defaultShareBtnLabel = document.getElementById('defaultShareBtnLabel');

  if (approvalsState.defaultShareActive) {
    if (tableWrapper) tableWrapper.hidden = true;
    if (sharePanel) sharePanel.hidden = false;
    if (defaultShareBtn) {
      defaultShareBtn.classList.add('btn-active');
      defaultShareBtn.setAttribute('aria-pressed', 'true');
    }
    if (defaultShareBtnLabel) {
      defaultShareBtnLabel.textContent = 'Go back to Approvals';
    }
  } else {
    if (tableWrapper) tableWrapper.hidden = false;
    if (sharePanel) sharePanel.hidden = true;
    if (defaultShareBtn) {
      defaultShareBtn.classList.remove('btn-active');
      defaultShareBtn.setAttribute('aria-pressed', 'false');
    }
    if (defaultShareBtnLabel) {
      defaultShareBtnLabel.textContent = 'Default Sharing';
    }
  }
}

function bindDefaultShareEvents() {
  const openBtn = document.getElementById('defaultShareModalBtn');
  if (openBtn && !openBtn.dataset.bound) {
    openBtn.addEventListener('click', () => {
      approvalsState.defaultShareActive = !approvalsState.defaultShareActive;
      renderApprovalQueue({ skipAnimation: true });
    });
    openBtn.dataset.bound = 'true';
  }

  const panel = document.getElementById('defaultSharePanel');
  if (panel && !panel.dataset.bound) {
    panel.addEventListener('click', (event) => {
      const approveBtn = event.target.closest('[data-share-request-approve]');
      if (approveBtn) {
        approveDefaultShareRequest(approveBtn.dataset.shareRequestApprove).catch((error) => {
          console.error('approve default share error', error);
          showMessage('Unable to approve default sharing request. Please try again.', 'error');
        });
        return;
      }
      const rejectBtn = event.target.closest('[data-share-request-reject]');
      if (rejectBtn) {
        rejectDefaultShareRequest(rejectBtn.dataset.shareRequestReject).catch((error) => {
          console.error('reject default share error', error);
          showMessage('Unable to decline default sharing request. Please try again.', 'error');
        });
      }
    });
    panel.dataset.bound = 'true';
  }
}

function renderShareRequestCard(request, { resolved }) {
  const status = normalizeShareRequestStatus(request.status);
  const statusLabel = formatShareRequestStatus(status);
  const volunteerName = request.user_name || request.volunteer_name || request.volunteerName || 'Volunteer';
  const volunteerEmail = request.user_email || request.volunteer_email || request.email || '';
  const message = typeof request.message === 'string' && request.message.trim()
    ? request.message.trim()
    : '';
  const requestedAt = formatShareRequestTimestamp(request);
  const decisionNote = resolved && typeof request.decision_note === 'string' && request.decision_note.trim()
    ? request.decision_note.trim()
    : '';
  const decisionBy = resolved && (request.decision_by_email || request.decision_by || null);

  const cardClasses = ['share-request-card'];
  if (!resolved) {
    cardClasses.push('share-request-card--pending');
  }
  if (resolved) {
    cardClasses.push('share-request-card--resolved', `share-request-card--${status}`);
  }

  const emailMarkup = volunteerEmail
    ? `<a class="share-request-email" href="mailto:${encodeURIComponent(volunteerEmail)}">${escapeHtml(volunteerEmail)}</a>`
    : '<span class="share-request-email share-request-email--muted">No email provided</span>';

  const messageMarkup = message
    ? `<div class="share-request-message"><strong>Message</strong><p>${escapeHtml(message)}</p></div>`
    : '<div class="share-request-message share-request-message--empty"><strong>Message</strong><p>No message provided.</p></div>';

  const actionMarkup = resolved
    ? ''
    : `
      <div class="share-request-actions">
        <button type="button" class="btn-primary" data-share-request-approve="${request.id}">
          <i class="fas fa-check"></i>
          <span>Approve</span>
        </button>
        <button type="button" class="btn-outline" data-share-request-reject="${request.id}">
          <i class="fas fa-ban"></i>
          <span>Decline</span>
        </button>
      </div>
    `;

  const decisionMarkup = resolved
    ? `
      <div class="share-request-decision">
        <div class="share-request-status-block">
          <span class="share-request-status share-request-status--${status}">${statusLabel}</span>
          <span class="share-request-timestamp"><i class="fas fa-clock"></i> ${escapeHtml(requestedAt)}</span>
        </div>
        ${decisionBy ? `<span class="share-request-decider"><i class="fas fa-user-shield"></i> ${escapeHtml(decisionBy)}</span>` : ''}
        ${decisionNote ? `<p class="share-request-note">${escapeHtml(decisionNote)}</p>` : ''}
      </div>
    `
    : `
      <div class="share-request-meta">
        <span class="share-request-timestamp"><i class="fas fa-clock"></i> ${escapeHtml(requestedAt)}</span>
      </div>
    `;

  return `
    <article class="${cardClasses.join(' ')}" data-share-request-id="${escapeHtml(request.id || '')}" data-share-status="${escapeHtml(status)}">
      <header class="share-request-header">
        <div>
          <h3>${escapeHtml(volunteerName)}</h3>
          ${emailMarkup}
        </div>
        ${resolved ? '' : `<span class="share-request-status share-request-status--${status}">${statusLabel}</span>`}
      </header>
      ${messageMarkup}
      ${decisionMarkup}
      ${actionMarkup}
    </article>
  `;
}

function resetDefaultShareRequestsListener() {
  if (appState.defaultShareRequestsUnsub) {
    try {
      appState.defaultShareRequestsUnsub();
    } catch (error) {
      console.warn('defaultShareRequestsUnsub error', error);
    }
    appState.defaultShareRequestsUnsub = null;
  }
}

function loadDefaultShareRequests() {
  resetDefaultShareRequestsListener();

  const normalizedOrgCode = (appState.currentOrgCode || '').trim().toUpperCase();
  const admin = appState.currentAdmin || {};
  const orgId = admin.organizationId
    || admin.organization_id
    || admin.linkedOrgId
    || admin.orgId
    || null;

  if (!normalizedOrgCode && !orgId) {
    appState.defaultShareRequests = [];
    renderApprovalQueue({ skipAnimation: true });
    notifyVolunteersUpdate();
    return;
  }

  const requestMap = new Map();
  const subscriptions = [];
  const requestsRef = collection(db, 'default_share_requests');

  const handleSnapshot = (snapshot) => {
    let mutated = false;
    snapshot.docChanges().forEach((change) => {
      const docId = change.doc.id;
      if (change.type === 'removed') {
        if (requestMap.delete(docId)) {
          mutated = true;
        }
        return;
      }
      const data = change.doc.data() || {};
      requestMap.set(docId, { id: docId, ...data });
      mutated = true;
    });

    if (mutated) {
      appState.defaultShareRequests = Array.from(requestMap.values());
      renderApprovalQueue({ skipAnimation: true });
      notifyVolunteersUpdate();
    }
  };

  const subscribe = (constraint) => {
    try {
      const unsub = onSnapshot(query(requestsRef, constraint), handleSnapshot, (error) => {
        console.error('default share requests listener error', error);
        showMessage(`Unable to load default sharing requests: ${error.message || error}`, 'error');
      });
      subscriptions.push(unsub);
    } catch (error) {
      console.error('default share requests listener setup failed', error);
      showMessage(`Unable to subscribe to default sharing requests: ${error.message || error}`, 'error');
    }
  };

  if (normalizedOrgCode) {
    subscribe(where('org_access_code', '==', normalizedOrgCode));
  }

  if (orgId) {
    subscribe(where('org_id', '==', orgId));
  }

  if (!subscriptions.length) {
    appState.defaultShareRequests = [];
    renderApprovalQueue({ skipAnimation: true });
    return;
  }

  appState.defaultShareRequestsUnsub = () => {
    subscriptions.forEach((unsub) => {
      try {
        unsub();
      } catch (error) {
        console.warn('defaultShareRequests unsubscribe error', error);
      }
    });
  };
}

function updateTable(dataset, options = {}) {
  const tbody = document.getElementById('approvalsTableBody');
  if (!tbody) {
  }

  if (!dataset.filteredLogs.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-table-row">All caught up! No pending approvals right now.</td></tr>';
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
  const volunteerName = getVolunteerDisplayName(log);
  const eventName = log.event || log.event_name || log.site || '—';
  const hostName = getHostName(log);
  const hostInitials = computeInitials(hostName);
  const checkInInfo = deriveCheckInInfo(log);
  const checkInTitleAttr = checkInInfo.tooltip ? ` title="${escapeHtml(checkInInfo.tooltip)}"` : '';
  const rowClasses = [`approval-row`, `status-${status}`];
  if (isExpanded) {
    rowClasses.push('expanded');
  }

  const statusChip = `<span class="status-chip status-${status}">${statusLabel}</span>`;
  const actionsMarkup = `
    <div class="approval-actions">
      <button class="btn-icon" type="button" data-action="approve-row" data-log-id="${logId}" title="Approve">
        <i class="fas fa-check"></i>
      </button>
      <button class="btn-icon" type="button" data-action="deny-row" data-log-id="${logId}" title="Deny">
        <i class="fas fa-ban"></i>
      </button>
    </div>
  `;

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
      <td>${statusChip}</td>
      <td>${escapeHtml(eventName)}</td>
      <td>
        <div class="host-meta">
          <span class="host-avatar">${hostInitials}</span>
          <span class="host-meta-primary">${escapeHtml(hostName)}</span>
        </div>
      </td>
      <td>
        <span class="checkin-chip ${checkInInfo.className}"${checkInTitleAttr}>
          <i class="fas ${checkInInfo.icon}"></i>
          ${escapeHtml(checkInInfo.label)}
        </span>
      </td>
      <td>${actionsMarkup}</td>
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

function deriveCheckInInfo(log) {
  const defaultInfo = {
    label: 'No',
    className: 'unchecked',
    icon: 'fa-circle',
    tooltip: 'No phone check-in recorded.'
  };

  if (!log || typeof log !== 'object') {
    return defaultInfo;
  }

  const metadata = (log.metadata && typeof log.metadata === 'object') ? log.metadata : (log.meta && typeof log.meta === 'object' ? log.meta : {});
  const normalizedSources = [
    log.checkInSource,
    log.source,
    log.entry_source,
    metadata.checkInSource,
    metadata.source
  ].map(normalizeString).filter(Boolean);

  const tagBuckets = [];
  if (Array.isArray(log.tags)) tagBuckets.push(log.tags);
  if (Array.isArray(log.labels)) tagBuckets.push(log.labels);
  if (Array.isArray(metadata.tags)) tagBuckets.push(metadata.tags);
  const normalizedTags = tagBuckets.flat().map(normalizeString).filter(Boolean);

  const checkInBuckets = [];
  if (Array.isArray(log.checkIns)) checkInBuckets.push(log.checkIns);
  if (Array.isArray(log.checkins)) checkInBuckets.push(log.checkins);
  if (Array.isArray(log.check_in_events)) checkInBuckets.push(log.check_in_events);
  if (Array.isArray(metadata.checkIns)) checkInBuckets.push(metadata.checkIns);
  const checkInEntries = checkInBuckets.flat();

  let phoneCheckIn = normalizedSources.some(matchesPhoneKeyword)
    || normalizedTags.some(matchesPhoneKeyword);

  const checkInBooleans = [
    log.checkedIn,
    log.checked_in,
    log.checked_in_phone,
    log.checked_in_mobile,
    metadata.checkedIn,
    metadata.checked_in,
    metadata.checked_in_phone
  ];
  let hasAnyCheckIn = checkInBooleans.some((value) => value === true)
    || normalizedTags.some(matchesCheckKeyword);

  checkInEntries.forEach((entry) => {
    if (typeof entry === 'string') {
      const normalized = normalizeString(entry);
      phoneCheckIn = phoneCheckIn || matchesPhoneKeyword(normalized);
      hasAnyCheckIn = hasAnyCheckIn || matchesCheckKeyword(normalized);
    } else if (entry && typeof entry === 'object') {
      const status = normalizeString(entry.status || entry.type || entry.tag);
      const device = normalizeString(entry.device || entry.source || entry.via);
      phoneCheckIn = phoneCheckIn || matchesPhoneKeyword(device);
      hasAnyCheckIn = hasAnyCheckIn || matchesCheckKeyword(status) || matchesPhoneKeyword(device);
    }
  });

  if (!phoneCheckIn) {
    const metadataHints = [
      metadata.device,
      metadata.checkInDevice,
      metadata.checkInMethod,
      metadata.via,
      metadata.channel
    ];
    phoneCheckIn = metadataHints.some(matchesPhoneKeyword);
  }

  const derivedInfo = phoneCheckIn
    ? {
        label: 'Yes',
        className: 'checked',
        icon: 'fa-mobile-screen-button',
        tooltip: 'Phone/QR check-in recorded.'
      }
    : defaultInfo;

  const tooltipParts = [derivedInfo.tooltip];
  if (!phoneCheckIn && hasAnyCheckIn) {
    tooltipParts.push('A check-in exists from another source.');
  }
  if (normalizedSources.length) {
    tooltipParts.push(`Source: ${normalizedSources[0]}`);
  }

  return {
    ...derivedInfo,
    tooltip: tooltipParts.join(' ')
  };
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function matchesPhoneKeyword(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return false;
  }
  return normalized.includes('phone')
    || normalized.includes('mobile')
    || normalized.includes('qr')
    || normalized.includes('scan');
}

function matchesCheckKeyword(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return false;
  }
  return normalized.includes('checked')
    || normalized.includes('check-in')
    || normalized.includes('checkin');
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
      const first = (volunteer.firstName || '').trim();
      const last = (volunteer.lastName || '').trim();
      const combinedName = [first, last].filter(Boolean).join(' ').trim();
      if (combinedName) {
        return combinedName;
      }
      return volunteer.email || volunteerId;
    }
  }
  const fallbackFirst = (log.volunteer_name || log.firstName || '').trim();
  const fallbackLast = (log.lastName || log.last_name || '').trim();
  const combinedFallback = [fallbackFirst, fallbackLast].filter(Boolean).join(' ').trim();
  if (combinedFallback) {
    return combinedFallback;
  }
  return log.volunteer_email || log.email || 'Volunteer';
}

function getHostName(log) {
  if (log.__meta && log.__meta.isIncoming) {
    if (log.__meta.owningOrgName) {
      return log.__meta.owningOrgName;
    }
    if (log.host) {
      return log.host;
    }
    if (log.host_name) {
      return log.host_name;
    }
    if (log.__meta.owningOrgCode) {
      return log.__meta.owningOrgCode;
    }
  }
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

function normalizeShareRequestStatus(status) {
  const raw = (status || 'pending').toString().toLowerCase().trim();
  if (!raw || raw === 'pending') return 'pending';
  if (raw === 'approved' || raw === 'accept' || raw.startsWith('accept') || raw.startsWith('approve') || raw === 'granted') {
    return 'approved';
  }
  if (raw === 'rejected' || raw === 'declined' || raw === 'denied' || raw.startsWith('reject') || raw.startsWith('deny')) {
    return 'rejected';
  }
  if (raw.startsWith('revoke') || raw === 'revoked') {
    return 'revoked';
  }
  return 'pending';
}

function formatShareRequestStatus(status) {
  switch (normalizeShareRequestStatus(status)) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Declined';
    case 'revoked':
      return 'Revoked';
    case 'pending':
    default:
      return 'Pending';
  }
}

function extractTimestampMillis(value) {
  if (!value) return 0;
  try {
    if (typeof value.toDate === 'function') {
      const date = value.toDate();
      const millis = date.getTime();
      if (!Number.isNaN(millis)) return millis;
    }
    if (typeof value.toMillis === 'function') {
      const millis = value.toMillis();
      if (Number.isFinite(millis)) return millis;
    }
  } catch (error) {
    console.warn('extractTimestampMillis error', error);
  }

  const date = new Date(value);
  const millis = date.getTime();
  return Number.isNaN(millis) ? 0 : millis;
}

function parseRequestTimestamp(request) {
  if (!request) return 0;
  const fields = [
    request.submitted_at,
    request.created_at,
    request.createdAt,
    request.requested_at,
    request.requestedAt,
    request.updated_at,
    request.updatedAt,
    request.decision_at,
  ];

  for (const field of fields) {
    const millis = extractTimestampMillis(field);
    if (millis) return millis;
  }

  return 0;
}

function formatShareRequestTimestamp(request) {
  const millis = parseRequestTimestamp(request);
  if (!millis) {
    return 'Requested just now';
  }
  const date = new Date(millis);
  return `Requested ${date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function findDefaultShareRequest(requestId) {
  if (!requestId) return null;
  return (appState.defaultShareRequests || []).find((request) => request && request.id === requestId) || null;
}

async function resolveUserOrganizationDoc(request) {
  const userId = request?.user_id;
  if (!userId) return null;

  try {
    const snapshot = await getDocs(query(collection(db, 'user_organizations'), where('user_id', '==', userId)));
    const requestCodes = [
      request.org_access_code,
      request.org_accessCode,
      request.orgCode,
    ].map((value) => (value ? String(value).trim().toUpperCase() : null)).filter(Boolean);
    const requestOrgId = request.org_id ? String(request.org_id) : null;

    let match = null;
    snapshot.forEach((docSnap) => {
      if (match) return;
      const data = docSnap.data() || {};
      const candidateCodes = [
        data.access_code,
        data.organizationCode,
        data.org_access_code,
      ].map((value) => (value ? String(value).trim().toUpperCase() : null)).filter(Boolean);
      const codesMatch = requestCodes.some((code) => candidateCodes.includes(code));

      const candidateIds = [
        data.linked_org_id,
        data.organization_id,
        data.org_id,
        docSnap.id,
      ].map((value) => (value ? String(value) : null)).filter(Boolean);
      const idsMatch = requestOrgId && candidateIds.includes(requestOrgId);

      if (codesMatch || idsMatch) {
        match = {
          ref: docSnap.ref,
          id: docSnap.id,
          data,
        };
      }
    });

    return match;
  } catch (error) {
    console.error('resolveUserOrganizationDoc error', error);
    return null;
  }
}

async function approveDefaultShareRequest(requestId) {
  const request = findDefaultShareRequest(requestId);
  if (!request) {
    showMessage('Default sharing request not found.', 'error');
    return;
  }

  if (normalizeShareRequestStatus(request.status) !== 'pending') {
    showMessage('This request has already been processed.', 'info');
    return;
  }

  const admin = appState.currentAdmin || {};

  try {
    await updateDoc(doc(db, 'default_share_requests', requestId), {
      status: 'approved',
      decision_at: serverTimestamp(),
      decision_by: admin.uid || null,
      decision_by_email: admin.email || null,
      decision_note: null,
    });

    const userOrg = await resolveUserOrganizationDoc(request);
    if (userOrg) {
      await updateDoc(userOrg.ref, {
        default_auto_share: true,
        default_share_status: 'approved',
        default_share_rejection_reason: null,
        default_share_request_message: request.message || null,
        default_share_requested_at: request.created_at || request.createdAt || serverTimestamp(),
      });
    }

    showMessage('Default sharing approved.', 'success');
  } catch (error) {
    console.error('approve default share error', error);
    showMessage('Unable to approve the request. Please try again.', 'error');
    throw error;
  }
}

async function rejectDefaultShareRequest(requestId) {
  const request = findDefaultShareRequest(requestId);
  if (!request) {
    showMessage('Default sharing request not found.', 'error');
    return;
  }

  if (normalizeShareRequestStatus(request.status) !== 'pending') {
    showMessage('This request has already been processed.', 'info');
    return;
  }

  const reasonInput = window.prompt('Optional note to the volunteer about this decision (leave blank to skip):', '');
  if (reasonInput === null) {
    return;
  }
  const reason = reasonInput.trim();
  const admin = appState.currentAdmin || {};

  try {
    await updateDoc(doc(db, 'default_share_requests', requestId), {
      status: 'rejected',
      decision_at: serverTimestamp(),
      decision_by: admin.uid || null,
      decision_by_email: admin.email || null,
      decision_note: reason || null,
    });

    const userOrg = await resolveUserOrganizationDoc(request);
    if (userOrg) {
      await updateDoc(userOrg.ref, {
        default_auto_share: false,
        default_share_status: 'rejected',
        default_share_rejection_reason: reason || 'Request declined by admin',
        default_share_requested_at: request.created_at || request.createdAt || serverTimestamp(),
      });
    }

    showMessage('Default sharing request declined.', 'info');
  } catch (error) {
    console.error('reject default share error', error);
    showMessage('Unable to decline the request. Please try again.', 'error');
    throw error;
  }
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
