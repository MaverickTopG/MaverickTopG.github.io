import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import crypto from 'crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
const STRIPE_PRICE_SCHOOL = defineSecret('STRIPE_PRICE_SCHOOL');
const ADMIN_QR_SECRET = defineSecret('ADMIN_QR_SECRET');
const DEFAULT_PRICE_SCHOOL = 'price_1SXZMfH9sPZuClpwNAJK5Uj2';
const DEFAULT_QR_TTL_SECONDS = 3153600000; // 100 years
const DEMO_ACCOUNT_EMAILS = new Set(['x@gmail.com']);
const AUTO_APPROVE_MAX_HOURS = 12;
const AUTO_APPROVE_HISTORY_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;

initializeApp();
const db = getFirestore();
const authAdmin = getAuth();

function safeSecretValue(secret, fallback) {
  try {
    const value = secret.value();
    return value || fallback;
  } catch (error) {
    return fallback;
  }
}

function handleCorsPreflight(req, res, allowedMethods = ['POST']) {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Access-Control-Allow-Methods', [...allowedMethods, 'OPTIONS'].join(', '));
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return true;
  }
  return false;
}

async function resolveOrgDocById(orgId) {
  if (!orgId) return null;
  const collections = ['organizations', 'orgs', 'volunteer_organizations'];
  for (const coll of collections) {
    const snap = await db.collection(coll).doc(orgId).get();
    if (snap.exists) {
      return snap;
    }
  }
  return null;
}

async function resolveOrgDocByCode(orgCode) {
  if (!orgCode) return null;
  const collections = ['organizations', 'orgs', 'volunteer_organizations'];
  const fields = ['access_code', 'accessCode', 'orgCode', 'org_code', 'organizationCode', 'organization_code'];
  for (const coll of collections) {
    for (const field of fields) {
      const snap = await db.collection(coll).where(field, '==', orgCode).limit(1).get();
      if (!snap.empty) {
        return snap.docs[0];
      }
    }
  }
  return null;
}

async function resolveOrgContextForUser(uid) {
  if (!uid) return { orgId: null, orgCode: null };
  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (userSnap.exists) {
      const data = userSnap.data() || {};
      const orgId =
        data.organizationId
        || data.organization_id
        || data.orgId
        || data.org_id
        || data.linked_org_id
        || data.linkedOrgId
        || null;
      const orgCode =
        data.accessCode
        || data.access_code
        || data.orgCode
        || data.org_code
        || data.organizationCode
        || data.organization_code
        || null;
      if (orgId || orgCode) return { orgId, orgCode };
    }
  } catch (error) {
    logger.warn('Unable to resolve org from user profile', error);
  }

  try {
    const userOrgSnap = await db.collection('user_organizations').doc(uid).get();
    if (userOrgSnap.exists) {
      const data = userOrgSnap.data() || {};
      const orgId =
        data.organizationId
        || data.organization_id
        || data.orgId
        || data.org_id
        || data.linked_org_id
        || data.linkedOrgId
        || null;
      const orgCode =
        data.accessCode
        || data.access_code
        || data.orgCode
        || data.org_code
        || data.organizationCode
        || data.organization_code
        || null;
      if (orgId || orgCode) return { orgId, orgCode };
    }
  } catch (error) {
    logger.warn('Unable to resolve org from user_organizations', error);
  }

  const query = await db
    .collection('user_organizations')
    .where('user_id', '==', uid)
    .limit(1)
    .get();
  if (!query.empty) {
    const data = query.docs[0].data() || {};
    return {
      orgId:
        data.organizationId
        || data.organization_id
        || data.orgId
        || data.org_id
        || data.linked_org_id
        || data.linkedOrgId
        || null,
      orgCode:
        data.accessCode
        || data.access_code
        || data.orgCode
        || data.org_code
        || data.organizationCode
        || data.organization_code
        || null,
    };
  }

  return { orgId: null, orgCode: null };
}

function resolveLogUserId(log) {
  return String(log.user_id || log.userId || log.volunteer_id || log.volunteerId || log.uid || '').trim();
}

function resolveLogHours(log) {
  const raw = log.hours_contributed ?? log.hours ?? log.totalHours ?? log.total_hours;
  const hours = Number(raw ?? 0);
  return Number.isFinite(hours) ? hours : 0;
}

function resolveLogDateValue(log) {
  return log.date || log.createdAt || log.created_at || log.createdAtMs || log.created_at_ms;
}

function resolveTimestampMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function resolveLogStatus(log) {
  const raw = (log.status || log.approve || log.approval_status || log.approvalStatus || '').toString().toLowerCase();
  if (raw.includes('approve')) return 'approved';
  if (raw.includes('reject') || raw.includes('decline')) return 'rejected';
  if (raw.includes('pending')) return 'pending';
  return raw || 'pending';
}

function resolveLogOrg(log) {
  const orgId = String(
    log.orgId
    || log.org_id
    || log.organizationId
    || log.linked_org_id
    || log.linkedOrgId
    || '',
  ).trim();
  const orgCode = String(
    log.orgCode
    || log.org_code
    || log.organizationCode
    || log.organization_id
    || log.organization_code
    || '',
  ).trim();
  return { orgId, orgCode };
}

function isQuestionableLog(log, historyByUser = new Map()) {
  const hours = resolveLogHours(log);
  if (!Number.isFinite(hours) || hours <= 0) return true;
  if (hours > AUTO_APPROVE_MAX_HOURS) return true;

  const flagKeys = [
    'flagged',
    'questionable',
    'needs_review',
    'requires_review',
    'review_required',
    'manual_review',
    'review_status',
    'approval_status',
    'approvalStatus',
  ];
  const flagged = flagKeys.some((key) => {
    const value = log[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      return normalized.includes('flag') || normalized.includes('review') || normalized.includes('question');
    }
    return false;
  });
  if (flagged) return true;

  const dateMs = resolveTimestampMillis(resolveLogDateValue(log));
  if (dateMs && dateMs > Date.now() + 24 * 60 * 60 * 1000) return true;

  const userId = resolveLogUserId(log);
  if (userId && historyByUser.has(userId)) {
    const history = historyByUser.get(userId) || [];
    if (history.length >= 3) {
      const avg = history.reduce((sum, value) => sum + value, 0) / history.length;
      if (avg > 0 && avg <= 2.5 && hours >= avg * 3) {
        return true;
      }
    }
  }
  return false;
}

async function resolveAutoProcessingEnabled({ orgId, orgCode }) {
  const collections = ['organizations', 'orgs', 'volunteer_organizations'];
  for (const coll of collections) {
    const refId = orgId || orgCode;
    if (!refId) continue;
    const snap = await db.collection(coll).doc(refId).get();
    if (snap.exists) {
      const data = snap.data() || {};
      return Boolean(data.auto_process_logs);
    }
  }
  return false;
}

export const autoApproveVolunteerLogs = onDocumentWritten('volunteer_logs/{logId}', async (event) => {
  const after = event.data?.after;
  if (!after || !after.exists) return;
  const log = after.data() || {};
  const status = resolveLogStatus(log);
  if (status !== 'pending') return;
  if (log.auto_approved === true) return;

  const org = resolveLogOrg(log);
  const isSchoolPlan = await resolveOrgSchoolPlan(org);
  if (isSchoolPlan) {
    await after.ref.update({
      approve: 'approved',
      status: 'approved',
      approved_at: Timestamp.now(),
      auto_approved: true,
    });
    return;
  }
  const autoProcessingEnabled = await resolveAutoProcessingEnabled(org);
  if (!autoProcessingEnabled) return;

  const userId = resolveLogUserId(log);
  if (!userId) return;

  const historyByUser = new Map();
  const now = Date.now();
  const history = [];
  const baseQuery = org.orgId
    ? db.collection('volunteer_logs').where('orgId', '==', org.orgId)
    : org.orgCode
      ? db.collection('volunteer_logs').where('orgCode', '==', org.orgCode)
      : db.collection('volunteer_logs');

  const [approvedStatusSnap, approvedFieldSnap] = await Promise.all([
    baseQuery.where('status', '==', 'approved').get(),
    baseQuery.where('approve', '==', 'approved').get().catch(() => ({ forEach: () => {} })),
  ]);
  const seenDocs = new Set();
  const collectHistory = (docSnap) => {
    if (seenDocs.has(docSnap.id)) return;
    seenDocs.add(docSnap.id);
    const data = docSnap.data() || {};
    const logUserId = resolveLogUserId(data);
    if (!logUserId || logUserId !== userId) return;
    const hours = resolveLogHours(data);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const dateMs = resolveTimestampMillis(resolveLogDateValue(data));
    if (!dateMs || now - dateMs > AUTO_APPROVE_HISTORY_WINDOW_MS) return;
    history.push(hours);
  };
  approvedStatusSnap.forEach(collectHistory);
  if (approvedFieldSnap?.forEach) {
    approvedFieldSnap.forEach(collectHistory);
  }
  if (history.length) {
    historyByUser.set(userId, history);
  }

  if (isQuestionableLog(log, historyByUser)) return;

  await after.ref.update({
    approve: 'approved',
    status: 'approved',
    approved_at: Timestamp.now(),
    auto_approved: true,
  });
});

const ORG_AUTO_APPROVE_MAX_HOURS = 12;
const ORG_AUTO_APPROVE_HISTORY_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;

async function isQuestionableOrgHourLog(orgId, log) {
  const hours = Number(log.hours);
  if (!Number.isFinite(hours) || hours <= 0) return true;
  if (hours > ORG_AUTO_APPROVE_MAX_HOURS) return true;

  const dateMs = new Date(log.date).getTime();
  if (Number.isFinite(dateMs) && dateMs > Date.now() + 24 * 60 * 60 * 1000) return true;

  const userId = log.userId;
  if (!userId) return true;

  // `date` is a zero-padded "YYYY-MM-DD" string (HourLog.date), which sorts
  // correctly with a lexicographic range query -- matches the old heuristic's
  // use of the logged work date (not the record's createdAt) for recency.
  const cutoffDate = new Date(Date.now() - ORG_AUTO_APPROVE_HISTORY_WINDOW_MS).toISOString().slice(0, 10);
  const historySnap = await db
    .collection('organizations').doc(orgId).collection('hourLogs')
    .where('userId', '==', userId)
    .where('status', '==', 'verified')
    .where('date', '>=', cutoffDate)
    .get();
  const history = historySnap.docs
    .map((d) => Number(d.data().hours))
    .filter((h) => Number.isFinite(h) && h > 0);
  if (history.length >= 3) {
    const avg = history.reduce((sum, h) => sum + h, 0) / history.length;
    if (avg > 0 && hours >= avg * 3) return true;
  }
  return false;
}

async function verifyOrgHourLog(orgId, logId, verifiedBy) {
  const logRef = db.collection('organizations').doc(orgId).collection('hourLogs').doc(logId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(logRef);
    if (!snap.exists) return;
    const log = snap.data();
    if (log.status !== 'pending') return;
    tx.update(logRef, {
      status: 'verified', verifiedBy, verifiedAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    tx.update(db.collection('users').doc(log.userId), {
      'stats.totalHoursPending': FieldValue.increment(-log.hours),
      'stats.totalHoursVerified': FieldValue.increment(log.hours),
    });
    tx.set(
      db.collection('organizations').doc(orgId).collection('volunteers').doc(log.userId),
      { perOrgStats: { hours: FieldValue.increment(log.hours) } },
      { merge: true },
    );
  });
}

async function rejectOrgHourLog(orgId, logId, reason) {
  const logRef = db.collection('organizations').doc(orgId).collection('hourLogs').doc(logId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(logRef);
    if (!snap.exists) return;
    const log = snap.data();
    if (log.status !== 'pending') return;
    tx.update(logRef, {
      status: 'rejected', rejectedReason: reason, updatedAt: Timestamp.now(),
    });
    tx.update(db.collection('users').doc(log.userId), {
      'stats.totalHoursPending': FieldValue.increment(-log.hours),
    });
  });
}

async function assertOrgAdmin(uid, orgId) {
  const snap = await db.collection('organizations').doc(orgId).collection('orgAdmins').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Not an admin of this organization.');
}

export const autoApproveOrgHourLogs = onDocumentWritten(
  'organizations/{orgId}/hourLogs/{logId}',
  async (event) => {
    const after = event.data?.after;
    if (!after || !after.exists) return;
    const log = after.data() || {};
    if (log.status !== 'pending') return;

    const { orgId, logId } = event.params;
    const orgSnap = await db.collection('organizations').doc(orgId).get();
    if (!orgSnap.exists || orgSnap.data().autoApproveHours !== true) return;

    if (await isQuestionableOrgHourLog(orgId, log)) return;
    await verifyOrgHourLog(orgId, logId, 'auto');
  },
);

export const verifyHourLog = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const { orgId, logId } = request.data || {};
  if (!orgId || !logId) throw new HttpsError('invalid-argument', 'orgId and logId are required.');
  await assertOrgAdmin(uid, orgId);
  await verifyOrgHourLog(orgId, logId, uid);
  return { ok: true };
});

export const rejectHourLog = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const { orgId, logId, reason } = request.data || {};
  if (!orgId || !logId) throw new HttpsError('invalid-argument', 'orgId and logId are required.');
  await assertOrgAdmin(uid, orgId);
  await rejectOrgHourLog(orgId, logId, String(reason || ''));
  return { ok: true };
});

async function findActiveVolunteerByEmail(orgId, email) {
  const snap = await db
    .collection('organizations').doc(orgId).collection('volunteers')
    .where('email', '==', email)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

export const kioskCheckIn = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const orgId = String(request.data?.orgId || '').trim();
  const email = String(request.data?.email || '').trim().toLowerCase();
  const task = String(request.data?.task || '').trim();
  if (!orgId || !email || !task) {
    throw new HttpsError('invalid-argument', 'orgId, email, and task are required.');
  }
  await assertOrgAdmin(uid, orgId);

  const volunteer = await findActiveVolunteerByEmail(orgId, email);
  if (!volunteer) {
    throw new HttpsError('not-found', 'Email not affiliated with this organization');
  }

  const sessionsRef = db.collection('organizations').doc(orgId).collection('kioskSessions');
  const activeSnap = await sessionsRef
    .where('userId', '==', volunteer.id)
    .where('checkOutAt', '==', null)
    .limit(1)
    .get();
  if (!activeSnap.empty) {
    throw new HttpsError('already-exists', 'Already signed in');
  }

  const sessionRef = sessionsRef.doc();
  await sessionRef.set({
    userId: volunteer.id,
    orgId,
    displayName: volunteer.data.displayName || volunteer.data.email || 'Volunteer',
    email,
    task,
    checkInAt: Timestamp.now(),
    checkOutAt: null,
    hourLogId: null,
  });

  return { ok: true, displayName: volunteer.data.displayName || '' };
});

export const kioskCheckOut = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const orgId = String(request.data?.orgId || '').trim();
  const email = String(request.data?.email || '').trim().toLowerCase();
  if (!orgId || !email) {
    throw new HttpsError('invalid-argument', 'orgId and email are required.');
  }
  await assertOrgAdmin(uid, orgId);

  const volunteer = await findActiveVolunteerByEmail(orgId, email);
  if (!volunteer) {
    throw new HttpsError('not-found', 'Email not affiliated with this organization');
  }

  const sessionsRef = db.collection('organizations').doc(orgId).collection('kioskSessions');
  const activeSnap = await sessionsRef
    .where('userId', '==', volunteer.id)
    .where('checkOutAt', '==', null)
    .limit(1)
    .get();
  if (activeSnap.empty) {
    throw new HttpsError('not-found', 'No active session found');
  }
  const sessionDoc = activeSnap.docs[0];
  const session = sessionDoc.data();

  const checkOutAt = Timestamp.now();
  const rawHours = (checkOutAt.toMillis() - session.checkInAt.toMillis()) / 3600000;
  const hours = Math.round(rawHours * 100) / 100;
  const dateStr = new Date().toISOString().slice(0, 10);

  const orgSnap = await db.collection('organizations').doc(orgId).get();
  const orgName = orgSnap.exists ? (orgSnap.data().name || '') : '';

  const logRef = db.collection('organizations').doc(orgId).collection('hourLogs').doc();
  await db.runTransaction(async (tx) => {
    tx.set(logRef, {
      userId: volunteer.id,
      orgId,
      orgName,
      eventId: null,
      hours,
      description: session.task || 'Kiosk Service',
      reflection: null,
      date: dateStr,
      startedAt: session.checkInAt,
      endedAt: checkOutAt,
      status: 'pending',
      source: 'kiosk',
      createdAt: checkOutAt,
      updatedAt: checkOutAt,
    });
    tx.update(db.collection('users').doc(volunteer.id), {
      'stats.totalHoursPending': FieldValue.increment(hours),
      'stats.totalSessions': FieldValue.increment(1),
    });
    tx.update(sessionDoc.ref, {
      checkOutAt,
      hourLogId: logRef.id,
    });
  });

  return { ok: true, hours };
});

export const consumeNebulaePrompt = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to use Nebulae AI.');
  }

  if (request.auth?.token?.grandfathered === true) {
    return { allowed: true, planTier: 'grandfathered', remaining: null };
  }

  const { orgId, orgCode } = await resolveOrgContextForUser(uid);
  if (!orgId && !orgCode) {
    throw new HttpsError('failed-precondition', 'Organization context is required.');
  }

  return { allowed: true, planTier: 'cosmos', remaining: null };
});

const ORG_ADMIN_ROLES = new Set(['owner', 'admin', 'coordinator', 'eventLead', 'viewer']);

export const addOrgAdmin = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const orgId = String(request.data?.orgId || '').trim();
  if (!orgId) {
    throw new HttpsError('invalid-argument', 'orgId is required.');
  }

  const callerSnap = await db.collection('organizations').doc(orgId)
    .collection('orgAdmins').doc(uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'Admin access required for this organization.');
  }

  const firstName = String(request.data?.firstName || '').trim();
  const lastName = String(request.data?.lastName || '').trim();
  const email = String(request.data?.email || '').trim().toLowerCase();
  const password = String(request.data?.password || '');
  const role = String(request.data?.role || 'coordinator').trim();

  if (!email || !password || password.length < 6) {
    throw new HttpsError('invalid-argument', 'Email and a password of at least 6 characters are required.');
  }
  if (!ORG_ADMIN_ROLES.has(role) || role === 'owner') {
    throw new HttpsError('invalid-argument', 'Invalid role. Use admin, coordinator, eventLead, or viewer.');
  }

  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || email;

  let newUser;
  try {
    newUser = await authAdmin.getUserByEmail(email);
  } catch (error) {
    newUser = await authAdmin.createUser({ email, password, displayName });
  }

  const now = Timestamp.now();
  await db.collection('organizations').doc(orgId)
    .collection('orgAdmins').doc(newUser.uid).set({
      userId: newUser.uid,
      orgId,
      displayName,
      email,
      role,
      addedBy: uid,
      createdAt: now,
    });

  return { uid: newUser.uid, email, displayName, role };
});

export const removeOrgAdmin = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const orgId = String(request.data?.orgId || '').trim();
  const targetUid = String(request.data?.uid || '').trim();
  if (!orgId || !targetUid) {
    throw new HttpsError('invalid-argument', 'orgId and uid are required.');
  }

  const callerSnap = await db.collection('organizations').doc(orgId)
    .collection('orgAdmins').doc(uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'Admin access required for this organization.');
  }

  const targetRef = db.collection('organizations').doc(orgId).collection('orgAdmins').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    return { ok: true };
  }
  if ((targetSnap.data() || {}).role === 'owner') {
    const ownersSnap = await db.collection('organizations').doc(orgId)
      .collection('orgAdmins').where('role', '==', 'owner').get();
    if (ownersSnap.size <= 1) {
      throw new HttpsError('failed-precondition', 'Cannot remove the only owner of an organization.');
    }
  }

  await targetRef.delete();
  return { ok: true };
});

export const acceptJoinRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const orgId = String(request.data?.orgId || '').trim();
  const volunteerId = String(request.data?.volunteerId || '').trim();
  if (!orgId || !volunteerId) {
    throw new HttpsError('invalid-argument', 'orgId and volunteerId are required.');
  }

  const adminSnap = await db.collection('organizations').doc(orgId)
    .collection('orgAdmins').doc(uid).get();
  if (!adminSnap.exists) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }

  const volunteerRef = db.collection('organizations').doc(orgId)
    .collection('volunteers').doc(volunteerId);
  const volunteerSnap = await volunteerRef.get();
  if (!volunteerSnap.exists) {
    throw new HttpsError('not-found', 'Join request not found.');
  }

  await volunteerRef.update({
    status: 'active',
    approvedBy: uid,
    approvedAt: Timestamp.now(),
  });

  return { ok: true };
});

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  const result = {};
  Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .forEach((key) => {
      result[key] = canonicalize(value[key]);
    });
  return result;
}

function canonicalJson(payload) {
  return JSON.stringify(canonicalize(payload));
}

function timingSafeHexEquals(a, b) {
  if (!a || !b) {
    return false;
  }
  let bufferA;
  let bufferB;
  try {
    bufferA = Buffer.from(String(a), 'hex');
    bufferB = Buffer.from(String(b), 'hex');
  } catch (error) {
    return false;
  }
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

async function ensureCanonicalOrganization(orgAccessCode, adminId, adminUser = {}) {
  const normalizedCode = String(orgAccessCode || '').trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error('Cannot ensure organization without access code.');
  }

  const canonicalQuery = await db
    .collection('organizations')
    .where('access_code', '==', normalizedCode)
    .limit(1)
    .get();

  if (!canonicalQuery.empty) {
    const canonicalDoc = canonicalQuery.docs[0];
    return {
      orgDoc: canonicalDoc,
      orgData: canonicalDoc.data() || {},
      source: 'organizations',
    };
  }

  const mirrorQuery = await db
    .collection('orgs')
    .where('access_code', '==', normalizedCode)
    .limit(1)
    .get();

  if (!mirrorQuery.empty) {
    const mirrorDoc = mirrorQuery.docs[0];
    const mirrorData = mirrorDoc.data() || {};
    const orgRef = db.collection('organizations').doc(mirrorDoc.id);
    const payload = {
      access_code: normalizedCode,
      name: mirrorData.name || adminUser.organizationName || normalizedCode,
      active: mirrorData.active !== false,
      syncedFrom: 'orgs',
      syncedAt: Timestamp.now(),
    };
    await orgRef.set(payload, { merge: true });
    const canonicalSnapshot = await orgRef.get();
    return {
      orgDoc: canonicalSnapshot,
      orgData: canonicalSnapshot.data() || payload,
      source: 'orgs-mirror',
    };
  }

  const inferredName =
    adminUser.organizationName
    || adminUser.organization_name
    || adminUser.organization
    || adminUser.name
    || `Organization ${normalizedCode}`;

  const newOrgRef = db.collection('organizations').doc();
  const payload = {
    access_code: normalizedCode,
    name: inferredName,
    active: true,
    createdAt: Timestamp.now(),
    createdBy: adminId || null,
    bootstrapSource: 'issueAdminQr',
  };
  await newOrgRef.set(payload);
  const newSnapshot = await newOrgRef.get();
  return {
    orgDoc: newSnapshot,
    orgData: newSnapshot.data() || payload,
    source: 'bootstrap',
  };
}

async function ensureOrganizationAdmin(orgRef, adminId, adminUser = {}, decodedToken = {}) {
  const adminRef = orgRef.collection('admins').doc(adminId);
  const adminSnap = await adminRef.get();
  if (adminSnap.exists) {
    return {
      adminRef,
      adminData: adminSnap.data() || {},
      created: false,
    };
  }

  const payload = {
    allowedCheckin: true,
    email: adminUser.email || decodedToken.email || null,
    displayName: adminUser.displayName || adminUser.name || decodedToken.name || null,
    createdAt: Timestamp.now(),
    createdBy: adminId || null,
    bootstrapSource: 'issueAdminQr',
  };
  await adminRef.set(payload, { merge: true });
  return {
    adminRef,
    adminData: payload,
    created: true,
  };
}

async function ensureUserOrganizationLink(orgAccessCode, orgId, adminId, adminUser = {}, orgData = {}) {
  const normalizedCode = String(orgAccessCode || '').trim().toUpperCase();
  if (!normalizedCode || !adminId) {
    return;
  }

  const userOrgQuery = await db
    .collection('user_organizations')
    .where('user_id', '==', adminId)
    .where('access_code', '==', normalizedCode)
    .limit(1)
    .get();

  const resolvedName =
    orgData.name
    || adminUser.organizationName
    || adminUser.organization
    || `Organization ${normalizedCode}`;

  if (!userOrgQuery.empty) {
    const docRef = userOrgQuery.docs[0].ref;
    await docRef.set(
      {
        name: resolvedName,
        linked_org_id: orgId || userOrgQuery.docs[0].data()?.linked_org_id || null,
        updated_at: Timestamp.now(),
      },
      { merge: true },
    );
    return;
  }

  await db.collection('user_organizations').add({
    user_id: adminId,
    access_code: normalizedCode,
    linked_org_id: orgId || null,
    name: resolvedName,
    created_at: Timestamp.now(),
    source: 'issueAdminQr-bootstrap',
  });
}

function isSchoolPlanKey(value) {
  return String(value || '').trim().toLowerCase() === 'school';
}

function normalizePlanKeyValue(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function isSchoolPlanValue(value) {
  const normalized = normalizePlanKeyValue(value);
  return Boolean(normalized && (normalized === 'school' || normalized.includes('school')));
}

function getSchoolPriceIds() {
  return new Set([
    DEFAULT_PRICE_SCHOOL,
    safeSecretValue(STRIPE_PRICE_SCHOOL, DEFAULT_PRICE_SCHOOL),
    process.env.ORBIT_PRICE_SCHOOL_MONTHLY,
    process.env.ORBIT_PRICE_SCHOOL_YEARLY,
    process.env.NEBULA_PRICE_SCHOOL_MONTHLY,
    process.env.NEBULA_PRICE_SCHOOL_YEARLY,
    process.env.COSMOS_PRICE_SCHOOL_MONTHLY,
    process.env.COSMOS_PRICE_SCHOOL_YEARLY,
  ].filter(Boolean));
}

function isSchoolSubscriptionPayload(payload = {}) {
  const schoolIds = getSchoolPriceIds();
  const planKey = String(payload.planKey || payload.plan_key || '').trim().toLowerCase();
  const planId = payload.plan
    || payload.planId
    || payload.plan_id
    || payload.plan?.id
    || payload.items?.[0]?.price?.id
    || payload.items?.data?.[0]?.price?.id
    || null;

  if (isSchoolPlanKey(planKey)) return true;
  if (isSchoolPlanValue(planKey)) return true;
  if (planId && schoolIds.has(planId)) return true;
  return false;
}

function isSchoolOrgData(data = {}) {
  if (data.school_plan_active === true || data.is_school_plan === true || data.schoolPlan === true) return true;

  const planKey = normalizePlanKeyValue(
    data.planKey
    || data.plan_key
    || data.plan
    || data.planType
    || data.plan_type
    || data.subscription_plan_key
    || data.subscriptionPlanKey
    || data.metadata?.plan_key,
  );
  if (isSchoolPlanValue(planKey)) return true;

  const category = normalizePlanKeyValue(
    data.category
    || data.type
    || data.org_type
    || data.organization_type,
  );
  if (isSchoolPlanValue(category)) return true;

  const sharePolicy = normalizePlanKeyValue(
    data.default_share_policy
    || data.defaultSharePolicy
    || data.metadata?.default_share_policy,
  );
  if (sharePolicy === 'required') return true;

  if (data.default_auto_share === true) return true;

  const subscription = data.subscription || data.subscriptionData || data.subscription_info || null;
  if (subscription && isSchoolSubscriptionPayload(subscription)) return true;

  return false;
}

async function resolveOrgSchoolPlan({ orgId, orgCode } = {}) {
  let orgSnap = null;
  if (orgId) {
    orgSnap = await resolveOrgDocById(orgId);
  }
  if (!orgSnap?.exists && orgCode) {
    orgSnap = await resolveOrgDocByCode(orgCode);
  }

  if (orgSnap?.exists) {
    const data = orgSnap.data() || {};
    if (isSchoolOrgData(data)) return true;

    const ownerId =
      data.owner_uid
      || data.ownerUid
      || data.created_by
      || data.createdBy
      || null;
    if (ownerId) {
      try {
        const userSnap = await db.collection('users').doc(ownerId).get();
        if (userSnap.exists && isSchoolOrgData(userSnap.data() || {})) return true;
      } catch (error) {
        logger.warn('Unable to resolve school plan from owner user', error);
      }
    }
  }

  return false;
}

async function syncCustomClaimsForUser(uid, paid, grandfathered = false, organizationId = null, role = null) {
  if (!uid) return;
  try {
    const userRecord = await authAdmin.getUser(uid);
    const currentClaims = userRecord.customClaims || {};
    const normalizedGrandfathered = Boolean(grandfathered);
    const targetOrgId = organizationId || currentClaims.organizationId || currentClaims.orgId || null;
    const targetRole = role || currentClaims.role || (currentClaims.admin ? 'admin' : 'volunteer');

    if (
      currentClaims.paid === paid
      && currentClaims.plan_tier === 'cosmos'
      && currentClaims.grandfathered === normalizedGrandfathered
      && currentClaims.organizationId === targetOrgId
      && currentClaims.role === targetRole
    ) {
      return;
    }
    await authAdmin.setCustomUserClaims(uid, {
      ...currentClaims,
      paid,
      plan_tier: 'cosmos',
      grandfathered: normalizedGrandfathered,
      organizationId: targetOrgId,
      role: targetRole,
    });
  } catch (error) {
    logger.warn(`Unable to sync custom claims for ${uid}`, error);
  }
}

async function decodeAuthHeader(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authHeader.replace(/Bearer\s+/i, '').trim();
  if (!token) return null;

  try {
    return await authAdmin.verifyIdToken(token);
  } catch (error) {
    logger.warn('Invalid authorization token supplied', error);
    return null;
  }
}

function isAdminRole(value) {
  if (!value) return false;
  const allowed = new Set(['admin', 'owner', 'superadmin']);
  if (Array.isArray(value)) {
    return value.some((role) => allowed.has(String(role).toLowerCase()));
  }
  return allowed.has(String(value).toLowerCase());
}

function hasAdminFlag(data = {}) {
  return data.isAdmin === true || data.is_admin === true || data.admin === true;
}

async function isAuthorizedAdmin(decoded = {}) {
  if (!decoded?.uid) return false;

  if (decoded.admin === true || decoded.isAdmin === true || isAdminRole(decoded.role) || isAdminRole(decoded.roles)) {
    return true;
  }

  try {
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    if (userSnap.exists) {
      const userData = userSnap.data() || {};
      if (hasAdminFlag(userData) || isAdminRole(userData.role) || isAdminRole(userData.roles)) {
        return true;
      }
    }
  } catch (error) {
    logger.warn('Unable to verify admin status from users collection', error);
  }

  try {
    const adminGroup = await db
      .collectionGroup('admins')
      .where(FieldPath.documentId(), '==', decoded.uid)
      .limit(1)
      .get();

    if (!adminGroup.empty) {
      const adminData = adminGroup.docs[0].data() || {};
      if (adminData.allowedCheckin === false) {
        return false;
      }
      return true;
    }
  } catch (error) {
    logger.warn('Unable to verify admin status from org admins', error);
  }

  try {
    const orgAdminGroup = await db
      .collectionGroup('orgAdmins')
      .where(FieldPath.documentId(), '==', decoded.uid)
      .limit(1)
      .get();
    if (!orgAdminGroup.empty) {
      return true;
    }
  } catch (error) {
    logger.warn('Unable to verify admin status from orgAdmins', error);
  }

  return false;
}

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += INVITE_CODE_CHARS.charAt(Math.floor(Math.random() * INVITE_CODE_CHARS.length));
  }
  return code;
}

async function createUniqueInviteCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateInviteCode();
    const snap = await db.collection('joinCodes').doc(code).get();
    if (!snap.exists) {
      return code;
    }
  }
  return generateInviteCode();
}

export const createOrganization = onRequest(
  {
    cors: true,
  },
  async (req, res) => {
    if (handleCorsPreflight(req, res, ['POST'])) return;
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const decodedToken = await decodeAuthHeader(req);
    if (!decodedToken?.uid) {
      res.status(401).json({ error: 'Missing or invalid authorization token.' });
      return;
    }

    const { organizationName } = req.body || {};
    const name = String(organizationName || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Organization name is required.' });
      return;
    }

    try {
      const inviteCode = await createUniqueInviteCode();
      const orgRef = db.collection('organizations').doc();
      const now = Timestamp.now();

      await orgRef.set({
        name,
        slug: null,
        inviteCode,
        logoURL: null,
        mission: null,
        location: null,
        linkedNonprofitEin: null,
        adminUserIds: [decodedToken.uid],
        publicEnabled: false,
        causes: [],
        archived: false,
        createdAt: now,
        updatedAt: now,
      });

      await orgRef.collection('orgAdmins').doc(decodedToken.uid).set({
        userId: decodedToken.uid,
        orgId: orgRef.id,
        displayName: decodedToken.name || decodedToken.email || null,
        email: decodedToken.email || null,
        role: 'owner',
        addedBy: decodedToken.uid,
        createdAt: now,
      });

      await db.collection('joinCodes').doc(inviteCode).set({
        orgId: orgRef.id,
        active: true,
      });

      await db.collection('publicOrgPages').doc(orgRef.id).set({
        name,
        slug: null,
        mission: null,
        logoURL: null,
        causes: [],
        publicEnabled: false,
      });

      res.json({
        organizationId: orgRef.id,
        organizationCode: inviteCode,
      });
    } catch (error) {
      logger.error('Organization creation failed', error);
      res.status(500).json({ error: 'Unable to create organization.' });
    }
  },
);

export const joinOrganization = onRequest(
  {
    cors: true,
  },
  async (req, res) => {
    if (handleCorsPreflight(req, res, ['POST'])) return;
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const decodedToken = await decodeAuthHeader(req);
    if (!decodedToken?.uid) {
      res.status(401).json({ error: 'Missing or invalid authorization token.' });
      return;
    }

    const { accessCode } = req.body || {};
    const normalizedCode = String(accessCode || '').trim().toUpperCase();
    if (!normalizedCode || normalizedCode.length !== 6) {
      res.status(400).json({ error: 'Please enter a valid 6-character organization code.' });
      return;
    }

    try {
      const codeSnap = await db.collection('joinCodes').doc(normalizedCode).get();
      if (!codeSnap.exists || codeSnap.data()?.active === false) {
        res.status(404).json({ error: 'Organization not found. Check the code and try again.' });
        return;
      }
      const orgId = codeSnap.data()?.orgId;
      const orgRef = db.collection('organizations').doc(orgId);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) {
        res.status(404).json({ error: 'Organization not found. Check the code and try again.' });
        return;
      }
      const orgData = orgSnap.data() || {};

      const volunteerRef = orgRef.collection('volunteers').doc(decodedToken.uid);
      const existing = await volunteerRef.get();
      if (existing.exists && ['active', 'pending'].includes((existing.data() || {}).status)) {
        res.status(409).json({ error: 'You have already joined or requested to join this organization.' });
        return;
      }

      const userSnap = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userSnap.exists ? (userSnap.data() || {}) : {};
      const displayName = String(
        userData.displayName || decodedToken.name || decodedToken.email || 'Volunteer',
      ).trim();

      await volunteerRef.set({
        userId: decodedToken.uid,
        orgId,
        orgName: orgData.name || '',
        displayName,
        email: userData.email || decodedToken.email || null,
        photoURL: userData.photoURL || null,
        role: 'Volunteer',
        status: 'pending',
        joinedAt: Timestamp.now(),
        approvedBy: null,
        approvedAt: null,
        rejectedReason: null,
        perOrgStats: { hours: 0, events: 0, reliability: 100, lastActiveAt: null },
        groupIds: [],
        archived: false,
      });

      res.json({
        organizationId: orgId,
        organizationCode: normalizedCode,
        organizationName: orgData.name || null,
        pendingApproval: true,
      });
    } catch (error) {
      logger.error('Join organization failed', error);
      res.status(500).json({ error: 'Unable to join organization.' });
    }
  },
);

export const syncUserClaims = onDocumentWritten('users/{userId}', async (event) => {
  const afterSnap = event.data?.after;
  if (!afterSnap?.exists) {
    return;
  }

  const userId = event.params.userId;
  const afterData = afterSnap.data() || {};
  const beforeData = event.data?.before?.data() || {};
  const paid = Boolean(afterData.paid);
  const previousPaid = beforeData ? Boolean(beforeData.paid) : null;

  if (previousPaid === paid) {
    return;
  }

  const grandfathered = Boolean(afterData.grandfathered || afterData.is_grandfathered);
  const organizationId = afterData.organization_id || afterData.organizationId || afterData.orgId || null;
  const role = afterData.role || null;
  await syncCustomClaimsForUser(userId, paid, grandfathered, organizationId, role);
});

const PURGE_COLLECTIONS = [
  'badges',
  'organization_join_requests',
  'organization_settings',
  'organization_shared_logs',
  'organizations',
  'orgs',
  'pendingSubscriptions',
  'stripe_events',
  'stripe_handoff',
  'user_organizations',
  'users',
  'volunteer_funfacts',
  'volunteer_logs',
  'volunteer_organizations',
];

async function deleteEmailDocs(collectionName, emails) {
  const deletedPaths = new Set();
  let total = 0;

  for (const email of emails) {
    while (true) {
      const snap = await db.collection(collectionName).where('email', '==', email).limit(200).get();
      if (snap.empty) break;
      const deletions = [];
      snap.docs.forEach((doc) => {
        const path = doc.ref.path;
        if (deletedPaths.has(path)) return;
        deletedPaths.add(path);
        deletions.push(doc.ref.delete());
      });
      if (deletions.length) {
        await Promise.all(deletions);
        total += deletions.length;
      }
      if (snap.size < 200) break;
    }
  }

  return total;
}

export const purgeEmail = onRequest(async (req, res) => {
  if (handleCorsPreflight(req, res, ['POST'])) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const decodedToken = await decodeAuthHeader(req);
  if (!decodedToken) {
    res.status(401).json({ error: 'Missing or invalid authorization token.' });
    return;
  }

  const isAdmin = await isAuthorizedAdmin(decodedToken);
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const emailInput = String(body.email || '').trim();
  if (!emailInput) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const normalizedEmail = emailInput;
  const lowerEmail = normalizedEmail.toLowerCase();
  const emails = new Set([normalizedEmail]);
  if (lowerEmail && lowerEmail !== normalizedEmail) {
    emails.add(lowerEmail);
  }

  const deleteAuth = Boolean(body.deleteAuth);

  const summary = {};
  let totalDeleted = 0;
  const errors = [];

  for (const collectionName of PURGE_COLLECTIONS) {
    try {
      const deleted = await deleteEmailDocs(collectionName, emails);
      summary[collectionName] = deleted;
      totalDeleted += deleted;
    } catch (error) {
      logger.error('Purge failed for collection', { collectionName, error });
      summary[collectionName] = 0;
      errors.push({ collection: collectionName, message: error?.message || 'Failed to delete.' });
    }
  }

  let authDeleted = false;
  let authUid = null;
  if (deleteAuth) {
    try {
      const userRecord = await authAdmin.getUserByEmail(normalizedEmail);
      authUid = userRecord?.uid || null;
      if (authUid) {
        await authAdmin.deleteUser(authUid);
        authDeleted = true;
      }
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') {
        logger.warn('Unable to delete auth user', error);
        errors.push({ collection: 'auth', message: error?.message || 'Failed to delete auth user.' });
      }
    }
  }

  res.json({
    ok: true,
    email: normalizedEmail,
    deleteAuth,
    totalDeleted,
    perCollection: summary,
    authDeleted,
    authUid,
    errors,
  });
});

export const issueAdminQr = onRequest(
  {
    secrets: [ADMIN_QR_SECRET],
  },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Method not allowed' });
      return;
    }

    try {
      const authHeader = req.get('authorization') || req.get('Authorization') || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!idToken) {
        res.status(401).json({ ok: false, message: 'Missing authorization token.' });
        return;
      }

      let decoded;
      try {
        decoded = await authAdmin.verifyIdToken(idToken);
      } catch (error) {
        res.status(401).json({ ok: false, message: 'Invalid authorization token.' });
        return;
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rawOrg = body.orgAccessCode;
      const rawAdmin = body.adminId;
      const orgAccessCode = String(rawOrg || '').trim().toUpperCase();
      const adminId = String(rawAdmin || '').trim();
      const ttlSeconds = Number.isFinite(body.ttlSeconds) ? Number(body.ttlSeconds) : null;

      if (!orgAccessCode) {
        res.status(400).json({ ok: false, message: 'orgAccessCode is required.' });
        return;
      }
      if (!adminId) {
        res.status(400).json({ ok: false, message: 'adminId is required.' });
        return;
      }

      if (decoded.uid !== adminId) {
        logger.warn('Admin QR issued for mismatched uid', { requester: decoded.uid, adminId });
      }

      const adminUserSnap = await db.collection('users').doc(adminId).get();
      const adminUserData = adminUserSnap.exists ? adminUserSnap.data() || {} : {};

      const { orgDoc, orgData, source: orgSource } = await ensureCanonicalOrganization(
        orgAccessCode,
        adminId,
        adminUserData,
      );

      if (!orgDoc) {
        res.status(404).json({ ok: false, message: 'Organization not found.' });
        return;
      }

      if (orgSource === 'bootstrap') {
        logger.info('Bootstrapped organization for QR issuance', {
          adminId,
          orgAccessCode,
          orgId: orgDoc.id,
        });
      }

      if (orgData.active === false) {
        res.status(403).json({ ok: false, message: 'Organization is inactive.' });
        return;
      }

      const { adminRef, adminData, created: adminCreated } = await ensureOrganizationAdmin(
        orgDoc.ref,
        adminId,
        adminUserData,
        decoded,
      );

      if (adminCreated) {
        logger.info('Bootstrapped organization admin for QR issuance', {
          adminId,
          orgId: orgDoc.id,
          orgAccessCode,
        });
      }

      if (adminData.allowedCheckin === false) {
        res.status(403).json({ ok: false, message: 'Admin check-in access is disabled.', adminValid: false });
        return;
      }

      const secret = safeSecretValue(ADMIN_QR_SECRET, '');
      if (!secret) {
        res.status(500).json({ ok: false, message: 'QR signing secret not configured.' });
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const ttl = ttlSeconds
        ? Math.max(60, Math.min(ttlSeconds, DEFAULT_QR_TTL_SECONDS))
        : DEFAULT_QR_TTL_SECONDS;

      const nonce = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString('hex');

      const payload = {
        v: 1,
        orgAccessCode,
        adminId,
        nonce,
        issuedAt: nowSec,
        exp: nowSec + ttl,
      };

      const canonical = canonicalJson(payload);
      const sig = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

      await ensureUserOrganizationLink(orgAccessCode, orgDoc.id, adminId, adminUserData, orgData);

      const tokenFields = {
        qrToken: sig,
        qrTokenVersion: payload.v,
        qrTokenNonce: payload.nonce,
        qrTokenIssuedAt: Timestamp.fromMillis(payload.issuedAt * 1000),
        qrTokenExpiresAt: Timestamp.fromMillis(payload.exp * 1000),
        qrTokenIssuedBy: decoded.uid || null,
        qrTokenIssuedByEmail: decoded.email || adminData.email || null,
        qrTokenExpSeconds: payload.exp,
        qrTokenIssuedAtSeconds: payload.issuedAt,
      };

      const orgMirrorRef = db.collection('orgs').doc(orgDoc.id);
      const adminMirrorRef = orgMirrorRef.collection('admins').doc(adminId);

      try {
        await Promise.all([
          adminRef.set(tokenFields, { merge: true }),
          orgMirrorRef.set(
            {
              access_code: orgAccessCode,
              name: orgData.name || adminUserData.organizationName || null,
              active: orgData.active !== false,
              lastQrSync: Timestamp.now(),
            },
            { merge: true },
          ),
          adminMirrorRef.set(
            {
              ...tokenFields,
              uid: adminId,
              email: adminData.email || adminUserData.email || decoded.email || null,
              allowedCheckin: adminData.allowedCheckin !== false,
            },
            { merge: true },
          ),
        ]);
      } catch (syncError) {
        logger.warn('Failed to mirror QR token to orgs collection', {
          orgId: orgDoc.id,
          adminId,
          error: syncError?.message || syncError,
        });
      }

      res.json({
        ok: true,
        payload,
        sig,
        orgDocId: orgDoc.id,
        orgName: orgData.name || null,
        linkedOrgId: orgDoc.id,
        adminValid: true,
      });
    } catch (error) {
      logger.error('issueAdminQr failed', error);
      res.status(500).json({ ok: false, message: 'Unable to issue QR badge.' });
    }
  }
);

export const verifyAdminQr = onCall({ secrets: [ADMIN_QR_SECRET] }, async (request) => {
  const data = request.data || {};
  const payload = data.payload || null;
  const sig = data.sig || data.signature || null;
  const payloadHash = data.payloadHash || null;

  if (!payload || typeof payload !== 'object' || !sig) {
    return { ok: false, message: 'Invalid QR payload provided.', adminValid: false };
  }

  const secret = safeSecretValue(ADMIN_QR_SECRET, '');
  if (!secret) {
    return { ok: false, message: 'QR verification not configured.', adminValid: false };
  }

  const canonicalPayload = {
    v: payload.v,
    orgAccessCode: payload.orgAccessCode,
    adminId: payload.adminId,
    nonce: payload.nonce,
    issuedAt: payload.issuedAt,
    exp: payload.exp,
  };

  const canonical = canonicalJson(canonicalPayload);
  const expectedSig = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  if (!timingSafeHexEquals(expectedSig, sig)) {
    return { ok: false, message: 'Signature mismatch.', adminValid: false };
  }

  if (payloadHash) {
    const computedHash = crypto.createHash('sha256').update(canonical).digest('hex');
    if (!timingSafeHexEquals(computedHash, payloadHash)) {
      return { ok: false, message: 'Payload hash mismatch.', adminValid: false };
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const version = Number(canonicalPayload.v);
  if (version !== 1) {
    return { ok: false, message: 'Unsupported QR version.', adminValid: false };
  }
  const exp = Number(canonicalPayload.exp);
  const issuedAt = Number(canonicalPayload.issuedAt);
  if (!Number.isFinite(exp) || exp <= nowSec - 5) {
    return { ok: false, message: 'QR code expired.', adminValid: true };
  }
  if (!Number.isFinite(issuedAt) || issuedAt > nowSec + 120) {
    return { ok: false, message: 'QR issue time is invalid.', adminValid: true };
  }

  const orgAccessCode = String(canonicalPayload.orgAccessCode || '').trim().toUpperCase();
  const adminId = String(canonicalPayload.adminId || '').trim();
  const nonce = String(canonicalPayload.nonce || '').trim();

  if (!orgAccessCode || !adminId || !nonce || nonce.length < 8) {
    return { ok: false, message: 'QR payload missing required fields.', adminValid: false };
  }

  const orgSnapshot = await db
    .collection('organizations')
    .where('access_code', '==', orgAccessCode)
    .limit(1)
    .get();

  if (orgSnapshot.empty) {
    return { ok: false, message: 'Organization not found.', adminValid: false };
  }

  const orgDoc = orgSnapshot.docs[0];
  const orgData = orgDoc.data() || {};

  if (orgData.active === false) {
    return { ok: false, message: 'Organization is inactive.', adminValid: false };
  }

  const adminSnap = await orgDoc.ref.collection('admins').doc(adminId).get();
  if (!adminSnap.exists) {
    return { ok: false, message: 'Admin not authorized for QR check-in.', adminValid: false };
  }
  const adminData = adminSnap.data() || {};
  if (adminData.allowedCheckin === false) {
    return { ok: false, message: 'Admin check-in access is disabled.', adminValid: false };
  }

  return {
    ok: true,
    orgDocId: orgDoc.id,
    orgName: orgData.name || null,
    linkedOrgId: orgDoc.id,
    adminValid: true,
  };
});
