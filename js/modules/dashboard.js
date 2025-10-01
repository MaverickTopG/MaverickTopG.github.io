import { appState } from './state.js';
import { showMessage, animateNumber, setTextContent } from './ui.js';
import {
  initVolunteerEditView,
  resetVolunteerListener,
  loadVolunteersData,
  registerVolunteersUpdateHandler,
  computeInitials,
  displayVolunteers as renderVolunteersPanel
} from './volunteerOps.js';
import {
  resetActivityListener,
  loadActivityData,
  registerActivityUpdateHandler,
  getCurrentWeekBoundaries
} from './programsEvents.js';
import { initApprovalsModule, renderApprovalQueue } from './approvals.js';
import { renderAnalytics, refreshAnalytics, renderCalendarHeatmap } from './analytics.js';
import { hideBillingGate } from './billing.js';

const VOLUNTEER_HOUR_VALUE = 28.27;
let weekOffset = 0;        // 0 = this week, -1 = last week, etc.
let navigationInitialized = false;
let activeView = 'overview';


/** ── NAVIGATION & VIEW SWITCHING ─────────────────────────────────────────── */

export function initDashboardNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-view]');
  if (!navItems.length) return;

  if (!navigationInitialized) {
    document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
      weekOffset -= 1;
      renderAttendanceChart();
    });
    document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
      weekOffset = Math.min(0, weekOffset + 1);
      renderAttendanceChart();
    });
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const next = item.dataset.view;
        if (next && next !== activeView) setActiveView(next);
      });
    });
    navigationInitialized = true;
  }

  setActiveView(activeView);
}

export function setActiveView(view) {
  activeView = view;
  document.querySelectorAll('.sidebar-nav .nav-item[data-view]')
    .forEach(i => i.classList.toggle('active', i.dataset.view === view));
  document.querySelectorAll('.view-panel')
    .forEach(p => p.classList.toggle('active', p.dataset.view === view));

  if (view === 'approvals') {
    initApprovalsModule();
  } else if (view === 'overview') {
    updateStatistics();
    renderAttendanceChart();
    renderTopVolunteers();
    renderEventActivityChart();
    renderCalendarHeatmap();
  }
}

export function showAuthSection() {
  document.getElementById('authSection').style.display = 'flex';
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('navbarLogoutBtn').style.display = 'none';
  document.querySelector('nav.navbar').style.display = 'flex';
  hideBillingGate();
  document.body.classList.add('has-aurora');
  resetRealtimeListeners();
  activeView = 'overview';
}

export function showDashboardSection() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'flex';
  document.getElementById('navbarLogoutBtn').style.display = 'block';
  document.querySelector('nav.navbar').style.display = 'none';
  hideBillingGate();
  document.body.classList.remove('has-aurora');
  initDashboardNavigation();
}


/** ── INITIALIZATION ─────────────────────────────────────────────────────── */

export async function initializeDashboard() {
  initVolunteerEditView();
  try {
    displayAdminInfo();
    initDashboardNavigation();

    registerVolunteersUpdateHandler(() => {
      updateStatistics();
      renderAttendanceChart();
      renderTopVolunteers();
      renderEventActivityChart();
      renderVolunteersPanel();
      refreshAnalytics();
    });

    registerActivityUpdateHandler((source) => {
      renderAttendanceChart();
      renderEventActivityChart();
      renderCalendarHeatmap();
      refreshAnalytics();
      if (source !== 'approval') {
        renderApprovalQueue();
      }
    });

    resetRealtimeListeners();
    loadVolunteersData();
    loadActivityData();
    initApprovalsModule();

    updateStatistics();
    renderAttendanceChart();
    renderTopVolunteers();
    renderEventActivityChart();
    renderCalendarHeatmap();
    renderApprovalQueue();
    renderVolunteersPanel();
  } catch (err) {
    console.error('Error initializing dashboard:', err);
    showMessage('Error loading dashboard. Please refresh the page.', 'error');
  }
}

function resetRealtimeListeners() {
  resetVolunteerListener();
  resetActivityListener();
  // approvals lives in its own module
}

function displayAdminInfo() {
  const { email = '', organizationName = 'Organization' } = appState.currentAdmin || {};
  const orgCode = appState.currentOrgCode || 'XXXXXXXX';

  setTextContent('sidebarUserEmail', email);
  setTextContent('sidebarOrgName', organizationName);
  setTextContent('sidebarOrgCode', orgCode);
  setTextContent('sidebarAvatar', computeInitials(email, organizationName));
}


/** ── STAT METRICS ─────────────────────────────────────────────────────────── */

export function updateStatistics() {
  const metrics = buildMetrics();

  animateNumber('metricTotalVolunteers', metrics.totalVolunteers, 0, v => v.toLocaleString());
  animateNumber('metricWeeklyActive',   metrics.weeklyActive,   0, v => v.toLocaleString());
  animateNumber('metricHours',         metrics.totalHours,     1, formatHours);
  animateNumber('metricEvents',        metrics.uniqueEvents,   0, v => v.toLocaleString());
  renderEventActivityChart(metrics.weeklyActive, metrics.totalVolunteers);
  setTextContent('metricBusiestDay', metrics.busiestDay);
  animateNumber('metricImpact',       metrics.donationValue,   0, formatCurrency);
}

function buildMetrics() {
  // FIX: Decouple total metrics from weekly attendance data to prevent incorrect recalculations.
  // The `buildWeeklyAttendanceData` function is scoped to a single week (with offsets),
  // which was causing total hours to be miscalculated when navigating weeks.
  // This now correctly calculates metrics over all time, independent of the weekly chart's view.
  const { labels: weeklyLabels, data: weeklyData } = buildWeeklyAttendanceData();
  const { startOfWeek, endOfWeek } = getCurrentWeekBoundaries(); // Use current week for "weekly active"

  // busiest day
  const max = Math.max(...weeklyData);
  const busiest = max > 0 ? weeklyLabels[weeklyData.indexOf(max)] : '—';

  // Map roles to skip org-admins
  const roles = new Map(appState.volunteersData.map(v => [v.id, v.role]));

  // who logged this week?
  const activeSet = new Set();
  appState.activityData.forEach(log => {
    const logDate = normalizeDateValue(log.date);
    // FIX: Correct variable names `startOfWeek` and `endOfWeek` were not being used.
    if (logDate && logDate >= startOfWeek && logDate < endOfWeek && log.user_id && roles.get(log.user_id) !== 'org-admin') {
      activeSet.add(log.user_id);
    }
  });

  const nonAdmins = appState.volunteersData.filter(v => v.role !== 'org-admin');
  const totalVols = nonAdmins.length;  
  // FIX: Calculate total hours from all approved logs, not just the current week.
  // The previous logic was flawed. This correctly sums up the pre-calculated totalHours
  // from each volunteer, which already respects the 'approved' status.
  const totalApprovedHours = appState.volunteersData
    .filter(v => v.role !== 'org-admin')
    .reduce((sum, v) => sum + (v.totalHours || 0), 0);
  const uniqEvt = getUniqueEventCount(appState.activityData);
  const donation = calculateDonationValue(totalApprovedHours);

  return {
    totalVolunteers: totalVols,
    weeklyActive:   activeSet.size,
    totalHours:     totalApprovedHours,
    uniqueEvents:   uniqEvt,
    donationValue:  donation,
    busiestDay:     busiest
  };
}


/** ── ATTENDANCE BAR CHART ───────────────────────────────────────────────── */

function renderAttendanceChart() {
  const canvas = document.getElementById('attendanceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { labels, data, weekStart, weekEnd } = buildWeeklyAttendanceData();
  
  // FIX: Update chart title to always show the date range.
  const titleEl = document.querySelector('.activity-card .card-header h3');
  if (titleEl) {
    const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    const s = weekStart.toLocaleDateString(undefined, opts);
    const e = new Date(weekEnd);
    e.setUTCDate(e.getUTCDate() - 1);
    titleEl.textContent = `Volunteer Hours: ${s} - ${e.toLocaleDateString(undefined, opts)}`;
  }
  document.getElementById('nextWeekBtn').disabled = weekOffset >= 0;

  // gradient fill
  const grad = ctx.createLinearGradient(0,0,0,canvas.height);
  grad.addColorStop(0, 'rgba(255,159,28,0.85)');
  grad.addColorStop(1, 'rgba(255,190,11,0.2)');

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Volunteer Hours',
        data,
        backgroundColor: grad,
        borderColor: '#ff9f1c',
        borderWidth: 2,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: t => `${t.dataset.label}: ${t.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        x: { ticks:{ color:'rgba(74,44,0,0.55)' }, grid:{ display:false } },
        y: {
          beginAtZero: true,
          ticks:{ color:'rgba(74,44,0,0.45)' },
          grid:{ color:'rgba(255,190,11,0.15)' }
        }
      }
    }
  };

  if (appState.attendanceChart) {
    appState.attendanceChart.data = config.data;
    appState.attendanceChart.update();
  } else {
    appState.attendanceChart = new window.Chart(ctx, config);
  }
}


/** ── TOP VOLUNTEERS LIST ────────────────────────────────────────────────── */

function renderTopVolunteers() {
  const list = document.getElementById('topEmployeesList');
  if (!list) return;

  const top5 = [...appState.volunteersData]
    .sort((a,b) => (b.totalHours||0) - (a.totalHours||0))
    .slice(0,5);

  if (!top5.length) {
    list.innerHTML = '<li class="placeholder">No volunteer activity recorded yet.</li>';
    return;
  }

  list.innerHTML = top5.map(v => {
    const name = v.firstName || v.email || 'Volunteer';
    const initials = computeInitials(name, v.email);
    const hrs = (v.totalHours||0).toFixed(1);
    return `
      <li>
        <div class="employee-meta">
          <div class="employee-avatar">${initials}</div>
          <div class="employee-text">
            <div class="employee-name">${name}</div>
            <div class="subtle-text">${v.email||''}</div>
          </div>
        </div>
        <div class="employee-hours">${hrs} hrs</div>
      </li>
    `;
  }).join('');
}


/** ── ACTIVITY DOUGHNUT CHART ────────────────────────────────────────────── */

function renderEventActivityChart() {
  const canvas = document.getElementById('eventActivityChart');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  // FIX: Consolidate active volunteer calculation here to ensure consistency.
  // This logic was previously split and incorrect, causing the chart to show 0.
  // Also, ensure we only count approved logs for active volunteers.
  const { startOfWeek, endOfWeek } = getCurrentWeekBoundaries();
  const roles = new Map(appState.volunteersData.map(v => [v.id, v.role]));
  const activeSet = new Set();
  appState.activityData.forEach(log => {
    const logDate = normalizeDateValue(log.date);
    const status = (log.approve || 'pending').toLowerCase();
    if (logDate && logDate >= startOfWeek && logDate < endOfWeek && log.user_id && roles.get(log.user_id) !== 'org-admin' && (status === 'approved' || status === 'accepted')) {
      activeSet.add(log.user_id);
    }
  });

  const engaged = activeSet.size;
  const totalVolunteers = appState.volunteersData.filter(v => v.role !== 'org-admin').length;
  const inactive = Math.max(0, totalVolunteers - engaged);
  const pct = totalVolunteers > 0 ? Math.round((engaged / totalVolunteers) * 100) : 0;

  document.getElementById('eventActivityPercent').textContent = `${pct}%`;

  const data = {
    labels: ['Active','Inactive'],
    datasets:[{
      data: totalVolunteers > 0 ? [engaged, inactive] : [0, 1],
      backgroundColor: ['#ff9f1c','rgba(74,44,0,0.15)'],
      borderWidth:0
    }]
  };

  if (appState.eventActivityChart) {
    appState.eventActivityChart.data = data;
    appState.eventActivityChart.update();
  } else {
    appState.eventActivityChart = new window.Chart(context, {
      type:'doughnut',
      data,
      options:{
        responsive:true,
        maintainAspectRatio:false,
        cutout:'68%',
        plugins:{ legend:{ display:false } }
      }
    });
  }
}


/** ── WEEKLY ATTENDANCE DATA ──────────────────────────────────────────────── */

function buildWeeklyAttendanceData() {
  const { startOfWeek, endOfWeek } = getCurrentWeekBoundaries();
  const weekStart = new Date(startOfWeek);
  weekStart.setUTCDate(weekStart.getUTCDate() + weekOffset * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const data   = new Array(7).fill(0);

  const roles = new Map(appState.volunteersData.map(v => [v.id, v.role]));

  // FIX: Ensure only approved hours are counted in the weekly chart.
  const approvedLogs = appState.activityData.filter(log => ['approved', 'accepted'].includes((log.approve || 'pending').toLowerCase()));

  approvedLogs.forEach(log => {
    const d = normalizeDateValue(log.date);
    if (d && d >= weekStart && d < weekEnd && roles.get(log.user_id) !== 'org-admin') {
      // FIX: Use getUTCDay() to align with the UTC-based week boundaries.
      data[d.getUTCDay()] += parseFloat(log.hours_contributed || log.hours) || 0;
    }
  });

  return { labels, data, weekStart, weekEnd };
}


/** ── UTILITIES ──────────────────────────────────────────────────────────── */

function getUniqueEventCount(logs) {
  const set = new Set();
  logs.forEach(l => {
    const key = (l.campaign||l.event||l.site||l.location||'').toLowerCase();
    if (key) set.add(key);
  });
  return set.size;
}

function calculateDonationValue(hours) {
  return hours * VOLUNTEER_HOUR_VALUE;
}

function formatHours(h) {
  const total = Number(h) || 0;
  const hrs   = Math.floor(total);
  const mins  = Math.round((total - hrs)*60);
  return `${hrs.toLocaleString()}h ${String(mins).padStart(2,'0')}m`;
}

function formatCurrency(v) {
  return new Intl.NumberFormat(undefined, {
    style:'currency',
    currency:'USD',
    maximumFractionDigits:0
  }).format(v||0);
}

function normalizeDateValue(val) {
  if (!val) return null;
  // FIX: Consistently use UTC for all date normalization to match week boundary calculations.
  // Using local time methods like `setHours` can cause off-by-one-day errors in different timezones.
  let d;

  if (typeof val.toDate === 'function') {
    d = val.toDate();
  } else if (val.seconds != null && val.nanoseconds != null) {
    const ms = val.seconds*1e3 + Math.floor(val.nanoseconds/1e6);
    d = new Date(ms);
  } else {
    d = new Date(val);
  }

  if (!isNaN(d.getTime())) {
    // FIX: Do not zero out the time here. Let comparisons happen with full date-time objects.
    return d;
  }

  return null;
}
