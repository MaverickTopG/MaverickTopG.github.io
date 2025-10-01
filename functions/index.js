import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const PUBLIC_BASE_URL = defineSecret('PUBLIC_BASE_URL');

initializeApp();
const db = getFirestore();

const PRICE_MAP = {
  monthly: 'price_monthly_placeholder',
  yearly: 'price_yearly_placeholder',
};

function resolvePriceId(input) {
  if (!input) return null;
  if (PRICE_MAP[input]) return PRICE_MAP[input];
  if (Object.values(PRICE_MAP).includes(input)) return input;
  return null;
}

function computePaidStatus(status) {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === 'active' || normalized === 'trialing';
}

async function upsertSubscriptionRecord(stripe, subscription, fallbackEmail) {
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
    product: firstItem.price?.product || null,
    currentPeriodEnd: subscription.current_period_end
      ? subscription.current_period_end * 1000
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    customerId: subscription.customer,
    paid: computePaidStatus(subscription.status),
    updatedAt: new Date().toISOString(),
  };

  if (!email) {
    logger.warn('Subscription update missing email', subscription.id);
    return;
  }

  const normalizedEmail = email.toLowerCase();
  const usersSnapshot = await db
    .collection('users')
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  if (!usersSnapshot.empty) {
    const userRef = usersSnapshot.docs[0].ref;
    await userRef.set(
      { subscription: subscriptionPayload, paid: subscriptionPayload.paid },
      { merge: true }
    );
    await db
      .collection('pendingSubscriptions')
      .doc(normalizedEmail)
      .delete()
      .catch(() => {});
  } else {
    await db
      .collection('pendingSubscriptions')
      .doc(normalizedEmail)
      .set({ subscription: subscriptionPayload }, { merge: true });
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
      await upsertSubscriptionRecord(stripe, subscription, email);
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

  const usersSnapshot = await db
    .collection('users')
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();

  if (!usersSnapshot.empty) {
    await usersSnapshot.docs[0].ref.set({ lastInvoice: invoicePayload }, { merge: true });
  } else {
    await db
      .collection('pendingSubscriptions')
      .doc(normalizedEmail)
      .set({ lastInvoice: invoicePayload }, { merge: true });
  }
}

export const createCheckout = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY, PUBLIC_BASE_URL],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { priceId, plan, email, uid } = req.body || {};
    const resolvedPriceId = resolvePriceId(priceId || plan);

    if (!resolvedPriceId) {
      res.status(400).json({ error: 'Invalid price selection.' });
      return;
    }

    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      const publicBase = PUBLIC_BASE_URL.value();
      const successUrl = `${publicBase.replace(/\/?$/, '')}/signup.html?session=success&plan=${encodeURIComponent(resolvedPriceId)}`;
      const cancelUrl = `${publicBase.replace(/\/?$/, '')}/signup.html?session=cancel`;

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          {
            price: resolvedPriceId,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: email || undefined,
        metadata: {
          uid: uid || '',
          plan: resolvedPriceId,
          email: (email || '').toLowerCase(),
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      logger.error('Checkout session creation failed', error);
      res.status(500).json({ error: 'Unable to create checkout session.' });
    }
  }
);

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
              session.customer_details?.email || session.customer_email || session.metadata?.email
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
            subscription.customer_email
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
