import { appState } from './state.js';
import { showMessage } from './ui.js';
import { getActivityLogsForOrg } from './programsEvents.js';
import { isSchoolOrgActive } from './volunteerOps.js';

let analyticsInitialized = false;
const MAX_TREND_DAYS = 180;
const COLOR_PALETTE = [
  '#ffb347',
  '#ff8b6b',
  '#ff6fb2',
  '#ffd970',
  '#f9844a',
  '#4cc9f0',
  '#1982c4',
  '#6a4c93'
];

export function initAnalytics() {
  if (analyticsInitialized) {
    syncControlValues();
    return;
  }

  const insightsSection = document.getElementById('tab-insights');
  if (!insightsSection) {
    return;
  }

  insightsSection.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    if (target.id === 'trendMetricSelect') {
      appState.analyticsState.trendMetric = target.value;
      renderTrendChart();
    }

    if (target.id === 'heatmapYearSelect') {
      appState.analyticsState.heatmapYear = parseInt(target.value, 10);
      renderCalendarHeatmap();
    }
  });

  const closeBtn = document.getElementById('closeHeatmapModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeHeatmapModal);
  }

  const heatmapModal = document.getElementById('heatmapModal');
  heatmapModal.addEventListener('click', (event) => {
    if (event.target === heatmapModal) closeHeatmapModal();
  });

  insightsSection.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-analytics-action]');
    if (!button) return;

    const action = button.dataset.analyticsAction;
    const format = button.dataset.format;

    switch (action) {
      case 'trend-csv':
        exportTrendCsv();
        break;
      case 'trend-image':
        downloadTrendImage(format || 'png');
        break;
      case 'heatmap-csv':
        exportHeatmapCsv();
        break;
      case 'heatmap-image':
        downloadHeatmapPng();
        break;
      case 'heatmap-prev':
        navigateHeatmap(-1);
        break;
      case 'heatmap-next':
        navigateHeatmap(1);
        break;
      default:
        break;
    }
  });

  analyticsInitialized = true;
  syncControlValues();
}

export function renderAnalytics() {
  initAnalytics();
  renderTrendChart();
  renderCalendarHeatmap();
}

export function refreshAnalytics() {
  if (!document.getElementById('tab-insights')) return;
  renderTrendChart();
  renderCalendarHeatmap();
}

function syncControlValues() {
  const { trendMetric, comparisonCategory, comparisonValue, comparisonMode } = appState.analyticsState;
  const trendSelect = document.getElementById('trendMetricSelect');
  if (trendSelect) trendSelect.value = trendMetric;
  const categorySelect = document.getElementById('comparisonCategorySelect');
  if (categorySelect) categorySelect.value = comparisonCategory;
  const valueSelect = document.getElementById('comparisonValueSelect');
  if (valueSelect) valueSelect.value = comparisonValue;
  const modeSelect = document.getElementById('comparisonModeSelect');
  if (modeSelect) modeSelect.value = comparisonMode;
}

function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  const metric = appState.analyticsState.trendMetric;
  const { daily, monthly } = buildTrendData(metric);
  appState.analyticsTrendData = { metric, daily, monthly };

  const context = canvas.getContext('2d');
  if (!context) return;

  const labels = daily.map((item) => item.date);
  const data = daily.map((item) => item.value);

  if (!appState.trendChart) {
    appState.trendChart = new window.Chart(context, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: metricLabel(metric),
            data,
            fill: false,
            borderColor: '#ffb347',
            backgroundColor: 'rgba(255, 179, 71, 0.28)',
            tension: 0.25,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${context.parsed.y.toLocaleString()} ${metricUnit(metric)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { maxRotation: 0, minRotation: 0 }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => `${Number(value).toLocaleString()}`
            }
          }
        }
      }
    });
  } else {
    appState.trendChart.data.labels = labels;
    appState.trendChart.data.datasets[0].data = data;
    appState.trendChart.data.datasets[0].label = metricLabel(metric);
    appState.trendChart.update();
  }
}

export function renderCalendarHeatmap(direction = 0) {
  const container = document.getElementById('heatmapContainer');
  if (!container) return;

  if (direction !== 0) {
    // This logic is now handled by the year selector
  }
  
  const today = new Date();
  const MS_DAY = 1000 * 60 * 60 * 24;
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentYear = today.getFullYear();
  const hasSchoolExtras = Array.isArray(appState.schoolActivityLogs) && appState.schoolActivityLogs.length > 0;
  const activityLogs = getActivityLogsForOrg({ includeSchoolExtras: true });
  const schoolPlan = isSchoolOrgActive() || hasSchoolExtras;

  const yearlyTotals = new Map();
  const yearlyTotalsAll = new Map();
  activityLogs.forEach((log) => {
    const logDate = deriveLogDate(log);
    if (!logDate) return;
    const year = logDate.getFullYear();
    const hours = parseFloat(log.hours_contributed || log.hours) || 0;
    yearlyTotalsAll.set(year, (yearlyTotalsAll.get(year) || 0) + hours);

    const status = normalizeApprovalStatus(log.approve);
    if (!schoolPlan && status !== 'approved') return;
    yearlyTotals.set(year, (yearlyTotals.get(year) || 0) + hours);
  });

  const availableYears = Array.from(yearlyTotals.keys()).sort((a, b) => b - a);
  const availableYearsAll = Array.from(yearlyTotalsAll.keys()).sort((a, b) => b - a);
  const fallbackYear = availableYears.length ? availableYears[0] : (availableYearsAll[0] || currentYear);
  const requestedYear = appState.analyticsState.heatmapYear || fallbackYear;
  const displayYear = yearlyTotals.has(requestedYear) && yearlyTotals.get(requestedYear) > 0
    ? requestedYear
    : fallbackYear;
  if (displayYear !== appState.analyticsState.heatmapYear) {
    appState.analyticsState.heatmapYear = displayYear;
  }

  let startDate = new Date(displayYear, 0, 1);
  let endDate = new Date(displayYear, 11, 31);
  let dataCutoff = displayYear >= currentYear ? normalizedToday : endDate;
  let leadingOffset = ((startDate.getDay() + 6) % 7);
  let totalDays = Math.floor((endDate - startDate) / MS_DAY) + 1;
  let trailingOffset = (7 - ((leadingOffset + totalDays) % 7)) % 7;

  updateYearSelector(availableYears.length ? availableYears : (availableYearsAll.length ? availableYearsAll : [displayYear]));

  const dailyTotals = new Map();
  const eventTotals = new Map();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const cursor = new Date(startDate);
  // Create keys for all days in the display year
  while (cursor <= endDate) {
    dailyTotals.set(formatDateKey(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  const fillTotals = (ignoreStatus = false, targetYear = displayYear) => {
    dailyTotals.forEach((_, k) => dailyTotals.set(k, 0)); // reset to zero
    eventTotals.clear();

    activityLogs.forEach((log) => {
      const logDate = deriveLogDate(log);
      if (!logDate) return;
      if (logDate.getFullYear() !== targetYear) return;
      if (logDate > dataCutoff) return;
      const status = normalizeApprovalStatus(log.approve);
      if (!ignoreStatus && !schoolPlan && status !== 'approved') return;
      const key = formatDateKey(logDate);
      if (!dailyTotals.has(key)) return;

      const hours = parseFloat(log.hours_contributed || log.hours) || 0;
      dailyTotals.set(key, (dailyTotals.get(key) || 0) + hours);

      if (log.event_id) {
        const compositeKey = `${key}__${log.event_id}`;
        eventTotals.set(compositeKey, (eventTotals.get(compositeKey) || 0) + hours);
      }
    });
  };

  fillTotals(false, displayYear);

  let maxValue = Math.max(...dailyTotals.values(), 0);
  // If we still have zero activity, retry with all logs (ignore approval) using the most recent year with any data.
  if (maxValue === 0 && activityLogs.length > 0) {
    const fallbackYearWithData = availableYearsAll.length ? availableYearsAll[0] : displayYear;
    const altStart = new Date(fallbackYearWithData, 0, 1);
    const altEnd = new Date(fallbackYearWithData, 11, 31);
    const altLeading = ((altStart.getDay() + 6) % 7);
    const altTotalDays = Math.floor((altEnd - altStart) / MS_DAY) + 1;
    const altTrailing = (7 - ((altLeading + altTotalDays) % 7)) % 7;

    // Rebuild the map for the fallback year
    dailyTotals.clear();
    const cursorAlt = new Date(altStart);
    while (cursorAlt <= altEnd) {
      dailyTotals.set(formatDateKey(cursorAlt), 0);
      cursorAlt.setDate(cursorAlt.getDate() + 1);
    }

    fillTotals(true, fallbackYearWithData);
    maxValue = Math.max(...dailyTotals.values(), 0);

    // Update layout context to fallback year if it changed.
    startDate = altStart;
    endDate = altEnd;
    dataCutoff = fallbackYearWithData >= currentYear ? normalizedToday : altEnd;
    totalDays = altTotalDays;
    trailingOffset = altTrailing;
    leadingOffset = altLeading;
  }
  if (totalDays <= 0) {
    container.innerHTML = '<div class="heatmap-grid"><div class="empty-state">No data to display for this month.</div></div>';
    return;
  }

  const monthLabels = new Map();
  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(displayYear, month, 1);
    const dayIndex = Math.floor((monthStart - startDate) / MS_DAY);
    const weekIndex = Math.floor((leadingOffset + dayIndex) / 7);
    monthLabels.set(month, {
      label: monthStart.toLocaleDateString(undefined, { month: 'short' }),
      column: 2 + weekIndex
    });
  }

  let calendarHtml = '<div class="heat-calendar-scroll-wrapper"><div class="heat-calendar">';
  calendarHtml += '<div class="heat-months">';
  monthLabels.forEach((data, monthIndex) => {
    calendarHtml += `<div class="heat-month" data-month="${monthIndex}" style="--col-start: ${data.column + 1};">${data.label}</div>`;
  });
  calendarHtml += '</div>';

  calendarHtml += '<div class="heat-body">';
  calendarHtml += '<div class="heat-days"><div>Mon</div><div>Wed</div><div>Fri</div></div>';
  calendarHtml += '<div class="heat-cells">';

  for (let i = 0; i < leadingOffset; i++) {
    calendarHtml += '<div class="heat-cell" style="visibility: hidden;"></div>';
  }

  for (let i = 0; i < totalDays; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const isFuture = displayYear > currentYear || (displayYear === currentYear && cellDate > normalizedToday);
    const dateKey = formatDateKey(cellDate);
    const rawValue = dailyTotals.get(dateKey) || 0;
    const value = isFuture ? 0 : rawValue;
    const isEmpty = value <= 0;
    const intensity = isFuture || isEmpty ? 0 : (maxValue > 0 ? value / maxValue : 0);
    const color = heatmapColor(intensity);
    const dateLabel = cellDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const title = isFuture
      ? `${dateLabel} — No activity yet`
      : isEmpty
        ? `${dateLabel} — 0 hrs logged`
        : `${dateLabel} — ${value.toFixed(1)} hrs`;
    const monthIndex = cellDate.getMonth();

    const cellClasses = `heat-cell${isFuture ? ' heat-cell--future' : ''}${isEmpty ? ' heat-cell--empty' : ''}`;
    const cellStyle = (isFuture || isEmpty) ? '' : `background-color: ${color};`;
    calendarHtml += `<div class="${cellClasses}" data-month="${monthIndex}" style="${cellStyle}" title="${title}" aria-label="${title}"></div>`;
  }

  for (let i = 0; i < trailingOffset; i++) {
    calendarHtml += '<div class="heat-cell" style="visibility: hidden;"></div>';
  }

  calendarHtml += '</div></div></div></div>';

  const legendHtml = `<div class="heat-legend">
    <span>Less</span>
    <div class="heat-cell" style="background-color: ${heatmapColor(0.01)};"></div>
    <div class="heat-cell" style="background-color: ${heatmapColor(0.25)};"></div>
    <div class="heat-cell" style="background-color: ${heatmapColor(0.5)};"></div>
    <div class="heat-cell" style="background-color: ${heatmapColor(0.75)};"></div>
    <div class="heat-cell" style="background-color: ${heatmapColor(1)};"></div>
    <span>More</span>
  </div>`;

  container.innerHTML = calendarHtml + legendHtml;

  if (!container.dataset.modalBound) {
    container.addEventListener('dblclick', (event) => {
      if (event.target.closest('.heat-calendar')) {
        openHeatmapModal();
      }
    });
    container.dataset.modalBound = 'true';
  }

  appState.heatmapDataCache = { dailyTotals, eventTotals, timezone };
}

function getAvailableYears() {
  const currentYear = new Date().getFullYear();
  const years = new Set([currentYear]);
  const hasSchoolExtras = Array.isArray(appState.schoolActivityLogs) && appState.schoolActivityLogs.length > 0;
  const schoolPlan = isSchoolOrgActive() || hasSchoolExtras;
  const activityLogs = getActivityLogsForOrg({ includeSchoolExtras: schoolPlan });
  activityLogs.forEach(log => {
    const date = parseDate(log.date);
    if (date) {
      const year = date.getFullYear();
      years.add(year);
    }
  });
  return Array.from(years).sort((a, b) => b - a);
}

function updateYearSelector(years) {
  const select = document.getElementById('heatmapYearSelect');
  if (!select) return;

  const todayYear = new Date().getFullYear();
  const fallbackYear = years.length ? years[0] : todayYear;
  const selectedYear = appState.analyticsState.heatmapYear || fallbackYear;
  const effectiveSelected = years.includes(selectedYear) ? selectedYear : fallbackYear;
  appState.analyticsState.heatmapYear = effectiveSelected;
  select.innerHTML = years.map(year => `<option value="${year}" ${year === effectiveSelected ? 'selected' : ''}>Year: ${year}</option>`).join('');
}

function openHeatmapModal() {
  const modal = document.getElementById('heatmapModal');
  const modalBody = document.getElementById('heatmapModalBody');
  const originalContainer = document.getElementById('heatmapContainer');

  if (!modal || !modalBody || !originalContainer) return;

  // Clone the heatmap to show in the modal
  const clonedHeatmap = originalContainer.cloneNode(true);
  clonedHeatmap.id = 'heatmapModalContent';
  modalBody.innerHTML = '';
  modalBody.appendChild(clonedHeatmap);

  modal.style.display = 'flex';
}

function closeHeatmapModal() {
  const modal = document.getElementById('heatmapModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function buildTrendData(metric) {
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (MAX_TREND_DAYS - 1));

  const dailyMap = new Map();
  const dailyActiveMap = metric === 'active' ? new Map() : null;

  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    dailyMap.set(formatDateKey(cursor), 0);
    if (dailyActiveMap) {
      dailyActiveMap.set(formatDateKey(cursor), new Set());
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (metric === 'hours' || metric === 'active') {
    const hasSchoolExtras = Array.isArray(appState.schoolActivityLogs) && appState.schoolActivityLogs.length > 0;
    const schoolPlan = isSchoolOrgActive() || hasSchoolExtras;
    const activityLogs = getActivityLogsForOrg({ includeSchoolExtras: schoolPlan });
    activityLogs.forEach((log, index) => {
      if (!log.date) return;
      const date = parseDate(log.date);
      if (!date) return;
      const key = formatDateKey(date);
      if (!dailyMap.has(key)) return;

      if (metric === 'hours') {
        const hours = parseFloat(log.hours_contributed || log.hours) || 0;
        dailyMap.set(key, (dailyMap.get(key) || 0) + hours);
      } else if (dailyActiveMap) {
        const set = dailyActiveMap.get(key);
        if (set) {
          const uid = log.user_id || log.volunteer_email || log.email || `anon-${index}`;
          set.add(uid);
        }
      }
    });

    if (metric === 'active' && dailyActiveMap) {
      dailyActiveMap.forEach((set, key) => {
        dailyMap.set(key, set.size);
      });
    }
  } else if (metric === 'signups') {
    appState.volunteersData.forEach((volunteer, index) => {
      const createdAt = volunteer.registrationDate || volunteer.createdAt || volunteer.created_at;
      const date = parseDate(createdAt);
      if (!date) return;
      const key = formatDateKey(date);
      if (!dailyMap.has(key)) return;
      dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
    });
  }

  const daily = Array.from(dailyMap.entries()).map(([date, value]) => ({
    date,
    value: metric === 'hours' ? Number(value.toFixed(2)) : value
  }));

  const monthlyMap = new Map();
  daily.forEach(({ date, value }) => {
    const monthKey = date.slice(0, 7);
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + value);
  });

  const monthly = Array.from(monthlyMap.entries()).map(([month, total]) => ({
    month,
    value: metric === 'hours' ? Number(total.toFixed(2)) : total
  }));

  return { daily, monthly };
}

function buildComparisonData(categoryType, valueType) {
  const hasSchoolExtras = Array.isArray(appState.schoolActivityLogs) && appState.schoolActivityLogs.length > 0;
  const schoolPlan = isSchoolOrgActive() || hasSchoolExtras;
  const logs = getActivityLogsForOrg({ includeSchoolExtras: schoolPlan }) || [];

  const summary = new Map();

  logs.forEach((log, index) => {
    if (!log.date) return;
    const date = parseDate(log.date);
    if (!date) return;

    const category = resolveCategory(log, categoryType);
    const subgroup = resolveSubgroup(log);
    const period = formatMonthKey(date);
    const volunteerId = log.user_id || log.volunteer_email || log.email || `anon-${index}`;
    const hours = parseFloat(log.hours_contributed || log.hours) || 0;

    const bucket = getComparisonBucket(summary, category, valueType);

    if (valueType === 'hours') {
      bucket.totals.set(subgroup, (bucket.totals.get(subgroup) || 0) + hours);
      const periodMap = bucket.monthly.get(period) || new Map();
      periodMap.set(subgroup, (periodMap.get(subgroup) || 0) + hours);
      bucket.monthly.set(period, periodMap);
    } else {
      const set = bucket.totalsSet.get(subgroup) || new Set();
      set.add(volunteerId);
      bucket.totalsSet.set(subgroup, set);

      const periodMap = bucket.monthlySet.get(period) || new Map();
      const periodSet = periodMap.get(subgroup) || new Set();
      periodSet.add(volunteerId);
      periodMap.set(subgroup, periodSet);
      bucket.monthlySet.set(period, periodMap);
    }
  });

  const matrix = new Map();
  const exportRows = [];
  const categoryTotals = [];
  const subgroupsSet = new Set();

  summary.forEach((bucket, category) => {
    const subgroupValues = new Map();
    let categoryTotal = 0;

    if (valueType === 'hours') {
      bucket.totals.forEach((value, subgroup) => {
        subgroupValues.set(subgroup, Number(value.toFixed(2)));
        categoryTotal += value;
        subgroupsSet.add(subgroup);
      });
    } else {
      bucket.totalsSet.forEach((set, subgroup) => {
        const count = set.size;
        subgroupValues.set(subgroup, count);
        categoryTotal += count;
        subgroupsSet.add(subgroup);
      });
    }

    matrix.set(category, subgroupValues);
    categoryTotals.push({ category, total: categoryTotal });

    bucket.monthly.forEach((periodMap, period) => {
      periodMap.forEach((value, subgroup) => {
        exportRows.push({
          category,
          subgroup,
          period,
          value: Number(value.toFixed(2)),
          metric: valueType
        });
      });
    });

    if (bucket.monthlySet.size) {
      bucket.monthlySet.forEach((periodMap, period) => {
        periodMap.forEach((set, subgroup) => {
          exportRows.push({
            category,
            subgroup,
            period,
            value: set.size,
            metric: valueType
          });
        });
      });
    }
  });

  categoryTotals.sort((a, b) => b.total - a.total);
  const limitedCategories = categoryTotals.slice(0, 8).map((item) => item.category);
  if (limitedCategories.length === 0) {
    limitedCategories.push('Uncategorized');
    matrix.set('Uncategorized', new Map([['All', 0]]));
    subgroupsSet.add('All');
  }

  return {
    categories: limitedCategories,
    subgroups: Array.from(subgroupsSet),
    matrix,
    exportRows,
    categoryType
  };
}

function exportTrendCsv() {
  const data = appState.analyticsTrendData;
  if (!data) {
    showMessage('Trend data not ready yet.', 'error');
    return;
  }

  const rows = [['date', 'metric_name', 'metric_value', 'group_or_team']];
  data.daily.forEach((item) => {
    rows.push([item.date, data.metric, item.value, 'All']);
  });

  rows.push([]);
  rows.push(['month', 'metric_name', 'metric_value', 'group_or_team']);
  data.monthly.forEach((item) => {
    rows.push([item.month, data.metric, item.value, 'All']);
  });

  downloadCsv('activity-trends.csv', rows);
}

function downloadTrendImage(format) {
  if (!appState.trendChart) {
    showMessage('Trend chart not available yet.', 'error');
    return;
  }

  downloadChartImage(appState.trendChart, format, `activity-trends.${format}`);
}

function exportComparisonCsv() {
  const data = appState.analyticsComparisonData;
  if (!data) {
    showMessage('Comparison data not ready yet.', 'error');
    return;
  }

  const rows = [['category_type', 'category', 'subgroup', 'value', 'period', 'metric']];
  data.exportRows.forEach((row) => {
    rows.push([data.categoryType, row.category, row.subgroup, row.value, row.period, row.metric]);
  });

  downloadCsv('program-comparison.csv', rows);
}

function downloadComparisonImage(format) {
  if (!appState.comparisonChart) {
    showMessage('Comparison chart not available yet.', 'error');
    return;
  }

  downloadChartImage(appState.comparisonChart, format, `program-comparison.${format}`);
}

function exportHeatmapCsv() {
  const data = appState.heatmapDataCache;
  if (!data) {
    showMessage('Heatmap data not ready yet.', 'error');
    return;
  }

  const rows = [['date', 'count', 'event_id', 'timezone']];
  data.dailyTotals.forEach((value, date) => {
    rows.push([date, Number(value.toFixed(2)), '', data.timezone]);
  });

  if (data.eventTotals.size) {
    rows.push([]);
    rows.push(['date', 'count', 'event_id', 'timezone']);
    data.eventTotals.forEach((value, composite) => {
      const [date, eventId] = composite.split('__');
      rows.push([date, Number(value.toFixed(2)), eventId === 'undefined' ? '' : eventId, data.timezone]);
    });
  }

  downloadCsv('calendar-heatmap.csv', rows);
}

function downloadHeatmapPng() {
  const canvas = document.getElementById('calendarHeatmap');
  if (!canvas) {
    showMessage('Heatmap not available yet.', 'error');
    return;
  }
  const dataUrl = canvas.toDataURL('image/png');
  triggerDownload(dataUrl, 'calendar-heatmap.png');
}

function downloadChartImage(chart, format, filename) {
  if (format === 'png') {
    const url = chart.toBase64Image('image/png');
    triggerDownload(url, filename);
    return;
  }

  if (format === 'svg') {
    const pngData = chart.toBase64Image('image/png');
    const svg = createSvgWrapper(pngData, chart.width, chart.height);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    triggerBlobDownload(blob, filename);
    return;
  }

  showMessage(`Unsupported format: ${format}`, 'error');
}

function downloadCsv(filename, rows) {
  const csvContent = rows
    .map((columns) => columns
      .map((value) => {
        const stringValue = value === undefined || value === null ? '' : String(value);
        const needsQuotes = stringValue.includes(',') || stringValue.includes('"') || /[\r\n]/.test(stringValue);
        return needsQuotes ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
      })
      .join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);
}

function triggerDownload(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

function createSvgWrapper(pngData, width, height) {
  const svgWidth = width || 800;
  const svgHeight = height || 400;
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <image href="${pngData}" width="${svgWidth}" height="${svgHeight}" />
</svg>`;
}

function metricLabel(metric) {
  switch (metric) {
    case 'signups':
      return 'New Signups';
    case 'active':
      return 'Active Volunteers';
    case 'hours':
    default:
      return 'Volunteer Hours';
  }
}

function metricUnit(metric) {
  return metric === 'hours' ? 'hrs' : 'people';
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseDate(input) {
  if (!input) return null;

  if (typeof input.toDate === 'function') {
    const date = input.toDate();
    if (date && typeof date.getTime === 'function' && !Number.isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }

  if (input.seconds && input.nanoseconds !== undefined) {
    const milliseconds = input.seconds * 1000 + Math.floor(input.nanoseconds / 1e6);
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }

  if (typeof input === 'string') {
    // Support plain numeric-only dates like "2025-06-02" or "9/28/2025"
    const date = new Date(input.replace(/\s+/g, ' ').trim());
    if (!Number.isNaN(date.getTime())) {
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }

  const date = new Date(input);
  if (!Number.isNaN(date.getTime())) {
    date.setHours(0, 0, 0, 0);
    return date;
  }

  return null;
}

function normalizeApprovalStatus(value) {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (!raw) return 'pending';
  if (raw === 'approved' || raw === 'accepted' || raw.startsWith('approved') || raw.startsWith('approved by') || raw.startsWith('accept')) return 'approved';
  if (raw === 'denied' || raw.startsWith('denied') || raw === 'rejected' || raw.includes('reject')) return 'denied';
  return 'pending';
}

function deriveLogDate(log) {
  const primary = parseDate(log?.date);
  if (primary) return primary;
  const candidates = [log?.created_at, log?.createdAt, log?.submitted_at, log?.timestamp];
  for (const c of candidates) {
    const d = parseDate(c);
    if (d) return d;
  }
  return null;
}

function resolveCategory(log, type) {
  switch (type) {
    case 'event':
      return log.event || log.event_name || log.eventTitle || 'Uncategorized';
    case 'location':
      return log.location || log.site || 'Uncategorized';
    case 'campaign':
    default:
      return log.campaign || log.program || 'Uncategorized';
  }
}

function resolveSubgroup(log) {
  return log.team || log.role || log.volunteer_role || 'All';
}

function getComparisonBucket(summary, category, valueType) {
  if (!summary.has(category)) {
    summary.set(category, {
      totals: new Map(),
      monthly: new Map(),
      totalsSet: valueType === 'volunteers' ? new Map() : new Map(),
      monthlySet: valueType === 'volunteers' ? new Map() : new Map()
    });
  }
  return summary.get(category);
}

function heatmapColor(intensity) {
  if (intensity <= 0) {
    return 'rgba(74, 44, 0, 0.06)'; // Buttercream base
  }
  const start = [255, 237, 160]; // Light amber
  const end = [255, 159, 28];   // Deep amber
  const r = Math.round(start[0] + (end[0] - start[0]) * intensity);
  const g = Math.round(start[1] + (end[1] - start[1]) * intensity);
  const b = Math.round(start[2] + (end[2] - start[2]) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}
