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

const VOLUNTEER_HOUR_VALUE = 28.27;

let weekOffset = 0; // 0 for current week, -1 for last week, etc.

let navigationInitialized = false;
let activeView = 'overview';

export function initDashboardNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-view]');
  if (!navItems.length) {
    return;
  }

  if (!navigationInitialized) {
    const prevWeekBtn = document.getElementById('prevWeekBtn');
    const nextWeekBtn = document.getElementById('nextWeekBtn');

    if (prevWeekBtn) {
      prevWeekBtn.addEventListener('click', () => {
        weekOffset -= 1;
        renderAttendanceChart();
      });
    }

    if (nextWeekBtn) {
      nextWeekBtn.addEventListener('click', () => {
        weekOffset += 1;
        // Prevent going into the future
        if (weekOffset > 0) weekOffset = 0;
        renderAttendanceChart();
      });
    }

    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const { view } = item.dataset;
        if (!view || view === activeView) {
          return;
        }
        setActiveView(view);
      });
    });
    navigationInitialized = true;
  }

  setActiveView(activeView);
}

export function setActiveView(view) {
  activeView = view;

  const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-view]');
  navItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  const panels = document.querySelectorAll('.view-panel');
  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.view === view);
  });

  if (view === 'approvals') {
    initApprovalsModule();
  } else if (view === 'overview') {
    updateStatistics();
    renderAttendanceChart();
    renderTopEmployees();
    renderEventActivityChart();
    renderCalendarHeatmap();
  }
}

export function showAuthSection() {
  const authSection = document.getElementById('authSection');
  const dashboardSection = document.getElementById('dashboardSection');
  const sidebarLogoutBtn = document.getElementById('logoutBtn');
  const navbarLogoutBtn = document.getElementById('navbarLogoutBtn');
  const topNavbar = document.querySelector('nav.navbar');

  if (authSection) authSection.style.display = 'flex';
  if (dashboardSection) dashboardSection.style.display = 'none';
  if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = 'none';
  if (navbarLogoutBtn) navbarLogoutBtn.style.display = 'none';
  if (topNavbar) topNavbar.style.display = 'flex';

  resetRealtimeListeners();
  activeView = 'overview';
}

export function showDashboardSection() {
  const authSection = document.getElementById('authSection');
  const dashboardSection = document.getElementById('dashboardSection');
  const sidebarLogoutBtn = document.getElementById('logoutBtn');
  const navbarLogoutBtn = document.getElementById('navbarLogoutBtn');
  const topNavbar = document.querySelector('nav.navbar');

  if (authSection) authSection.style.display = 'none';
  if (dashboardSection) dashboardSection.style.display = 'block';
  if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = 'flex';
  if (navbarLogoutBtn) navbarLogoutBtn.style.display = 'block';
  if (topNavbar) topNavbar.style.display = 'none';

  initDashboardNavigation();
}

export async function initializeDashboard() {
  initVolunteerEditView();
  try {
    displayAdminInfo();
    initDashboardNavigation();

    registerVolunteersUpdateHandler(() => {
      updateStatistics();
      renderAttendanceChart();
      renderTopEmployees();
      renderEventActivityChart();
      renderVolunteersPanel();
      refreshAnalytics();
    });

    registerActivityUpdateHandler(() => {
      renderAttendanceChart();
      renderEventActivityChart();
      renderCalendarHeatmap();
      refreshAnalytics();
    });

    resetRealtimeListeners();
    loadVolunteersData();
    loadActivityData();
    initApprovalsModule();

    updateStatistics();
    renderAttendanceChart();
    renderTopEmployees();
    renderEventActivityChart();
    renderCalendarHeatmap();
    renderApprovalQueue();
    renderVolunteersPanel();
  } catch (error) {
    console.error('Error initializing dashboard:', error);
    showMessage('Error loading dashboard. Please refresh the page.', 'error');
  }
}

function resetRealtimeListeners() {
  resetVolunteerListener();
  resetActivityListener();
  // The approvals listener is handled in its own module
}

function displayAdminInfo() {
  const currentAdmin = appState.currentAdmin || {};
  const email = currentAdmin.email || '';
  const organization = currentAdmin.organizationName || 'Organization';
  const orgCode = appState.currentOrgCode || 'XXXXXXXX';

  const sidebarEmail = document.getElementById('sidebarUserEmail');
  const sidebarOrgName = document.getElementById('sidebarOrgName');
  const sidebarOrgCode = document.getElementById('sidebarOrgCode');
  const avatar = document.getElementById('sidebarAvatar');

  if (sidebarEmail) sidebarEmail.textContent = email;
  if (sidebarOrgName) sidebarOrgName.textContent = organization;
  if (sidebarOrgCode) sidebarOrgCode.textContent = orgCode;
  if (avatar) avatar.textContent = computeInitials(email, organization);
}

export function updateStatistics() {
  const metrics = buildMetrics();

  animateNumber('metricTotalVolunteers', metrics.totalVolunteers, 0, (val) => val.toLocaleString());
  animateNumber('metricWeeklyActive', metrics.weeklyActive, 0, (val) => val.toLocaleString());
  animateNumber('metricHours', metrics.totalHours, 1, formatHours);
  animateNumber('metricEvents', metrics.uniqueEvents, 0, (val) => val.toLocaleString());
  renderEventActivityChart(metrics.weeklyActive, metrics.totalVolunteers); // Pass metrics to the chart
  setTextContent('metricBusiestDay', metrics.busiestDay);
  animateNumber('metricImpact', metrics.donationValue, 0, formatCurrency);
}

function buildMetrics() {
  const { labels, data, startOfWeek, endOfWeek } = buildWeeklyAttendanceData();

  const volunteerRoles = new Map(appState.volunteersData.map(v => [v.id, v.role]));

  const maxHours = Math.max(...data);
  const busiestDayIndex = data.indexOf(maxHours);
  const busiestDay = maxHours > 0 ? labels[busiestDayIndex] : '—';

  const weeklyActiveSet = new Set();
  appState.activityData.forEach((log) => {
    const logDate = normalizeDateValue(log.date);
    if (logDate && logDate >= startOfWeek && logDate < endOfWeek) {
      if (log.user_id) {
        const userRole = volunteerRoles.get(log.user_id);
        if (userRole !== 'org-admin') {
          weeklyActiveSet.add(log.user_id);
        }
      }
    }
  });

  const nonAdminVolunteers = appState.volunteersData.filter(v => v.role !== 'org-admin');
  const totalHours = nonAdminVolunteers.reduce((sum, volunteer) => sum + (volunteer.totalHours || 0), 0);
  const uniqueEvents = getUniqueEventCount(appState.activityData);
  const donationValue = calculateDonationValue(totalHours);
  
  // FIX: Ensure totalVolunteers for the metric card also excludes admins.
  const totalVolunteersCount = nonAdminVolunteers.length;

  return { totalVolunteers: totalVolunteersCount, weeklyActive: weeklyActiveSet.size, totalHours, uniqueEvents, donationValue, busiestDay };
}

function renderAttendanceChart() {
  const canvas = document.getElementById('attendanceChart');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const { labels, data, weekStart, weekEnd } = buildWeeklyAttendanceData();

  const chartTitle = document.getElementById('attendanceChartTitle');
  if (chartTitle) {
    if (weekOffset === 0) {
      chartTitle.textContent = "This week's volunteer hours";
    } else if (weekOffset === -1) {
      chartTitle.textContent = "Last week's volunteer hours";
    } else {
      const options = { month: 'short', day: 'numeric' };
      const startStr = weekStart.toLocaleDateString(undefined, options);
      const endOfWeekForDisplay = new Date(weekEnd);
      endOfWeekForDisplay.setDate(endOfWeekForDisplay.getDate() - 1);
      const endStr = endOfWeekForDisplay.toLocaleDateString(undefined, options);
      chartTitle.textContent = `Volunteer Hours: ${startStr} - ${endStr}`;
    }
  }

  const nextWeekBtn = document.getElementById('nextWeekBtn');
  if (nextWeekBtn) {
    nextWeekBtn.disabled = weekOffset >= 0;
  }

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(255, 159, 28, 0.85)');
  gradient.addColorStop(1, 'rgba(255, 190, 11, 0.2)');

  const datasets = [
    {
      label: 'Volunteer Hours',
      data,
      backgroundColor: gradient,
      borderColor: '#ff9f1c',
      borderWidth: 2,
      borderRadius: 4,
    }
  ];

  if (appState.attendanceChart) {
    appState.attendanceChart.data.labels = labels;
    appState.attendanceChart.data.datasets[0].data = data;
    appState.attendanceChart.update();
    return;
  }

  appState.attendanceChart = new window.Chart(context, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (tooltipItem) => `${tooltipItem.dataset.label}: ${tooltipItem.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: 'rgba(74, 44, 0, 0.55)'
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: 'rgba(74, 44, 0, 0.45)'
          },
          grid: {
            color: 'rgba(255, 190, 11, 0.15)'
          }
        }
      }
    }
  });
}

function renderTopEmployees() {
  const list = document.getElementById('topEmployeesList');
  if (!list) return;

  const topFive = [...appState.volunteersData]
    .sort((a, b) => (b.totalHours || 0) - (a.totalHours || 0))
    .slice(0, 5);

  if (!topFive.length) {
    list.innerHTML = '<li class="placeholder">No volunteer activity recorded yet.</li>';
    return;
  }

  list.innerHTML = topFive.map((volunteer) => {
    const name = volunteer.firstName || volunteer.email || 'Volunteer';
    const initials = computeInitials(volunteer.firstName || volunteer.email, volunteer.email);
    const hours = (volunteer.totalHours || 0).toFixed(1);

    return `
      <li>
        <div class="employee-meta">
          <div class="employee-avatar">${initials}</div>
          <div class="employee-text">
            <div class="employee-name">${name}</div>
            <div class="subtle-text">${volunteer.email || ''}</div>
          </div>
        </div>
        <div class="employee-hours">${hours} hrs</div>
      </li>
    `;
  }).join('');
}

function renderEventActivityChart(weeklyActiveCount, totalVolunteersCount) {
  const canvas = document.getElementById('eventActivityChart');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  // FIX: Use the reliable counts passed from buildMetrics instead of recalculating.
  const engaged = weeklyActiveCount;
  const totalVolunteers = totalVolunteersCount;
  const inactive = Math.max(0, totalVolunteers - engaged);
  const percent = totalVolunteers > 0 ? Math.round((engaged / totalVolunteers) * 100) : 0;

  const percentElement = document.getElementById('eventActivityPercent');
  if (percentElement) {
    percentElement.textContent = `${percent}%`;
  }

  const data = {
    labels: ['Active', 'Inactive'],
    datasets: [
      { // Ensure data sums to totalVolunteers, or 1 if no volunteers
        data: totalVolunteers > 0 ? [engaged, inactive] : [0, 1],
        backgroundColor: ['#ff9f1c', 'rgba(74, 44, 0, 0.15)'],
        borderWidth: 0
      }
    ]
  };

  if (appState.eventActivityChart) {
    appState.eventActivityChart.data = data;
    appState.eventActivityChart.update();
    return;
  }

  appState.eventActivityChart = new window.Chart(context, {
    type: 'doughnut',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (tooltipItem) => `${tooltipItem.label}: ${tooltipItem.parsed.toLocaleString()}`
          }
        }
      }
    }
  });
}

function buildWeeklyAttendanceData() {
  const { startOfWeek: currentWeekStart } = getCurrentWeekBoundaries();
  const weekStart = new Date(currentWeekStart);
  weekStart.setDate(weekStart.getDate() + (weekOffset * 7));

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data = Array(7).fill(0);

  appState.activityData.forEach((log) => {
    const logDate = normalizeDateValue(log.date);
    if (logDate && logDate >= weekStart && logDate < weekEnd) { // FIX: Use '<' to correctly handle the end of the week boundary.
      const dayIndex = logDate.getDay();
      const hours = parseFloat(log.hours_contributed || log.hours) || 0;
      data[dayIndex] += hours;
    }
  });

  return { labels, data, weekStart, weekEnd };
}

function getUniqueEventCount(activityLogs) {
  const unique = new Set();
  activityLogs.forEach((log) => {
    const key = log.campaign || log.event || log.site || log.location;
    if (key) {
      unique.add(key.toLowerCase());
    }
  });
  return unique.size;
}

function calculateDonationValue(totalHours) {
  return totalHours * VOLUNTEER_HOUR_VALUE;
}

function formatHours(totalHours) {
  const safeHours = Number(totalHours) || 0;
  const wholeHours = Math.floor(safeHours);
  const minutes = Math.round((safeHours - wholeHours) * 60);
  return `${wholeHours.toLocaleString()}h ${String(minutes).padStart(2, '0')}m`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function normalizeDateValue(value) {
  if (!value) return null;

  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date && typeof date.getTime === 'function' && !Number.isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }

  if (value.seconds && value.nanoseconds !== undefined) {
    const milliseconds = value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  return null;
}
