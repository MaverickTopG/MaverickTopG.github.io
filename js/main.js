import { setupAuthModule, registerAuthFormHandlers, toggleForm, signIn, signup, logout } from './modules/auth.js';
import { showDashboardSection, initDashboardNavigation } from './modules/dashboard.js';
import { attachGlobalUiHandlers } from './modules/ui.js';
import { initBillingModule, showBillingGate, hideBillingGate } from './modules/billing.js';
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
import { initCheckInBadge } from './modules/checkInBadge.js';

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

  // FIX: Initialize the auth module FIRST. This is critical to prevent race conditions.
  // The onAuthStateChanged listener must be active before any other code
  // (like a sign-in attempt) tries to interact with the authentication state.
  setupAuthModule();
  attachGlobalUiHandlers();
  registerAuthFormHandlers();
  initDashboardNavigation();
  initBillingModule();
  initAnalytics();
  initApprovalsModule();
  initCheckInBadge();
});
