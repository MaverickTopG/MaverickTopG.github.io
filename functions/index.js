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

  const firstItem = subscription.items?.data?.[0] || {};
  const subscriptionPayload = {
    id: subscription.id,
    status: subscription.status,
    plan: firstItem.price?.id || null,
    planKey: subscription.metadata?.plan_key || null,
    product: firstItem.price?.product || null,
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

  if (userDoc) {
    const userRef = userDoc.ref;
    await userRef.set(
      {
        subscription: subscriptionPayload,
        paid: subscriptionPayload.paid,
        emailNormalized: normalizedEmail || userDoc.get('emailNormalized') || null,
        stripeCustomerId: subscription.customer,
      },
      { merge: true }
    );
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
    if (normalizedEmail) {
      await db
        .collection('pendingSubscriptions')
        .doc(normalizedEmail)
        .set(
          {
            emailNormalized: normalizedEmail,
            subscription: subscriptionPayload,
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
  let email =
    invoice.customer_email ||
    invoice.account_tax_ids?.[0]?.email ||
    null;
  let subscription = null;

  try {
    if (invoice.subscription) {
      subscription = await stripe.subscriptions.retrieve(invoice.subscription);
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

  if (!email && invoice.customer) {
    try {
      const customer = await stripe.customers.retrieve(invoice.customer);
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
  const invoicePayload = {
    id: invoice.id,
    status: statusLabel,
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    created: invoice.created ? invoice.created * 1000 : Date.now(),
  };

  const userDoc = await findUserDocByEmail(normalizedEmail, email);

  if (userDoc) {
    await userDoc.ref.set({ lastInvoice: invoicePayload, emailNormalized: normalizedEmail }, { merge: true });
  } else {
    await db
      .collection('pendingSubscriptions')
      .doc(normalizedEmail)
      .set({ emailNormalized: normalizedEmail, lastInvoice: invoicePayload }, { merge: true });
    if (email && email !== normalizedEmail) {
      await db
        .collection('pendingSubscriptions')
        .doc(email)
        .set({ emailNormalized: normalizedEmail, lastInvoice: invoicePayload }, { merge: true });
    }
    const invoiceUid = subscription?.metadata?.uid || subscription?.metadata?.user_uid || null;
    if (invoiceUid) {
      await db
        .collection('pendingSubscriptions')
        .doc(invoiceUid)
        .set({ emailNormalized: normalizedEmail, lastInvoice: invoicePayload }, { merge: true });
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
    const { priceId, plan, email, uid } = req.body || {};
    const resolvedPriceId = resolvePriceId(priceId || plan);

    if (!resolvedPriceId) {
      res.status(400).json({ error: 'Invalid price selection.' });
      return;
    }

    const planKey = plan || Object.entries(getPriceMap()).find(([, value]) => value === resolvedPriceId)?.[0] || null;
    const normalizedEmail = (decodedToken?.email || email || '').trim().toLowerCase();
    const customerUid = decodedToken?.uid || uid || '';

    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      const publicBase = PUBLIC_BASE_URL.value().replace(/\/?$/, '');
      const successParams = new URLSearchParams({ checkout: 'success' });
      if (planKey) {
        successParams.set('plan', planKey);
      }
      const successUrl = `${publicBase}/signup.html?${successParams.toString()}`;
      const cancelUrl = `${publicBase}/signup.html?checkout=cancel`;

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
        subscription_data: {
          // trial_period_days: 7,
          metadata: {
            plan_key: planKey || '',
            uid: customerUid,
          },
        },
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
      const customerId = subscription.customerId || subscription.customer_id;

      if (!customerId) {
        res.status(400).json({ error: 'No Stripe customer found for this admin.' });
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
      res.status(500).json({ error: 'Unable to create customer portal session.' });
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
              session.subscription
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
