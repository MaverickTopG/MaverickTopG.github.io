import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import crypto from 'crypto';
import Stripe from 'stripe';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const PUBLIC_BASE_URL = defineSecret('PUBLIC_BASE_URL');
const STRIPE_PRICE_MONTHLY = defineSecret('STRIPE_PRICE_MONTHLY');
const STRIPE_PRICE_YEARLY = defineSecret('STRIPE_PRICE_YEARLY');
const STRIPE_PRICE_SCHOOL = defineSecret('STRIPE_PRICE_SCHOOL');
const ADMIN_QR_SECRET = defineSecret('ADMIN_QR_SECRET');

const DEFAULT_PRICE_MONTHLY = 'price_1SFQAcH9sPZuClpwOuGwGOR6';
const DEFAULT_PRICE_YEARLY = 'price_1SFQB7H9sPZuClpwapwNiIuD';
const DEFAULT_PRICE_SCHOOL = 'price_1SXZMfH9sPZuClpwNAJK5Uj2';
const DEFAULT_PRODUCT_MONTHLY = 'prod_TBnmDFIOr3zqnj';
const DEFAULT_PRODUCT_YEARLY = 'prod_TBnmbia7RuTkkK';
const DEFAULT_PRODUCT_SCHOOL = 'prod_TUYT6k3Xq3JUOJ';
const DEFAULT_ORBIT_PRICE_ORG_MONTHLY = 'price_1T0r32H9sPZuClpwTCH9zACb';
const DEFAULT_ORBIT_PRICE_ORG_YEARLY = 'price_1T0r32H9sPZuClpw5S5tHVLf';
const DEFAULT_ORBIT_PRICE_SCHOOL_MONTHLY = 'price_1T0r32H9sPZuClpwyIXrwxgo';
const DEFAULT_ORBIT_PRICE_SCHOOL_YEARLY = 'price_1T0r32H9sPZuClpwp0wrydOg';
const DEFAULT_NEBULA_PRICE_ORG_MONTHLY = 'price_1T0r31H9sPZuClpwgnehfez9';
const DEFAULT_NEBULA_PRICE_ORG_YEARLY = 'price_1T0r31H9sPZuClpwfGyHaVcq';
const DEFAULT_NEBULA_PRICE_SCHOOL_MONTHLY = 'price_1T0r31H9sPZuClpwNIUeJa7l';
const DEFAULT_NEBULA_PRICE_SCHOOL_YEARLY = 'price_1T0r31H9sPZuClpw2ZnG20bj';
const DEFAULT_COSMOS_PRICE_ORG_MONTHLY = 'price_1T0r2wH9sPZuClpwNW8Gkjey';
const DEFAULT_COSMOS_PRICE_ORG_YEARLY = 'price_1T0r2wH9sPZuClpwLujOCPZK';
const DEFAULT_COSMOS_PRICE_SCHOOL_MONTHLY = 'price_1T0r2wH9sPZuClpwNW8Gkjey';
const DEFAULT_COSMOS_PRICE_SCHOOL_YEARLY = 'price_1T0r2wH9sPZuClpwE0KCMSrA';
const DEFAULT_ORBIT_PRODUCT_ID = 'prod_TyogJG8NIqQ3j8';
const DEFAULT_NEBULA_PRODUCT_ID = 'prod_TyogtonGwwzA0f';
const DEFAULT_COSMOS_PRODUCT_ID = 'prod_Tyoga1QHoEUYSI';
const DEFAULT_STRIPE_SECRET_KEY = '';
const DEFAULT_QR_TTL_SECONDS = 3153600000; // 100 years
const DEMO_ACCOUNT_EMAILS = new Set(['x@gmail.com']);
const AUTO_APPROVE_MAX_HOURS = 12;
const AUTO_APPROVE_HISTORY_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;
const DEFAULT_PLAN_TIER = 'orbit';
const SUPER_ADMIN_REAUTH_MAX_AGE_SECONDS = 5 * 60;
const PLAN_TIERS = new Set(['orbit', 'nebula', 'cosmos']);
const SUBADMIN_PASSWORD_INDEX_COLLECTION = 'sub_admin_password_index';
const PLAN_LIMITS = {
  orbit: {
    aiPromptsPerDay: 0,
    messaging: false,
    kiosk: false,
    events: false,
    autoLogReview: false,
    volunteerLimit: 50,
  },
  nebula: {
    aiPromptsPerDay: 50,
    messaging: true,
    kiosk: true,
    events: true,
    autoLogReview: true,
    volunteerLimit: 500,
  },
  cosmos: {
    aiPromptsPerDay: null,
    messaging: true,
    kiosk: true,
    events: true,
    autoLogReview: true,
    volunteerLimit: null,
  },
};

initializeApp();
const db = getFirestore();
const authAdmin = getAuth();

function isDemoEmail(value) {
  return DEMO_ACCOUNT_EMAILS.has(String(value || '').trim().toLowerCase());
}

function safeSecretValue(secret, fallback) {
  try {
    const value = secret.value();
    return value || fallback;
  } catch (error) {
    return fallback;
  }
}

function resolvePublicBase(req, fallback = 'https://nexolink-b8eb5.web.app') {
  const secretBase = safeSecretValue(PUBLIC_BASE_URL, '');
  const originHeader = (req?.headers?.origin || '').toString().split(',')[0].trim();
  const refererHeader = (req?.headers?.referer || '').toString().split(',')[0].trim();
  let refererOrigin = '';
  try {
    if (refererHeader) {
      refererOrigin = new URL(refererHeader).origin;
    }
  } catch {
    refererOrigin = '';
  }
  const base = secretBase || originHeader || refererOrigin || fallback;
  return base.replace(/\/?$/, '');
}

function getStripeClient() {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIREBASE_EMULATOR_HUB);
  const testKey = process.env.STRIPE_SECRET_KEY_TEST;
  const key = (isEmulator && testKey)
    ? testKey
    : (process.env.STRIPE_SECRET_KEY || safeSecretValue(STRIPE_SECRET_KEY, DEFAULT_STRIPE_SECRET_KEY));
  if (!key) {
    throw new Error('Stripe secret key is not configured.');
  }
  return new Stripe(key);
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

function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || safeSecretValue(STRIPE_WEBHOOK_SECRET, '');
}

const LEGACY_ACCESS_LOCK_TIMESTAMP = Date.UTC(2024, 10, 4, 0, 0, 0); // Nov 4, 2024 UTC

function shouldHonorLegacyPaidFlag(legacyPaid) {
  if (!legacyPaid) return false;
  return Date.now() < LEGACY_ACCESS_LOCK_TIMESTAMP;
}

function normalizeSubscription(subscription) {
  if (!subscription) {
    return { status: 'inactive' };
  }

  const normalized = { ...subscription };
  const timestampFields = [
    'currentPeriodEnd',
    'current_period_end',
    'trialEnd',
    'trial_end',
    'cancelAt',
    'cancel_at'
  ];

  timestampFields.forEach((field) => {
    if (!normalized[field]) return;
    const value = normalized[field];
    if (typeof value?.toDate === 'function') {
      normalized[field] = value.toDate();
    } else if (typeof value === 'number') {
      normalized[field] = new Date(value * (value < 1e12 ? 1000 : 1));
    }
  });

  if (normalized.current_period_end && !normalized.currentPeriodEnd) {
    normalized.currentPeriodEnd = normalized.current_period_end;
  }
  if (normalized.trial_end && !normalized.trialEnd) {
    normalized.trialEnd = normalized.trial_end;
  }
  if (normalized.cancel_at && !normalized.cancelAt) {
    normalized.cancelAt = normalized.cancel_at;
  }

  normalized.cancelAtPeriodEnd = Boolean(
    normalized.cancelAtPeriodEnd
    || normalized.cancel_at_period_end
    || subscription.cancelAtPeriodEnd
    || subscription.cancel_at_period_end
  );

  normalized.status = (normalized.status || 'inactive').toLowerCase();
  return normalized;
}

function isSubscriptionActive(subscription, legacyPaid = false) {
  if (shouldHonorLegacyPaidFlag(legacyPaid)) return true;
  if (!subscription) return false;
  const status = (subscription.status || '').toLowerCase();
  const cancelAt = subscription.cancelAt instanceof Date
    ? subscription.cancelAt
    : subscription.cancel_at instanceof Date
      ? subscription.cancel_at
      : null;

  if (status === 'canceled') {
    return false;
  }

  if (status === 'trialing' && cancelAt && cancelAt.getTime() <= Date.now()) {
    return false;
  }

  const activeStatuses = ['active', 'trialing'];
  const isActiveStatus = activeStatuses.includes(status);
  const paidHint = Boolean(
    subscription.paid === true
    || subscription.latest_invoice?.paid === true
    || (subscription.latest_invoice?.status || '').toLowerCase() === 'paid'
    || status === 'paid'
    || status === 'succeeded'
  );
  const hasPlanRef = Boolean(
    subscription.plan
    || subscription.planId
    || subscription.plan_id
    || subscription.planKey
    || subscription.plan_key
    || (Array.isArray(subscription.items) && subscription.items.length)
    || (Array.isArray(subscription.items?.data) && subscription.items.data.length)
  );
  try {
    const periodEnd = subscription.currentPeriodEnd
      || subscription.current_period_end
      || subscription.trialEnd
      || subscription.trial_end
      || null;

    if (!periodEnd) {
      return isActiveStatus || (paidHint && hasPlanRef);
    }

    const normalizedEnd = periodEnd instanceof Date
      ? periodEnd
      : new Date(periodEnd);

    if (Number.isNaN(normalizedEnd.getTime())) {
      return isActiveStatus || (paidHint && hasPlanRef);
    }
    const hasTimeRemaining = normalizedEnd.getTime() > Date.now();
    if (isActiveStatus) return hasTimeRemaining;
    if (hasPlanRef && hasTimeRemaining) return true;
    return paidHint && hasPlanRef && hasTimeRemaining;
  } catch (error) {
    return isActiveStatus || (paidHint && hasPlanRef);
  }
}

function normalizePlanTier(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PLAN_TIERS.has(normalized) ? normalized : DEFAULT_PLAN_TIER;
}

function resolvePlanTierFromSubscriptionPayload(payload = {}) {
  const priceId = payload.plan
    || payload.planId
    || payload.plan_id
    || payload.items?.[0]?.price?.id
    || payload.items?.data?.[0]?.price?.id
    || null;
  if (priceId) {
    const priceTier = resolvePlanTierFromPriceId(priceId);
    if (priceTier) return priceTier;
  }

  const key = String(
    payload.planKey
    || payload.plan_key
    || payload.planNickname
    || ''
  ).toLowerCase();
  if (key.includes('orbit') || key.includes('basic')) return 'orbit';
  if (key.includes('cosmos') || key.includes('enterprise')) return 'cosmos';
  if (key.includes('nebula') || key.includes('pro')) return 'nebula';
  return DEFAULT_PLAN_TIER;
}

function resolvePlanTierFromPriceId(priceId) {
  if (!priceId) return null;
  const map = {
    orbit: [
      process.env.ORBIT_PRICE_ORG_MONTHLY,
      process.env.ORBIT_PRICE_ORG_YEARLY,
      process.env.ORBIT_PRICE_SCHOOL_MONTHLY,
      process.env.ORBIT_PRICE_SCHOOL_YEARLY,
    ],
    nebula: [
      process.env.NEBULA_PRICE_ORG_MONTHLY,
      process.env.NEBULA_PRICE_ORG_YEARLY,
      process.env.NEBULA_PRICE_SCHOOL_MONTHLY,
      process.env.NEBULA_PRICE_SCHOOL_YEARLY,
    ],
    cosmos: [
      process.env.COSMOS_PRICE_ORG_MONTHLY,
      process.env.COSMOS_PRICE_ORG_YEARLY,
      process.env.COSMOS_PRICE_SCHOOL_MONTHLY,
      process.env.COSMOS_PRICE_SCHOOL_YEARLY,
    ],
  };
  if (map.orbit.includes(priceId)) return 'orbit';
  if (map.nebula.includes(priceId)) return 'nebula';
  if (map.cosmos.includes(priceId)) return 'cosmos';
  return null;
}

function getPlanLimits(planTier) {
  const tier = normalizePlanTier(planTier);
  return PLAN_LIMITS[tier] || PLAN_LIMITS[DEFAULT_PLAN_TIER];
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

async function collectOrgUserIdsByField(field, value) {
  const snap = await db.collection('users').where(field, '==', value).get();
  const ids = new Set();
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const archived = Boolean(data.archived === true || data.status === 'archived');
    if (!archived) {
      ids.add(docSnap.id);
    }
  });
  return ids;
}

async function collectOrgUserIdsFromUserOrganizations(field, value) {
  const snap = await db.collection('user_organizations').where(field, '==', value).get();
  const ids = new Set();
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const uid = data.user_id || data.userId || data.uid || docSnap.id;
    const archived = Boolean(data.archived === true || data.status === 'archived');
    if (uid && !archived) {
      ids.add(String(uid));
    }
  });
  return ids;
}

async function countOrganizationMembers({ orgId, orgCode }) {
  const ids = new Set();
  if (orgId) {
    const orgFields = ['organizationId', 'organization_id', 'orgId', 'org_id', 'linked_org_id', 'linkedOrgId'];
    const orgQueries = await Promise.all(orgFields.map((field) => collectOrgUserIdsByField(field, orgId)));
    orgQueries.forEach((set) => set.forEach((id) => ids.add(id)));

    const orgUserQueries = await Promise.all(orgFields.map((field) => collectOrgUserIdsFromUserOrganizations(field, orgId)));
    orgUserQueries.forEach((set) => set.forEach((id) => ids.add(id)));
  }

  if (orgCode) {
    const codeFields = ['organizationCode', 'organization_code', 'accessCode', 'access_code', 'orgCode', 'org_code'];
    const codeQueries = await Promise.all(codeFields.map((field) => collectOrgUserIdsByField(field, orgCode)));
    codeQueries.forEach((set) => set.forEach((id) => ids.add(id)));

    const codeUserQueries = await Promise.all(codeFields.map((field) => collectOrgUserIdsFromUserOrganizations(field, orgCode)));
    codeUserQueries.forEach((set) => set.forEach((id) => ids.add(id)));
  }

  return ids.size;
}

async function resolveOrgPlanTier({ orgId, orgCode, userId } = {}) {
  if (orgId) {
    const snap = await resolveOrgDocById(orgId);
    if (snap?.exists) {
      const data = snap.data() || {};
      return normalizePlanTier(data.plan_tier || data.planTier || data.plan || data.planKey || data.plan_key);
    }
  }

  if (orgCode) {
    const snap = await resolveOrgDocByCode(orgCode);
    if (snap?.exists) {
      const data = snap.data() || {};
      return normalizePlanTier(data.plan_tier || data.planTier || data.plan || data.planKey || data.plan_key);
    }
  }

  if (userId) {
    try {
      const userSnap = await db.collection('users').doc(userId).get();
      if (userSnap.exists) {
        const data = userSnap.data() || {};
        return normalizePlanTier(data.plan_tier || data.planTier || data.plan || data.planKey || data.plan_key);
      }
    } catch (error) {
      logger.warn('Unable to resolve plan tier from user', error);
    }
  }

  return DEFAULT_PLAN_TIER;
}

function resolveEffectivePlanTierFromOrgData(data = {}) {
  const pendingTier = normalizePlanTier(data.pending_plan_tier || data.pendingPlanTier || data.pending_plan || data.pendingPlan);
  const pendingAtRaw = data.pending_plan_effective_at || data.pendingPlanEffectiveAt || null;
  const pendingAt = resolveTimestampMillis(pendingAtRaw);
  if (pendingTier && pendingAt && pendingAt <= Date.now()) {
    return pendingTier;
  }
  const current = normalizePlanTier(data.plan_tier || data.planTier || data.plan || data.planKey || data.plan_key);
  return current;
}

async function resolveEffectivePlanTier({ orgId, orgCode, userId } = {}) {
  if (orgId) {
    const snap = await resolveOrgDocById(orgId);
    if (snap?.exists) {
      return resolveEffectivePlanTierFromOrgData(snap.data() || {});
    }
  }
  if (orgCode) {
    const snap = await resolveOrgDocByCode(orgCode);
    if (snap?.exists) {
      return resolveEffectivePlanTierFromOrgData(snap.data() || {});
    }
  }
  if (userId) {
    const userSnap = await db.collection('users').doc(userId).get();
    if (userSnap.exists) {
      return resolveEffectivePlanTierFromOrgData(userSnap.data() || {});
    }
  }
  return DEFAULT_PLAN_TIER;
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

export const getSubscriptionStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = request.auth.uid;
  const userDoc = await findUserDocByUid(uid);

  if (!userDoc || !userDoc.exists()) {
    return { status: 'inactive', subscription: null };
  }

  const userData = userDoc.data() || {};
  const subscription = normalizeSubscription(userData.subscription);
  const isActive = isSubscriptionActive(subscription, userData.paid === true);

  return {
    status: isActive ? 'active' : subscription.status,
    subscription,
  };
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

export const requestPlanChange = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const targetTier = normalizePlanTier(request.data?.targetTier);
  if (!targetTier) {
    throw new HttpsError('invalid-argument', 'Target plan is required.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'User record not found.');
  }
  const userData = userSnap.data() || {};
  const subscription = userData.subscription || {};
  const periodEndRaw = subscription.currentPeriodEnd || subscription.current_period_end || subscription.trialEnd || subscription.trial_end || null;
  const periodEndMs = resolveTimestampMillis(periodEndRaw) || Date.now();

  const orgContext = await resolveOrgContextForUser(uid);
  const orgId = orgContext.orgId || null;
  const orgCode = orgContext.orgCode || null;

  const pendingPayload = {
    pending_plan_tier: targetTier,
    pending_plan_effective_at: periodEndMs,
    pending_plan_requested_at: Timestamp.now(),
    pending_plan_requested_by: uid,
  };

  await userSnap.ref.set(pendingPayload, { merge: true });

  if (orgId) {
    const orgCollections = ['organizations', 'orgs', 'volunteer_organizations'];
    await Promise.all(orgCollections.map((coll) =>
      db.collection(coll).doc(orgId).set(pendingPayload, { merge: true }).catch(() => {})
    ));
  }

  return {
    pendingPlanTier: targetTier,
    effectiveAt: periodEndMs,
    orgId,
    orgCode,
  };
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

async function assertPriceExists(stripe, priceId) {
  try {
    return await stripe.prices.retrieve(priceId);
  } catch (error) {
    const missing = error?.code === 'resource_missing' || error?.statusCode === 404;
    const reason = missing ? 'Price not found in this Stripe account or mode.' : 'Unable to retrieve price.';
    error.userMessage = reason;
    throw error;
  }
}

async function getDefaultPriceForProduct(stripe, productId) {
  if (!productId) return null;
  try {
    const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
    if (product?.default_price) {
      return typeof product.default_price === 'string' ? product.default_price : product.default_price.id;
    }
  } catch (error) {
    // fall through to listing prices
  }

  const { data } = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 1,
  });
  return data[0]?.id || null;
}

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

function getPriceMap() {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIREBASE_EMULATOR_HUB);
  const tierPrices = {
    orbit_org_monthly: process.env.ORBIT_PRICE_ORG_MONTHLY || DEFAULT_ORBIT_PRICE_ORG_MONTHLY,
    orbit_org_yearly: process.env.ORBIT_PRICE_ORG_YEARLY || DEFAULT_ORBIT_PRICE_ORG_YEARLY,
    orbit_school_monthly: process.env.ORBIT_PRICE_SCHOOL_MONTHLY || DEFAULT_ORBIT_PRICE_SCHOOL_MONTHLY,
    orbit_school_yearly: process.env.ORBIT_PRICE_SCHOOL_YEARLY || DEFAULT_ORBIT_PRICE_SCHOOL_YEARLY,
    nebula_org_monthly: process.env.NEBULA_PRICE_ORG_MONTHLY || DEFAULT_NEBULA_PRICE_ORG_MONTHLY,
    nebula_org_yearly: process.env.NEBULA_PRICE_ORG_YEARLY || DEFAULT_NEBULA_PRICE_ORG_YEARLY,
    nebula_school_monthly: process.env.NEBULA_PRICE_SCHOOL_MONTHLY || DEFAULT_NEBULA_PRICE_SCHOOL_MONTHLY,
    nebula_school_yearly: process.env.NEBULA_PRICE_SCHOOL_YEARLY || DEFAULT_NEBULA_PRICE_SCHOOL_YEARLY,
    cosmos_org_monthly: process.env.COSMOS_PRICE_ORG_MONTHLY || DEFAULT_COSMOS_PRICE_ORG_MONTHLY,
    cosmos_org_yearly: process.env.COSMOS_PRICE_ORG_YEARLY || DEFAULT_COSMOS_PRICE_ORG_YEARLY,
    cosmos_school_monthly: process.env.COSMOS_PRICE_SCHOOL_MONTHLY || DEFAULT_COSMOS_PRICE_SCHOOL_MONTHLY,
    cosmos_school_yearly: process.env.COSMOS_PRICE_SCHOOL_YEARLY || DEFAULT_COSMOS_PRICE_SCHOOL_YEARLY,
  };
  const tierDefaults = Object.values(tierPrices).filter(Boolean).reduce((acc, value, index) => {
    const key = Object.keys(tierPrices)[index];
    acc[key] = value;
    return acc;
  }, {});
  if (isEmulator) {
    const testMonthly = process.env.STRIPE_PRICE_MONTHLY_TEST || process.env.PUBLIC_STRIPE_PRICE_MONTHLY;
    const testYearly = process.env.STRIPE_PRICE_YEARLY_TEST || process.env.PUBLIC_STRIPE_PRICE_YEARLY;
    const testSchoolMonthly = process.env.STRIPE_PRICE_SCHOOL_TEST || process.env.PUBLIC_STRIPE_PRICE_SCHOOL;
    const testSchoolYearly = process.env.STRIPE_PRICE_SCHOOL_YEARLY_TEST || process.env.PUBLIC_STRIPE_PRICE_SCHOOL_YEARLY;
    return {
      ...tierDefaults,
      monthly: testMonthly || safeSecretValue(STRIPE_PRICE_MONTHLY, DEFAULT_PRICE_MONTHLY),
      yearly: testYearly || safeSecretValue(STRIPE_PRICE_YEARLY, DEFAULT_PRICE_YEARLY),
      school: testSchoolMonthly || safeSecretValue(STRIPE_PRICE_SCHOOL, DEFAULT_PRICE_SCHOOL),
      school_yearly: testSchoolYearly || testSchoolMonthly || safeSecretValue(STRIPE_PRICE_SCHOOL, DEFAULT_PRICE_SCHOOL),
    };
  }
  const envMonthly = process.env.STRIPE_PRICE_MONTHLY;
  const envYearly = process.env.STRIPE_PRICE_YEARLY;
  const envSchool = process.env.STRIPE_PRICE_SCHOOL;
  return {
    ...tierDefaults,
    monthly: envMonthly || safeSecretValue(STRIPE_PRICE_MONTHLY, DEFAULT_PRICE_MONTHLY),
    yearly: envYearly || safeSecretValue(STRIPE_PRICE_YEARLY, DEFAULT_PRICE_YEARLY),
    school: envSchool || safeSecretValue(STRIPE_PRICE_SCHOOL, DEFAULT_PRICE_SCHOOL),
  };
}

function getProductMap() {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIREBASE_EMULATOR_HUB);
  const tierProducts = {
    orbit: process.env.ORBIT_PRODUCT_ID || DEFAULT_ORBIT_PRODUCT_ID,
    nebula: process.env.NEBULA_PRODUCT_ID || DEFAULT_NEBULA_PRODUCT_ID,
    cosmos: process.env.COSMOS_PRODUCT_ID || DEFAULT_COSMOS_PRODUCT_ID,
  };
  if (isEmulator) {
    return {
      ...tierProducts,
      monthly: process.env.STRIPE_PRODUCT_MONTHLY_TEST || process.env.PUBLIC_STRIPE_PRODUCT_MONTHLY || DEFAULT_PRODUCT_MONTHLY,
      yearly: process.env.STRIPE_PRODUCT_YEARLY_TEST || process.env.PUBLIC_STRIPE_PRODUCT_YEARLY || DEFAULT_PRODUCT_YEARLY,
      school: process.env.STRIPE_PRODUCT_SCHOOL_TEST || process.env.PUBLIC_STRIPE_PRODUCT_SCHOOL || DEFAULT_PRODUCT_SCHOOL,
    };
  }
  return {
    ...tierProducts,
    monthly: process.env.STRIPE_PRODUCT_MONTHLY || DEFAULT_PRODUCT_MONTHLY,
    yearly: process.env.STRIPE_PRODUCT_YEARLY || DEFAULT_PRODUCT_YEARLY,
    school: process.env.STRIPE_PRODUCT_SCHOOL || DEFAULT_PRODUCT_SCHOOL,
  };
}

function resolvePriceId(input) {
  if (!input) return null;
  const priceMap = getPriceMap();
  if (priceMap[input]) return priceMap[input];
  if (Object.values(priceMap).includes(input)) return input;
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'orbit') return priceMap.orbit_org_monthly || null;
    if (normalized === 'nebula') return priceMap.nebula_org_monthly || null;
    if (normalized === 'cosmos') return priceMap.cosmos_org_monthly || null;
  }
  if (typeof input === 'string' && /^price_[a-zA-Z0-9]+$/.test(input)) {
    return input;
  }
  return null;
}

function resolvePlanTierFromSubscription(subscription) {
  if (!subscription) return null;
  const key = subscription?.metadata?.plan_key
    || subscription?.metadata?.planKey
    || subscription?.plan?.metadata?.plan_key
    || subscription?.plan?.metadata?.planKey;
  if (typeof key === 'string') {
    const normalized = key.toLowerCase();
    if (['orbit', 'nebula', 'cosmos'].includes(normalized)) return normalized;
  }
  const priceId = subscription?.items?.data?.[0]?.price?.id
    || subscription?.plan?.id
    || subscription?.plan
    || null;
  if (!priceId) return null;
  const orbitIds = [
    process.env.ORBIT_PRICE_ORG_MONTHLY || DEFAULT_ORBIT_PRICE_ORG_MONTHLY,
    process.env.ORBIT_PRICE_ORG_YEARLY || DEFAULT_ORBIT_PRICE_ORG_YEARLY,
    process.env.ORBIT_PRICE_SCHOOL_MONTHLY || DEFAULT_ORBIT_PRICE_SCHOOL_MONTHLY,
    process.env.ORBIT_PRICE_SCHOOL_YEARLY || DEFAULT_ORBIT_PRICE_SCHOOL_YEARLY,
  ];
  const nebulaIds = [
    process.env.NEBULA_PRICE_ORG_MONTHLY || DEFAULT_NEBULA_PRICE_ORG_MONTHLY,
    process.env.NEBULA_PRICE_ORG_YEARLY || DEFAULT_NEBULA_PRICE_ORG_YEARLY,
    process.env.NEBULA_PRICE_SCHOOL_MONTHLY || DEFAULT_NEBULA_PRICE_SCHOOL_MONTHLY,
    process.env.NEBULA_PRICE_SCHOOL_YEARLY || DEFAULT_NEBULA_PRICE_SCHOOL_YEARLY,
  ];
  const cosmosIds = [
    process.env.COSMOS_PRICE_ORG_MONTHLY || DEFAULT_COSMOS_PRICE_ORG_MONTHLY,
    process.env.COSMOS_PRICE_ORG_YEARLY || DEFAULT_COSMOS_PRICE_ORG_YEARLY,
    process.env.COSMOS_PRICE_SCHOOL_MONTHLY || DEFAULT_COSMOS_PRICE_SCHOOL_MONTHLY,
    process.env.COSMOS_PRICE_SCHOOL_YEARLY || DEFAULT_COSMOS_PRICE_SCHOOL_YEARLY,
  ];
  if (orbitIds.includes(priceId)) return 'orbit';
  if (nebulaIds.includes(priceId)) return 'nebula';
  if (cosmosIds.includes(priceId)) return 'cosmos';
  return null;
}

function computePaidStatus(status) {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === 'active' || normalized === 'trialing';
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

function normalizeSubscriptionItems(rawItems = []) {
  return rawItems
    .filter(Boolean)
    .map((item) => ({
      id: item.id || null,
      priceId: item.price?.id || null,
      productId: item.price?.product || null,
      name: item.price?.product?.name || item.description || 'Subscription Item',
      amount: typeof item.price?.unit_amount === 'number' ? item.price.unit_amount : null,
      currency: item.price?.currency || null,
      interval: item.price?.recurring?.interval || null,
      quantity: typeof item.quantity === 'number' ? item.quantity : null,
    }));
}

function normalizeInvoiceLines(lines = []) {
  return lines
    .filter(Boolean)
    .map((line) => ({
      id: line.id || null,
      priceId: line.price?.id || null,
      productId: line.price?.product || null,
      name: line.price?.product?.name || line.description || 'Subscription Item',
      amount: typeof line.amount === 'number'
        ? line.amount
        : typeof line.price?.unit_amount === 'number'
          ? line.price.unit_amount
          : null,
      currency: line.currency || line.price?.currency || null,
      interval: line.price?.recurring?.interval || null,
      quantity: typeof line.quantity === 'number' ? line.quantity : null,
    }));
}

function appendHistory(list = [], entry, options = {}) {
  if (!entry) {
    return Array.isArray(list) ? [...list] : [];
  }

  const {
    limit = 20,
    dedupeKey = 'id',
    sortKey = null,
  } = options;

  const safeList = Array.isArray(list) ? [...list] : [];

  if (dedupeKey && entry[dedupeKey]) {
    const existingIndex = safeList.findIndex((item) => item && item[dedupeKey] === entry[dedupeKey]);
    if (existingIndex !== -1) {
      safeList.splice(existingIndex, 1);
    }
  }

  safeList.push(entry);

  const sortKeys = Array.isArray(sortKey)
    ? sortKey.filter(Boolean)
    : sortKey
      ? [sortKey]
      : [];

  if (sortKeys.length) {
    const resolveSortValue = (item) => {
      if (!item || typeof item !== 'object') return -Infinity;
      for (const key of sortKeys) {
        if (!key) continue;
        const value = item[key];
        if (value === undefined || value === null) continue;
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
        if (value instanceof Date) {
          return value.getTime();
        }
        if (typeof value === 'string') {
          const numeric = Number(value);
          if (!Number.isNaN(numeric)) {
            return numeric;
          }
          const parsed = Date.parse(value);
          if (!Number.isNaN(parsed)) {
            return parsed;
          }
        }
      }
      return -Infinity;
    };

    safeList.sort((a, b) => resolveSortValue(a) - resolveSortValue(b));
  }

  if (safeList.length > limit) {
    return safeList.slice(Math.max(0, safeList.length - limit));
  }

  return safeList;
}

function buildInvoicePayload(invoice, statusOverride = null) {
  if (!invoice || typeof invoice !== 'object') {
    return null;
  }

  const lines = normalizeInvoiceLines(
    invoice.lines?.data
    || invoice.lineItems
    || []
  );

  return {
    id: invoice.id || null,
    status: statusOverride || invoice.status || null,
    amountDue: typeof invoice.amount_due === 'number' ? invoice.amount_due : null,
    amountPaid: typeof invoice.amount_paid === 'number' ? invoice.amount_paid : null,
    currency: invoice.currency || null,
    hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    invoicePdf: invoice.invoice_pdf || null,
    created: invoice.created ? invoice.created * 1000 : Date.now(),
    periodStart: invoice.period_start ? invoice.period_start * 1000 : null,
    periodEnd: invoice.period_end ? invoice.period_end * 1000 : null,
    recordedAtMs: Date.now(),
    kind: 'invoice',
    lines,
  };
}

async function findUserDocByEmail(normalizedEmail, originalEmail = null) {
  const normalized = (normalizedEmail || originalEmail || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const byNormalized = await db
    .collection('users')
    .where('emailNormalized', '==', normalized)
    .limit(1)
    .get();

  if (!byNormalized.empty) {
    return byNormalized.docs[0];
  }

  const byLowerEmail = await db
    .collection('users')
    .where('email', '==', normalized)
    .limit(1)
    .get();

  if (!byLowerEmail.empty) {
    return byLowerEmail.docs[0];
  }

  if (originalEmail && originalEmail.trim()) {
    const byExactEmail = await db
      .collection('users')
      .where('email', '==', originalEmail.trim())
      .limit(1)
      .get();

    if (!byExactEmail.empty) {
      return byExactEmail.docs[0];
    }
  }

  return null;
}

async function findUserDocByUid(uid) {
  if (!uid) return null;

  try {
    const docRef = await db.collection('users').doc(uid).get();
    if (docRef.exists) {
      return docRef;
    }
  } catch (error) {
    logger.warn(`Unable to find user by uid ${uid}`, error);
  }

  return null;
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

function isSuperAdminRole(value) {
  if (!value) return false;
  const allowed = new Set(['superadmin', 'super_admin', 'owner']);
  if (Array.isArray(value)) {
    return value.some((role) => allowed.has(String(role).toLowerCase()));
  }
  return allowed.has(String(value).toLowerCase());
}

function hasSuperAdminFlag(data = {}) {
  return data.super_admin === true
    || data.superAdmin === true
    || data.is_super_admin === true
    || data.isSuperAdmin === true
    || isSuperAdminRole(data.role)
    || isSuperAdminRole(data.roles);
}

function extractOrgContextFromUserData(data = {}) {
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
  return { orgId, orgCode };
}

function extractStripeCustomerId(data = {}) {
  return data.stripeCustomerId
    || data.stripeCustomer
    || data.subscription?.customerId
    || data.subscription?.customer_id
    || data.subscription?.customer
    || null;
}

async function isBillingOwnerForUser(uid, userData = {}) {
  if (!uid) return false;

  let { orgId, orgCode } = extractOrgContextFromUserData(userData);
  if (!orgId && !orgCode) {
    const resolved = await resolveOrgContextForUser(uid);
    orgId = resolved.orgId || null;
    orgCode = resolved.orgCode || null;
  }

  let orgSnap = null;
  if (orgId) {
    orgSnap = await resolveOrgDocById(orgId);
  }
  if (!orgSnap?.exists && orgCode) {
    orgSnap = await resolveOrgDocByCode(orgCode);
  }
  if (!orgSnap?.exists) return false;

  const orgData = orgSnap.data() || {};
  const ownerCandidates = [
    orgData.billing_owner_uid,
    orgData.billingOwnerUid,
    orgData.owner_uid,
    orgData.ownerUid,
    orgData.created_by,
    orgData.createdBy,
  ]
    .filter(Boolean)
    .map((value) => String(value));

  if (ownerCandidates.includes(String(uid))) {
    return true;
  }

  const userCustomerId = extractStripeCustomerId(userData);
  const orgCustomerId = extractStripeCustomerId(orgData)
    || orgData.stripe_customer_id
    || orgData.stripeCustomerId
    || null;

  if (userCustomerId && orgCustomerId && String(userCustomerId) === String(orgCustomerId)) {
    return true;
  }

  return false;
}

async function isOrganizationAdminForUser(uid, userData = {}) {
  if (!uid) return false;

  let { orgId, orgCode } = extractOrgContextFromUserData(userData);
  if (!orgId && !orgCode) {
    const resolved = await resolveOrgContextForUser(uid);
    orgId = resolved.orgId || null;
    orgCode = resolved.orgCode || null;
  }

  let orgSnap = null;
  if (orgId) {
    orgSnap = await resolveOrgDocById(orgId);
  }
  if (!orgSnap?.exists && orgCode) {
    orgSnap = await resolveOrgDocByCode(orgCode);
  }

  if (orgSnap?.exists) {
    try {
      const adminSnap = await orgSnap.ref.collection('admins').doc(uid).get();
      if (adminSnap.exists) {
        const adminData = adminSnap.data() || {};
        return adminData.allowedCheckin !== false;
      }
    } catch (error) {
      logger.warn('Unable to verify org-scoped admin membership', error);
    }
  }

  try {
    const adminGroup = await db
      .collectionGroup('admins')
      .where(FieldPath.documentId(), '==', uid)
      .limit(1)
      .get();
    if (!adminGroup.empty) {
      const adminData = adminGroup.docs[0].data() || {};
      return adminData.allowedCheckin !== false;
    }
  } catch (error) {
    logger.warn('Unable to verify admin membership via collection group', error);
  }

  return false;
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

async function upsertSubscriptionRecord(stripe, subscription, fallbackEmail, fallbackUid = null) {
  if (!subscription) return;
  let email = fallbackEmail || subscription.customer_email || null;

  if (!email && subscription.default_payment_method?.billing_details?.email) {
    email = subscription.default_payment_method.billing_details.email;
  }

  if (!email) {
    try {
      const customer = await stripe.customers.retrieve(subscription.customer);
      if (!customer.deleted) {
        email = customer.email || email;
      }
    } catch (error) {
      logger.warn('Unable to retrieve customer email', error);
    }
  }

  const normalizedItems = normalizeSubscriptionItems(subscription.items?.data || []);
  const firstItem = subscription.items?.data?.[0] || {};
  const interval = subscription.plan?.interval
    || subscription.plan_interval
    || firstItem.price?.recurring?.interval
    || null;
  const amount = typeof firstItem.price?.unit_amount === 'number'
    ? firstItem.price.unit_amount
    : null;
  const currency = firstItem.price?.currency || subscription.currency || null;
  const planNickname = firstItem.price?.nickname
    || subscription.plan?.nickname
    || subscription.metadata?.plan_nickname
    || null;

  const subscriptionPayload = {
    id: subscription.id,
    status: subscription.status,
    plan: firstItem.price?.id || null,
    planKey: subscription.metadata?.plan_key || null,
    product: firstItem.price?.product || null,
    planNickname,
    interval,
    amount,
    currency,
    currentPeriodStart: subscription.current_period_start
      ? subscription.current_period_start * 1000
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? subscription.current_period_end * 1000
      : null,
    trialEnd: subscription.trial_end ? subscription.trial_end * 1000 : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    autoRenew: !subscription.cancel_at_period_end,
    customerId: subscription.customer,
    paid: computePaidStatus(subscription.status),
    updatedAt: new Date().toISOString(),
  };

  subscriptionPayload.items = normalizedItems;

  let latestInvoicePayload = null;
  if (subscription.latest_invoice && typeof subscription.latest_invoice === 'object') {
    latestInvoicePayload = buildInvoicePayload(
      subscription.latest_invoice,
      subscription.latest_invoice.status || null
    );
  } else if (subscription.latestInvoice && typeof subscription.latestInvoice === 'object') {
    latestInvoicePayload = buildInvoicePayload(
      subscription.latestInvoice,
      subscription.latestInvoice.status || null
    );
  }

  subscriptionPayload.latest_invoice = latestInvoicePayload || null;

  if (!email) {
    logger.warn('Subscription update missing email', subscription.id);
  }

  const metadataUid = subscription.metadata?.uid || subscription.metadata?.user_uid || null;
  const effectiveUid = fallbackUid || metadataUid || null;

  let userDoc = null;
  if (effectiveUid) {
    userDoc = await findUserDocByUid(effectiveUid);
  }

  email = (email || '').trim();
  const normalizedEmail = email.toLowerCase();
  if (!userDoc && normalizedEmail) {
    userDoc = await findUserDocByEmail(normalizedEmail, email);
  }

  const now = Date.now();
  const currentPeriodStart = subscription.current_period_start
    ? subscription.current_period_start * 1000
    : subscriptionPayload.currentPeriodStart
      ? subscriptionPayload.currentPeriodStart
      : null;
  const currentPeriodEnd = subscriptionPayload.currentPeriodEnd;
  const invoiceId = latestInvoicePayload?.id
    || subscription.latest_invoice?.id
    || subscription.latestInvoice?.id
    || null;
  const historyEntry = {
    id: subscription.id,
    status: subscription.status,
    planId: subscriptionPayload.plan,
    planKey: subscriptionPayload.planKey,
    planNickname,
    interval,
    amount,
    currency,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    currentPeriodStart,
    currentPeriodEnd,
    recordedAt: new Date(now).toISOString(),
    recordedAtMs: now,
    kind: 'subscription',
    invoiceId,
  };

  if (userDoc) {
    const existingData = userDoc.data() || {};
    const existingSubscription = existingData.subscription || {};
    const previousInterval = existingSubscription.interval
      || existingSubscription.plan_interval
      || existingSubscription.plan?.interval
      || null;
    const previousStatus = existingSubscription.status || null;
    const previousCancelAtPeriodEnd = existingSubscription.cancelAtPeriodEnd
      || existingSubscription.cancel_at_period_end
      || false;

    let changeType = 'subscription_updated';
    if (!existingSubscription.id) {
      changeType = 'subscription_created';
    } else if (
      previousInterval
      && interval
      && previousInterval !== interval
    ) {
      changeType = 'plan_changed';
    }

    if (
      typeof subscription.cancel_at_period_end === 'boolean'
      && previousCancelAtPeriodEnd !== historyEntry.cancelAtPeriodEnd
    ) {
      changeType = historyEntry.cancelAtPeriodEnd
        ? 'cancellation_scheduled'
        : 'cancellation_revoked';
    }

    if (previousStatus && previousStatus !== subscription.status) {
      changeType = `status_${(subscription.status || '').toLowerCase()}`;
    }

    if ((subscription.status || '').toLowerCase() === 'canceled') {
      changeType = 'subscription_canceled';
    }

    historyEntry.changeType = changeType;

    if (!latestInvoicePayload && existingSubscription.latest_invoice) {
      subscriptionPayload.latest_invoice = existingSubscription.latest_invoice;
    }

    const userRef = userDoc.ref;
    let subscriptionHistory = Array.isArray(existingData.subscriptionHistory)
      ? existingData.subscriptionHistory
      : [];
    subscriptionHistory = appendHistory(subscriptionHistory, historyEntry, {
      limit: 50,
      dedupeKey: null,
      sortKey: ['recordedAtMs', 'recordedAt'],
    });

    let invoiceHistory = Array.isArray(existingData.invoiceHistory)
      ? existingData.invoiceHistory
      : [];
    if (latestInvoicePayload) {
      invoiceHistory = appendHistory(invoiceHistory, latestInvoicePayload, {
        limit: 50,
        dedupeKey: 'id',
        sortKey: ['created', 'recordedAtMs', 'recordedAt'],
      });
    }

    const updatePayload = {
      subscription: subscriptionPayload,
      subscriptionHistory,
      paid: subscriptionPayload.paid,
      emailNormalized: normalizedEmail || userDoc.get('emailNormalized') || null,
      stripeCustomerId: subscription.customer,
      pending_plan_tier: null,
      pending_plan_effective_at: null,
      pending_plan_requested_at: null,
      pending_plan_requested_by: null,
    };

    if (isSchoolSubscriptionPayload(subscriptionPayload)) {
      updatePayload.planKey = subscriptionPayload.planKey || 'school';
      updatePayload.default_share_policy = 'required';
      updatePayload.default_auto_share = true;
      updatePayload.default_share_status = 'approved';
    }

    if (invoiceHistory.length) {
      updatePayload.invoiceHistory = invoiceHistory;
    }

    if (latestInvoicePayload) {
      updatePayload.lastInvoice = latestInvoicePayload;
    }

    await userRef.set(updatePayload, { merge: true });
    try {
      await db.collection('user_organizations').doc(userRef.id).set(updatePayload, { merge: true });
    } catch (mirrorError) {
      logger.warn('Unable to mirror subscription update to user_organizations', mirrorError);
    }
    const planTier = resolvePlanTierFromSubscriptionPayload(subscriptionPayload);
    updatePayload.plan_tier = planTier;
    const isGrandfathered = Boolean(existingData.grandfathered || existingData.is_grandfathered);
    await syncCustomClaimsForUser(userRef.id, subscriptionPayload.paid, planTier, isGrandfathered);
    const userContext = extractOrgContextFromUserData(existingData);
    let resolvedOrgId = userContext.orgId || null;
    let resolvedOrgCode = userContext.orgCode || null;
    if (!resolvedOrgId && !resolvedOrgCode) {
      const resolved = await resolveOrgContextForUser(userRef.id);
      resolvedOrgId = resolved.orgId || null;
      resolvedOrgCode = resolved.orgCode || null;
    }
    let resolvedOrgSnap = null;
    if (resolvedOrgId) {
      resolvedOrgSnap = await resolveOrgDocById(resolvedOrgId);
    }
    if (!resolvedOrgSnap?.exists && resolvedOrgCode) {
      resolvedOrgSnap = await resolveOrgDocByCode(resolvedOrgCode);
    }
    if (resolvedOrgSnap?.exists) {
      const orgCollections = ['organizations', 'orgs', 'volunteer_organizations'];
      const orgPlanPayload = {
        billing_owner_uid: userRef.id,
      };
      if (normalizedEmail) {
        orgPlanPayload.billing_owner_email = normalizedEmail;
      }
      if (updatePayload.plan_tier) {
        const isSchoolPlan = isSchoolSubscriptionPayload(subscriptionPayload);
        orgPlanPayload.plan_tier = planTier;
        orgPlanPayload.pending_plan_tier = null;
        orgPlanPayload.pending_plan_effective_at = null;
        orgPlanPayload.pending_plan_requested_at = null;
        orgPlanPayload.pending_plan_requested_by = null;
        orgPlanPayload.school_plan_active = isSchoolPlan;
        if (subscriptionPayload.planKey) {
          orgPlanPayload.plan_key = subscriptionPayload.planKey;
        }
        if (isSchoolPlan) {
          orgPlanPayload.default_share_policy = 'required';
          orgPlanPayload.default_auto_share = true;
          orgPlanPayload.default_share_status = 'approved';
        }
      }
      await Promise.all(orgCollections.map((coll) =>
        db.collection(coll).doc(resolvedOrgSnap.id).set(orgPlanPayload, { merge: true }).catch(() => {})
      ));
    }
    if (normalizedEmail) {
      await db
        .collection('pendingSubscriptions')
        .doc(normalizedEmail)
        .delete()
        .catch(() => {});
    }
    if (email && email !== normalizedEmail) {
      await db
        .collection('pendingSubscriptions')
        .doc(email)
        .delete()
        .catch(() => {});
    }
    if (effectiveUid) {
      await db
        .collection('pendingSubscriptions')
        .doc(effectiveUid)
        .delete()
        .catch(() => {});
    }

    if (
      existingSubscription?.id
      && existingSubscription.id !== subscription.id
      && subscription.status
      && subscription.status !== 'canceled'
    ) {
      try {
        await stripe.subscriptions.del(existingSubscription.id);
        logger.info('Canceled previous subscription after upgrade', {
          oldId: existingSubscription.id,
          newId: subscription.id,
        });
      } catch (cancelError) {
        logger.warn('Unable to cancel previous subscription', {
          oldId: existingSubscription.id,
          newId: subscription.id,
          message: cancelError?.message,
        });
      }
    }
  } else {
    if (!historyEntry.changeType) {
      historyEntry.changeType = 'subscription_updated';
    }
    const seedHistory = appendHistory([], historyEntry, {
      limit: 50,
      dedupeKey: null,
      sortKey: ['recordedAtMs', 'recordedAt'],
    });

    if (normalizedEmail) {
      await db
        .collection('pendingSubscriptions')
        .doc(normalizedEmail)
        .set(
          {
            emailNormalized: normalizedEmail,
            subscription: subscriptionPayload,
            subscriptionHistory: seedHistory,
            paid: subscriptionPayload.paid,
            stripeCustomerId: subscription.customer,
            default_share_policy: isSchoolSubscriptionPayload(subscriptionPayload) ? 'required' : null,
            default_auto_share: isSchoolSubscriptionPayload(subscriptionPayload) || null,
            default_share_status: isSchoolSubscriptionPayload(subscriptionPayload) ? 'approved' : null,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
    }
    if (email && email !== normalizedEmail) {
      await db
        .collection('pendingSubscriptions')
        .doc(email)
        .set(
          {
            emailNormalized: normalizedEmail,
            subscription: subscriptionPayload,
            subscriptionHistory: seedHistory,
            paid: subscriptionPayload.paid,
            stripeCustomerId: subscription.customer,
            default_share_policy: isSchoolSubscriptionPayload(subscriptionPayload) ? 'required' : null,
            default_auto_share: isSchoolSubscriptionPayload(subscriptionPayload) || null,
            default_share_status: isSchoolSubscriptionPayload(subscriptionPayload) ? 'approved' : null,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
    }
    if (effectiveUid) {
      await db
        .collection('pendingSubscriptions')
        .doc(effectiveUid)
        .set(
          {
            emailNormalized: normalizedEmail || null,
            subscription: subscriptionPayload,
            subscriptionHistory: seedHistory,
            paid: subscriptionPayload.paid,
            stripeCustomerId: subscription.customer,
            default_share_policy: isSchoolSubscriptionPayload(subscriptionPayload) ? 'required' : null,
            default_auto_share: isSchoolSubscriptionPayload(subscriptionPayload) || null,
            default_share_status: isSchoolSubscriptionPayload(subscriptionPayload) ? 'approved' : null,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
    }
  }
}

async function updateInvoiceInfo(stripe, invoice, statusLabel) {
  if (!invoice) return;

  let enrichedInvoice = invoice;
  if (!enrichedInvoice.lines || !enrichedInvoice.lines.data) {
    try {
      enrichedInvoice = await stripe.invoices.retrieve(invoice.id, {
        expand: ['lines.data.price'],
      });
    } catch (error) {
      logger.warn('Unable to expand invoice lines', error);
    }
  }

  let email =
    enrichedInvoice.customer_email ||
    enrichedInvoice.account_tax_ids?.[0]?.email ||
    null;
  let subscription = null;

  try {
    if (enrichedInvoice.subscription) {
      subscription = await stripe.subscriptions.retrieve(enrichedInvoice.subscription, {
        expand: ['latest_invoice'],
      });
      await upsertSubscriptionRecord(
        stripe,
        subscription,
        email,
        subscription?.metadata?.uid || subscription?.metadata?.user_uid || null
      );
    }
  } catch (error) {
    logger.warn('Unable to sync subscription from invoice', error);
  }

  if (!email && subscription) {
    email =
      subscription.customer_email ||
      subscription.default_payment_method?.billing_details?.email ||
      null;
  }

  if (!email && enrichedInvoice.customer) {
    try {
      const customer = await stripe.customers.retrieve(enrichedInvoice.customer);
      if (!customer.deleted) {
        email = customer.email || email;
      }
    } catch (error) {
      logger.warn('Unable to retrieve customer for invoice', error);
    }
  }

  if (!email) return;

  email = email.trim();
  const normalizedEmail = email.toLowerCase();
  const invoicePayload = buildInvoicePayload(enrichedInvoice, statusLabel);
  if (!invoicePayload) return;

  const userDoc = await findUserDocByEmail(normalizedEmail, email);

  if (userDoc) {
    const existingData = userDoc.data() || {};
    let invoiceHistory = Array.isArray(existingData.invoiceHistory)
      ? existingData.invoiceHistory
      : [];
    invoiceHistory = appendHistory(invoiceHistory, invoicePayload, {
      limit: 50,
      dedupeKey: 'id',
      sortKey: ['created', 'recordedAtMs', 'recordedAt'],
    });

    const updates = {
      lastInvoice: invoicePayload,
      invoiceHistory,
      emailNormalized: normalizedEmail,
      'subscription.latest_invoice': invoicePayload,
    };

    await userDoc.ref.set(updates, { merge: true });
  } else {
    const pendingPayload = {
      emailNormalized: normalizedEmail,
      lastInvoice: invoicePayload,
      invoiceHistory: appendHistory([], invoicePayload, {
        limit: 50,
        dedupeKey: 'id',
        sortKey: ['created', 'recordedAtMs', 'recordedAt'],
      }),
      'subscription.latest_invoice': invoicePayload,
    };

    await db
      .collection('pendingSubscriptions')
      .doc(normalizedEmail)
      .set(pendingPayload, { merge: true });
    if (email && email !== normalizedEmail) {
      await db
        .collection('pendingSubscriptions')
        .doc(email)
        .set(pendingPayload, { merge: true });
    }
    const invoiceUid = subscription?.metadata?.uid || subscription?.metadata?.user_uid || null;
    if (invoiceUid) {
      await db
        .collection('pendingSubscriptions')
        .doc(invoiceUid)
        .set(pendingPayload, { merge: true });
    }
  }
}

export const createCheckout = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY, PUBLIC_BASE_URL, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, STRIPE_PRICE_SCHOOL],
  },
  async (req, res) => {
    if (handleCorsPreflight(req, res, ['POST'])) return;
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const decodedToken = await decodeAuthHeader(req);
    const {
      priceId,
      plan,
      email,
      uid,
      trial: trialRequested,
      orgName,
      firstName,
      lastName,
    } = req.body || {};
    const resolvedPriceId = resolvePriceId(priceId || plan);

    if (!resolvedPriceId) {
      logger.error('Checkout price resolution failed', { plan, priceIdInput: priceId, planKey: plan });
      res.status(400).json({ error: 'Invalid price selection. Please refresh and try again.' });
      return;
    }

    const planKey = plan || Object.entries(getPriceMap()).find(([, value]) => value === resolvedPriceId)?.[0] || null;
    const normalizedEmail = (decodedToken?.email || email || '').trim().toLowerCase();
    const customerUid = decodedToken?.uid || uid || '';

    if (isDemoEmail(normalizedEmail)) {
      res.status(403).json({ error: 'Demo access cannot initiate billing.' });
      return;
    }

    const shouldEvaluateTrial = Boolean(trialRequested);
    const TRIAL_PERIOD_DAYS = 365;
    let shouldApplyTrial = false;

    if (shouldEvaluateTrial) {
      try {
        let existingUserDoc = null;
        if (customerUid) {
          existingUserDoc = await findUserDocByUid(customerUid);
        }
        if (!existingUserDoc && normalizedEmail) {
          existingUserDoc = await findUserDocByEmail(normalizedEmail, email);
        }

        const existingData = existingUserDoc?.data ? existingUserDoc.data() : null;
        const existingSubscription = existingData?.subscription || null;
        const existingStatus = (existingSubscription?.status || '').toLowerCase();
        const hasActiveLikeStatus = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired'].includes(existingStatus);
        const hasSeenTrial = Boolean(
          existingSubscription?.trialEnd
          || existingSubscription?.trial_end
          || existingSubscription?.trialEndedAt
          || existingSubscription?.trialEndedAtMs
        );
        const hasCustomerRef = Boolean(
          existingSubscription?.customerId
          || existingSubscription?.customer_id
          || existingSubscription?.customer
          || existingData?.stripeCustomerId
          || existingData?.stripeCustomer
        );

        if (!existingData || (!hasActiveLikeStatus && !hasSeenTrial && !hasCustomerRef)) {
          if (normalizedEmail) {
            const pendingDoc = await db.collection('pendingSubscriptions').doc(normalizedEmail).get();
            const pendingData = pendingDoc.exists ? pendingDoc.data() : null;
            const pendingStatus = (pendingData?.subscription?.status || '').toLowerCase();
            const pendingTrial = pendingData?.subscription?.trialEnd || pendingData?.subscription?.trial_end;
            shouldApplyTrial = !pendingTrial && (!pendingStatus || pendingStatus === 'canceled');
          } else {
            shouldApplyTrial = true;
          }
        }
      } catch (error) {
        logger.warn('Unable to determine trial eligibility', error);
        shouldApplyTrial = false;
      }
    }

    try {
      const stripe = getStripeClient();
      const publicBase = resolvePublicBase(req);
      let priceToUse = resolvedPriceId;
      try {
        await assertPriceExists(stripe, priceToUse);
      } catch (error) {
        const productFallback = getProductMap()[planKey] || getProductMap()[plan] || null;
        if (productFallback) {
          const altPrice = await getDefaultPriceForProduct(stripe, productFallback);
          if (altPrice) {
            priceToUse = altPrice;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      const successParams = new URLSearchParams({ checkout: 'success' });
      if (planKey) {
        successParams.set('plan', planKey);
      }
      const successQuery = successParams.toString();
      const isAuthedCheckout = Boolean(decodedToken?.uid);
      const successPath = isAuthedCheckout ? '/admin/create' : '/#create';
      const successUrl = `${publicBase}${successPath}?${successQuery}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${publicBase}/#pricing`;

      const subscriptionData = {
        metadata: {
          plan_key: planKey || '',
          uid: customerUid,
          trial_requested: shouldEvaluateTrial ? 'true' : 'false',
          trial_applied: shouldApplyTrial ? 'true' : 'false',
        },
      };

      if (shouldApplyTrial) {
        subscriptionData.trial_period_days = TRIAL_PERIOD_DAYS;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_collection: 'always',
        line_items: [
          {
            price: priceToUse,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        client_reference_id: customerUid || undefined,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          uid: customerUid,
          plan: resolvedPriceId,
          plan_key: planKey || '',
          email: normalizedEmail || (email || '').toLowerCase(),
          org_name: String(orgName || '').trim(),
          first_name: String(firstName || '').trim(),
          last_name: String(lastName || '').trim(),
        },
        subscription_data: subscriptionData,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
      logger.error('Checkout session creation failed', {
        message: error?.message,
        type: error?.type,
        code: error?.code,
        statusCode: error?.statusCode || error?.raw?.statusCode,
        priceId: resolvedPriceId,
        priceUsed: typeof priceToUse !== 'undefined' ? priceToUse : resolvedPriceId,
        planKey,
        hint: error?.userMessage,
      });
      const statusCode = error?.statusCode || error?.raw?.statusCode || 500;
      const message = error?.userMessage || error?.message || 'Unable to create checkout session.';
      res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
        error: message,
        code: error?.code || 'checkout_failed',
      });
    }
  }
);

function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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

async function createUniqueAccessCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateAccessCode();
    const snapshot = await db
      .collection('organizations')
      .where('access_code', '==', code)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return code;
    }
  }
  return generateAccessCode();
}

async function verifyCheckoutSession(sessionId) {
  if (!sessionId) return null;
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer', 'customer_details'],
  });
  return session;
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


export const createPortal = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY, PUBLIC_BASE_URL],
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

    try {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        res.json({ customerId: null, invoices: [] });
        return;
      }

      const userData = userDoc.data() || {};
      if (isDemoEmail(userData.email)) {
        res.status(403).json({ error: 'Demo accounts cannot access billing.' });
        return;
      }
      const subscription = userData.subscription || {};
      const customerId = subscription.customerId
        || subscription.customer_id
        || subscription.customer
        || userData.stripeCustomerId
        || userData.stripeCustomer;

      if (!customerId) {
        res.status(404).json({ error: 'This admin is not yet linked to Stripe billing. Please contact support to enable the customer portal.' });
        return;
      }

      const stripe = getStripeClient();
      const returnUrl = `${resolvePublicBase(req)}/admin/create?checkout=return`;

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      res.json({ url: portalSession.url });
    } catch (error) {
      logger.error('Customer portal session creation failed', error);
      const statusCode = error?.statusCode || error?.raw?.statusCode || 500;
      const message = error?.message || 'Unable to create customer portal session.';
      res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({ error: message });
    }
  }
);

export const getCheckoutSession = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const sessionId = req.query.id || req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Missing checkout session id.' });
      return;
    }

    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['customer', 'customer_details'],
      });

      const email = session.customer_details?.email
        || session.customer_email
        || (session.customer && typeof session.customer === 'object'
          ? session.customer.email
          : null);
      const name = session.customer_details?.name
        || (session.customer && typeof session.customer === 'object'
          ? session.customer.name
          : null);
      const metadata = session?.metadata || {};
      const firstName = metadata.first_name || null;
      const lastName = metadata.last_name || null;
      const orgName = metadata.org_name || null;

      res.json({
        email: email || null,
        name: name || null,
        firstName,
        lastName,
        orgName,
      });
    } catch (error) {
      logger.error(`Checkout session lookup failed for ${sessionId}`, error);
      res.status(500).json({ error: 'Unable to retrieve checkout session.' });
    }
  }
);

export const listInvoices = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const decodedToken = await decodeAuthHeader(req);
    if (!decodedToken?.uid) {
      res.status(401).json({ error: 'Missing or invalid authorization token.' });
      return;
    }

    try {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        res.json({ customerId: null, invoices: [] });
        return;
      }

      const userData = userDoc.data() || {};
      const subscription = userData.subscription || {};
      const customerId = subscription.customerId
        || subscription.customer_id
        || subscription.customer
        || userData.stripeCustomerId
        || userData.stripeCustomer;
      const fallbackEmail = userData.email || decodedToken.email || null;

      const stripe = getStripeClient();
      let resolvedCustomerId = customerId;
      if (!resolvedCustomerId && fallbackEmail) {
        const customers = await stripe.customers.list({ email: fallbackEmail, limit: 1 });
        resolvedCustomerId = customers.data?.[0]?.id || null;
      }

      if (!resolvedCustomerId) {
        res.json({ customerId: null, invoices: [] });
        return;
      }

      let limit = parseInt(req.query.limit, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        limit = 10;
      }
      if (limit > 50) {
        limit = 50;
      }

      const { data } = await stripe.invoices.list({
        customer: resolvedCustomerId,
        limit,
        // Avoid deep expansion errors; price info is enough for UI.
        expand: ['data.lines.data.price'],
      });

      const invoices = data.map((invoice) => ({
        id: invoice.id,
        status: invoice.status,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        hostedInvoiceUrl: invoice.hosted_invoice_url || null,
        invoicePdf: invoice.invoice_pdf || null,
        created: invoice.created ? invoice.created * 1000 : null,
        lines: normalizeInvoiceLines(invoice.lines?.data || []),
      }));

      res.json({ customerId: resolvedCustomerId, invoices });
    } catch (error) {
      logger.error('Invoice list retrieval failed', error);
      res.status(500).json({ error: 'Unable to fetch invoices.' });
    }
  }
);

export const listSubscriptions = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const decodedToken = await decodeAuthHeader(req);
    if (!decodedToken?.uid) {
      res.status(401).json({ error: 'Missing or invalid authorization token.' });
      return;
    }

    try {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        res.status(404).json({ error: 'Admin record not found.' });
        return;
      }

      const userData = userDoc.data() || {};
      let subscription = userData.subscription || null;
      const subscriptionHistory = Array.isArray(userData.subscriptionHistory)
        ? [...userData.subscriptionHistory]
        : [];
      const invoiceHistory = Array.isArray(userData.invoiceHistory)
        ? [...userData.invoiceHistory]
        : [];
      const lastInvoice = userData.lastInvoice || null;
      const fallbackEmail = userData.email || decodedToken.email || null;
      const getStripeId = (val) => {
        if (typeof val === 'string') return val;
        if (typeof val === 'object' && val !== null && val.id) return val.id;
        return null;
      };

      const baseCustomerId = getStripeId(subscription?.customerId)
        || getStripeId(subscription?.customer_id)
        || getStripeId(subscription?.customer)
        || getStripeId(userData.stripeCustomerId)
        || getStripeId(userData.stripeCustomer);

      const stripe = getStripeClient();
      const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIREBASE_EMULATOR_HUB);
      logger.info('Billing diagnostic', { 
        userId: decodedToken.uid, 
        isEmulator, 
        hasBaseCustomerId: !!baseCustomerId,
        resolvedCustomerId: baseCustomerId
      });

      const pickBestSubscription = (subs = []) => {
        if (!Array.isArray(subs) || subs.length === 0) return null;
        const priority = new Map([
          ['trialing', 0],
          ['active', 1],
          ['past_due', 2],
          ['incomplete', 3],
          ['unpaid', 4],
          ['incomplete_expired', 5],
          ['canceled', 6],
        ]);
        return subs
          .filter(Boolean)
          .sort((a, b) => {
            const aPriority = priority.has(a.status) ? priority.get(a.status) : 99;
            const bPriority = priority.has(b.status) ? priority.get(b.status) : 99;
            if (aPriority !== bPriority) return aPriority - bPriority;
            const aEnd = a.current_period_end || a.created || 0;
            const bEnd = b.current_period_end || b.created || 0;
            return bEnd - aEnd;
          })[0] || null;
      };

      if (!subscription && fallbackEmail) {
        let customers = [];
        try {
          const customerResp = await stripe.customers.list({ email: fallbackEmail, limit: 10 });
          customers = customerResp.data || [];
        } catch (err) {
          logger.warn('Customer lookup failed', { email: fallbackEmail });
        }

        const lookupIds = [
          baseCustomerId,
          ...customers.map((customer) => customer?.id).filter(Boolean)
        ].filter(Boolean);

        const seen = new Set();
        const allSubs = [];
        for (const id of lookupIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          try {
            const subs = await stripe.subscriptions.list({
              customer: id,
              status: 'all',
              limit: 10,
              expand: ['data.items.data.price', 'data.items.data.price.product', 'data.default_payment_method'],
            });
            if (Array.isArray(subs.data)) {
              allSubs.push(...subs.data);
            }
          } catch (err) {
            logger.warn('Subscription list failed', { customer: id });
          }
        }

        subscription = pickBestSubscription(allSubs);
      }

      // Ensure we have the most complete subscription object possible
      if (subscription?.id) {
        try {
          const expanded = await stripe.subscriptions.retrieve(subscription.id, {
            expand: [
              'items.data.price', 
              'items.data.price.product', 
              'latest_invoice.payment_intent.payment_method',
              'default_payment_method'
            ],
          });
          if (expanded) {
            subscription = expanded;
          }
        } catch (error) {
          logger.warn('Unable to expand subscription details', { message: error?.message });
        }
      }

      const finalCustomerId = getStripeId(baseCustomerId)
        || getStripeId(subscription?.customer)
        || getStripeId(subscription?.customer_id)
        || null;

      let paymentMethod = null;
      try {
        paymentMethod = await findStripePaymentMethod(stripe, {
          subscription,
          customerId: finalCustomerId,
          email: fallbackEmail,
        });
        logger.info('Resolved payment method', { userId: decodedToken.uid, found: !!paymentMethod });
      } catch (error) {
        logger.warn('Payment method resolution failed', { message: error?.message });
      }

      subscriptionHistory.sort((a, b) => (b?.recordedAtMs || 0) - (a?.recordedAtMs || 0));
      invoiceHistory.sort((a, b) => (b?.created || 0) - (a?.created || 0));

      const derivedTier = resolvePlanTierFromSubscription(subscription);
      if (derivedTier && derivedTier !== (userData.plan_tier || userData.planTier)) {
        try {
          await userDoc.ref.set({ plan_tier: derivedTier, updatedAt: Timestamp.now() }, { merge: true });
        } catch (error) {
          logger.warn('Unable to persist derived plan tier', { message: error?.message });
        }
      }

      const normalizedStatus = subscription?.status || null;
      const normalizedTrialEnd = subscription?.trial_end || subscription?.trialEnd || null;
      const normalizedPeriodEnd = subscription?.current_period_end || subscription?.currentPeriodEnd || null;

      res.json({
        subscription,
        subscriptionHistory,
        invoiceHistory,
        lastInvoice,
        paymentMethod,
        planTier: derivedTier || userData.plan_tier || userData.planTier || null,
        normalizedStatus,
        trialEnd: normalizedTrialEnd,
        currentPeriodEnd: normalizedPeriodEnd,
        pendingPlanTier: userData.pending_plan_tier || userData.pendingPlanTier || null,
        pendingPlanEffectiveAt: userData.pending_plan_effective_at || userData.pendingPlanEffectiveAt || null,
        grandfathered: Boolean(userData.grandfathered || userData.is_grandfathered),
      });
    } catch (error) {
      logger.error('Subscription history retrieval failed', error);
      res.status(500).json({ error: 'Unable to fetch subscription history.' });
    }
  }
);

export const cancelSubscription = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY],
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

    try {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        res.status(404).json({ error: 'Admin record not found.' });
        return;
      }

      const userData = userDoc.data() || {};
      if (isDemoEmail(userData.email)) {
        res.status(403).json({ error: 'Demo accounts cannot modify billing.' });
        return;
      }
      const subscription = userData.subscription || {};
      const subscriptionId = subscription.id || null;

      if (!subscriptionId) {
        res.status(400).json({ error: 'No active subscription found to cancel.' });
        return;
      }

      const stripe = getStripeClient();
      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      await upsertSubscriptionRecord(
        stripe,
        updated,
        userData.email || userData.emailNormalized || null,
        decodedToken.uid
      );

      res.json({
        status: updated.status,
        cancel_at_period_end: updated.cancel_at_period_end,
        current_period_end: updated.current_period_end
          ? updated.current_period_end * 1000
          : null,
      });
    } catch (error) {
      logger.error('Cancel subscription failed', error);
      const statusCode = error?.statusCode || error?.raw?.statusCode || 500;
      const message = error?.message || 'Unable to cancel subscription.';
      res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({ error: message });
    }
  }
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

export const stripeWebhook = onRequest(
  {
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
    rawBody: true,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const stripe = getStripeClient();
    const signature = req.headers['stripe-signature'];
    const webhookSecret = getWebhookSecret();

    if (!webhookSecret) {
      logger.error('Stripe webhook secret is not configured.');
      res.status(500).send('Webhook not configured.');
      return;
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret
      );
    } catch (error) {
      logger.error('Stripe webhook signature verification failed', error);
      res.status(400).send(`Webhook Error: ${error.message}`);
      return;
    }

    // Idempotency check
    const eventId = event.id;
    const eventRef = db.collection('stripe_events').doc(eventId);
    const doc = await eventRef.get();
    if (doc.exists) {
      logger.info(`Stripe event ${eventId} already processed.`);
      res.json({ received: true });
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.mode === 'subscription' && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription,
              { expand: ['latest_invoice'] }
            );
            await upsertSubscriptionRecord(
              stripe,
              subscription,
              session.customer_details?.email || session.customer_email || session.metadata?.email,
              session.client_reference_id || session.metadata?.uid || null
            );
          }
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          await upsertSubscriptionRecord(
            stripe,
            subscription,
            subscription.customer_email,
            subscription.metadata?.uid || subscription.metadata?.user_uid || null
          );
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object;
          await updateInvoiceInfo(stripe, invoice, 'paid');
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          await updateInvoiceInfo(stripe, invoice, 'payment_failed');
          break;
        }
        default:
          logger.info(`Unhandled Stripe event type: ${event.type}`);
      }

      // Record the event as processed
      await eventRef.set({
        receivedAt: Timestamp.now(),
        eventType: event.type,
      });

      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook handler failed', { eventId, error });
    }
  }
);

export const applyPendingPlanChanges = onSchedule('every 12 hours', async () => {
  const now = Date.now();
  const collections = ['organizations', 'orgs', 'volunteer_organizations'];
  for (const coll of collections) {
    const snap = await db.collection(coll)
      .where('pending_plan_effective_at', '<=', now)
      .limit(200)
      .get();
    if (snap.empty) continue;
    const updates = snap.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const pendingTier = normalizePlanTier(data.pending_plan_tier || data.pendingPlanTier);
      if (!pendingTier) return null;
      return docSnap.ref.set({
        plan_tier: pendingTier,
        pending_plan_tier: null,
        pending_plan_effective_at: null,
        pending_plan_requested_at: null,
        pending_plan_requested_by: null,
        plan_updated_at: Timestamp.now(),
      }, { merge: true });
    }).filter(Boolean);
    if (updates.length) {
      await Promise.all(updates);
    }
  }
});

export const cleanupPendingSubscriptions = onSchedule('every 24 hours', async (context) => {
  const now = Timestamp.now();
  const sevenDaysAgo = Timestamp.fromMillis(now.toMillis() - 7 * 24 * 60 * 60 * 1000);

  const oldSubscriptionsQuery = db.collection('pendingSubscriptions').where('updatedAt', '<', sevenDaysAgo);

  const snapshot = await oldSubscriptionsQuery.get();

  if (snapshot.empty) {
    logger.info('No stale pending subscriptions to clean up.');
    return null;
  }

  const deletions = [];
  snapshot.forEach(doc => {
    deletions.push(doc.ref.delete());
  });

  await Promise.all(deletions);

  logger.info(`Cleaned up ${deletions.length} stale pending subscriptions.`);

  return null;
});

/**
 * Hyper-robust payment method lookup for Stripe.
 * Attempts to find card details across subscription, customer, and invoices.
 */
async function findStripePaymentMethod(stripe, { subscription, customerId, email }) {
  let resolvedPm = null;

  // 1. Try Default Payment Method on Subscription
  let subPm = subscription?.default_payment_method;
  if (subPm) {
    if (typeof subPm === 'string') {
      try { subPm = await stripe.paymentMethods.retrieve(subPm); } catch (e) { subPm = null; }
    }
    if (subPm) resolvedPm = serializeStripePm(subPm);
  }

  // 2. Try Default Payment Method/Source on Customer
  if (!resolvedPm && customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      let custPmId = customer?.invoice_settings?.default_payment_method || customer?.default_source;
      
      if (custPmId) {
        if (typeof custPmId === 'string') {
          if (custPmId.startsWith('pm_')) {
            const pm = await stripe.paymentMethods.retrieve(custPmId);
            if (pm) resolvedPm = serializeStripePm(pm);
          } else if (custPmId.startsWith('card_') || custPmId.startsWith('src_')) {
            const src = await stripe.customers.retrieveSource(customerId, custPmId);
            if (src) resolvedPm = serializeStripeSource(src);
          }
        } else if (custPmId.id) {
          resolvedPm = serializeStripePm(custPmId);
        }
      }
    } catch (e) { /* ignore */ }
  }

  // 3. Try Latest Invoice
  if (!resolvedPm && subscription?.latest_invoice) {
    let inv = subscription.latest_invoice;
    if (typeof inv === 'string') {
      try { inv = await stripe.invoices.retrieve(inv, { expand: ['payment_intent.payment_method'] }); } catch (e) { inv = null; }
    }
    const pm = inv?.payment_intent?.payment_method;
    if (pm) resolvedPm = serializeStripePm(pm);
  }

  // 4. Fallback: List all payment methods for customer (checking cards first as most common)
  if (!resolvedPm && customerId) {
    try {
      const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
      if (methods.data?.[0]) resolvedPm = serializeStripePm(methods.data[0]);
    } catch (e) { /* ignore */ }
  }

  if (resolvedPm && !resolvedPm.brand && resolvedPm.type === 'card') {
    resolvedPm.brand = 'Card';
  }
  return resolvedPm;
}

function serializeStripePm(pm) {
  if (!pm) return null;
  const type = pm.type || 'card';
  return {
    type,
    brand: pm.card?.brand || null,
    last4: pm.card?.last4 || null,
    expMonth: pm.card?.exp_month || null,
    expYear: pm.card?.exp_year || null,
    funding: pm.card?.funding || null,
  };
}

function serializeStripeSource(src) {
  // Handles legacy card sources
  const card = src.card || src;
  return {
    type: 'card',
    brand: card.brand || null,
    last4: card.last4 || null,
    expMonth: card.exp_month || null,
    expYear: card.exp_year || null,
    funding: card.funding || null,
  };
}
