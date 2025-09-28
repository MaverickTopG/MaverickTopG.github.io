import { db } from './firebase.js';
import { collection, query, where, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { appState } from './state.js';
import { showMessage } from './ui.js';
import { notifyVolunteersUpdate, syncVolunteerHoursFromActivity } from './volunteerOps.js';

let activityUpdateHandler = () => {};

export function registerActivityUpdateHandler(handler) {
  activityUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

function notifyActivityUpdate() {
  activityUpdateHandler();
}

export function resetActivityListener() {
  if (appState.logsUnsub) {
    try {
      appState.logsUnsub();
    } catch (error) {
      console.warn('logsUnsub error', error);
    }
    appState.logsUnsub = null;
  }
}

export function loadActivityData() {
  resetActivityListener();

  if (!appState.currentOrgCode) {
    appState.activityData = [];
    notifyActivityUpdate();
    return;
  }

  const logsQuery = query(
    collection(db, 'volunteer_logs'),
    where('organization_id', '==', appState.currentOrgCode),
    orderBy('date', 'desc')
  );

  appState.logsUnsub = onSnapshot(logsQuery, (snapshot) => {
    const activity = [];
    snapshot.forEach((doc) => {
      const logData = doc.data();
      // Ensure every log has an approval status for consistency.
      if (logData.approve === undefined) {
        logData.approve = 'pending';
      }
      activity.push({ id: doc.id, ...logData });
    });

    appState.activityData = activity;
    syncVolunteerHoursFromActivity(activity);
    notifyVolunteersUpdate();
    notifyActivityUpdate();
  }, (error) => {
    console.error('logs onSnapshot error:', error);
    showMessage(`Error listening for activity: ${error.message || error}`, 'error');
  });
}

export function getCurrentWeekBoundaries(referenceDate = new Date()) {
  const now = new Date(referenceDate); // Use the provided date or today
  // FIX: Use UTC methods to avoid timezone-related off-by-one errors.
  const dayOfWeek = now.getUTCDay(); // 0 for Sunday, 1 for Monday, etc.
  const diff = now.getUTCDate() - dayOfWeek;

  const startOfWeek = new Date(now.setUTCDate(diff));
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  return { startOfWeek, endOfWeek };
}

export function getWeeklyData(startOfWeekInput) {
  const startOfWeek = startOfWeekInput ? new Date(startOfWeekInput) : getCurrentWeekBoundaries().startOfWeek;
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(0, 0, 0, 0);

  const weekData = [0, 0, 0, 0, 0, 0, 0];

  appState.activityData.forEach((log, index) => {
    if (!log.date) {
      console.warn(`Chart - Missing date in log ${index}:`, log);
      return;
    }

    const logDate = new Date(log.date);
    if (Number.isNaN(logDate.getTime())) {
      console.warn(`Chart - Invalid date in log ${index}:`, log.date);
      return;
    }

    if (logDate >= startOfWeek && logDate < endOfWeek) {
      const dayOfWeek = logDate.getDay();
      const hours = parseFloat(log.hours_contributed || log.hours) || 0;
      weekData[dayOfWeek] += hours;
    }
  });

  return weekData;
}