import { setupAuthModule, registerAuthFormHandlers, toggleForm, signIn, signup, logout } from './modules/auth.js';
import { showDashboardSection, initDashboardNavigation } from './modules/dashboard.js';
import { attachGlobalUiHandlers } from './modules/ui.js';
import { initBillingUi, showBillingGate, hideBillingGate } from './modules/billing.js';
import {
  editVolunteerHours,
  saveVolunteerHours,
  addNewLog,
  createNewLog,
  deleteLog,
  closeEditModal,
  filterVolunteers,
  exportVolunteersToCsv
} from './modules/volunteerOps.js';
import { initApprovalsModule, renderApprovalQueue } from './modules/approvals.js';
import { downloadSheetsReport, closeSheetsModal, generateSheetsData } from './modules/reportingComms.js';
import { initAnalytics } from './modules/analytics.js';

document.addEventListener('DOMContentLoaded', () => {
  Object.assign(window, {
    toggleForm,
    signIn,
    signup,
    logout,
    showDashboard: showDashboardSection,
    editVolunteerHours,
    saveVolunteerHours,
    addNewLog,
    createNewLog,
    deleteLog,
    closeEditModal,
    filterVolunteers,
    exportVolunteersToCsv,
    downloadSheetsReport,
    closeSheetsModal,
    generateSheetsData,
    renderApprovalQueue,
    showBillingGate,
    hideBillingGate
  });

  // Initialize modules after functions are on the window
  attachGlobalUiHandlers();
  registerAuthFormHandlers();
  initDashboardNavigation();
  initBillingUi();
  setupAuthModule();
  initAnalytics();
  initApprovalsModule();
});
