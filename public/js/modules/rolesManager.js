import { appState } from './state.js';
import { showMessage, formatEmailForDisplay } from './ui.js';
import { db } from './firebase.js';
import { doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { notifyVolunteersUpdate } from './volunteerOps.js';

const SECTION_ID = 'rolesManagerSection';
const ROLE_MODAL_ID = 'roleModal';

export function initRolesManager() {
  renderRolesManager();
  bindRoleManagerEvents();
}

export function renderRolesManager() {
  const section = document.getElementById(SECTION_ID);
  if (!section) return;

  const members = appState.volunteersData;
  section.innerHTML = `
    <div class="card-block">
      <div class="section-header">
        <h3><i class="fas fa-user-shield"></i> Team &amp; Roles</h3>
        <div class="section-controls">
          <button class="btn-outline" data-action="select-all"><i class="fas fa-check-double"></i> Select All</button>
          <button class="btn-outline" data-action="clear-selection"><i class="fas fa-eraser"></i> Clear</button>
          <button class="btn-primary" data-action="change-role" ${disableIfNone()}><i class="fas fa-user-gear"></i> Change Role</button>
        </div>
      </div>
      <p class="section-description">Bulk update access levels for admins, program managers, schedulers, and auditors.</p>
      <div class="role-grid">
        ${renderRoleCards(members)}
      </div>
    </div>
  `;
}
function renderRoleCards(members) {
  if (!members.length) {
    return '<div class="empty-state">No team members found.</div>';
  }

  return members.map((member) => {
    const selected = appState.roleManagerSelection.has(member.id);
    const lastActivity = member.lastActivity ? new Date(member.lastActivity).toLocaleDateString() : 'N/A';
    const roleMeta = appState.rolesCatalog.find((role) => role.id === member.role) || { name: member.role || 'Volunteer' };
    const name = member.firstName || 'Unknown';
    const email = member.email || 'N/A';
    return `
      <article class="role-card ${selected ? 'role-card--selected' : ''}">
        <label class="role-card__checkbox">
          <input type="checkbox" data-id="${member.id}" ${selected ? 'checked' : ''}>
          <span class="checkbox-indicator"><i class="fas fa-check"></i></span>
        </label>
        <div class="role-card__header">
          <div>
            <h4>${name}</h4>
            <span class="subtle-text" title="${email}">${formatEmailForDisplay(email)}</span>
          </div>
          <span class="role-pill role-${member.role || 'volunteer'}">${roleMeta.name}</span>
        </div>
        <div class="role-card__meta">
          <div>
            <span class="label">Hours</span>
            <strong>${(member.totalHours || 0).toFixed(1)} hrs</strong>
          </div>
          <div>
            <span class="label">Last Active</span>
            <strong>${lastActivity}</strong>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function bindRoleManagerEvents() {
  const section = document.getElementById(SECTION_ID);
  const modal = document.getElementById(ROLE_MODAL_ID);
  if (!section || !modal) return;

  section.addEventListener('change', (event) => {
    const checkbox = event.target;
    if (!checkbox.matches('input[type="checkbox"][data-id]')) return;
    const memberId = checkbox.dataset.id;
    if (checkbox.checked) {
      appState.roleManagerSelection.add(memberId);
    } else {
      appState.roleManagerSelection.delete(memberId);
    }
    renderRolesManager();
  });

  section.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.dataset.action === 'select-all') {
      appState.volunteersData.forEach((member) => appState.roleManagerSelection.add(member.id));
      renderRolesManager();
    }

    if (button.dataset.action === 'clear-selection') {
      appState.roleManagerSelection.clear();
      renderRolesManager();
    }

    if (button.dataset.action === 'change-role') {
      openRoleModal();
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target.matches('[data-role-modal="close"]')) {
      closeRoleModal();
    }

    if (event.target.matches('[data-role-modal="save"]')) {
      const select = modal.querySelector('select');
      const role = select.value;
      if (!role) {
        showMessage('Select a role to assign.', 'error');
        return;
      }
      applyRoleChange(role);
    }
  });
}

function openRoleModal() {
  const modal = document.getElementById(ROLE_MODAL_ID);
  if (!modal) return;

  const options = appState.rolesCatalog.map((role) => `<option value="${role.id}">${role.name}</option>`).join('');
  modal.querySelector('select').innerHTML = `<option value="">Select role</option>${options}`;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeRoleModal() {
  const modal = document.getElementById(ROLE_MODAL_ID);
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

async function applyRoleChange(roleId) {
  if (!appState.roleManagerSelection.size) {
    showMessage('Select members to update.', 'error');
    return;
  }

  const members = appState.volunteersData.filter((member) => appState.roleManagerSelection.has(member.id));

  const batch = members.map(async (member) => {
    member.role = roleId;
    if (!member.id) return null;
    try {
      const currentAdmin = appState.currentAdmin || {};
      await updateDoc(doc(db, 'users', member.id), {
        role: roleId,
        roleUpdatedAt: serverTimestamp(),
        roleUpdatedBy: currentAdmin.uid || null
      });
      return true;
    } catch (error) {
      console.error('Role update failed', error);
      return false;
    }
  });

  await Promise.all(batch);
  closeRoleModal();
  showMessage(`Updated ${members.length} member${members.length === 1 ? '' : 's'} role to ${roleId}.`, 'success');
  notifyVolunteersUpdate();
}

function disableIfNone() {
  return appState.roleManagerSelection.size ? '' : 'disabled';
}
