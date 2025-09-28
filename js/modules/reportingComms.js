import { appState } from './state.js';
import { showMessage } from './ui.js';
import { getCurrentWeekBoundaries } from './programsEvents.js';

export function downloadSheetsReport() {
  const popover = document.getElementById('exportPopover');
  if (!popover) return;

  popover.style.display = popover.style.display === 'none' ? 'flex' : 'none';

  const startInput = document.getElementById('sheetsStartDate');
  const endInput = document.getElementById('sheetsEndDate');

  const { startOfWeek } = getCurrentWeekBoundaries();
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const startValue = startOfWeek.toISOString().split('T')[0];
  const endValue = endOfWeek.toISOString().split('T')[0];

  if (startInput) startInput.value = startValue;
  if (endInput) endInput.value = endValue;
}

export function closeSheetsModal() {
  const popover = document.getElementById('exportPopover');
  if (popover) {
    popover.style.display = 'none';
  }
}

export async function generateSheetsData() {
  const startInput = document.getElementById('sheetsStartDate');
  const endInput = document.getElementById('sheetsEndDate');

  const startDateValue = startInput ? startInput.value : undefined;
  const endDateValue = endInput ? endInput.value : undefined;

  if (!startDateValue || !endDateValue) {
    showMessage('Please select both start and end dates', 'error');
    return;
  }

  const startDate = new Date(startDateValue);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(endDateValue);
  endDate.setHours(23, 59, 59, 999);

  if (startDate > endDate) {
    showMessage('Start date must be before or equal to end date', 'error');
    return;
  }

  try {
    const filteredLogs = appState.activityData.filter((log) => {
      if (!log.date) return false;
      const logDate = new Date(log.date);
      return logDate >= startDate && logDate <= endDate;
    });

    if (filteredLogs.length === 0) {
      showMessage('No volunteer activity found for the selected date range', 'error');
      return;
    }

    filteredLogs.sort((a, b) => {
      const dateCompare = new Date(a.date) - new Date(b.date);
      if (dateCompare !== 0) return dateCompare;

      const volunteerA = appState.volunteersData.find((volunteer) => volunteer.id === a.user_id) || {};
      const volunteerB = appState.volunteersData.find((volunteer) => volunteer.id === b.user_id) || {};

      const nameA = volunteerA.firstName || a.firstName || a.volunteer_name || 'Unknown';
      const nameB = volunteerB.firstName || b.firstName || b.volunteer_name || 'Unknown';
      return nameA.localeCompare(nameB);
    });

    let csvContent = 'Date,Volunteer Name,Volunteer Email,Volunteering Job,Hours,Organization\n';
    let totalHours = 0;

    filteredLogs.forEach((log) => {
      const volunteer = appState.volunteersData.find((item) => item.id === log.user_id) || {};
      const volunteerName = volunteer.firstName || log.firstName || log.volunteer_name || 'Unknown';
      const volunteerEmail = volunteer.email || log.volunteer_email || log.email || 'Unknown';
      const location = log.site || 'Not specified';
      const hours = parseFloat(log.hours_contributed || log.hours) || 0;
      const organizationName = (appState.currentAdmin && appState.currentAdmin.organizationName) || 'Organization';

      totalHours += hours;

      csvContent += [
        log.date,
        escapeCsv(volunteerName),
        escapeCsv(volunteerEmail),
        escapeCsv(location),
        hours,
        escapeCsv(organizationName)
      ].join(',');
      csvContent += '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `volunteer-hours-${startDateValue}-to-${endDateValue}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showMessage(`CSV exported successfully! ${filteredLogs.length} log entries with ${totalHours.toFixed(1)} total hours.`, 'success');
    closeSheetsModal();
  } catch (error) {
    console.error('Error generating CSV:', error);
    showMessage(`Error generating CSV file: ${error.message || error}`, 'error');
  }
}

function escapeCsv(value) {
  const stringValue = value === undefined || value === null ? '' : String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || /[\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
