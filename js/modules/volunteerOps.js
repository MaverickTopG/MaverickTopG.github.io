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
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { appState } from './state.js';
import { showMessage, setTextContent } from './ui.js';
import { setActiveView } from './dashboard.js';

let volunteersUpdateHandler = () => {};

export function registerVolunteersUpdateHandler(handler) {
  volunteersUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

export function notifyVolunteersUpdate() {
  volunteersUpdateHandler();
}

export function initVolunteerEditView() {
  const backBtn = document.getElementById('backToVolunteersBtn');
  if (backBtn) backBtn.addEventListener('click', () => setActiveView('volunteers'));

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

export function computeInitials(nameSource, fallback) {
  const primary = nameSource || fallback || '';
  if (!primary) return 'N';
  const cleaned = primary.trim();
  if (!cleaned) return 'N';
  const parts = cleaned.split(/\s+/);
  const initials = parts.length > 1 ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}` : cleaned.slice(0, 2);
  return initials.toUpperCase();
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
        const name = data.firstName || data.name || (data.email ? data.email.split('@')[0] : 'Unknown');

        volunteers.push({
          id: d.id,
          firstName: name,
          email: data.email || '',
          totalHours: 0,
          lastActivity: null,
          logs: [],
          registrationDate: data.createdAt || null,
          role: normalizeRole(data.role),
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

export function syncVolunteerHoursFromActivity(activityLogs, baseVolunteers = appState.volunteersData) {
  const map = new Map();

  baseVolunteers.forEach((v) => {
    map.set(v.id, { ...v, totalHours: 0, lastActivity: null, logs: [] });
  });

  activityLogs.forEach((log, index) => {
    const userId = log.user_id;
    if (!userId) {
      console.warn(`Activity log missing user_id at index ${index}`, log);
      return;
    }

    if (!map.has(userId)) {
      const email = log.volunteer_email || log.email || 'Unknown';
      const name = log.firstName || log.volunteer_name || (email.includes('@') ? email.split('@')[0] : 'Unknown'); // Correctly uses firstName from log
      map.set(userId, {
        id: userId,
        firstName: name,
        email,
        totalHours: 0,
        lastActivity: null,
        logs: [],
        registrationDate: null,
        role: normalizeRole(log.role),
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
import { triggerListAnimation } from './ui.js';

export function displayVolunteers() { // This function is also exported as renderVolunteersPanel
  const tbody = document.getElementById('volunteersTableBody');
  if (!tbody) return;

  const visible = appState.volunteersData.filter((v) => (v.role || 'volunteer') !== 'org-admin');
  tbody.innerHTML = '';

  if (visible.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#666;">No volunteers found</td></tr>';
    return;
  }

  visible.forEach((v) => {
    const name = v.firstName || 'Unknown';
    const lastActivity = v.lastActivity ? new Date(v.lastActivity).toLocaleDateString() : 'Never';
    const rolesCatalog = appState.rolesCatalog || [];
    const roleMeta = rolesCatalog.find((r) => r.id === v.role) || { name: v.role || 'Volunteer' };

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${name}</td>
      <td>${v.email}</td>
      <td><span class="role-pill role-${v.role || 'volunteer'}">${roleMeta.name}</span></td>
      <td><span class="hours-badge">${(v.totalHours || 0).toFixed(1)} hrs</span></td>
      <td>${lastActivity}</td>
      <td class="table-actions">
        <button class="btn-icon" title="Edit Volunteer" onclick="showEditVolunteerView('${v.id}')"><i class="fas fa-pencil-alt"></i></button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Trigger the rolling fade-in animation for the new rows
  triggerListAnimation('#volunteersTableBody tr');
}

export function exportVolunteersToCsv() {
  const volunteers = appState.volunteersData.filter((v) => (v.role || 'volunteer') !== 'org-admin');
  if (!volunteers.length) {
    showMessage('No volunteer data to export.', 'error');
    return;
  }

  const headers = ['Name', 'Email', 'Role', 'Total Hours', 'Last Activity'];
  const rows = volunteers.map((v) => {
    const name = v.firstName || 'Unknown';
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
      <input type="date" data-field="date" value="${date}" class="log-input" title="Activity Date">
      <input type="text" data-field="site" value="${site}" placeholder="Volunteering Task" class="log-input">
      <input type="number" data-field="hours" value="${hours}" step="0.5" min="0" class="log-input">
      <select data-field="status" class="log-input" title="Approval Status">
        <option value="approved" ${status === 'approved' || status === 'accepted' ? 'selected' : ''}>Approved</option>
        <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="denied" ${status === 'denied' ? 'selected' : ''}>Denied</option>
      </select>
    </div>
  `;
}

function handleAddNewLog() {
  const container = document.getElementById('activityLogsContainer');
  if (!container) return;
  if (container.querySelector('.empty-state')) container.innerHTML = '';
  container.insertAdjacentHTML('beforeend', createLogRow());
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
  const creations = [];
  const deletions = [];

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
      email: volunteer.email, // Add volunteer's email to new logs
      organization_id: appState.currentOrgCode,
    };

    if (isNew) {
      creations.push(addDoc(collection(db, 'volunteer_logs'), { ...logData, created_at: serverTimestamp() }));
    } else {
      updates.push(updateDoc(doc(db, 'volunteer_logs', logId), logData));
    }
  });

  // FIX: Await all promises to ensure all operations (updates, creations, deletions) complete.
  // The previous implementation was not correctly awaiting the array of promises.
  await Promise.all([...updates, ...creations, ...deletions]);

  // FIX: Re-render the view after saving to reflect all changes immediately.
  // This ensures that status changes (like 'denied') and hour totals are updated on the screen.
  await showEditVolunteerView(volunteerId);
  showMessage('Activity logs saved successfully.', 'success');
}

async function handleDeleteVolunteer() {
  const volunteerId = appState.editingVolunteerId;
  await deleteVolunteer(volunteerId);
}

/* ------------------------------------------
   Entry: open the per-volunteer editor view
-------------------------------------------*/
export async function showEditVolunteerView(volunteerId) {
  const volunteer = appState.volunteersData.find((v) => v.id === volunteerId);
  if (!volunteer) {
    showMessage('Could not find volunteer to edit.', 'error');
    return;
  }

  // Fetch logs for this volunteer (NO orderBy -> no composite index needed)
  const logsQueryRef = query(
    collection(db, 'volunteer_logs'),
    where('user_id', '==', volunteerId),
    where('organization_id', '==', appState.currentOrgCode)
  );
  const logsSnapshot = await getDocs(logsQueryRef);
  const volunteerLogs = [];
  logsSnapshot.forEach((d) => volunteerLogs.push({ id: d.id, ...d.data() }));

  // Sort client-side by created_at (desc), fallback to date/createdAt
  volunteerLogs.sort(
    (a, b) =>
      tsToMillis(b.created_at || b.date || b.createdAt) -
      tsToMillis(a.created_at || a.date || a.createdAt)
  );

  appState.editingVolunteerId = volunteerId;

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

  // Render logs in the inline editor panel
  renderActivityLogs(volunteerLogs);

  // Wire controls
  const addLogBtn = document.getElementById('addNewLogBtn');
  if (addLogBtn) addLogBtn.onclick = handleAddNewLog;

  const deleteBtn = document.getElementById('deleteVolunteerBtn');
  if (deleteBtn) deleteBtn.dataset.volunteerId = volunteerId;

  const saveBtn = document.getElementById('saveVolunteerBtn');
  if (saveBtn) saveBtn.dataset.volunteerId = volunteerId;

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
