import { appState } from './state.js';
import { showMessage, setTextContent } from './ui.js';
import { auth } from './firebase.js';

const STRIPE_PUBLISHABLE_KEY = 'pk_test_…'; // replace with your key
const FALLBACK_PRICE_MONTHLY = 'price_1SDIUBHbGg7F5Ky7Ix6qd5mR';
const FALLBACK_PRICE_YEARLY = 'price_1SDIUuHbGg7F5Ky7FX58nZEJ';

export function bindCheckoutButtons(root = document) {
  const container = typeof root === 'string'
    ? document.querySelector(root)
    : root;

  if (!container) return;
  container.addEventListener('click', handleBillingActions);
}

function resolveBasePriceId(plan) {
  const env = import.meta?.env;
  const w = typeof window !== 'undefined' ? window : undefined;
  if (plan === 'yearly') {
    return w?.STRIPE_PRICE_YEARLY
      || env?.VITE_STRIPE_PRICE_YEARLY
      || FALLBACK_PRICE_YEARLY;
  }
  return w?.STRIPE_PRICE_MONTHLY
    || env?.VITE_STRIPE_PRICE_MONTHLY
    || FALLBACK_PRICE_MONTHLY;
}

export function initBillingModule() {
  if (!appState.isBillingInitialized) {
    // The functions are now called via fetch, so no special initialization is needed here.
    // We just need to ensure the event listener is attached.
    const dashboardEl = document.getElementById('dashboardSection');
    const billingGateEl = document.getElementById('billingGate');
    if (!dashboardEl) {
      console.error("Dashboard element not found for billing event delegation.");
      return;
    }

    bindCheckoutButtons(dashboardEl);
    if (billingGateEl) bindCheckoutButtons(billingGateEl);

    const manageBillingBtn = document.getElementById('manageBilling');
    manageBillingBtn?.addEventListener('click', () => {
      redirectToCustomerPortal(manageBillingBtn);
    });

    appState.isBillingInitialized = true;
  }
  refreshBillingDisplay();
}

async function handleBillingActions(event) {
  const checkoutButton = event.target.closest('[data-checkout-plan]');
  if (checkoutButton) {
    await createCheckoutSession(checkoutButton);
    return;
  }

  const portalButton = event.target.closest('[data-customer-portal]');
  if (portalButton) {
    await redirectToCustomerPortal(portalButton);
    return;
  }

  const invoiceButton = event.target.closest('[data-latest-invoice]');
  if (invoiceButton) {
    openLatestInvoice(invoiceButton);
  }
}

export function showBillingGate(statusOrSubscription, renewalDateInput) {
  const gate = document.getElementById('billingGate');
  if (gate) {
    gate.style.display = 'none';
  }

  const dashboard = document.getElementById('dashboardSection');
  if (dashboard) {
    dashboard.style.display = 'none';
  }

  const authSection = document.getElementById('authSection');
  if (authSection) {
    authSection.style.display = 'flex';
  }

  const signInForm = document.getElementById('signInForm');
  const signupForm = document.getElementById('signupForm');
  const signInToggle = document.getElementById('signInToggle');
  const signupToggle = document.getElementById('signupToggle');

  if (signInForm && signupForm) {
    signInForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
  }

  if (signInToggle) signInToggle.classList.remove('active');
  if (signupToggle) signupToggle.classList.add('active');

  const unlockBtn = document.getElementById('unlockSignupBtn');
  if (unlockBtn) {
    unlockBtn.hidden = false;
  }

  const statusText = typeof statusOrSubscription === 'string'
    ? statusOrSubscription
    : statusOrSubscription?.status
      || statusOrSubscription?.plan?.nickname
      || 'inactive';

  if (statusText) {
    setTextContent('billingStatusText', `Your current plan is ${statusText}.`);
  }

  const renewalEl = document.getElementById('billingRenewalText');
  if (renewalEl) {
    renewalEl.style.display = 'none';
  }

  showMessage('Complete checkout via “See our plans” to unlock your admin workspace.', 'info');
}

export function hideBillingGate() {
  const gate = document.getElementById('billingGate');
  if (gate) gate.style.display = 'none';
}

async function createCheckoutSession(button) {
  const plan = button.dataset.checkoutPlan;
  const priceId = button.dataset.priceId || resolveBasePriceId(plan);

  if (!priceId) {
    console.error('No price id configured for plan:', plan);
    showMessage('Billing configuration missing price ids. Please contact support.', 'error');
    return;
  }

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
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ priceId, plan, email: user.email, uid: user.uid })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Checkout request failed');
    }

    const { url } = await response.json();
    window.location.assign(url);
  } catch (error) {
    console.error('Stripe checkout error:', error);
    showMessage(`Error creating checkout session: ${error.message}`, 'error');
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

async function redirectToCustomerPortal(button) {
  const portalButton = button ?? document.querySelector('[data-customer-portal].is-loading');
  if (portalButton) {
    portalButton.classList.add('is-loading');
    portalButton.disabled = true;
  }

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

function openLatestInvoice(button) {
  if (!button) return;
  const invoiceUrl = button.dataset.invoiceUrl;
  if (!invoiceUrl) {
    showMessage('No invoice available yet.', 'info');
    return;
  }

  window.open(invoiceUrl, '_blank', 'noopener');
  button.blur();
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
  const planNameEl       = document.getElementById('billingPlanName');
  const planAmountEl     = document.getElementById('billingPlanAmount');
  const renewalCopyEl    = document.getElementById('billingRenewalCopy');
  const statusPillEl     = document.getElementById('billingStatusPill');
  const trialCountdownEl = document.getElementById('billingTrialCountdown');
  const actionsCopyEl    = document.getElementById('billingActionsCopy');
  const actionsHintEl    = document.getElementById('billingActionsHint');
  const cancelBtn        = document.getElementById('billingCancelBtn');
  const upgradeBtn       = document.getElementById('billingUpgradeBtn');
  const invoiceBtn       = document.getElementById('billingInvoiceBtn');
  const managePortalBtn  = document.getElementById('manageBilling');
  const activityList     = document.getElementById('billingActivityList');

  const cancelLabel  = cancelBtn?.querySelector('span');
  const upgradeLabel = upgradeBtn?.querySelector('span');
  const invoiceLabel = invoiceBtn?.querySelector('span');

  if (managePortalBtn) {
    managePortalBtn.style.display = stripeRole ? 'inline-flex' : 'none';
    managePortalBtn.disabled = !stripeRole;
    managePortalBtn.classList.remove('is-loading');
  }

  const hasSubscription = Boolean(subscription?.status);

  if (cancelBtn) {
    cancelBtn.style.display = stripeRole && hasSubscription ? 'inline-flex' : 'none';
    cancelBtn.disabled = !stripeRole || !hasSubscription;
    cancelBtn.classList.remove('is-loading');
  }

  const resetInvoiceButton = (labelText = 'View Latest Invoice') => {
    if (!invoiceBtn) return;
    invoiceBtn.disabled = true;
    delete invoiceBtn.dataset.invoiceUrl;
    if (invoiceLabel) invoiceLabel.textContent = labelText;
  };

  if (!hasSubscription) {
    if (planNameEl) planNameEl.textContent = 'No active plan';
    if (planAmountEl) planAmountEl.textContent = 'Choose a plan to unlock the admin experience.';
    if (renewalCopyEl) renewalCopyEl.textContent = 'No renewal scheduled.';
    if (statusPillEl) {
      statusPillEl.textContent = 'Inactive';
      statusPillEl.className = 'status-pill pill-muted';
    }
    if (trialCountdownEl) trialCountdownEl.style.display = 'none';
    if (actionsCopyEl) actionsCopyEl.textContent = 'Billing actions will appear once a subscription is active.';
    if (actionsHintEl) actionsHintEl.textContent = 'Complete checkout to cancel renewals or download invoices.';
    if (upgradeBtn) {
      upgradeBtn.disabled = true;
      upgradeBtn.classList.remove('is-loading');
      upgradeBtn.removeAttribute('data-checkout-plan');
      upgradeBtn.removeAttribute('data-customer-portal');
      delete upgradeBtn.dataset.priceId;
      if (upgradeLabel) upgradeLabel.textContent = 'Upgrade Plan';
    }
    resetInvoiceButton();
    if (activityList) activityList.innerHTML = '<li class="empty">No subscription items found.</li>';
    return;
  }

  const normalizeDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
    return null;
  };

  const status = subscription.status || 'inactive';
  const rawItems = subscription.items;
  const billingItems = Array.isArray(rawItems?.data)
    ? rawItems.data
    : Array.isArray(rawItems)
      ? rawItems
      : [];
  const firstItem = billingItems[0];
  const interval = subscription.plan?.interval
    || subscription.plan_interval
    || firstItem?.price?.recurring?.interval
    || 'month';
  const amountCents = subscription.plan?.amount
    ?? subscription.planAmount
    ?? firstItem?.price?.unit_amount;
  const priceCopy = typeof amountCents === 'number'
    ? `$${(amountCents / 100).toFixed(2)}/${interval}`
    : '—';
  const trialEndDate = normalizeDate(subscription.trial_end || subscription.trialEnd);
  const periodEndDate = normalizeDate(subscription.current_period_end || subscription.currentPeriodEnd);
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end || subscription.cancelAtPeriodEnd);
  const latestInvoice = subscription.latest_invoice || null;

  if (planNameEl) planNameEl.textContent = `${interval.charAt(0).toUpperCase() + interval.slice(1)} Plan`;
  if (planAmountEl) planAmountEl.textContent = priceCopy;
  if (statusPillEl) {
    statusPillEl.textContent = status;
    const statusClass = /active|trialing/i.test(status) ? 'active' : 'warning';
    statusPillEl.className = `status-pill pill-${statusClass}`;
  }

  if (trialCountdownEl) {
    if (status === 'trialing' && trialEndDate) {
      const daysLeft = Math.max(0, Math.ceil((trialEndDate - Date.now()) / (1000 * 60 * 60 * 24)));
      trialCountdownEl.textContent = `You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your trial.`;
      trialCountdownEl.style.display = 'block';
    } else {
      trialCountdownEl.style.display = 'none';
    }
  }

  if (renewalCopyEl) {
    if (cancelAtPeriodEnd && periodEndDate) {
      renewalCopyEl.textContent = `Your plan will be cancelled on ${periodEndDate.toLocaleDateString()}.`;
    } else if (periodEndDate) {
      renewalCopyEl.textContent = `Your plan renews on ${periodEndDate.toLocaleDateString()}.`;
    } else {
      renewalCopyEl.textContent = '';
    }
  }

  if (actionsCopyEl) {
    actionsCopyEl.textContent = cancelAtPeriodEnd
      ? 'Your plan is scheduled to cancel at the end of this billing period.'
      : 'Need to make changes? Cancel or manage your subscription below.';
  }

  if (actionsHintEl) {
    const invoiceDate = latestInvoice?.created
      ? new Date(latestInvoice.created * 1000).toLocaleDateString()
      : null;
    actionsHintEl.textContent = latestInvoice?.hosted_invoice_url
      ? `Last invoice generated on ${invoiceDate || '—'}.`
      : 'Invoices will appear here after your first payment.';
  }

  if (upgradeBtn) {
    upgradeBtn.disabled = false;
    upgradeBtn.classList.remove('is-loading');
    const intervalKey = interval.toLowerCase();
    if (intervalKey === 'month' || intervalKey === 'monthly') {
      upgradeBtn.setAttribute('data-checkout-plan', 'yearly');
      upgradeBtn.removeAttribute('data-customer-portal');
      upgradeBtn.dataset.priceId = resolveBasePriceId('yearly');
      if (upgradeLabel) upgradeLabel.textContent = 'Upgrade to Yearly';
    } else {
      upgradeBtn.removeAttribute('data-checkout-plan');
      upgradeBtn.setAttribute('data-customer-portal', '');
      delete upgradeBtn.dataset.priceId;
      if (upgradeLabel) upgradeLabel.textContent = 'Manage Plan in Stripe';
    }
  }

  if (cancelLabel) {
    cancelLabel.textContent = cancelAtPeriodEnd ? 'Manage Cancellation' : 'Cancel Billing';
  }

  if (invoiceBtn) {
    if (latestInvoice?.hosted_invoice_url) {
      invoiceBtn.disabled = false;
      invoiceBtn.dataset.invoiceUrl = latestInvoice.hosted_invoice_url;
      if (invoiceLabel) invoiceLabel.textContent = 'View Latest Invoice';
    } else {
      resetInvoiceButton('No Invoice Yet');
    }
  }

  if (activityList) {
    activityList.innerHTML = billingItems.length
      ? billingItems.map(item => `
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
