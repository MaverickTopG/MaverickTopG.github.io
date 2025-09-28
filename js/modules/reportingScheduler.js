import { appState } from './state.js';
import { showMessage } from './ui.js';
import { db } from './firebase.js';
import { collection, query, where, orderBy, onSnapshot, doc, setDoc, addDoc, deleteDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const SECTION_ID = 'reportingSchedulerSection';
const MODAL_ID = 'scheduleReportModal';

const FREQUENCIES = ['Weekly', 'Monthly', 'Quarterly'];
const FORMATS = ['CSV', 'PDF'];

export function initReportingScheduler() {
  bindSchedulerEvents();
}

export function loadScheduledReports() {
  if (!appState.currentOrgCode) return;

  if (appState.reportSchedulesUnsub) {
    try { appState.reportSchedulesUnsub(); } catch (error) { console.warn(error); }
    appState.reportSchedulesUnsub = null;
  }

  const q = query(
    collection(db, 'report_schedules'),
    where('organizationCode', '==', appState.currentOrgCode),
    orderBy('createdAt', 'desc')
  );

  appState.reportSchedulesUnsub = onSnapshot(q, (snapshot) => {
    const schedules = [];
    snapshot.forEach((doc) => schedules.push({ id: doc.id, ...doc.data() }));
    appState.scheduledReports = schedules;
    renderReportingScheduler();
  }, (error) => {
    console.error('Report schedule listener failed', error);
    showMessage('Unable to load report schedules.', 'error');
  });
}

export function renderReportingScheduler() {
  const section = document.getElementById(SECTION_ID);
  if (!section) return;

  section.innerHTML = `
    <div class="card-block">
      <div class="section-header">
        <h3><i class="fas fa-paper-plane"></i> Scheduled Impact Reports</h3>
        <button class="btn-primary" data-report-action="new">Schedule Report</button>
      </div>
      <p class="section-description">Automatically email funders and stakeholders with branded summaries of your impact.</p>
      <div class="schedule-list">
        ${appState.scheduledReports.length ? appState.scheduledReports.map(renderScheduleCard).join('') : '<div class="empty-state">No scheduled reports yet. Automate your updates to save time.</div>'}
      </div>
    </div>
  `;
}

function renderScheduleCard(schedule) {
  const nextSend = schedule.nextRunAt ? new Date(schedule.nextRunAt.seconds ? schedule.nextRunAt.toDate() : schedule.nextRunAt).toLocaleString() : 'Queued on next cycle';
  const recipients = (schedule.recipients || []).join(', ');

  return `
    <div class="schedule-card" data-schedule-id="${schedule.id}">
      <div class="schedule-card__header">
        <div>
          <h4>${schedule.name || schedule.frequency + ' Report'}</h4>
          <span class="subtle-text">${schedule.frequency} | ${schedule.format}</span>
        </div>
        <span class="badge badge-status">${schedule.isActive === false ? 'Paused' : 'Active'}</span>
      </div>
      <p>${schedule.description || 'No description added.'}</p>
      <div class="schedule-card__meta">
        <div>
          <span class="label">Recipients</span>
          <strong>${recipients || 'Not specified'}</strong>
        </div>
        <div>
          <span class="label">Next Send</span>
          <strong>${nextSend}</strong>
        </div>
      </div>
      <div class="schedule-card__actions">
        <button class="btn-outline" data-report-action="pause">${schedule.isActive === false ? 'Resume' : 'Pause'}</button>
        <button class="btn-outline" data-report-action="edit">Edit</button>
        <button class="btn-danger" data-report-action="delete">Delete</button>
      </div>
    </div>
  `;
}

function bindSchedulerEvents() {
  const section = document.getElementById(SECTION_ID);
  const modal = document.getElementById(MODAL_ID);
  if (!section || !modal) return;

  section.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    const action = button.dataset.reportAction;
    const card = button.closest('.schedule-card');
    const scheduleId = card ? card.dataset.scheduleId : undefined;

    if (action === 'new') {
      openScheduleModal();
    }

    if (action === 'pause' && scheduleId) {
      toggleSchedule(scheduleId);
    }

    if (action === 'edit' && scheduleId) {
      const schedule = appState.scheduledReports.find((item) => item.id === scheduleId);
      openScheduleModal(schedule);
    }

    if (action === 'delete' && scheduleId) {
      deleteSchedule(scheduleId);
    }
  });

  modal.addEventListener('click', async (event) => {
    if (event.target.matches('[data-schedule-modal="close"]')) {
      closeScheduleModal();
    }

    if (event.target.matches('[data-schedule-modal="save"]')) {
      await saveScheduleFromModal();
    }
  });
}

function openScheduleModal(schedule = null) {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;

  const scheduleData = schedule || {};

  modal.dataset.scheduleId = scheduleData.id || '';
  modal.querySelector('[name="reportName"]').value = scheduleData.name || '';
  modal.querySelector('[name="reportDescription"]').value = scheduleData.description || '';
  modal.querySelector('[name="reportFrequency"]').value = scheduleData.frequency || FREQUENCIES[0];
  modal.querySelector('[name="reportFormat"]').value = scheduleData.format || FORMATS[0];
  const scheduleRecipients = Array.isArray(scheduleData.recipients) ? scheduleData.recipients : [];
  modal.querySelector('[name="reportRecipients"]').value = scheduleRecipients.join(', ');
  modal.querySelector('[name="reportNotes"]').value = scheduleData.notes || '';

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeScheduleModal() {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

async function saveScheduleFromModal() {
  const modal = document.getElementById(MODAL_ID);
  const scheduleId = modal.dataset.scheduleId || null;

  const payload = {
    name: modal.querySelector('[name="reportName"]').value.trim(),
    description: modal.querySelector('[name="reportDescription"]').value.trim(),
    frequency: modal.querySelector('[name="reportFrequency"]').value,
    format: modal.querySelector('[name="reportFormat"]').value,
    recipients: modal.querySelector('[name="reportRecipients"]').value
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean),
    notes: modal.querySelector('[name="reportNotes"]').value.trim(),
    organizationCode: appState.currentOrgCode,
    updatedAt: serverTimestamp(),
    updatedBy: (appState.currentAdmin && appState.currentAdmin.uid) || null,
    isActive: true
  };

  if (!payload.name) {
    showMessage('Report name is required.', 'error');
    return;
  }

  if (!payload.recipients.length) {
    showMessage('Provide at least one recipient email.', 'error');
    return;
  }

  try {
    if (scheduleId) {
      await setDoc(doc(db, 'report_schedules', scheduleId), payload, { merge: true });
      showMessage('Schedule updated.', 'success');
    } else {
      await addDoc(collection(db, 'report_schedules'), {
        ...payload,
        createdAt: serverTimestamp(),
        nextRunAt: serverTimestamp()
      });
      showMessage('Schedule created.', 'success');
    }
    closeScheduleModal();
  } catch (error) {
    console.error('Failed to save schedule', error);
    showMessage('Unable to save schedule.', 'error');
  }
}

async function toggleSchedule(scheduleId) {
  const schedule = appState.scheduledReports.find((item) => item.id === scheduleId);
  if (!schedule) return;

  try {
    await updateDoc(doc(db, 'report_schedules', scheduleId), {
      isActive: schedule.isActive === false,
      updatedAt: serverTimestamp()
    });
    showMessage(`Schedule ${schedule.isActive === false ? 'resumed' : 'paused'}.`, 'success');
  } catch (error) {
    console.error('Failed to toggle schedule', error);
    showMessage('Unable to update schedule status.', 'error');
  }
}

async function deleteSchedule(scheduleId) {
  if (!window.confirm('Delete this scheduled report?')) return;

  try {
    await deleteDoc(doc(db, 'report_schedules', scheduleId));
    showMessage('Scheduled report deleted.', 'success');
  } catch (error) {
    console.error('Delete failed', error);
    showMessage('Unable to delete schedule.', 'error');
  }
}