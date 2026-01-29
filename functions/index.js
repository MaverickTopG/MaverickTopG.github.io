import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import crypto from 'crypto';
import Stripe from 'stripe';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldPath } from 'firebase-admin/firestore';
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
const DEFAULT_STRIPE_SECRET_KEY = 'REDACTED_STRIPE_LIVE_SECRET_KEY';
const DEFAULT_QR_TTL_SECONDS = 3153600000; // 100 years
const DEMO_ACCOUNT_EMAILS = new Set(['x@gmail.com']);

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
  if (isEmulator) {
    const testMonthly = process.env.STRIPE_PRICE_MONTHLY_TEST || process.env.PUBLIC_STRIPE_PRICE_MONTHLY;
    const testYearly = process.env.STRIPE_PRICE_YEARLY_TEST || process.env.PUBLIC_STRIPE_PRICE_YEARLY;
    const testSchoolMonthly = process.env.STRIPE_PRICE_SCHOOL_TEST || process.env.PUBLIC_STRIPE_PRICE_SCHOOL;
    const testSchoolYearly = process.env.STRIPE_PRICE_SCHOOL_YEARLY_TEST || process.env.PUBLIC_STRIPE_PRICE_SCHOOL_YEARLY;
    return {
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
    monthly: envMonthly || safeSecretValue(STRIPE_PRICE_MONTHLY, DEFAULT_PRICE_MONTHLY),
    yearly: envYearly || safeSecretValue(STRIPE_PRICE_YEARLY, DEFAULT_PRICE_YEARLY),
    school: envSchool || safeSecretValue(STRIPE_PRICE_SCHOOL, DEFAULT_PRICE_SCHOOL),
  };
}

function getProductMap() {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIREBASE_EMULATOR_HUB);
  if (isEmulator) {
    return {
      monthly: process.env.STRIPE_PRODUCT_MONTHLY_TEST || process.env.PUBLIC_STRIPE_PRODUCT_MONTHLY || DEFAULT_PRODUCT_MONTHLY,
      yearly: process.env.STRIPE_PRODUCT_YEARLY_TEST || process.env.PUBLIC_STRIPE_PRODUCT_YEARLY || DEFAULT_PRODUCT_YEARLY,
      school: process.env.STRIPE_PRODUCT_SCHOOL_TEST || process.env.PUBLIC_STRIPE_PRODUCT_SCHOOL || DEFAULT_PRODUCT_SCHOOL,
    };
  }
  return {
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
  if (typeof input === 'string' && /^price_[a-zA-Z0-9]+$/.test(input)) {
    return input;
  }
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

function getSchoolPriceIds() {
  return new Set([
    DEFAULT_PRICE_SCHOOL,
    safeSecretValue(STRIPE_PRICE_SCHOOL, DEFAULT_PRICE_SCHOOL),
  ].filter(Boolean));
}

function isSchoolSubscriptionPayload(payload = {}) {
  const schoolIds = getSchoolPriceIds();
  const planKey = String(payload.planKey || payload.plan_key || '').trim().toLowerCase();
  const planId = payload.plan || payload.planId || payload.plan_id || null;

  if (isSchoolPlanKey(planKey)) return true;
  if (planId && schoolIds.has(planId)) return true;
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

async function syncCustomClaimsForUser(uid, paid) {
  if (!uid) return;
  try {
    const userRecord = await authAdmin.getUser(uid);
    const currentClaims = userRecord.customClaims || {};
    if (currentClaims.paid === paid) {
      return;
    }
    await authAdmin.setCustomUserClaims(uid, { ...currentClaims, paid });
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
    await syncCustomClaimsForUser(userRef.id, subscriptionPayload.paid);
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
    const TRIAL_PERIOD_DAYS = 14;
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
      const successUrl = `${publicBase}/admin/create?${successQuery}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${publicBase}/admin/create?checkout=cancel`;

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

    const { organizationName, sessionId } = req.body || {};
    const name = String(organizationName || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Organization name is required.' });
      return;
    }

    let session = null;
    if (sessionId) {
      try {
        session = await verifyCheckoutSession(sessionId);
      } catch (error) {
        logger.error('Checkout session verification failed', error);
        res.status(400).json({ error: 'Unable to verify checkout session.' });
        return;
      }

      const paymentStatus = session?.payment_status || '';
      const sessionStatus = session?.status || '';
      if (!['paid', 'no_payment_required'].includes(paymentStatus) && sessionStatus !== 'complete') {
        res.status(400).json({ error: 'Checkout is not completed yet.' });
        return;
      }

      const sessionEmail = session?.customer_details?.email || session?.customer_email || '';
      if (sessionEmail && decodedToken.email && sessionEmail.toLowerCase() !== decodedToken.email.toLowerCase()) {
        res.status(400).json({ error: 'Checkout email does not match the signed-in account.' });
        return;
      }
    }

    try {
      const orgCode = await createUniqueAccessCode();
      const orgRef = db.collection('organizations').doc();

      const payload = {
        name,
        access_code: orgCode,
        created_at: Timestamp.now(),
        created_by: decodedToken.uid,
        owner_uid: decodedToken.uid,
        source: 'stripe_checkout',
        stripe_session_id: sessionId || null,
        stripe_customer_id: session?.customer?.id || session?.customer || null,
        stripe_subscription_id: session?.subscription?.id || session?.subscription || null,
      };

      await orgRef.set(payload, { merge: true });
      await ensureUserOrganizationLink(orgCode, orgRef.id, decodedToken.uid, {
        email: decodedToken.email || null,
      }, {
        name,
      });

      await db.collection('users').doc(decodedToken.uid).set(
        {
          email: decodedToken.email || null,
          organizationName: name,
          organizationId: orgRef.id,
          accessCode: orgCode,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

      res.json({
        organizationId: orgRef.id,
        organizationCode: orgCode,
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
      const orgSnapshot = await db
        .collection('organizations')
        .where('access_code', '==', normalizedCode)
        .limit(1)
        .get();

      if (orgSnapshot.empty) {
        res.status(404).json({ error: 'Organization not found. Check the code and try again.' });
        return;
      }

      const orgDoc = orgSnapshot.docs[0];
      const orgData = orgDoc.data() || {};

      await ensureUserOrganizationLink(normalizedCode, orgDoc.id, decodedToken.uid, {
        email: decodedToken.email || null,
      }, orgData);

      await db.collection('users').doc(decodedToken.uid).set(
        {
          email: decodedToken.email || null,
          organizationId: orgDoc.id,
          organizationName: orgData.name || null,
          accessCode: normalizedCode,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

      res.json({
        organizationId: orgDoc.id,
        organizationCode: normalizedCode,
        organizationName: orgData.name || null,
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
        res.status(404).json({ error: 'Admin record not found.' });
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

      res.json({ email: email || null });
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
        res.status(404).json({ error: 'Admin record not found.' });
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
        res.status(404).json({ error: 'No Stripe customer record found for this account.' });
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

      if (!subscription && fallbackEmail) {
        let lookupId = baseCustomerId;
        if (!lookupId) {
          try {
            const customers = await stripe.customers.list({ email: fallbackEmail, limit: 1 });
            lookupId = customers.data?.[0]?.id || null;
          } catch (err) {
            logger.warn('Initial customer lookup failed', { email: fallbackEmail });
          }
        }
        if (lookupId) {
          try {
            const subs = await stripe.subscriptions.list({
              customer: lookupId,
              status: 'all',
              limit: 1,
              expand: ['data.items.data.price', 'data.items.data.price.product', 'data.default_payment_method'],
            });
            subscription = subs.data?.[0] || null;
          } catch (err) {
            logger.warn('Subscription list failed', { customer: lookupId });
          }
        }
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

      res.json({
        subscription,
        subscriptionHistory,
        invoiceHistory,
        lastInvoice,
        paymentMethod,
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

  await syncCustomClaimsForUser(userId, paid);
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
