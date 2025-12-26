import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { app } from "./firebase.js";
import { appState } from "./state.js";
import { db } from "./firebase.js";

const functions = getFunctions(app);

// Callable functions
const getSubscriptionStatusCallable = httpsCallable(functions, 'getSubscriptionStatus');
const createCheckoutCallable = httpsCallable(functions, 'createCheckout');
const createPortalCallable = httpsCallable(functions, 'createPortal');
const listInvoicesCallable = httpsCallable(functions, 'listInvoices');
const listSubscriptionsCallable = httpsCallable(functions, 'listSubscriptions');
const cancelSubscriptionCallable = httpsCallable(functions, 'cancelSubscription');

let userSubscriptionUnsubscribe = null;

function setupSubscriptionListener(uid) {
  if (userSubscriptionUnsubscribe) {
    userSubscriptionUnsubscribe();
  }

  const userDocRef = doc(db, 'users', uid);
  userSubscriptionUnsubscribe = onSnapshot(userDocRef, (doc) => {
    if (doc.exists()) {
      const userData = doc.data();
      appState.billing.subscription = userData.subscription || null;
      appState.billing.lastInvoice = userData.lastInvoice || null;
      appState.billing.activity = userData.invoiceHistory || [];
    } else {
      appState.billing.subscription = null;
      appState.billing.lastInvoice = null;
      appState.billing.activity = [];
    }
  });
}

function detachSubscriptionListener() {
  if (userSubscriptionUnsubscribe) {
    userSubscriptionUnsubscribe();
    userSubscriptionUnsubscribe = null;
  }
}

async function getSubscriptionStatus() {
  try {
    const result = await getSubscriptionStatusCallable();
    return result.data;
  } catch (error) {
    console.error("Error getting subscription status:", error);
    return { status: 'inactive', subscription: null };
  }
}

async function createCheckout(plan) {
  return await createCheckoutCallable({ plan });
}

async function createPortal() {
  return await createPortalCallable();
}

async function listInvoices(limit = 10) {
  return await listInvoicesCallable({ limit });
}

async function listSubscriptions() {
  return await listSubscriptionsCallable();
}

async function cancelSubscription() {
  return await cancelSubscriptionCallable();
}

export const billingService = {
  setupSubscriptionListener,
  detachSubscriptionListener,
  getSubscriptionStatus,
  createCheckout,
  createPortal,
  listInvoices,
  listSubscriptions,
  cancelSubscription,
};
