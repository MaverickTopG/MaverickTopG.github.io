import { appState } from './state.js';
import { showMessage } from './ui.js';
import { db } from './firebase.js';
import { collection, query, where, orderBy, onSnapshot, doc, setDoc, addDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const SECTION_ID = 'programTemplatesSection';
const MODAL_ID = 'templateModal';

export function initProgramTemplatesModule() {
  bindTemplateEvents();
}

export async function loadProgramTemplates() {
  if (!appState.currentOrgCode) return;

  if (appState.programTemplatesUnsub) {
    try { appState.programTemplatesUnsub(); } catch (error) { console.warn(error); }
    appState.programTemplatesUnsub = null;
  }

  const q = query(
    collection(db, 'program_templates'),
    where('organizationCode', '==', appState.currentOrgCode),
    orderBy('name')
  );

  appState.programTemplatesUnsub = onSnapshot(q, (snapshot) => {
    const templates = [];
    snapshot.forEach((doc) => templates.push({ id: doc.id, ...doc.data() }));
    appState.programTemplates = templates;
    renderProgramTemplates();
  }, (error) => {
    console.error('Template listener failed', error);
    showMessage('Unable to load program templates.', 'error');
  });
}

export function renderProgramTemplates() {
  const section = document.getElementById(SECTION_ID);
  if (!section) return;

  section.innerHTML = `
    <div class="card-block">
      <div class="section-header">
        <h3><i class="fas fa-sitemap"></i> Campaign &amp; Shift Templates</h3>
        <div class="section-controls">
          <button class="btn-outline" data-template-action="refresh">Refresh</button>
          <button class="btn-primary" data-template-action="new">New Template</button>
        </div>
      </div>
      <p class="section-description">Build reusable playbooks for recurring events, including recommended roles, supply checklists, and shift capacity.</p>
      <div class="template-grid">
        ${appState.programTemplates.length ? appState.programTemplates.map(renderTemplateCard).join('') : '<div class="empty-state">No templates yet. Create one to save time on your next campaign.</div>'}
      </div>
    </div>
  `;
}

function renderTemplateCard(template) {
  const shifts = Array.isArray(template.shifts) ? template.shifts : [];
  const shiftCount = shifts.length;
  const waitlistCount = shifts.reduce((sum, shift) => sum + Number(shift.waitlistLimit || 0), 0);
  const supplies = Array.isArray(template.supplies) ? template.supplies : [];

  return `
    <div class="template-card" data-template-id="${template.id}">
      <div class="template-card__header">
        <h4>${template.name}</h4>
        <span class="badge badge-theme">${template.cohort || 'General'}</span>
      </div>
      <p>${template.description || 'No description provided.'}</p>
      <ul class="template-meta">
        <li><i class="fas fa-calendar-day"></i> ${shiftCount} shift${shiftCount === 1 ? '' : 's'}</li>
        <li><i class="fas fa-users"></i> Capacity ${totalCapacity(template)} (waitlist ${waitlistCount})</li>
        <li><i class="fas fa-box"></i> ${supplies.length || 0} supply item${supplies.length === 1 ? '' : 's'}</li>
      </ul>
      <div class="template-card__actions">
        <button class="btn-outline" data-template-action="duplicate">Duplicate</button>
        <button class="btn-outline" data-template-action="edit">Edit</button>
        <button class="btn-danger" data-template-action="delete">Delete</button>
      </div>
    </div>
  `;
}

function bindTemplateEvents() {
  const section = document.getElementById(SECTION_ID);
  const modal = document.getElementById(MODAL_ID);
  if (!section || !modal) return;

  section.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    const action = button.dataset.templateAction;
    const card = button.closest('.template-card');
    const templateId = card ? card.dataset.templateId : undefined;

    if (action === 'refresh') {
      loadProgramTemplates();
    }

    if (action === 'new') {
      openTemplateModal();
    }

    if (action === 'duplicate' && templateId) {
      duplicateTemplate(templateId);
    }

    if (action === 'delete' && templateId) {
      deleteTemplate(templateId);
    }

    if (action === 'edit' && templateId) {
      const template = appState.programTemplates.find((t) => t.id === templateId);
      openTemplateModal(template);
    }
  });

  modal.addEventListener('click', async (event) => {
    if (event.target.matches('[data-template-modal="close"]')) {
      closeTemplateModal();
    }

    if (event.target.matches('[data-template-modal="save"]')) {
      await saveTemplateFromModal();
    }

    if (event.target.matches('[data-template-modal="add-shift"]')) {
      addShiftRow();
    }
  });
}

function openTemplateModal(template = null) {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;

  const templateData = template || {};

  modal.dataset.templateId = templateData.id || '';
  modal.querySelector('[name="templateName"]').value = templateData.name || '';
  modal.querySelector('[name="templateDesc"]').value = templateData.description || '';
  modal.querySelector('[name="templateCohort"]').value = templateData.cohort || '';
  const suppliesField = modal.querySelector('[name="templateSupplies"]');
  const templateSupplies = Array.isArray(templateData.supplies) ? templateData.supplies : [];
  suppliesField.value = templateSupplies.join(', ');

  const shiftsWrapper = modal.querySelector('.template-shifts');
  shiftsWrapper.innerHTML = '';
  const shifts = Array.isArray(templateData.shifts) && templateData.shifts.length
    ? templateData.shifts
    : [{ name: '', capacity: 25, waitlistLimit: 5 }];
  shifts.forEach((shift) => {
    shiftsWrapper.appendChild(createShiftRow(shift));
  });

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeTemplateModal() {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function createShiftRow(shift = {}) {
  const row = document.createElement('div');
  row.className = 'shift-row';
  row.innerHTML = `
    <input type="text" placeholder="Shift name" value="${shift.name || ''}" data-field="name">
    <input type="number" min="1" placeholder="Capacity" value="${shift.capacity || 25}" data-field="capacity">
    <input type="number" min="0" placeholder="Waitlist" value="${shift.waitlistLimit || 5}" data-field="waitlistLimit">
    <button type="button" class="btn-icon" title="Remove shift" data-shift-action="remove">
      <i class="fas fa-trash"></i>
    </button>
  `;

  row.querySelector('[data-shift-action="remove"]').addEventListener('click', () => {
    row.remove();
  });

  return row;
}

function addShiftRow() {
  const modal = document.getElementById(MODAL_ID);
  const wrapper = modal.querySelector('.template-shifts');
  wrapper.appendChild(createShiftRow());
}

async function saveTemplateFromModal() {
  const modal = document.getElementById(MODAL_ID);
  const templateId = modal.dataset.templateId || null;

  const name = modal.querySelector('[name="templateName"]').value.trim();
  const description = modal.querySelector('[name="templateDesc"]').value.trim();
  const cohort = modal.querySelector('[name="templateCohort"]').value.trim();
  const supplies = modal.querySelector('[name="templateSupplies"]').value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const shiftRows = Array.from(modal.querySelectorAll('.template-shifts .shift-row'));
  const shifts = shiftRows.map((row) => ({
    name: row.querySelector('[data-field="name"]').value.trim() || 'Unnamed Shift',
    capacity: Number(row.querySelector('[data-field="capacity"]').value) || 0,
    waitlistLimit: Number(row.querySelector('[data-field="waitlistLimit"]').value) || 0
  }));

  if (!name) {
    showMessage('Template name is required.', 'error');
    return;
  }

  const currentAdmin = appState.currentAdmin || {};

  const payload = {
    name,
    description,
    cohort,
    supplies,
    shifts,
    organizationCode: appState.currentOrgCode,
    updatedAt: serverTimestamp(),
    updatedBy: currentAdmin.uid || null
  };

  try {
    if (templateId) {
      await setDoc(doc(db, 'program_templates', templateId), payload, { merge: true });
      showMessage('Template updated.', 'success');
    } else {
      await addDoc(collection(db, 'program_templates'), {
        ...payload,
        createdAt: serverTimestamp()
      });
      showMessage('Template created.', 'success');
    }
    closeTemplateModal();
  } catch (error) {
    console.error('Failed to save template', error);
    showMessage('Could not save template. Please try again.', 'error');
  }
}

async function duplicateTemplate(templateId) {
  const template = appState.programTemplates.find((t) => t.id === templateId);
  if (!template) return;

  const copy = { ...template };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.organizationCode;
  delete copy.duplicatedFrom;

  try {
    await addDoc(collection(db, 'program_templates'), {
      ...copy,
      name: `${template.name} Copy`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      organizationCode: appState.currentOrgCode,
      duplicatedFrom: templateId
    });
    showMessage('Template duplicated.', 'success');
  } catch (error) {
    console.error('Failed to duplicate template', error);
    showMessage('Could not duplicate template.', 'error');
  }
}

async function deleteTemplate(templateId) {
  if (!window.confirm('Delete this template? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db, 'program_templates', templateId));
    showMessage('Template deleted.', 'success');
  } catch (error) {
    console.error('Delete failed', error);
    showMessage('Could not delete template.', 'error');
  }
}

function totalCapacity(template) {
  return (template.shifts || []).reduce((sum, shift) => sum + Number(shift.capacity || 0), 0);
}