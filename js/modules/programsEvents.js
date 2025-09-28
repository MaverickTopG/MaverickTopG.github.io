import { db } from './firebase.js';
import { collection, query, where, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { appState } from './state.js';
import { showMessage } from './ui.js';
import { notifyVolunteersUpdate, syncVolunteerHoursFromActivity } from './volunteerOps.js';

let activityUpdateHandler = () => {};

export function registerActivityUpdateHandler(handler) { // handler can now accept a source
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
  // FIX: Ensure Sunday is correctly handled as the start of the new week.
  const dayOfWeek = now.getUTCDay(); // 0 for Sunday
  const diff = now.getUTCDate() - dayOfWeek; // This correctly finds the last Sunday.

  const startOfWeek = new Date(now.setUTCDate(diff));
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek.getTime());
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 7);

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