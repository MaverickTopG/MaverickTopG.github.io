import { appState } from './state.js';
import { showMessage, setTextContent } from './ui.js';
import { auth } from './firebase.js';

const STRIPE_PUBLISHABLE_KEY = 'pk_test_…'; // replace with your key

export function initBillingModule() {
  if (!appState.isBillingInitialized) {
    // The functions are now called via fetch, so no special initialization is needed here.
    // We just need to ensure the event listener is attached.
    const dashboardEl = document.getElementById('dashboardSection');
    if (!dashboardEl) {
      console.error("Dashboard element not found for billing event delegation.");
      return;
    }

    dashboardEl.addEventListener('click', handleBillingActions);

    const manageBillingBtn = document.getElementById('manageBilling');
    manageBillingBtn?.addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user) {
        showMessage("You must be signed in to manage your subscription.", "error");
        return;
      }
      manageBillingBtn.classList.add('is-loading');
      manageBillingBtn.disabled = true;
      try {
        const res = await fetch('/api/portal', { method: 'POST' });
        const { url } = await res.json();
        location.href = url;
      } catch (error) {
        showMessage('Could not open billing portal.', 'error');
        manageBillingBtn.classList.remove('is-loading');
        manageBillingBtn.disabled = false;
      }
    });

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

  const user = auth.currentUser;
  if (!user) {
    showMessage("You must be signed in to start a subscription.", "error");
    button.classList.remove('is-loading');
    button.disabled = false;
    return;
  }

  try {
    const idToken = await user.getIdToken();
    const response = await fetch('/api/createCheckout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ priceId, plan, email: user.email, uid: user.uid })
    });

    if (!response.ok) throw new Error(await response.text());

    const { url } = await response.json();
    window.location.assign(url);
  } catch (error) {
    console.error('Stripe checkout error:', error);
    showMessage(`Error creating checkout session: ${error.message}`, 'error');
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

async function redirectToCustomerPortal() {
  // The button is already managed by the handleBillingActions function,
  // which adds loading states. We can simplify this function.
  const portalButton = document.querySelector('[data-customer-portal].is-loading');
  
  const user = auth.currentUser;
  if (!user) {
    showMessage("You must be signed in to manage your subscription.", "error");
    if (portalButton) {
      portalButton.classList.remove('is-loading');
      portalButton.disabled = false;
    }
    return;
  }

  try {
    const idToken = await user.getIdToken();
    const response = await fetch('/api/portal', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    if (!response.ok) throw new Error(await response.text());
    const { url } = await response.json();
    window.location.assign(url);
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
    await user.getIdToken(true);
    const tokenResult = await user.getIdTokenResult();
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
  const price    = plan?.amount ? `${(plan.amount/100).toFixed(0)}` : '';

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
      ? `${(latest_invoice.amount_due/100).toFixed(2)}`
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
              ${(item.price.unit_amount/100).toFixed(2)} / ${item.price.recurring.interval}
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
