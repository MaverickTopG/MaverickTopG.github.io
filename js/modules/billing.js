import { appState } from './state.js';
import { showMessage, setTextContent } from './ui.js';
import { auth, functions } from './firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js';

const STRIPE_PUBLISHABLE_KEY = 'pk_test_…'; // replace with your key
let customerPortalFunction;
let createCheckoutSessionFunction;

export function initBillingModule() {
  if (!appState.isBillingInitialized) {
    try {
      customerPortalFunction = httpsCallable(functions, 'ext-firestore-stripe-payments-createPortalLink');
      createCheckoutSessionFunction = httpsCallable(functions, 'ext-firestore-stripe-payments-createCheckoutSession');
    } catch (e) {
      console.error("Could not initialize billing functions", e);
      showMessage("Billing functions are not available at the moment.", "error");
      return;
    }

    const dashboardEl = document.getElementById('dashboardSection');
    if (dashboardEl) {
      dashboardEl.addEventListener('click', handleBillingActions);
    }
    appState.isBillingInitialized = true;
  }
  refreshBillingDisplay();
}

async function handleBillingActions(event) {
  const checkoutButton = event.target.closest('.billing-checkout, .plan-checkout');
  const portalButton = event.target.closest('[data-customer-portal]');

  if (checkoutButton) {
    await createCheckoutSession(checkoutButton);
  } else if (portalButton) {
    await redirectToCustomerPortal();
  }
}

export function showBillingGate(status, renewalDate) {
  const gate = document.getElementById('billingGate');
  if (!gate) return;

  setTextContent('billingStatusText', `Your current plan is ${status}.`);
  const renewalEl = document.getElementById('billingRenewalText');
  if (renewalEl && renewalDate) {
    renewalEl.textContent = `Your plan renews on ${new Date(renewalDate).toLocaleDateString()}.`;
    renewalEl.style.display = 'block';
  } else if (renewalEl) {
    renewalEl.style.display = 'none';
  }

  gate.style.display = 'flex';
  document.getElementById('dashboardSection').style.display = 'none';
}

export function hideBillingGate() {
  const gate = document.getElementById('billingGate');
  if (gate) gate.style.display = 'none';
}

async function createCheckoutSession(button) {
  const plan = button.dataset.checkoutPlan;
  const priceId = plan === 'yearly'
    ? 'price_1PPfJQRxL0hMhYyI8s7t6r5f'
    : 'price_1PPfJQRxL0hMhYyI4t3y2x1w';

  button.classList.add('is-loading');
  button.disabled = true;

  try {
    const { data } = await createCheckoutSessionFunction({
      price: priceId,
      success_url: window.location.href,
      cancel_url: window.location.href,
      allow_promotion_codes: true,
      trial_from_plan: false,
    });
    window.location.assign(data.url);
  } catch (error) {
    console.error('Stripe checkout error:', error);
    showMessage(`Error creating checkout session: ${error.message}`, 'error');
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

async function redirectToCustomerPortal() {
  const portalButton = document.querySelector('[data-customer-portal]');
  if (portalButton) {
    portalButton.classList.add('is-loading');
    portalButton.disabled = true;
  }

  try {
    const { data } = await customerPortalFunction({ returnUrl: window.location.href });
    window.location.assign(data.url);
  } catch (error) {
    console.error('Customer portal error:', error);
    showMessage(`Error opening customer portal: ${error.message}`, 'error');
    if (portalButton) {
      portalButton.classList.remove('is-loading');
      portalButton.disabled = false;
    }
  }
}

export async function refreshBillingDisplay() {
  const user = auth.currentUser;
  if (!user) {
    updateBillingUI(null);
    updateBillingDebug(null);
    return;
  }

  try {
    const tokenResult = await user.getIdTokenResult(true);
    const claims = tokenResult.claims;
    const stripeRole = claims.stripeRole;
    const subscription = appState.currentAdmin?.subscription;

    updateBillingUI(subscription, stripeRole);
    updateBillingDebug(claims, subscription);
  } catch (error) {
    console.error("Error refreshing billing display:", error);
    updateBillingUI(null);
    updateBillingDebug(null);
  }
}

function updateBillingUI(subscription, stripeRole) {
  const planNameEl        = document.getElementById('billingPlanName');
  const planAmountEl      = document.getElementById('billingPlanAmount');
  const renewalCopyEl     = document.getElementById('billingRenewalCopy');
  const statusPillEl      = document.getElementById('billingStatusPill');
  const trialCountdownEl  = document.getElementById('billingTrialCountdown');
  const portalBtn         = document.querySelector('[data-customer-portal]');
  const activityList      = document.getElementById('billingActivityList');

  if (portalBtn) {
    portalBtn.style.display = stripeRole ? 'inline-flex' : 'none';
  }

  if (!subscription || !subscription.status) {
    planNameEl.textContent       = 'No active plan';
    planAmountEl.textContent     = 'Choose a plan to unlock the admin experience.';
    renewalCopyEl.textContent    = 'No renewal scheduled.';
    statusPillEl.textContent     = 'Inactive';
    statusPillEl.className       = 'status-pill pill-muted';
    trialCountdownEl.style.display = 'none';
    if (activityList) activityList.innerHTML = '<li class="empty">No subscription items found.</li>';
    return;
  }

  const {
    status,
    trial_end,
    current_period_end,
    plan,
    cancel_at_period_end,
    latest_invoice,
    items
  } = subscription;

  const interval = plan?.interval || 'month';
  const price    = plan?.amount ? `$${(plan.amount/100).toFixed(0)}` : '';

  planNameEl.textContent   = `${interval.charAt(0).toUpperCase() + interval.slice(1)} Plan`;
  planAmountEl.textContent = `${price}/${interval}`;
  statusPillEl.textContent = status;
  statusPillEl.className   = `status-pill pill-${status.match(/active|trialing/) ? 'active' : 'warning'}`;

  // Trial vs renewal copy
  if (status === 'trialing' && trial_end) {
    const endDate = trial_end.toDate();
    const daysLeft = Math.ceil((endDate - Date.now())/(1000*60*60*24));
    trialCountdownEl.textContent = `You have ${daysLeft} days left in your trial.`;
    trialCountdownEl.style.display = 'block';
    renewalCopyEl.textContent      = `Your trial ends on ${endDate.toLocaleDateString()}.`;
  } else {
    trialCountdownEl.style.display = 'none';
    if (cancel_at_period_end) {
      renewalCopyEl.textContent = `Your plan will be cancelled on ${current_period_end.toDate().toLocaleDateString()}.`;
    } else {
      renewalCopyEl.textContent = `Your plan renews on ${current_period_end.toDate().toLocaleDateString()}.`;
    }
  }

  // Invoice details
  if (latest_invoice) {
    setTextContent('billingInvoiceAmount', latest_invoice.amount_due > 0
      ? `$${(latest_invoice.amount_due/100).toFixed(2)}`
      : 'Paid');
    setTextContent('billingInvoiceStatus', latest_invoice.status);
    setTextContent('billingInvoiceDate', latest_invoice.created
      ? new Date(latest_invoice.created*1000).toLocaleDateString()
      : '—');
    const badge = document.getElementById('billingInvoiceBadge');
    if (badge) {
      badge.textContent = latest_invoice.status;
      badge.className   = `status-pill pill-${latest_invoice.status === 'paid' ? 'active' : 'warning'}`;
    }
    const link = document.getElementById('billingInvoiceLink');
    if (link) {
      if (latest_invoice.hosted_invoice_url) {
        link.href = latest_invoice.hosted_invoice_url;
        link.style.display = 'inline-flex';
      } else {
        link.style.display = 'none';
      }
    }
  }

  // Activity list
  if (activityList) {
    activityList.innerHTML = items && items.length
      ? items.map(item => `
          <li>
            <div class="activity-meta">
              <span>${item.price.product?.name || 'Subscription Item'}</span>
              <small>Quantity: ${item.quantity}</small>
            </div>
            <div class="activity-status">
              $${(item.price.unit_amount/100).toFixed(2)} / ${item.price.recurring.interval}
            </div>
          </li>
        `).join('')
      : '<li class="empty">No subscription items found.</li>';
  }
}

function updateBillingDebug(claims, subscription) {
  const debugEl = document.getElementById('billingDebugContent');
  if (!debugEl) return;

  if (!auth.currentUser) {
    debugEl.textContent = 'Not signed in.';
    return;
  }

  const toDate = ts => {
    if (!ts) return 'n/a';
    return typeof ts.toDate === 'function'
      ? ts.toDate().toLocaleString()
      : (new Date(ts*1000)).toLocaleString();
  };

  debugEl.textContent = `
    claims.stripeRole:      ${claims?.stripeRole  || 'n/a'}
    claims.exp:             ${toDate(claims?.exp)}

    subscription.id:        ${subscription?.id    || 'n/a'}
    subscription.status:    ${subscription?.status|| 'n/a'}
    subscription.trial_end: ${toDate(subscription?.trial_end)}
    subscription.current_period_end: ${toDate(subscription?.current_period_end)}
    subscription.cancel_at_period_end: ${subscription?.cancel_at_period_end || false}

    latest_invoice.id:      ${subscription?.latest_invoice?.id    || 'n/a'}
    latest_invoice.status:  ${subscription?.latest_invoice?.status|| 'n/a'}
    latest_invoice.paid:    ${subscription?.latest_invoice?.paid  || 'n/a'}
  `.trim();
}

export function subscribeToSubscriptionChanges() {
  // listen for Firestore updates and call refreshBillingDisplay()
}
