import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const PUBLIC_BASE_URL = defineSecret('PUBLIC_BASE_URL');
const STRIPE_PRICE_MONTHLY = defineSecret('STRIPE_PRICE_MONTHLY');
const STRIPE_PRICE_YEARLY = defineSecret('STRIPE_PRICE_YEARLY');

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

function getPriceMap() {
  return {
    monthly: safeSecretValue(STRIPE_PRICE_MONTHLY, null),
    yearly: safeSecretValue(STRIPE_PRICE_YEARLY, null),
  };
}

function resolvePriceId(input) {
  if (!input) return null;
  const priceMap = getPriceMap();
  if (priceMap[input]) return priceMap[input];
  if (Object.values(priceMap).includes(input)) return input;
  return null;
}

function computePaidStatus(status) {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === 'active' || normalized === 'trialing';
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

    if (invoiceHistory.length) {
      updatePayload.invoiceHistory = invoiceHistory;
    }

    if (latestInvoicePayload) {
      updatePayload.lastInvoice = latestInvoicePayload;
    }

    await userRef.set(updatePayload, { merge: true });
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
        expand: ['lines.data.price.product'],
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
    secrets: [STRIPE_SECRET_KEY, PUBLIC_BASE_URL, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY],
  },
  async (req, res) => {
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
      res.status(400).json({ error: 'Invalid price selection.' });
      return;
    }

    const planKey = plan || Object.entries(getPriceMap()).find(([, value]) => value === resolvedPriceId)?.[0] || null;
    const normalizedEmail = (decodedToken?.email || email || '').trim().toLowerCase();
    const customerUid = decodedToken?.uid || uid || '';

    const shouldEvaluateTrial = Boolean(trialRequested);
    const TRIAL_PERIOD_DAYS = 7;
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
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      const publicBase = PUBLIC_BASE_URL.value().replace(/\/?$/, '');
      const successParams = new URLSearchParams({ checkout: 'success' });
      if (planKey) {
        successParams.set('plan', planKey);
      }
      const successQuery = successParams.toString();
      const successUrl = `${publicBase}/signup.html?${successQuery}${successQuery ? '&' : ''}session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${publicBase}/signup.html?checkout=cancel`;

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
        line_items: [
          {
            price: resolvedPriceId,
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

      res.json({ url: session.url });
    } catch (error) {
      logger.error('Checkout session creation failed', error);
      res.status(500).json({ error: 'Unable to create checkout session.' });
    }
  }
);

export const createPortal = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY, PUBLIC_BASE_URL],
  },
  async (req, res) => {
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

      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      const returnUrl = `${PUBLIC_BASE_URL.value().replace(/\/?$/, '')}/signup.html?checkout=return`;

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
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
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

      if (!customerId) {
        res.status(404).json({ error: 'This admin is not yet linked to Stripe billing. Please contact support to enable billing.' });
        return;
      }

      let limit = parseInt(req.query.limit, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        limit = 10;
      }
      if (limit > 50) {
        limit = 50;
      }

      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      const { data } = await stripe.invoices.list({
        customer: customerId,
        limit,
        expand: ['data.lines.data.price.product'],
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

      res.json({ customerId, invoices });
    } catch (error) {
      logger.error('Invoice list retrieval failed', error);
      res.status(500).json({ error: 'Unable to fetch invoices.' });
    }
  }
);

export const listSubscriptions = onRequest(
  {
    cors: true,
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
      const subscription = userData.subscription || null;
      const subscriptionHistory = Array.isArray(userData.subscriptionHistory)
        ? [...userData.subscriptionHistory]
        : [];
      const invoiceHistory = Array.isArray(userData.invoiceHistory)
        ? [...userData.invoiceHistory]
        : [];
      const lastInvoice = userData.lastInvoice || null;

      subscriptionHistory.sort((a, b) => (b?.recordedAtMs || 0) - (a?.recordedAtMs || 0));
      invoiceHistory.sort((a, b) => (b?.created || 0) - (a?.created || 0));

      res.json({
        subscription,
        subscriptionHistory,
        invoiceHistory,
        lastInvoice,
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
      const subscription = userData.subscription || {};
      const subscriptionId = subscription.id || null;

      if (!subscriptionId) {
        res.status(400).json({ error: 'No active subscription found to cancel.' });
        return;
      }

      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
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

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const signature = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (error) {
      logger.error('Stripe webhook signature verification failed', error);
      res.status(400).send(`Webhook Error: ${error.message}`);
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

      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook handler failed', error);
      res.status(500).send('Internal Server Error');
    }
  }
);
