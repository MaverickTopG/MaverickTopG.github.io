import { db } from './firebase.js';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { appState } from './state.js';
import { showMessage } from './ui.js';
import { notifyVolunteersUpdate, syncVolunteerHoursFromActivity } from './volunteerOps.js';

let activityUpdateHandler = () => {};
let primaryActivity = [];
let secondaryActivity = [];
let tertiaryActivity = [];

export function registerActivityUpdateHandler(handler) {
  activityUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

function notifyActivityUpdate() {
  activityUpdateHandler();
}

function resetSharedLogsListener() {
  if (appState.sharedLogsUnsub) {
    try {
      appState.sharedLogsUnsub();
    } catch (error) {
      console.warn('sharedLogsUnsub error', error);
    }
    appState.sharedLogsUnsub = null;
  }
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
  if (appState.altLogsUnsub) {
    try {
      appState.altLogsUnsub();
    } catch (error) {
      console.warn('altLogsUnsub error', error);
    }
    appState.altLogsUnsub = null;
  }
  if (appState.linkedLogsUnsub) {
    try {
      appState.linkedLogsUnsub();
    } catch (error) {
      console.warn('linkedLogsUnsub error', error);
    }
    appState.linkedLogsUnsub = null;
  }
  resetSharedLogsListener();
  appState.schoolActivityLogs = [];
  primaryActivity = [];
  secondaryActivity = [];
  tertiaryActivity = [];
}

function parseDateForSort(log) {
  const candidates = [
    log.created_at,
    log.createdAt,
    log.submitted_at,
    log.submittedAt,
  ];

  for (const value of candidates) {
    if (!value) continue;
    if (typeof value.toDate === 'function') {
      const date = value.toDate();
      const millis = date.getTime();
      if (!Number.isNaN(millis)) return millis;
    }
    if (typeof value.toMillis === 'function') {
      const millis = value.toMillis();
      if (Number.isFinite(millis)) return millis;
    }
    const date = new Date(value);
    const millis = date.getTime();
    if (!Number.isNaN(millis)) return millis;
  }

  if (log.date) {
    const date = new Date(log.date);
    const millis = date.getTime();
    if (!Number.isNaN(millis)) return millis;
  }

  return 0;
}

function loadSharedLogs(orgCode) {
  resetSharedLogsListener();

  if (!orgCode) {
    appState.sharedLogs = [];
    notifyActivityUpdate();
    return;
  }

  try {
    const sharedQuery = query(
      collection(db, 'organization_shared_logs'),
      where('organization_code', '==', orgCode),
    );

    appState.sharedLogsUnsub = onSnapshot(
      sharedQuery,
      (snapshot) => {
        const records = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          records.push({
            id: docSnap.id,
            ...data,
          });
        });

        records.sort((a, b) => {
          const aTime = parseDateForSort(a);
          const bTime = parseDateForSort(b);
          return bTime - aTime;
        });

        appState.sharedLogs = records;
        updateVolunteerAggregates();
        notifyActivityUpdate();
      },
      (error) => {
        console.error('shared logs onSnapshot error:', error);
        showMessage(`Error loading shared logs: ${error.message || error}`, 'error');
      },
    );
  } catch (error) {
    console.error('shared logs listener setup failed:', error);
    showMessage(`Unable to subscribe to shared logs: ${error.message || error}`, 'error');
  }
}

function normalizeSharedLogForTotals(entry) {
  if (!entry) return null;
  const volunteerId = entry.user_id || entry.volunteer_id || entry.uid || null;
  if (!volunteerId) return null;
  const hours = Number(entry.hours_contributed ?? entry.hours ?? entry.total_hours ?? 0);
  const normalized = {
    id: entry.log_id || entry.id || `shared-${volunteerId}-${entry.date || Date.now()}`,
    user_id: volunteerId,
    site: entry.site || entry.task || entry.organization_task || 'Shared session',
    hours_contributed: hours,
    hours,
    approve: 'approved',
    date: entry.date || null,
    time: entry.time || null,
    organizationCode: entry.organization_code || entry.org_access_code || null,
    organizationName: entry.organization_name || entry.org_name || null,
    shared: true,
  };
  return normalized;
}

function buildCombinedActivity(baseLogs, sharedEntries) {
  const base = Array.isArray(baseLogs) ? baseLogs : [];
  const normalizedShared = Array.isArray(sharedEntries)
    ? sharedEntries.map(normalizeSharedLogForTotals).filter(Boolean)
    : [];
  return [...base, ...normalizedShared];
}

function activityLogKey(log) {
  if (!log) return '';
  if (log.id) return String(log.id);
  const user = log.user_id || log.uid || log.volunteer_id || log.volunteer_email || log.email || 'unknown';
  const event = log.event_id || log.eventId || log.event || '';
  const date = log.date || log.created_at || log.createdAt || log.submitted_at || log.timestamp || '';
  const hours = log.hours_contributed ?? log.hours ?? 0;
  return `${user}__${date}__${event}__${hours}`;
}

export function getActivityLogsForOrg(options = {}) {
  const includeSchoolExtras = typeof options === 'object'
    ? Boolean(options.includeSchoolExtras)
    : Boolean(options);
  const baseLogs = Array.isArray(appState.activityData) ? appState.activityData : [];
  if (!includeSchoolExtras) return baseLogs;

  const schoolExtras = Array.isArray(appState.schoolActivityLogs) ? appState.schoolActivityLogs : [];
  if (!schoolExtras.length) return baseLogs;

  const seen = new Set(baseLogs.map(activityLogKey));
  const merged = [...baseLogs];
  schoolExtras.forEach((log) => {
    const key = activityLogKey(log);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(log);
  });
  return merged;
}

function updateVolunteerAggregates() {
  const combined = buildCombinedActivity(appState.activityData, appState.sharedLogs);
  syncVolunteerHoursFromActivity(combined);
  notifyVolunteersUpdate();
}

function emitActivity() {
  const merged = [...primaryActivity];
  const seen = new Set(merged.map((log) => log.id));
  secondaryActivity.forEach((log) => {
    if (!seen.has(log.id)) {
      merged.push(log);
    }
  });
  tertiaryActivity.forEach((log) => {
    if (!seen.has(log.id)) {
      merged.push(log);
    }
  });
  merged.sort((a, b) => parseDateForSort(b) - parseDateForSort(a));
  appState.activityData = merged;
  updateVolunteerAggregates();
  notifyActivityUpdate();
}

export function loadActivityData() {
  resetActivityListener();

  const normalizedOrgCode = (appState.currentOrgCode || '').trim().toUpperCase();
  const linkedOrgId = (appState.currentAdmin?.organizationId || appState.currentAdmin?.organization_id || '').trim();
  if (!normalizedOrgCode) {
    appState.activityData = [];
    appState.sharedLogs = [];
    updateVolunteerAggregates();
    notifyActivityUpdate();
    return;
  }

  const logsQuery = query(
    collection(db, 'volunteer_logs'),
    where('organization_id', '==', normalizedOrgCode),
  );

  const altLogsQuery = query(
    collection(db, 'volunteer_logs'),
    where('organizationCode', '==', normalizedOrgCode),
  );

  appState.logsUnsub = onSnapshot(
    logsQuery,
    (snapshot) => {
      const activity = [];
      snapshot.forEach((doc) => {
        const logData = doc.data() || {};
        if (!logData.approve) {
          logData.approve = 'pending';
        }
        activity.push({
          id: doc.id,
          ...logData,
        });
      });
      activity.sort((a, b) => parseDateForSort(b) - parseDateForSort(a));
      primaryActivity = activity;
      emitActivity();
    },
    (error) => {
      console.error('logs onSnapshot error:', error);
      showMessage(`Error listening for activity: ${error.message || error}`, 'error');
    },
  );

  appState.altLogsUnsub = onSnapshot(
    altLogsQuery,
    (snapshot) => {
      const activity = [];
      snapshot.forEach((doc) => {
        const logData = doc.data() || {};
        if (!logData.approve) {
          logData.approve = 'pending';
        }
        activity.push({
          id: doc.id,
          ...logData,
        });
      });
      activity.sort((a, b) => parseDateForSort(b) - parseDateForSort(a));
      secondaryActivity = activity;
      emitActivity();
    },
    (error) => {
      console.error('alt logs onSnapshot error:', error);
      showMessage(`Error listening for activity: ${error.message || error}`, 'error');
    },
  );

  if (linkedOrgId) {
    const linkedQuery = query(
      collection(db, 'volunteer_logs'),
      where('linked_org_id', '==', linkedOrgId),
    );

    appState.linkedLogsUnsub = onSnapshot(
      linkedQuery,
      (snapshot) => {
        const activity = [];
        snapshot.forEach((doc) => {
          const logData = doc.data() || {};
          if (!logData.approve) {
            logData.approve = 'pending';
          }
          activity.push({
            id: doc.id,
            ...logData,
          });
        });
        activity.sort((a, b) => parseDateForSort(b) - parseDateForSort(a));
        tertiaryActivity = activity;
        emitActivity();
      },
      (error) => {
        console.error('linked logs onSnapshot error:', error);
        showMessage(`Error listening for linked activity: ${error.message || error}`, 'error');
      },
    );
  }

  loadSharedLogs(normalizedOrgCode);
}

export function getCurrentWeekBoundaries(referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const dayOfWeek = now.getUTCDay();
  const diff = now.getUTCDate() - dayOfWeek;

  const startOfWeek = new Date(now.setUTCDate(diff));
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek.getTime());
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 7);

  return { startOfWeek, endOfWeek };
}

export function getWeeklyData(startOfWeekInput) {
  const startOfWeek = startOfWeekInput
    ? new Date(startOfWeekInput)
    : getCurrentWeekBoundaries().startOfWeek;
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
