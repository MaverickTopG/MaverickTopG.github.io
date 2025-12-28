// volunteerOps.js (rewritten)
// Fix: avoid Firestore composite index requirement by removing server-side orderBy
// and sorting client-side. Also harden totals calculation.

import { db } from './firebase.js';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { appState } from './state.js';
import { showMessage, setTextContent, formatEmailForDisplay, triggerListAnimation } from './ui.js';
import { setActiveView } from './dashboard.js';

let volunteersUpdateHandler = () => {};
let volunteerRequestsUpdateHandler = () => {};

export function registerVolunteersUpdateHandler(handler) {
  volunteersUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

export function notifyVolunteersUpdate() {
  if (typeof volunteersUpdateHandler === 'function') {
    volunteersUpdateHandler();
  }
}

export function registerVolunteerRequestsUpdateHandler(handler) {
  volunteerRequestsUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

export function notifyVolunteerRequestsUpdate() {
  if (typeof volunteerRequestsUpdateHandler === 'function') {
    volunteerRequestsUpdateHandler();
  }
}

export function initVolunteerEditView() {
  const backBtn = document.getElementById('backToVolunteersBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (appState.editingVolunteerUnsub) appState.editingVolunteerUnsub();
      setActiveView('volunteers');
    });
  }

  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => setActiveView('volunteers'));

  const saveBtn = document.getElementById('saveVolunteerBtn');
  if (saveBtn) saveBtn.addEventListener('click', handleSaveVolunteer);

  const deleteBtn = document.getElementById('deleteVolunteerBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteVolunteer);

  window.showEditVolunteerView = showEditVolunteerView;
  // FIX: Expose modal action handlers to the global scope for inline `onclick` attributes.
  window.editVolunteerHours = editVolunteerHours;
  window.saveVolunteerHours = saveVolunteerHours;
  window.closeEditModal = closeEditModal;
  window.addNewLog = addNewLog;
  window.createNewLog = createNewLog;
  window.deleteLog = deleteLog;
  window.exportVolunteerApprovedHours = exportVolunteerApprovedHours;
  window.acceptVolunteerRequest = acceptVolunteerRequest;
  window.declineVolunteerRequest = declineVolunteerRequest;
  window.viewVolunteerShareDetails = viewVolunteerShareDetails;

  const exportBtn = document.getElementById('exportVolunteerHoursBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const volunteerId = appState.editingVolunteerId || exportBtn.dataset.volunteerId;
      if (!volunteerId) {
        showMessage('Select a volunteer to export hours.', 'error');
        return;
      }
      exportVolunteerApprovedHours(volunteerId);
    });
  }

  const requestsBtn = document.getElementById('volunteerRequestsBtn');
  if (requestsBtn) {
    requestsBtn.addEventListener('click', () => {
      displayVolunteerRequests();
      setActiveView('volunteer-requests');
    });
  }

  const requestsBackBtn = document.getElementById('volunteerRequestsBackBtn');
  if (requestsBackBtn) {
    requestsBackBtn.addEventListener('click', () => setActiveView('volunteers'));
  }

}

/* ------------------------------------------
   Helpers
-------------------------------------------*/
function normalizeRole(role) {
  if (!role) return 'volunteer';
  if (role === 'admin') return 'org-admin';
  return role;
}

function pruneRoleSelection() {
  if (!appState.roleManagerSelection || typeof appState.roleManagerSelection.forEach !== 'function') return;
  const validIds = new Set(appState.volunteersData.map((v) => v.id));
  appState.roleManagerSelection.forEach((id) => {
    if (!validIds.has(id)) appState.roleManagerSelection.delete(id);
  });
}

/** Safely get millis from Firestore Timestamp or date-ish values */
function tsToMillis(v) {
  if (!v) return 0;
  try {
    if (typeof v.toDate === 'function') return v.toDate().getTime(); // Firestore Timestamp
    const t = new Date(v).getTime(); // ISO/string/number
    return Number.isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

/** Format to yyyy-mm-dd for <input type="date"> */
function formatDateToInput(value) {
  if (!value) return '';
  try {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  } catch {}
  const nested = value && (value.created_at || value.createdAt);
  if (nested) return formatDateToInput(nested);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().split('T')[0];
}

function parseMDYTime(dateStr, timeStr) {
  if (!dateStr) return 0;
  const [m, d, y] = dateStr.split('/').map((n) => parseInt(n, 10));
  let hours = 0;
  let minutes = 0;
  if (timeStr) {
    const [hhmm, ampmRaw] = timeStr.split(' ');
    const [hh, mm] = (hhmm || '').split(':').map((n) => parseInt(n, 10));
    const ampm = (ampmRaw || '').toUpperCase();
    hours = (hh || 0) % 12;
    if (ampm === 'PM') hours += 12;
    minutes = mm || 0;
  }
  return new Date(y || 1970, (m || 1) - 1, d || 1, hours, minutes, 0, 0).getTime();
}

function normalizeDefaultShareStatus(status) {
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

function extractVolunteerShareMeta(data = {}) {
  const autoShareFlags = [
    data.default_auto_share,
    data.defaultAutoShare
  ];
  let defaultAutoShare = autoShareFlags.find((value) => typeof value === 'boolean');
  defaultAutoShare = typeof defaultAutoShare === 'boolean' ? defaultAutoShare : false;

  const statusSource = data.default_share_status
    || data.defaultShareStatus
    || (defaultAutoShare ? 'approved' : '');
  const defaultShareStatus = statusSource
    ? normalizeDefaultShareStatus(statusSource)
    : (defaultAutoShare ? 'approved' : 'pending');

  const requestedAt =
    data.default_share_requested_at
    || data.defaultShareRequestedAt
    || data.default_share_updated_at
    || data.defaultShareUpdatedAt
    || data.updated_at
    || data.updatedAt
    || null;

  const defaultShareRequestedAtMs = tsToMillis(requestedAt);

  const defaultShareMessage =
    data.default_share_request_message
    || data.defaultShareRequestMessage
    || data.default_share_message
    || data.defaultShareMessage
    || null;

  return {
    defaultAutoShare,
    defaultShareStatus,
    defaultShareRequestedAt: requestedAt,
    defaultShareRequestedAtMs,
    defaultShareMessage,
  };
}

function shareRequestTimestamp(request) {
  if (!request) return 0;
  const candidates = [
    request.decision_at,
    request.submitted_at,
    request.created_at,
    request.createdAt,
    request.requested_at,
    request.requestedAt,
    request.updated_at,
    request.updatedAt,
  ];
  for (const candidate of candidates) {
    const millis = tsToMillis(candidate);
    if (millis) return millis;
  }
  return 0;
}

function formatShareStateTimestamp(timestampMs) {
  if (!timestampMs) return 'recently';
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return 'recently';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDefaultShareTimestamp(request) {
  return formatShareStateTimestamp(shareRequestTimestamp(request));
}

function findDefaultShareRecordForVolunteer(volunteerId) {
  if (!volunteerId) return null;
  const requests = Array.isArray(appState.defaultShareRequests) ? appState.defaultShareRequests : [];
  const matches = requests.filter((request) => request && request.user_id === volunteerId);
  if (!matches.length) return null;
  matches.sort((a, b) => shareRequestTimestamp(b) - shareRequestTimestamp(a));
  return matches[0];
}

function getVolunteerDefaultShareState(volunteer) {
  const baseState = {
    active: false,
    status: 'pending',
    source: 'none',
    timestampMs: 0,
    message: null,
    record: null,
  };

  if (!volunteer) {
    return baseState;
  }

  const record = findDefaultShareRecordForVolunteer(volunteer.id);
  const recordStatus = normalizeDefaultShareStatus(record?.status);
  const recordTimestamp = shareRequestTimestamp(record);
  const volunteerStatus = normalizeDefaultShareStatus(volunteer.defaultShareStatus);
  const volunteerTimestamp = volunteer.defaultShareRequestedAtMs || tsToMillis(volunteer.defaultShareRequestedAt);
  const volunteerMessage = volunteer.defaultShareMessage || null;
  const volunteerAutoShare = volunteer.defaultAutoShare === true;
  const volunteerRevoked = volunteer.defaultAutoShare === false || volunteerStatus === 'revoked';
  const volunteerActive = !volunteerRevoked && (volunteerAutoShare || volunteerStatus === 'approved');

  if (recordStatus === 'approved' && !volunteerRevoked) {
    return {
      active: true,
      status: 'approved',
      source: 'request',
      timestampMs: recordTimestamp || volunteerTimestamp,
      message: record?.message || volunteerMessage,
      record,
    };
  }

  if (recordStatus === 'pending') {
    return {
      active: false,
      status: 'pending',
      source: 'request',
      timestampMs: recordTimestamp,
      message: record?.message || volunteerMessage,
      record,
    };
  }

  if (volunteerActive) {
    return {
      active: true,
      status: 'approved',
      source: 'volunteer',
      timestampMs: volunteerTimestamp || recordTimestamp,
      message: volunteerMessage || record?.message || null,
      record,
    };
  }

  const derivedStatus = volunteerRevoked
    ? 'revoked'
    : (recordStatus && recordStatus !== 'approved' ? recordStatus : (volunteerStatus || 'pending'));

  return {
    active: false,
    status: derivedStatus,
    source: volunteerRevoked ? 'volunteer' : (record ? 'request' : 'volunteer'),
    timestampMs: volunteerTimestamp || recordTimestamp,
    message: volunteerMessage || record?.message || null,
    record,
  };
}

function viewVolunteerShareDetails(volunteerId) {
  const volunteer = appState.volunteersData.find((member) => member.id === volunteerId);
  if (!volunteer) {
    showMessage('Volunteer not found.', 'error');
    return;
  }

  const shareState = getVolunteerDefaultShareState(volunteer);
  const timestampLabel = formatShareStateTimestamp(shareState.timestampMs);
  const volunteerMessage = typeof shareState.message === 'string' && shareState.message.trim()
    ? shareState.message.trim()
    : null;

  if (!shareState.active) {
    const statusMessage = shareState.status === 'pending'
      ? 'Default sharing request is still pending review.'
      : 'Default sharing is not currently active for this volunteer.';
    const suffix = shareState.timestampMs ? ` (Last update: ${timestampLabel})` : '';
    showMessage(`${statusMessage}${suffix}`, 'info');
    return;
  }

  let details = `Default sharing was approved ${timestampLabel}. Their approved and personal hours will sync automatically.`;
  if (volunteerMessage) {
    details += `\n\nVolunteer message:\n${volunteerMessage}`;
  }

  window.alert(details);
}

export function computeInitials(nameSource, fallback) {
  const primary = nameSource || fallback || '';
  if (!primary) return 'N';
  const cleaned = primary.trim();
  if (!cleaned) return 'N';
  const parts = cleaned.split(/\s+/);
  const initials = parts.length > 1 ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}` : cleaned.slice(0, 2);
  return initials.toUpperCase();
}

export function getVolunteerDisplayName(volunteer) {
  if (!volunteer) return 'Volunteer';
  const first = (volunteer.firstName || '').trim();
  const last = (volunteer.lastName || '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  const fallbackEmail = (volunteer.email || 'Volunteer').trim();
  return fallbackEmail || 'Volunteer';
}

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------
   Load & Sync Volunteers
-------------------------------------------*/
export function resetVolunteerListener() {
  if (appState.volunteersUnsub) { 
    try { appState.volunteersUnsub(); } catch (e) { console.warn('volunteersUnsub error', e); }
    appState.volunteersUnsub = null;
  }
}

export function loadVolunteersData() {
  resetVolunteerListener();

  if (!appState.currentOrgCode) {
    appState.volunteersData = [];
    notifyVolunteersUpdate();
    return;
  }

  const usersQuery = query(
    collection(db, 'users'),
    where('organizationCode', '==', appState.currentOrgCode),
    where('role', '==', 'volunteer')
  );

  appState.volunteersUnsub = onSnapshot(
    usersQuery,
    (snapshot) => {
      const volunteers = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const normalizedEmail = (data.email || '').trim();
        const baseFirst = (data.firstName || data.name || '').trim();
        const fallbackFirst = normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : normalizedEmail;
        const resolvedFirstName = baseFirst || fallbackFirst || 'Unknown';
        const lastName = (data.lastName || data.last_name || '').trim();
        const shareMeta = extractVolunteerShareMeta(data);

        volunteers.push({
          id: d.id,
          firstName: resolvedFirstName,
          lastName,
          email: normalizedEmail,
          totalHours: 0,
          lastActivity: null,
          logs: [],
          registrationDate: data.createdAt || null,
          role: normalizeRole(data.role),
          ...shareMeta
        });
      });

      const updated = syncVolunteerHoursFromActivity(appState.activityData, volunteers);
      appState.volunteersData = updated;
      pruneRoleSelection();
      notifyVolunteersUpdate();
    },
    (error) => {
      console.error('volunteers onSnapshot error:', error);
      showMessage(`Error listening for volunteers: ${error.message || error}`, 'error');
    }
  );
}

export function resetVolunteerRequestsListener() {
  if (appState.volunteerRequestsUnsub) {
    try {
      appState.volunteerRequestsUnsub();
    } catch (error) {
      console.warn('volunteerRequestsUnsub error', error);
    }
    appState.volunteerRequestsUnsub = null;
  }
}

export function loadVolunteerRequests() {
  resetVolunteerRequestsListener();

  if (!appState.currentOrgCode) {
    appState.volunteerRequests = [];
    notifyVolunteerRequestsUpdate();
    return;
  }

  const requestsQuery = query(
    collection(db, 'organization_join_requests'),
    where('org_access_code', '==', appState.currentOrgCode.toUpperCase())
  );

  appState.volunteerRequestsUnsub = onSnapshot(
    requestsQuery,
    (snapshot) => {
      const pending = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const status = (data.status || 'pending').toString().toLowerCase();
        if (status !== 'pending') return;
        const createdAt = data.created_at || data.createdAt || null;
        const requestedAtMs = tsToMillis(createdAt);
        pending.push({
          id: docSnap.id,
          userId: data.user_id || data.userId || null,
          userName: data.user_name || data.userName || data.user_email || 'Volunteer',
          userEmail: data.user_email || data.userEmail || '',
          status,
          createdAt,
          requestedAtMs,
          note: data.message || data.note || '',
        });
      });

      pending.sort((a, b) => (b.requestedAtMs || 0) - (a.requestedAtMs || 0));
      appState.volunteerRequests = pending;
      notifyVolunteerRequestsUpdate();
    },
    (error) => {
      console.error('volunteer requests onSnapshot error:', error);
      showMessage(`Error loading volunteer requests: ${error.message || error}`, 'error');
    }
  );
}

export function syncVolunteerHoursFromActivity(activityLogs, baseVolunteers = appState.volunteersData) {
  const map = new Map();

  baseVolunteers.forEach((v) => {
    const { hidden, hiddenAt, ...rest } = v;
    map.set(v.id, { ...rest, totalHours: 0, lastActivity: null, logs: [] });
  });

  activityLogs.forEach((log, index) => {
    const userId = log.user_id;
    if (!userId) {
      console.warn(`Activity log missing user_id at index ${index}`, log);
      return;
    }

    if (!map.has(userId)) {
      const rawEmail = log.volunteer_email || log.email || '';
      const email = rawEmail.trim() || 'Unknown';
      const fallbackName = email.includes('@') ? email.split('@')[0] : email;
      const name = log.firstName || log.volunteer_name || fallbackName || 'Unknown';
      const lastName = (log.lastName || log.last_name || '').trim();
      map.set(userId, {
        id: userId,
        firstName: name,
        lastName,
        email,
        totalHours: 0,
        lastActivity: null,
        logs: [],
        registrationDate: null,
        role: normalizeRole(log.role),
        ...extractVolunteerShareMeta({})
      });
    }

    const v = map.get(userId);
    const hours = parseFloat(log.hours_contributed ?? log.hours ?? 0) || 0;
    // FIX: Only add hours to the total if the log is approved.
    const status = (log.approve || 'pending').toLowerCase();
    if (status === 'approved' || status === 'accepted') {
      v.totalHours += hours;
    }

    v.logs.push(log);

    if (log.date) {
      const dt = new Date(log.date);
      if (!Number.isNaN(dt.getTime())) {
        if (!v.lastActivity || new Date(v.lastActivity) < dt) v.lastActivity = log.date;
      } else {
        console.warn(`Invalid date in activity log ${index}:`, log.date);
      }
    }
  });

  const updated = Array.from(map.values());
  appState.volunteersData = updated;
  pruneRoleSelection();
  return updated;
}

/* ------------------------------------------
   Table & Export
-------------------------------------------*/
export function displayVolunteers() { // This function is also exported as renderVolunteersPanel
  const tbody =
    document.getElementById('volunteersTableBody')
    || document.querySelector('[data-role="volunteers-table"] tbody')
    || document.querySelector('table tbody');
  if (!tbody) return;

  const visible = appState.volunteersData.filter(
    (v) => (v.role || 'volunteer') !== 'org-admin'
  );
  tbody.innerHTML = '';

  if (visible.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#666;">No volunteers found</td></tr>';
    return;
  }

  const rolesCatalog = appState.rolesCatalog || [];
  const rows = visible.map((volunteer) => {
    const name = getVolunteerDisplayName(volunteer);
    const lastActivity = volunteer.lastActivity ? new Date(volunteer.lastActivity).toLocaleDateString() : 'Never';
    const roleMeta = rolesCatalog.find((r) => r.id === volunteer.role) || { name: volunteer.role || 'Volunteer' };
    const normalizedEmail = (volunteer.email || '').trim();
    const displayEmail = normalizedEmail || '—';
    const shareState = getVolunteerDefaultShareState(volunteer);
    const shareButtonTitle = shareState.active
      ? `Default sharing enabled${shareState.timestampMs ? ` • ${formatShareStateTimestamp(shareState.timestampMs)}` : ''}`
      : '';

    const safeName = escapeHtml(name);
    const safeEmailTitle = escapeHtml(normalizedEmail || '');
    const safeDisplayEmail = escapeHtml(displayEmail);
    const safeRoleName = escapeHtml(roleMeta.name);
    const safeHours = escapeHtml((volunteer.totalHours || 0).toFixed(1));
    const safeLastActivity = escapeHtml(lastActivity);
    const shareButton = shareState.active
      ? `<button class="btn-icon share-indicator" type="button" title="${escapeHtml(shareButtonTitle)}" onclick="viewVolunteerShareDetails('${volunteer.id}')"><i class="fas fa-share-alt"></i></button>`
      : '';

    return `
      <tr>
        <td>${safeName}</td>
        <td title="${safeEmailTitle || safeDisplayEmail}">${safeDisplayEmail}</td>
        <td><span class="role-pill role-${volunteer.role || 'volunteer'}">${safeRoleName}</span></td>
        <td><span class="hours-badge">${safeHours} hrs</span></td>
        <td>${safeLastActivity}</td>
        <td class="table-actions">
          ${shareButton}
          <button class="btn-icon" type="button" title="Edit Volunteer" onclick="showEditVolunteerView('${volunteer.id}')"><i class="fas fa-pencil-alt"></i></button>
          <button class="btn-icon" type="button" title="Export Approved Hours" onclick="exportVolunteerApprovedHours('${volunteer.id}')"><i class="fas fa-file-export"></i></button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = rows.join('');

  // Trigger the rolling fade-in animation for the new rows
  triggerListAnimation('#volunteersTableBody tr');
}

export function displayVolunteerRequests() {
  const tbody = document.getElementById('volunteerRequestsTableBody');
  if (!tbody) return;

  const countEl = document.getElementById('volunteerRequestsCount');
  const subtitleEl = document.getElementById('volunteerRequestsSubtitle');
  const requests = Array.isArray(appState.volunteerRequests) ? appState.volunteerRequests : [];
  const pendingCount = requests.length;

  if (countEl) {
    if (pendingCount === 0) {
      countEl.textContent = '';
      countEl.hidden = true;
    } else {
      countEl.hidden = false;
      countEl.textContent = `${pendingCount} pending ${pendingCount === 1 ? 'request' : 'requests'}`;
    }
  }

  if (subtitleEl) {
    subtitleEl.textContent = pendingCount === 0
      ? 'Send invite links or share your access code to grow your team.'
      : 'Review incoming volunteers and decide who joins your organization.';
  }

  if (pendingCount === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-table-row">No pending requests.</td></tr>';
  } else {
    const rows = requests.map((request) => {
      const name = request.userName || 'Volunteer';
      const email = request.userEmail || '';
      const maskedEmail = formatEmailForDisplay(email);
      const requestedLabel = request.requestedAtMs
        ? new Date(request.requestedAtMs).toLocaleString()
        : '—';

      const safeName = escapeHtml(name);
      const safeEmail = escapeHtml(email);
      const safeMaskedEmail = escapeHtml(maskedEmail);
      const safeRequested = escapeHtml(requestedLabel);

      return `
        <tr data-request-row="${request.id}">
          <td>${safeName}</td>
          <td title="${safeEmail}">${safeMaskedEmail}</td>
          <td>${safeRequested}</td>
          <td>
            <div class="volunteer-request-actions">
              <button class="request-action-btn approve" type="button" onclick="acceptVolunteerRequest('${request.id}')">
                <i class="fas fa-check"></i> Accept
              </button>
              <button class="request-action-btn decline" type="button" onclick="declineVolunteerRequest('${request.id}')">
                <i class="fas fa-times"></i> Decline
              </button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = rows.join('');
    triggerListAnimation('#volunteerRequestsTableBody tr');
  }

  const requestsBtn = document.getElementById('volunteerRequestsBtn');
  if (requestsBtn) {
    const label = requestsBtn.querySelector('.btn-label');
    const baseText = 'New Volunteer Requests';
    if (label) {
      label.textContent = pendingCount > 0 ? `${baseText} (${pendingCount})` : baseText;
    }
    requestsBtn.classList.toggle('btn-has-pending', pendingCount > 0);
  }
}

export function exportVolunteersToCsv() {
  const volunteers = appState.volunteersData.filter(
    (v) => (v.role || 'volunteer') !== 'org-admin'
  );
  if (!volunteers.length) {
    showMessage('No volunteer data to export.', 'error');
    return;
  }

  const headers = ['Name', 'Email', 'Role', 'Total Hours', 'Last Activity'];
  const rows = volunteers.map((v) => {
    const name = getVolunteerDisplayName(v);
    const email = v.email || '';
    const rolesCatalog = appState.rolesCatalog || [];
    const roleMeta = rolesCatalog.find((r) => r.id === v.role) || { name: v.role || 'Volunteer' };
    const hours = (v.totalHours || 0).toFixed(1);
    const lastActivity = v.lastActivity ? new Date(v.lastActivity).toLocaleDateString() : 'Never';
    return [name, email, roleMeta.name, hours, lastActivity];
  });

  const csv = [headers, ...rows]
    .map((cols) =>
      cols
        .map((val) => {
          const s = val == null ? '' : String(val);
          const needsQuotes = s.includes(',') || s.includes('"') || /[\r\n]/.test(s);
          return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'volunteers.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showMessage('Volunteer roster exported.', 'success');
}

/* ------------------------------------------
   CRUD (Volunteer)
-------------------------------------------*/
function setRequestProcessingState(requestId, processing) {
  const row = document.querySelector(`[data-request-row="${requestId}"]`);
  if (!row) return;
  row.querySelectorAll('button.request-action-btn').forEach((btn) => {
    if (processing) {
      btn.dataset.originalLabel = btn.dataset.originalLabel || btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('is-loading');
    } else {
      btn.disabled = false;
      btn.classList.remove('is-loading');
      if (btn.dataset.originalLabel) {
        btn.innerHTML = btn.dataset.originalLabel;
        delete btn.dataset.originalLabel;
      }
    }
  });
}

async function handleVolunteerRequestAction(requestId, action) {
  if (!requestId) return;
  const requests = Array.isArray(appState.volunteerRequests) ? appState.volunteerRequests : [];
  const request = requests.find((entry) => entry.id === requestId);
  if (!request) {
    showMessage('Request not found. Refresh and try again.', 'error');
    return;
  }

  setRequestProcessingState(requestId, true);

  const admin = appState.currentAdmin || {};
  const requestRef = doc(db, 'organization_join_requests', requestId);
  const updatePayload = {
    status: action === 'accept' ? 'accepted' : 'declined',
    handled_at: serverTimestamp(),
    handled_by: admin.uid || null,
    handled_by_email: admin.email || null,
  };

  try {
    if (action === 'accept') {
      if (!request.userId) {
        showMessage('Accepted request, but volunteer profile needs manual setup.', 'warning');
      } else {
        const userRef = doc(db, 'users', request.userId);
        const timestamp = serverTimestamp();
        const mergePayload = {
          organizationCode: appState.currentOrgCode || null,
          organizationJoinedAt: timestamp,
          role: 'volunteer',
          status: 'active',
          updatedAt: timestamp,
        };
        if (admin.organizationName) {
          mergePayload.organizationName = admin.organizationName;
        }
        await setDoc(userRef, mergePayload, { merge: true });
      }
    }

    await updateDoc(requestRef, updatePayload);
    const successCopy = action === 'accept'
      ? `Accepted ${request.userName || 'volunteer'}.`
      : `Declined ${request.userName || 'volunteer'}.`;
    showMessage(successCopy, 'success');
  } catch (error) {
    console.error('Volunteer request action failed:', error);
    showMessage(
      action === 'accept'
        ? 'Unable to accept this request. Please try again.'
        : 'Unable to decline this request. Please try again.',
      'error'
    );
  } finally {
    setRequestProcessingState(requestId, false);
  }
}

export function acceptVolunteerRequest(requestId) {
  return handleVolunteerRequestAction(requestId, 'accept');
}

export function declineVolunteerRequest(requestId) {
  return handleVolunteerRequestAction(requestId, 'decline');
}

export async function updateVolunteer(volunteerId, updates) {
  if (!volunteerId || !updates) {
    showMessage('Invalid data for volunteer update.', 'error');
    return;
  }
  try {
    const ref = doc(db, 'users', volunteerId);
    await updateDoc(ref, updates);
    showMessage('Volunteer updated successfully.', 'success');
  } catch (error) {
    console.error('Error updating volunteer:', error);
    showMessage('Failed to update volunteer. Please try again.', 'error');
    throw error;
  }
}

export async function deleteVolunteer(volunteerId) {
  if (!volunteerId) return;

  const v = appState.volunteersData.find((x) => x.id === volunteerId);
  const volunteerName = v ? (v.firstName || v.email) : 'this volunteer';

  if (!window.confirm(`Are you sure you want to permanently delete ${volunteerName}? This action cannot be undone.`)) {
    return;
  }

  try {
    if (v) {
      await archiveVolunteerRecord(v);
    }
    const ref = doc(db, 'users', volunteerId);
    await deleteDoc(ref);
    showMessage('Volunteer successfully deleted.', 'success');
    setActiveView('volunteers');
  } catch (error) {
    console.error('Error deleting volunteer:', error);
    showMessage('Failed to delete volunteer. Please try again.', 'error');
  }
}

/* ------------------------------------------
   Edit Hours Modal (existing behaviors)
-------------------------------------------*/
export function editVolunteerHours(volunteerId) {
  const volunteer = appState.volunteersData.find((item) => item.id === volunteerId);
  if (!volunteer) return;

  const modal = document.getElementById('editHoursModal');
  const content = document.getElementById('editHoursContent');
  if (!modal || !content) return;

  const name = volunteer.firstName || volunteer.email || 'Volunteer';

  content.innerHTML = `
    <div class="volunteer-header">
      <h3>${name}</h3>
      <p>${volunteer.email} - Total: ${Number(volunteer.totalHours || 0).toFixed(1)} hours</p>
    </div>
    <div class="volunteer-logs">
      <div class="logs-header">
        <h4>Activity Logs</h4>
        <button onclick="addNewLog('${volunteerId}')" class="btn-success">
          <i class="fas fa-plus"></i> Add New Log
        </button>
      </div>
      <div id="editableLogsList" class="logs-list">
        ${
          volunteer.logs.length > 0
            ? volunteer.logs
                .map(
                  (log) => `
          <div class="log-item" data-log-id="${log.id}">
            <div class="log-inputs">
              <div class="input-group">
                <label for="log-date-${log.id}">Date</label>
                <input id="log-date-${log.id}" type="date" value="${formatDateToInput(
                    log.date || log.created_at || log.createdAt || log.timestamp
                  )}" data-field="date">
              </div>
              <div class="input-group">
                <label for="log-site-${log.id}">Volunteering Task</label>
                <input id="log-site-${log.id}" type="text" value="${log.site || ''}" placeholder="Location" data-field="site">
              </div>
              <div class="input-group">
                <label for="log-hours-${log.id}">Hours</label>
                <input id="log-hours-${log.id}" type="number" value="${
                  log.hours_contributed ?? log.hours ?? 0
                }" step="0.1" min="0" placeholder="Hours" data-field="hours">
              </div>
              <div class="log-actions">
                <button onclick="deleteLog('${log.id}', '${volunteerId}')" class="btn-icon btn-danger" title="Delete Log">
                  <i class="fas fa-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>`
                )
                .join('')
            : '<div class="empty-logs">No activity logs found</div>'
        }
      </div>
    </div>
    <div class="edit-modal-footer">
      <button onclick="saveVolunteerHours('${volunteerId}')" class="btn-primary">
        <i class="fas fa-save"></i> Save All Changes
      </button>
      <button onclick="closeEditModal()" class="btn-outline">Cancel</button>
    </div>
  `;

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

export async function saveVolunteerHours(volunteerId) {
  const saveButton = document.querySelector('.modal-actions .btn-primary') || document.querySelector('.edit-modal-footer .btn-primary');
  if (!saveButton) return;

  const originalText = saveButton.innerHTML;
  saveButton.disabled = true;
  saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Changes...';

  try {
    const logItems = document.querySelectorAll('#editableLogsList .log-item');
    const updates = [];
    let hasChanges = false;

    logItems.forEach((item) => {
      const logId = item.dataset.logId;
      if (!logId || logId === 'new') return;

      const inputs = item.querySelectorAll('input');
      const logData = {};
      let hasValidData = true;

      inputs.forEach((input) => {
        const field = input.dataset.field;
        const rawValue = typeof input.value === 'string' ? input.value : '';
        let value = rawValue.trim();

        if (field === 'hours') {
          value = parseFloat(value) || 0;
          if (value < 0) {
            value = 0;
            input.value = 0;
          }
          logData.hours_contributed = value;
          logData.hours = value;
        } else if (field === 'date') {
          if (!value) {
            hasValidData = false;
            input.style.borderColor = '#dc3545';
          } else {
            logData[field] = value;
            input.style.borderColor = '';
          }
        } else {
          logData[field] = value;
          input.style.borderColor = '';
        }
      });

      if (hasValidData) {
        logData.updated_at = serverTimestamp();
        const currentAdmin = appState.currentAdmin || {};
        logData.updated_by = currentAdmin.uid || null;
        updates.push(updateDoc(doc(db, 'volunteer_logs', logId), logData));
        hasChanges = true;
      }
    });

    if (!hasChanges) {
      showMessage('No changes to save', 'info');
      return;
    }

    await Promise.all(updates);
    showMessage(`Successfully updated ${updates.length} log entries`, 'success');
    closeEditModal();
  } catch (error) {
    console.error('Error saving volunteer hours:', error);
    let msg = 'Error saving changes: ';
    switch (error.code) {
      case 'permission-denied':
        msg += 'You do not have permission to modify this data.'; break;
      case 'not-found':
        msg += 'One or more log entries could not be found.'; break;
      case 'unavailable':
        msg += 'Service temporarily unavailable. Please try again.'; break;
      default:
        msg += error.message || 'Unknown error occurred.';
    }
    showMessage(msg, 'error');
  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = originalText;
  }
}

export function addNewLog(volunteerId) {
  const logsList = document.getElementById('editableLogsList');
  if (!logsList) return;

  const newLogDiv = document.createElement('div');
  newLogDiv.className = 'log-item new-log';
  newLogDiv.dataset.logId = 'new';

  const today = new Date().toISOString().split('T')[0];

  newLogDiv.innerHTML = `
    <div class="log-inputs">
      <div class="input-group">
        <label for="log-date-new">Date</label>
        <input id="log-date-new" type="date" value="${today}" data-field="date">
      </div>
      <div class="input-group">
        <label for="log-site-new">Location</label>
        <input id="log-site-new" type="text" placeholder="Location" data-field="site">
      </div>
      <div class="input-group">
        <label for="log-hours-new">Hours</label>
        <input id="log-hours-new" type="number" step="0.1" min="0" placeholder="Hours" data-field="hours">
      </div>
      <div class="input-group">
        <label>&nbsp;</label>
        <button onclick="createNewLog('${volunteerId}', this.closest('.log-item'))" class="btn-primary">
          <i class="fas fa-check"></i> Save
        </button>
        <button onclick="this.closest('.log-item').remove()" class="btn-outline" style="margin-left: 8px;">
          <i class="fas fa-times"></i> Cancel
        </button>
      </div>
    </div>
  `;

  logsList.appendChild(newLogDiv);
}

export async function createNewLog(volunteerId, logElement) {
  if (!logElement) return;

  try {
    const inputs = logElement.querySelectorAll('input');
    const logData = {
      user_id: volunteerId,
      organization_id: appState.currentOrgCode,
      created_at: serverTimestamp(),
    };

    inputs.forEach((input) => {
      const field = input.dataset.field;
      let value = input.value;

      if (field === 'hours') {
        value = parseFloat(value) || 0;
        logData.hours_contributed = value;
        logData.hours = value;
      } else {
        logData[field] = value;
      }
    });

    const docRef = await addDoc(collection(db, 'volunteer_logs'), logData);
    logElement.dataset.logId = docRef.id;
    logElement.classList.remove('new-log');

    const actionsGroup = logElement.querySelector('.input-group:last-child');
    if (actionsGroup) {
      actionsGroup.innerHTML = `
        <label>&nbsp;</label>
        <button onclick="deleteLog('${docRef.id}', '${volunteerId}')" class="btn-icon btn-danger" title="Delete Log">
          <i class="fas fa-trash"></i> Delete
        </button>
      `;
    }

    showMessage('New log entry added', 'success');
  } catch (error) {
    console.error('Error creating log:', error);
    showMessage('Error creating log entry', 'error');
  }
}

export async function deleteLog(logId, volunteerId) {
  if (!logId) return;
  if (!window.confirm('Are you sure you want to delete this log entry?')) return;

  try {
    await deleteDoc(doc(db, 'volunteer_logs', logId));
    const el = document.querySelector(`[data-log-id="${logId}"]`);
    if (el) el.remove();
    showMessage('Log entry deleted', 'success');
  } catch (error) {
    console.error('Error deleting log:', error);
    showMessage('Error deleting log entry', 'error');
  }
}

export function closeEditModal() {
  const modal = document.getElementById('editHoursModal');
  if (modal) modal.style.display = 'none';
  document.body.classList.remove('modal-open');
}

/* ------------------------------------------
   Inline activity editor (2-column panel)
-------------------------------------------*/
function renderActivityLogs(logs) {
  const container = document.getElementById('activityLogsContainer');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="empty-state">No activity logs found for this volunteer.</div>';
    return;
  }

  container.innerHTML = logs.map((log) => createLogRow(log)).join('');
  // No event listeners needed for the new select dropdown.
  // Trigger the rolling fade-in animation for the new rows
  triggerListAnimation('#activityLogsContainer .log-row');
}

async function archiveVolunteerRecord(volunteer) {
  if (!volunteer || !appState.currentOrgCode) return;
  const totalHours = Number(volunteer.totalHours || 0);
  const archiveId = `${appState.currentOrgCode}_${volunteer.id}`;

  let lastActivity = volunteer.lastActivity || null;
  if (!lastActivity && Array.isArray(volunteer.logs) && volunteer.logs.length) {
    const sorted = [...volunteer.logs].sort((a, b) => {
      const aDate = parseMDYTime(a.date, a.time);
      const bDate = parseMDYTime(b.date, b.time);
      return bDate - aDate;
    });
    if (sorted.length && sorted[0].date) {
      lastActivity = sorted[0].date;
    }
  }

  const payload = {
    organizationCode: appState.currentOrgCode,
    volunteerId: volunteer.id,
    volunteerName: volunteer.firstName || volunteer.email || 'Volunteer',
    volunteerEmail: volunteer.email || '',
    totalHours,
    lastActivity: lastActivity || null,
    archivedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'organization_hour_archive', archiveId), payload, { merge: true });
  } catch (error) {
    console.error('archiveVolunteerRecord error', error);
    showMessage('Saved volunteer hours locally but could not archive record in the cloud.', 'warning');
  }
}

export function exportVolunteerApprovedHours(volunteerIdInput) {
  const volunteerId = volunteerIdInput || appState.editingVolunteerId;
  if (!volunteerId) {
    showMessage('Select a volunteer to export hours.', 'error');
    return;
  }

  const volunteer = appState.volunteersData.find((v) => v.id === volunteerId);
  if (!volunteer) {
    showMessage('Could not find volunteer record for export.', 'error');
    return;
  }

  const approvedLogs = appState.activityData.filter((log) => {
    if (!log || log.user_id !== volunteerId) return false;
    const status = String(log.approve || log.status || '').toLowerCase();
    return status === 'approved' || status === 'accepted';
  });

  if (approvedLogs.length === 0) {
    showMessage('No approved hours found to export for this volunteer.', 'info');
    return;
  }

  const sortedLogs = [...approvedLogs].sort((a, b) => {
    const aMillis = tsToMillis(a.date || a.created_at || a.createdAt);
    const bMillis = tsToMillis(b.date || b.created_at || b.createdAt);
    return aMillis - bMillis;
  });

  const csvLines = [
    ['Volunteer Name', 'Volunteer Email', 'Date', 'Volunteering Task', 'Hours', 'Approval Status'].join(',')
  ];

  let totalHours = 0;

  sortedLogs.forEach((log) => {
    const volunteerName = getVolunteerDisplayName(volunteer) || log.firstName || log.volunteer_name || 'Volunteer';
    const volunteerEmail = volunteer.email || log.volunteer_email || log.email || 'Unknown';
    const dateValue = formatDateToInput(log.date || log.created_at || log.createdAt) || 'Not specified';
    const task = log.site || log.volunteering_task || log.task || 'Not specified';
    const status = String(log.approve || log.status || 'approved');
    const hoursValue = Number.parseFloat(log.hours_contributed ?? log.hours ?? 0) || 0;
    totalHours += hoursValue;

    csvLines.push(
      [
        escapeCsv(volunteerName),
        escapeCsv(volunteerEmail),
        escapeCsv(dateValue),
        escapeCsv(task),
        escapeCsv(hoursValue.toFixed(1)),
        escapeCsv(status)
      ].join(',')
    );
  });

  const safeNameSource = volunteer.firstName || volunteer.email || `volunteer-${volunteerId.slice(0, 6)}`;
  const safeName = safeNameSource.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'volunteer';
  const fileName = `${safeName}-approved-hours.csv`;

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showMessage(`Export ready! ${approvedLogs.length} approved entries totaling ${totalHours.toFixed(1)} hours.`, 'success');
}

function escapeCsv(value) {
  const stringValue = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function createLogRow(log = {}) {
  const logId = log.id || `new-${Date.now()}`;
  const date = log.date ? formatDateToInput(log.date) : new Date().toISOString().split('T')[0];
  const site = log.site || '';
  const hours = log.hours_contributed ?? log.hours ?? '0';
  const status = log.approve || 'pending';
  
  let statusClass = '';
  if (status === 'denied') statusClass = 'log-row-denied';
  else if (status === 'approved' || status === 'accepted') statusClass = 'log-row-approved';
  else if (status === 'pending') statusClass = 'log-row-pending';


  return `
    <div class="log-row ${statusClass}" data-log-id="${logId}">
      <input type="date" data-field="date" value="${date}" class="log-input" title="Activity Date" readonly>
      <input type="text" data-field="site" value="${site}" placeholder="Volunteering Task" class="log-input" readonly>
      <input type="number" data-field="hours" value="${hours}" step="0.5" min="0" class="log-input" readonly>
      <select data-field="status" class="log-input" title="Approval Status">
        <option value="approved" ${status === 'approved' || status === 'accepted' ? 'selected' : ''}>Approved</option>
        <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="denied" ${status === 'denied' ? 'selected' : ''}>Denied</option>
      </select>
    </div>
  `;
}

/* ------------------------------------------
   Save inline editor
-------------------------------------------*/
async function handleSaveVolunteer() {
  const volunteerId = appState.editingVolunteerId;
  const logsContainer = document.getElementById('activityLogsContainer');
  if (!volunteerId || !logsContainer) return;

  const volunteer = appState.volunteersData.find((v) => v.id === volunteerId);
  if (!volunteer) {
    console.error('Could not find volunteer data for saving logs.');
    showMessage('Error: Could not find volunteer data.', 'error');
    return;
  }

  const logRows = logsContainer.querySelectorAll('.log-row');
  const updates = [];

  // 1. Process creations and updates

  logRows.forEach((row) => {
    const logId = row.dataset.logId;
    const isNew = logId.startsWith('new-');

    const logData = {
      date: row.querySelector('[data-field="date"]').value,
      site: row.querySelector('[data-field="site"]').value,
      hours: parseFloat(row.querySelector('[data-field="hours"]').value) || 0,
      hours_contributed: parseFloat(row.querySelector('[data-field="hours"]').value) || 0,
      approve: row.querySelector('[data-field="status"]').value,
      user_id: volunteerId,
      firstName: volunteer.firstName, // Add volunteer's name to new logs
      lastName: volunteer.lastName || '',
      email: volunteer.email, // Add volunteer's email to new logs
      organization_id: appState.currentOrgCode,
    };

    if (!isNew) {
      updates.push(updateDoc(doc(db, 'volunteer_logs', logId), logData));
    }
  });

  // 2. Execute all promises

  // FIX: Await all promises to ensure all operations (updates, creations, deletions) complete.
  // The previous implementation was not correctly awaiting the array of promises.
  await Promise.all(updates);

  // FIX: After saving, manually trigger a sync of volunteer hours from all activity logs.
  // This ensures that changes to approved hours are immediately reflected in the volunteer's total.
  // The live listener on its own does not trigger this global recalculation.
  syncVolunteerHoursFromActivity(appState.activityData);
  notifyVolunteersUpdate();

  const changeCount = updates.length;
  if (changeCount > 0) {
    showMessage('Activity logs saved successfully.', 'success');
  } else {
    showMessage('No changes to save.', 'info');
  }
}

async function handleDeleteVolunteer() {
  const volunteerId = appState.editingVolunteerId;
  await deleteVolunteer(volunteerId);
}

/* ------------------------------------------
   Entry: open the per-volunteer editor view
-------------------------------------------*/
export async function showEditVolunteerView(volunteerId) {
  // Detach any previous listener
  if (appState.editingVolunteerUnsub) {
    appState.editingVolunteerUnsub();
    appState.editingVolunteerUnsub = null;
  }

  const volunteer = appState.volunteersData.find((v) => v.id === volunteerId);
  if (!volunteer) {
    showMessage('Could not find volunteer to edit.', 'error');
    return;
  }

  appState.editingVolunteerId = volunteerId;

  // Set up a live listener for this volunteer's logs
  const logsQueryRef = query(
    collection(db, 'volunteer_logs'),
    where('user_id', '==', volunteerId),
    where('organization_id', '==', appState.currentOrgCode)
  );

  appState.editingVolunteerUnsub = onSnapshot(logsQueryRef, (snapshot) => {
    const volunteerLogs = [];
    snapshot.forEach((d) => volunteerLogs.push({ id: d.id, ...d.data() }));
    volunteerLogs.sort((a, b) => tsToMillis(b.created_at || b.date || b.createdAt) - tsToMillis(a.created_at || a.date || a.createdAt));

    renderActivityLogs(volunteerLogs);
  });

  // Header
  setTextContent('editVolunteerName', volunteer.firstName || volunteer.email);
  setTextContent('editVolunteerAvatar', computeInitials(volunteer.firstName, volunteer.email));

  // FIX: Use the pre-calculated totalHours from the main volunteer object.
  // The previous logic was incorrectly recalculating the total here, ignoring approval status.
  // This ensures the total displayed is always the sum of approved hours.
  setTextContent('editVolunteerTotalHours', `${(volunteer.totalHours || 0).toFixed(1)} hrs`);

  // Populate read-only form fields (leave as-is if your form differs)
  const form = document.getElementById('editVolunteerForm');
  if (form) {
    if (form.elements.name) {
      form.elements.name.value = volunteer.firstName || '';
      form.elements.name.readOnly = true;
    }
    if (form.elements.email) {
      form.elements.email.value = volunteer.email || '';
      form.elements.email.readOnly = true;
    }
    if (form.elements.status) {
      form.elements.status.value = volunteer.status || 'active';
    }
    if (form.elements.notes) {
      // If you removed Notes from UI, this will harmlessly no-op
      form.elements.notes.value = volunteer.notes || '';
    }
  }

  // Wire controls
  const addLogBtn = document.getElementById('addNewLogBtn'); // This button is now removed from the UI
  if (addLogBtn) {
    addLogBtn.onclick = null;
    addLogBtn.style.display = 'none';
  }

  const deleteBtn = document.getElementById('deleteVolunteerBtn');
  if (deleteBtn) deleteBtn.dataset.volunteerId = volunteerId;

  const saveBtn = document.getElementById('saveVolunteerBtn');
  if (saveBtn) saveBtn.dataset.volunteerId = volunteerId;

  const exportBtn = document.getElementById('exportVolunteerHoursBtn');
  if (exportBtn) exportBtn.dataset.volunteerId = volunteerId;

  const adjustHoursBtn = document.getElementById('adjustHoursBtn');
  if (adjustHoursBtn) adjustHoursBtn.dataset.volunteerId = volunteerId;

  // Switch view
  setActiveView('edit-volunteer');
}

/* ------------------------------------------
   Filters
-------------------------------------------*/
export function filterVolunteers() {
  const searchInput = document.getElementById('searchVolunteer');
  const searchTerm = searchInput ? (searchInput.value || '').toLowerCase() : '';
  const rows = document.querySelectorAll('#volunteersTableBody tr');

  rows.forEach((row) => {
    const text = (row.textContent || '').toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

export { displayVolunteers as renderVolunteersPanel };
