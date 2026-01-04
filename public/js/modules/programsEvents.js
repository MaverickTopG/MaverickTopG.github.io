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
const SCHOOL_PLAN_KEY = 'school';
const SCHOOL_VOLUNTEER_CHUNK_SIZE = 10;
const schoolLogsByChunk = new Map();

export function registerActivityUpdateHandler(handler) {
  activityUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

function notifyActivityUpdate() {
  activityUpdateHandler();
}

function normalizePlanValue(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function subscriptionMentionsSchool(subscription = {}, admin = {}) {
  const candidates = [
    subscription.planKey,
    subscription.plan_key,
    subscription.planNickname,
    subscription.plan?.nickname,
    subscription.plan?.name,
    subscription.plan_name,
    subscription.product_name,
    subscription.price?.nickname,
    subscription.price?.name,
    subscription.product?.name,
    subscription.metadata?.plan_key,
    admin.planKey,
    admin.plan_key,
    admin.plan,
    admin.planType,
    admin.subscription_plan_key,
  ];
  return candidates.some((value) => {
    const normalized = normalizePlanValue(value);
    return normalized ? normalized.includes(SCHOOL_PLAN_KEY) : false;
  });
}

function isSchoolAdminPlan() {
  const admin = appState.currentAdmin || {};
  const subscription = admin.subscription || admin.subscriptionData || admin.subscriptionSnapshot || {};
  if (subscriptionMentionsSchool(subscription, admin)) return true;
  const items = subscription.items || subscription.subscription_items || subscription.products || subscription.subscription_products;
  if (Array.isArray(items)) {
    return items.some((item) => subscriptionMentionsSchool(item, admin));
  }
  return false;
}

function getVolunteerIdsForSchool() {
  const volunteers = Array.isArray(appState.volunteersData) ? appState.volunteersData : [];
  const ids = volunteers.map((volunteer) =>
    volunteer.user_id || volunteer.userId || volunteer.uid || volunteer.id || null,
  );
  return Array.from(new Set(ids.filter(Boolean)));
}

function normalizeSchoolLog(log, orgCode) {
  return {
    ...log,
    approve: 'accepted',
    school_auto_approved: true,
  };
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

function resetSchoolVolunteerLogsListener() {
  if (appState.schoolLogsUnsub) {
    try {
      appState.schoolLogsUnsub();
    } catch (error) {
      console.warn('schoolLogsUnsub error', error);
    }
    appState.schoolLogsUnsub = null;
  }
  schoolLogsByChunk.clear();
  appState.schoolVolunteerLogs = [];
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
  resetSchoolVolunteerLogsListener();
  resetSharedLogsListener();
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
  const combined = [...base, ...normalizedShared];
  const deduped = new Map();
  combined.forEach((entry) => {
    if (!entry || !entry.id) return;
    deduped.set(entry.id, entry);
  });
  return Array.from(deduped.values());
}

function updateVolunteerAggregates() {
  const combined = buildCombinedActivity(appState.activityData, appState.sharedLogs);
  syncVolunteerHoursFromActivity(combined);
  notifyVolunteersUpdate();
}

function applySchoolLogsSnapshot(chunkKey, orgCode, snapshot) {
  const records = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const normalized = normalizeSchoolLog({ id: docSnap.id, ...data }, orgCode);
    records.push(normalized);
  });
  schoolLogsByChunk.set(chunkKey, records);
  const combined = [];
  schoolLogsByChunk.forEach((entries) => {
    combined.push(...entries);
  });
  appState.schoolVolunteerLogs = combined;
  refreshActivityData();
}

function refreshActivityData() {
  const baseLogs = Array.isArray(appState.baseOrgLogs) ? appState.baseOrgLogs : [];
  const schoolLogs = Array.isArray(appState.schoolVolunteerLogs) ? appState.schoolVolunteerLogs : [];
  const merged = new Map();
  baseLogs.forEach((entry) => entry?.id && merged.set(entry.id, entry));
  schoolLogs.forEach((entry) => entry?.id && merged.set(entry.id, entry));
  const combined = Array.from(merged.values());
  combined.sort((a, b) => parseDateForSort(b) - parseDateForSort(a));
  appState.activityData = combined;
  updateVolunteerAggregates();
  notifyActivityUpdate();
}

function loadSchoolVolunteerLogs(orgCode) {
  resetSchoolVolunteerLogsListener();
  if (!orgCode || !isSchoolAdminPlan()) {
    refreshActivityData();
    return;
  }

  const volunteerIds = getVolunteerIdsForSchool();
  if (!volunteerIds.length) {
    refreshActivityData();
    return;
  }

  const subscriptions = [];
  const chunks = [];
  for (let i = 0; i < volunteerIds.length; i += SCHOOL_VOLUNTEER_CHUNK_SIZE) {
    chunks.push(volunteerIds.slice(i, i + SCHOOL_VOLUNTEER_CHUNK_SIZE));
  }

  const idFields = ['user_id', 'volunteer_id', 'uid'];

  chunks.forEach((chunk, index) => {
    const chunkKey = `chunk-${index}`;
    idFields.forEach((field) => {
      try {
        const logsQuery = query(
          collection(db, 'volunteer_logs'),
          where(field, 'in', chunk),
        );
        const unsub = onSnapshot(
          logsQuery,
          (snapshot) => applySchoolLogsSnapshot(`${chunkKey}-${field}`, orgCode, snapshot),
          (error) => {
            console.error('school logs onSnapshot error:', error);
            showMessage(`Error loading school logs: ${error.message || error}`, 'error');
          },
        );
        subscriptions.push(unsub);
      } catch (error) {
        console.error('school logs listener setup failed:', error);
        showMessage(`Unable to subscribe to school logs: ${error.message || error}`, 'error');
      }
    });
  });

  appState.schoolLogsUnsub = () => {
    subscriptions.forEach((unsub) => {
      try {
        unsub();
      } catch (error) {
        console.warn('school logs unsubscribe error', error);
      }
    });
  };
}

export function refreshSchoolVolunteerLogs() {
  const orgCode = (appState.currentOrgCode || '').trim().toUpperCase();
  loadSchoolVolunteerLogs(orgCode);
}

export function loadActivityData() {
  resetActivityListener();

  const normalizedOrgCode = (appState.currentOrgCode || '').trim().toUpperCase();
  if (!normalizedOrgCode) {
    appState.activityData = [];
    appState.baseOrgLogs = [];
    appState.sharedLogs = [];
    appState.schoolVolunteerLogs = [];
    updateVolunteerAggregates();
    notifyActivityUpdate();
    return;
  }

  const logsQuery = query(
    collection(db, 'volunteer_logs'),
    where('organization_id', '==', normalizedOrgCode),
  );

  appState.logsUnsub = onSnapshot(
    logsQuery,
    (snapshot) => {
      const activity = [];
      snapshot.forEach((doc) => {
        const logData = doc.data() || {};
        if (logData.approve === undefined) {
          logData.approve = 'pending';
        }
        if (isSchoolAdminPlan()) {
          logData.approve = 'accepted';
          logData.school_auto_approved = true;
        }
        activity.push({
          id: doc.id,
          ...logData,
        });
      });

      appState.baseOrgLogs = activity;
      refreshActivityData();
    },
    (error) => {
      console.error('logs onSnapshot error:', error);
      showMessage(`Error listening for activity: ${error.message || error}`, 'error');
    },
  );

  loadSharedLogs(normalizedOrgCode);
  loadSchoolVolunteerLogs(normalizedOrgCode);
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
