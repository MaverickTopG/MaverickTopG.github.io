import { appState } from './state.js';
import { showMessage, setTextContent } from './ui.js';
import { auth } from './firebase.js';

const STRIPE_PUBLISHABLE_KEY = 'pk_test_…'; // replace with your key
const FALLBACK_PRICE_MONTHLY = 'price_1SDIUBHbGg7F5Ky7Ix6qd5mR';
const FALLBACK_PRICE_YEARLY = 'price_1SDIUuHbGg7F5Ky7FX58nZEJ';
const SIGNUP_CHECKOUT_EMAIL_KEY = 'signup_checkout_email';

let latestInvoiceFetchPromise = null;
let invoiceHistoryFetchPromise = null;
let subscriptionDatasetFetchPromise = null;
let planOverlayKeyHandler = null;
let billingLoaderEl = null;

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

    const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');
    cancelSubscriptionBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = cancelSubscriptionBtn.dataset.action || 'cancel';
      if (action === 'reactivate') {
        openReactivateOverlay();
      } else {
        cancelRecurringSubscription(cancelSubscriptionBtn);
      }
    });

    const billingGateCloseBtn = document.getElementById('billingGateClose');
    billingGateCloseBtn?.addEventListener('click', () => {
      closePlanOverlay();
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
}

export function hideBillingGate() {
  const gate = document.getElementById('billingGate');
  if (gate) gate.style.display = 'none';
}

async function createCheckoutSession(button) {
  closePlanOverlay();

  const plan = button.dataset.checkoutPlan;
  const priceId = button.dataset.priceId || resolveBasePriceId(plan);

  if (!priceId) {
    console.error('No price id configured for plan:', plan);
    showMessage('Billing configuration missing price ids. Please contact support.', 'error');
    return;
  }

  button.classList.add('is-loading');
  button.disabled = true;
  showBillingLoader('Connecting to Stripe…');

  try {
    const user = auth.currentUser;
    let idToken = null;
    let email = null;
    let uid = null;

    if (user) {
      idToken = await user.getIdToken();
      email = user.email;
      uid = user.uid;
    } else if (typeof document !== 'undefined') {
      const signupEmailInput = document.getElementById('signupEmail');
      email = signupEmailInput?.value?.trim() || null;
    }

    const currentInterval = appState.currentAdmin?.subscription?.plan?.interval
      || appState.currentAdmin?.subscription?.plan_interval
      || appState.currentAdmin?.subscription?.interval
      || null;

    const currentStatus = (appState.currentAdmin?.subscription?.status || '').toLowerCase();
    const hasScheduledCancel = Boolean(appState.currentAdmin?.subscription?.cancel_at_period_end);

    if (currentInterval) {
      if ((currentInterval === 'year' || currentInterval === 'yearly') && plan === 'monthly') {
        showMessage('Thanks! As soon as your current yearly term wraps, we’ll start your monthly plan and comp the first month from this payment.', 'info');
      } else if ((currentInterval === 'month' || currentInterval === 'monthly') && plan === 'yearly') {
        showMessage('Once this payment completes, we’ll roll you into yearly billing at the end of your current monthly cycle.', 'info');
      }
    } else if (currentStatus === 'canceled' || hasScheduledCancel) {
      showMessage('We’ll reactivate your subscription as soon as checkout completes.', 'info');
    }

    if (typeof window !== 'undefined') {
      try {
        if (email) {
          sessionStorage.setItem(SIGNUP_CHECKOUT_EMAIL_KEY, email);
        }
      } catch (err) {
        console.warn('Unable to persist checkout email', err);
      }
    }

    const headers = { 'Content-Type': 'application/json' };
    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({ priceId, plan, email, uid })
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
    hideBillingLoader();
    return;
  }

  hideBillingLoader();
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
    if (!response.ok) {
      const status = response.status;
      let errorMessage = 'Unable to open billing portal.';
      try {
        const payload = await response.json();
        if (payload?.error) errorMessage = payload.error;
      } catch (parseErr) {
        const text = await response.text();
        if (text) errorMessage = text;
      }

      if (status === 400) {
        errorMessage = 'Billing portal is not configured for this workspace yet. Reactivate or change plans using the buttons below.';
      }

      throw new Error(errorMessage);
    }
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

async function cancelRecurringSubscription(button) {
  if (!button) return;
  if (!window.confirm('Cancel future renewals? Charges already processed are non-refundable. We will preserve your data so you can resubscribe later.')) {
    return;
  }

  button.classList.add('is-loading');
  button.disabled = true;
  showBillingLoader('Updating subscription…');

  const user = auth.currentUser;
  if (!user) {
    showMessage('Please sign in before managing billing.', 'error');
    button.classList.remove('is-loading');
    button.disabled = false;
    hideBillingLoader();
    return;
  }

  try {
    const idToken = await user.getIdToken();
    const response = await fetch('/api/cancelSubscription', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}` }
    });

    if (!response.ok) {
      let errorMessage = 'Unable to cancel subscription.';
      try {
        const payload = await response.json();
        if (payload?.error) errorMessage = payload.error;
      } catch (parseErr) {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const endDate = data?.current_period_end ? new Date(data.current_period_end).toLocaleDateString() : 'the end of this billing period';
    if (appState.currentAdmin) {
      const existing = appState.currentAdmin.subscription || {};
      appState.currentAdmin = {
        ...appState.currentAdmin,
        subscription: {
          ...existing,
          status: data?.status || existing.status || 'canceled',
          cancel_at_period_end: data?.cancel_at_period_end ?? true,
          current_period_end: data?.current_period_end ?? existing.current_period_end ?? null,
          cancelAtPeriodEnd: data?.cancel_at_period_end ?? true,
          currentPeriodEnd: data?.current_period_end ?? existing.currentPeriodEnd ?? null,
        }
      };
    }

    showMessage(`Recurring billing cancelled. You can continue using your account until ${endDate}.`, 'success');
    await ensureSubscriptionDataset(true);
    await refreshBillingDisplay({ forceDataset: true });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    showMessage(`Unable to cancel subscription: ${error.message}`, 'error');
  } finally {
    button.classList.remove('is-loading');
    button.disabled = false;
    hideBillingLoader();
  }
}

export async function refreshBillingDisplay(options = {}) {
  const { forceDataset = false } = options || {};
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
    await ensureSubscriptionDataset(forceDataset);
    const subscription = appState.currentAdmin?.subscription;
    updateBillingUI(subscription, stripeRole);
    updateBillingDebug(claims, subscription);
    ensureInvoiceHistory(stripeRole);
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
  const stayMonthlyBtn   = document.getElementById('billingStayMonthlyBtn');
  const upgradeBtn       = document.getElementById('billingUpgradeBtn');
  const invoiceBtn       = document.getElementById('billingInvoiceLink');
  const invoiceLinkEl    = invoiceBtn;
  const cancelSubscriptionBtn  = document.getElementById('cancelSubscriptionBtn');
  const activityList     = document.getElementById('billingActivityList');

  const stayLabel    = ensureButtonLabel(stayMonthlyBtn, stayMonthlyBtn?.textContent?.trim() || '');
  const upgradeLabel = ensureButtonLabel(upgradeBtn, upgradeBtn?.textContent?.trim() || '');
  const cancelLabel  = ensureButtonLabel(cancelSubscriptionBtn, 'Cancel Subscription');
  const invoiceLabel = invoiceBtn ? ensureButtonLabel(invoiceBtn, invoiceBtn.textContent?.trim() || '') : null;

  const invoiceElements = {
    amountEl: document.getElementById('billingInvoiceAmount'),
    statusEl: document.getElementById('billingInvoiceStatus'),
    dateEl: document.getElementById('billingInvoiceDate'),
    badgeEl: document.getElementById('billingInvoiceBadge'),
    buttonEl: invoiceBtn,
    linkEl: invoiceLinkEl,
    labelEl: invoiceLabel,
    hintEl: actionsHintEl
  };

  const hasSubscription = Boolean(subscription?.status || subscription?.id);
  const hasPortalCustomer = Boolean(
    subscription?.customerId
    || subscription?.customer_id
    || subscription?.customer
    || appState.currentAdmin?.stripeCustomerId
    || appState.currentAdmin?.stripeCustomer
  );
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end || subscription?.cancelAtPeriodEnd);
  const subscriptionStatus = (subscription?.status || '').toLowerCase();
  const isCanceledStatus = subscriptionStatus === 'canceled';
  const wantsReactivate = cancelAtPeriodEnd || isCanceledStatus;

  if (cancelSubscriptionBtn) {
    const canCancel = hasSubscription && hasPortalCustomer && !wantsReactivate;
    cancelSubscriptionBtn.style.display = hasSubscription ? 'inline-flex' : 'none';
    cancelSubscriptionBtn.classList.remove('is-loading');

    if (wantsReactivate) {
      cancelSubscriptionBtn.dataset.action = 'reactivate';
      cancelSubscriptionBtn.disabled = false;
      cancelSubscriptionBtn.style.opacity = '';
      cancelSubscriptionBtn.style.pointerEvents = '';
      const reactivateTitle = 'Reactivate your subscription by selecting a plan';
      cancelSubscriptionBtn.title = reactivateTitle;
      cancelSubscriptionBtn.setAttribute('aria-label', reactivateTitle);
      if (cancelLabel) {
        cancelLabel.textContent = 'Reactivate Plan';
      }
    } else {
      cancelSubscriptionBtn.dataset.action = 'cancel';
      cancelSubscriptionBtn.disabled = !canCancel;
      cancelSubscriptionBtn.style.opacity = canCancel ? '' : '0.6';
      cancelSubscriptionBtn.style.pointerEvents = canCancel ? '' : 'none';
      const cancelTitle = hasPortalCustomer
        ? 'Cancel subscription'
        : 'Link a billing profile to manage cancellations.';
      cancelSubscriptionBtn.title = cancelTitle;
      cancelSubscriptionBtn.setAttribute('aria-label', cancelTitle);
      if (cancelLabel) {
        cancelLabel.textContent = 'Cancel Subscription';
      }
    }
  }

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
    lockPlanOptions(null, true);
    updateInvoiceSection(null, invoiceElements);
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
    ?? subscription.amount
    ?? firstItem?.price?.unit_amount;
  const currencyCode = subscription.currency
    || subscription.plan?.currency
    || firstItem?.price?.currency
    || 'usd';
  const recurringPrice = typeof amountCents === 'number'
    ? `${formatMoney(amountCents, currencyCode)}${interval ? ` / ${interval}` : ''}`
    : null;
  const trialEndDate = normalizeDate(subscription.trial_end || subscription.trialEnd);
  const periodStartDate = normalizeDate(subscription.current_period_start || subscription.currentPeriodStart);
  const periodEndDate = normalizeDate(subscription.current_period_end || subscription.currentPeriodEnd);
  const latestInvoice = subscription.latest_invoice
    || subscription.lastInvoice
    || appState.currentAdmin?.lastInvoice
    || null;
  const normalizedInvoice = normalizeInvoiceForUi(latestInvoice);

  const subscriptionHistory = Array.isArray(appState.currentAdmin?.subscriptionHistory)
    ? appState.currentAdmin.subscriptionHistory
    : [];
  const invoiceHistory = Array.isArray(appState.currentAdmin?.invoiceHistory)
    ? appState.currentAdmin.invoiceHistory
    : [];

  if (planNameEl) {
    const intervalLabel = interval
      ? `${interval.charAt(0).toUpperCase() + interval.slice(1)} Plan`
      : 'Subscription';
    planNameEl.textContent = intervalLabel;
  }

  const nextBillingTimestamp = resolveNextBillingTimestamp(subscription, subscriptionHistory, invoiceHistory);
  let nextBillingCopy = formatDisplayDate(nextBillingTimestamp, 'Not scheduled');
  if (isCanceledStatus) {
    nextBillingCopy = 'Canceled';
  } else if (cancelAtPeriodEnd && nextBillingTimestamp) {
    nextBillingCopy = formatDisplayDate(nextBillingTimestamp, 'Scheduled to cancel');
  }

  const intervalKey = interval.toLowerCase();

  if (stayMonthlyBtn) {
    stayMonthlyBtn.disabled = false;
    stayMonthlyBtn.classList.remove('is-loading');
    stayMonthlyBtn.setAttribute('data-checkout-plan', 'monthly');
    stayMonthlyBtn.dataset.priceId = resolveBasePriceId('monthly');
    stayMonthlyBtn.removeAttribute('data-customer-portal');
    if (stayLabel) {
      if (wantsReactivate) {
        stayLabel.textContent = 'Start Monthly';
      } else if (intervalKey === 'month' || intervalKey === 'monthly') {
        stayLabel.textContent = 'Stay on Monthly';
      } else {
        stayLabel.textContent = 'Switch to Monthly';
      }
    }
  }

  if (planAmountEl) {
    const planLines = [];
    if (recurringPrice) planLines.push(recurringPrice);
    planLines.push(`Next billing: ${nextBillingCopy}`);
    if (cancelAtPeriodEnd && nextBillingTimestamp) {
      planLines.push(`Access through: ${formatDisplayDate(nextBillingTimestamp)}`);
    }
    if (!cancelAtPeriodEnd && (periodStartDate || periodEndDate)) {
      const startCopy = periodStartDate ? periodStartDate.toLocaleDateString() : '—';
      const endCopy = periodEndDate ? periodEndDate.toLocaleDateString() : '—';
      planLines.push(`Current period: ${startCopy} - ${endCopy}`);
    }

    planAmountEl.innerHTML = planLines
      .filter(Boolean)
      .map(escapeHtml)
      .join('<br>');
  }
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

  const nextBillingDate = nextBillingTimestamp ? new Date(nextBillingTimestamp) : null;

  if (renewalCopyEl) {
    if (cancelAtPeriodEnd && nextBillingDate) {
      renewalCopyEl.textContent = `Your plan will be cancelled on ${nextBillingDate.toLocaleDateString()}.`;
    } else if (nextBillingDate) {
      renewalCopyEl.textContent = `Your plan renews on ${nextBillingDate.toLocaleDateString()}.`;
    } else {
      renewalCopyEl.textContent = 'No renewal scheduled.';
    }
  }

  if (actionsCopyEl) {
    if (wantsReactivate) {
      actionsCopyEl.textContent = 'Your plan is canceled. Reactivate to resume uninterrupted access.';
    } else if (cancelAtPeriodEnd) {
      actionsCopyEl.textContent = 'Your plan is scheduled to cancel at the end of this billing period.';
    } else {
      actionsCopyEl.textContent = 'Need to make changes? Cancel or manage your subscription below.';
    }
  }

  if (actionsHintEl) {
    if (wantsReactivate) {
      actionsHintEl.textContent = cancelAtPeriodEnd && nextBillingTimestamp
        ? `You can keep using the admin suite until ${formatDisplayDate(nextBillingTimestamp)}. Reactivate below to avoid any disruption.`
        : 'Reactivate below to restart billing immediately.';
    } else {
      const invoiceDate = normalizedInvoice?.created
        ? new Date(normalizedInvoice.created).toLocaleDateString()
        : null;
      actionsHintEl.textContent = normalizedInvoice?.hosted_invoice_url
        ? `Last invoice generated on ${invoiceDate || '—'}.`
        : 'Invoices will appear here after your first payment.';
    }
  }

  if (upgradeBtn) {
    upgradeBtn.disabled = false;
    upgradeBtn.classList.remove('is-loading');
    upgradeBtn.setAttribute('data-checkout-plan', 'yearly');
    upgradeBtn.removeAttribute('data-customer-portal');
    upgradeBtn.dataset.priceId = resolveBasePriceId('yearly');
    if (upgradeLabel) {
      if (wantsReactivate) {
        upgradeLabel.textContent = 'Start Yearly';
      } else if (intervalKey === 'month' || intervalKey === 'monthly') {
        upgradeLabel.textContent = 'Upgrade to Yearly';
      } else {
        upgradeLabel.textContent = 'Stay on Yearly';
      }
    }
  }

  lockPlanOptions(interval, wantsReactivate);

  updateInvoiceSection(normalizedInvoice, invoiceElements);

  if (activityList) {
    const timeline = buildBillingActivityTimeline({
      subscription,
      subscriptionHistory,
      invoiceHistory,
      latestInvoice: normalizedInvoice,
    });
    renderActivityList(activityList, timeline);
  }

  if (!normalizedInvoice) {
    fetchLatestInvoiceFromServer()
      .then(invoice => {
        if (!invoice) return;
        updateInvoiceSection(invoice, invoiceElements);
        const refreshedHistory = Array.isArray(appState.currentAdmin?.invoiceHistory)
          ? appState.currentAdmin.invoiceHistory
          : [];
        const refreshedTimeline = buildBillingActivityTimeline({
          subscription,
          subscriptionHistory: Array.isArray(appState.currentAdmin?.subscriptionHistory)
            ? appState.currentAdmin.subscriptionHistory
            : subscriptionHistory,
          invoiceHistory: refreshedHistory,
          latestInvoice: invoice,
        });
        if (activityList) {
          renderActivityList(activityList, refreshedTimeline);
        }
      })
      .catch(() => {});
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

function normalizeSubscriptionPayload(subscription) {
  if (!subscription) return null;

  const normalized = { ...subscription };
  normalized.interval = normalized.interval
    || normalized.plan_interval
    || normalized.plan?.interval
    || null;
  normalized.planNickname = normalized.planNickname
    || normalized.plan?.nickname
    || null;
  normalized.amount = typeof normalized.amount === 'number'
    ? normalized.amount
    : typeof normalized.planAmount === 'number'
      ? normalized.planAmount
      : normalized.plan?.amount ?? null;
  normalized.currency = (normalized.currency
    || normalized.plan?.currency
    || 'usd').toLowerCase();
  normalized.currentPeriodStart = toTimestamp(
    normalized.currentPeriodStart
    ?? normalized.current_period_start
  );
  normalized.currentPeriodEnd = toTimestamp(
    normalized.currentPeriodEnd
    ?? normalized.current_period_end
  );
  normalized.cancelAtPeriodEnd = Boolean(
    normalized.cancelAtPeriodEnd
    ?? normalized.cancel_at_period_end
  );
  normalized.kind = normalized.kind || 'subscription';
  return normalized;
}

function normalizeSubscriptionHistoryEntry(entry) {
  if (!entry) return null;
  const normalized = { ...entry };
  normalized.interval = normalized.interval
    || normalized.plan_interval
    || null;
  normalized.recordedAtMs = typeof normalized.recordedAtMs === 'number'
    ? normalized.recordedAtMs
    : toTimestamp(normalized.recordedAt);
  if (!normalized.recordedAt && normalized.recordedAtMs) {
    normalized.recordedAt = new Date(normalized.recordedAtMs).toISOString();
  }
  normalized.currentPeriodStart = toTimestamp(
    normalized.currentPeriodStart
    ?? normalized.current_period_start
  );
  normalized.currentPeriodEnd = toTimestamp(
    normalized.currentPeriodEnd
    ?? normalized.current_period_end
  );
  normalized.kind = normalized.kind || 'subscription';
  normalized.amount = typeof normalized.amount === 'number'
    ? normalized.amount
    : null;
  normalized.currency = (normalized.currency || 'usd').toLowerCase();
  return normalized;
}

async function ensureSubscriptionDataset(force = false) {
  const user = auth.currentUser;
  if (!user) return null;

  if (subscriptionDatasetFetchPromise && !force) {
    return subscriptionDatasetFetchPromise;
  }

  subscriptionDatasetFetchPromise = (async () => {
    const idToken = await user.getIdToken();
    const response = await fetch('/api/subscriptions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` }
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    const normalizedSubscription = normalizeSubscriptionPayload(payload.subscription);
    const normalizedHistory = Array.isArray(payload.subscriptionHistory)
      ? payload.subscriptionHistory
        .map(normalizeSubscriptionHistoryEntry)
        .filter(Boolean)
      : [];
    normalizedHistory.sort((a, b) => (b?.recordedAtMs || 0) - (a?.recordedAtMs || 0));
    const normalizedInvoiceHistory = Array.isArray(payload.invoiceHistory)
      ? payload.invoiceHistory.map(normalizeInvoiceForUi).filter(Boolean)
      : [];
    const normalizedLastInvoice = payload.lastInvoice
      ? normalizeInvoiceForUi(payload.lastInvoice)
      : null;

    const existingAdmin = appState.currentAdmin || {};
    const mergedInvoices = mergeInvoiceHistories(
      existingAdmin.invoiceHistory || [],
      normalizedInvoiceHistory
    );

    appState.currentAdmin = {
      ...existingAdmin,
      subscription: normalizedSubscription || existingAdmin.subscription || null,
      subscriptionHistory: normalizedHistory.length
        ? normalizedHistory
        : (existingAdmin.subscriptionHistory || []),
      invoiceHistory: mergedInvoices,
      lastInvoice: normalizedLastInvoice || existingAdmin.lastInvoice || null,
    };

    return appState.currentAdmin;
  })()
    .catch(error => {
      console.error('Unable to sync subscription dataset:', error);
      return null;
    })
    .finally(() => {
      subscriptionDatasetFetchPromise = null;
    });

  return subscriptionDatasetFetchPromise;
}

function openReactivateOverlay() {
  const gate = document.getElementById('billingGate');
  if (!gate) return;

  const statusTextEl = document.getElementById('billingStatusText');
  const renewalTextEl = document.getElementById('billingRenewalText');

  const subscription = appState.currentAdmin?.subscription || null;
  const subscriptionHistory = Array.isArray(appState.currentAdmin?.subscriptionHistory)
    ? appState.currentAdmin.subscriptionHistory
    : [];
  const invoiceHistory = Array.isArray(appState.currentAdmin?.invoiceHistory)
    ? appState.currentAdmin.invoiceHistory
    : [];

  const nextBillingTimestamp = resolveNextBillingTimestamp(subscription, subscriptionHistory, invoiceHistory);

  if (statusTextEl) {
    statusTextEl.textContent = 'Reactivate your subscription to regain the full admin experience.';
  }

  if (renewalTextEl) {
    if (nextBillingTimestamp) {
      renewalTextEl.textContent = `You retain access until ${formatDisplayDate(nextBillingTimestamp)}.`;
      renewalTextEl.style.display = 'block';
    } else {
      renewalTextEl.textContent = '';
      renewalTextEl.style.display = 'none';
    }
  }

  gate.classList.add('is-visible');
  gate.style.display = 'flex';
  document.body.classList.add('billing-overlay-active');

  if (!planOverlayKeyHandler) {
    planOverlayKeyHandler = (event) => {
      if (event.key === 'Escape') {
        closePlanOverlay();
      }
    };
    document.addEventListener('keydown', planOverlayKeyHandler);
  }
}

function closePlanOverlay() {
  const gate = document.getElementById('billingGate');
  if (!gate) return;

  gate.classList.remove('is-visible');
  gate.style.display = 'none';
  document.body.classList.remove('billing-overlay-active');

  if (planOverlayKeyHandler) {
    document.removeEventListener('keydown', planOverlayKeyHandler);
    planOverlayKeyHandler = null;
  }
}

function ensureBillingLoader() {
  if (billingLoaderEl) return billingLoaderEl;
  billingLoaderEl = document.createElement('div');
  billingLoaderEl.className = 'billing-loader';
  billingLoaderEl.innerHTML = `
    <div class="billing-loader__spinner"></div>
    <span class="billing-loader__text">Preparing checkout…</span>
  `;
  document.body.appendChild(billingLoaderEl);
  return billingLoaderEl;
}

function showBillingLoader(message = 'Preparing checkout…') {
  const loader = ensureBillingLoader();
  const textEl = loader.querySelector('.billing-loader__text');
  if (textEl) textEl.textContent = message;
  requestAnimationFrame(() => {
    loader.classList.add('is-visible');
  });
}

function hideBillingLoader() {
  if (!billingLoaderEl) return;
  billingLoaderEl.classList.remove('is-visible');
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', hideBillingLoader);
}

function normalizeInvoiceForUi(invoice) {
  if (!invoice) return null;

  const amountDue = typeof invoice.amount_due === 'number'
    ? invoice.amount_due
    : typeof invoice.amountDue === 'number'
      ? invoice.amountDue
      : null;

  const amountPaid = typeof invoice.amount_paid === 'number'
    ? invoice.amount_paid
    : typeof invoice.amountPaid === 'number'
      ? invoice.amountPaid
      : null;

  const normalizeTimestamp = (value) => {
    if (!value) return null;
    if (typeof value === 'number') {
      return value < 1e12 ? value * 1000 : value;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value.toDate === 'function') {
      try {
        return value.toDate().getTime();
      } catch (error) {
        return null;
      }
    }
    if (typeof value === 'string') {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        return numeric < 1e12 ? numeric * 1000 : numeric;
      }
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const created = normalizeTimestamp(invoice.created || invoice.createdAt || null);
  const periodStart = normalizeTimestamp(invoice.period_start || invoice.periodStart || null);
  const periodEnd = normalizeTimestamp(invoice.period_end || invoice.periodEnd || null);

  return {
    id: invoice.id || null,
    status: invoice.status || invoice.statusLabel || null,
    amount_due: amountDue,
    amount_paid: amountPaid,
    currency: (invoice.currency || '').toUpperCase(),
    hosted_invoice_url: invoice.hosted_invoice_url || invoice.hostedInvoiceUrl || null,
    invoice_pdf: invoice.invoice_pdf || invoice.invoicePdf || null,
    created,
    period_start: periodStart,
    period_end: periodEnd,
    recordedAtMs: typeof invoice.recordedAtMs === 'number' ? invoice.recordedAtMs : created,
    kind: invoice.kind || 'invoice',
  };
}

function updateInvoiceSection(invoice, elements) {
  if (!elements) return;
  const { amountEl, statusEl, dateEl, badgeEl, buttonEl, linkEl, labelEl, hintEl } = elements;
  const normalized = invoice && (invoice.amount_due !== undefined || invoice.amountDue !== undefined)
    ? invoice
    : normalizeInvoiceForUi(invoice);

  if (!normalized) {
    if (amountEl) amountEl.textContent = '—';
    if (statusEl) statusEl.textContent = 'No invoices yet.';
    if (dateEl) dateEl.textContent = '—';
    if (badgeEl) {
      badgeEl.textContent = 'None';
      badgeEl.className = 'status-pill pill-muted';
    }
    if (buttonEl) {
      buttonEl.disabled = true;
      delete buttonEl.dataset.invoiceUrl;
      if (labelEl) labelEl.textContent = 'View Latest Invoice';
    }
    if (linkEl) {
      linkEl.href = '#';
      linkEl.style.display = 'none';
    }
    if (hintEl) {
      hintEl.textContent = 'Invoices will appear here after your first payment.';
    }
    return;
  }

  const amountDisplay = typeof normalized.amount_due === 'number'
    ? (normalized.amount_due / 100).toFixed(2)
    : '0.00';

  if (amountEl) amountEl.textContent = `$${amountDisplay}`;

  const statusText = normalized.status || '—';
  if (statusEl) statusEl.textContent = `Status: ${statusText}`;
  if (badgeEl) {
    const statusKey = statusText.toLowerCase();
    const badgeClass = statusKey === 'paid'
      ? 'active'
      : statusKey === 'open' || statusKey === 'draft'
        ? 'warning'
        : 'muted';
    badgeEl.textContent = statusText;
    badgeEl.className = `status-pill pill-${badgeClass}`;
  }

  const createdDate = normalized.created ? new Date(normalized.created) : null;
  if (dateEl) dateEl.textContent = createdDate ? createdDate.toLocaleDateString() : '—';

  const invoiceUrl = normalized.hosted_invoice_url || normalized.invoice_pdf || null;
  if (buttonEl) {
    if (invoiceUrl) {
      buttonEl.disabled = false;
      buttonEl.dataset.invoiceUrl = invoiceUrl;
      if (labelEl) labelEl.textContent = 'View Latest Invoice';
    } else {
      buttonEl.disabled = true;
      delete buttonEl.dataset.invoiceUrl;
      if (labelEl) labelEl.textContent = 'Invoice unavailable';
    }
  }

  if (linkEl) {
    if (invoiceUrl) {
      linkEl.href = invoiceUrl;
      linkEl.style.display = 'inline-flex';
      if (!linkEl.textContent.trim()) {
        linkEl.textContent = 'View Latest Invoice';
      }
    } else {
      linkEl.href = '#';
      linkEl.style.display = 'none';
    }
  }

  if (hintEl) {
    const hintDate = normalized.created
      ? new Date(normalized.created).toLocaleDateString()
      : null;
    hintEl.textContent = normalized.hosted_invoice_url
      ? `Last invoice generated on ${hintDate || '—'}.`
      : 'Invoices will appear here after your first payment.';
  }

  if (appState.currentAdmin) {
    const currentSubscription = appState.currentAdmin.subscription || {};
    appState.currentAdmin = {
      ...appState.currentAdmin,
      subscription: { ...currentSubscription, latest_invoice: normalized },
      lastInvoice: normalized
    };
  }
}

function ensureInvoiceHistory(stripeRole, minimum = 2) {
  const currentHistory = Array.isArray(appState.currentAdmin?.invoiceHistory)
    ? appState.currentAdmin.invoiceHistory
    : [];

  if (currentHistory.length >= minimum) return;
  if (invoiceHistoryFetchPromise) return;

  invoiceHistoryFetchPromise = fetchInvoicesFromServer(Math.max(minimum, 12))
    .then(invoices => {
      if (!invoices.length || !appState.currentAdmin) return;

      const mergedHistory = mergeInvoiceHistories(appState.currentAdmin.invoiceHistory, invoices);
      const nextLastInvoice = mergedHistory[0] || appState.currentAdmin.lastInvoice || null;

      appState.currentAdmin = {
        ...appState.currentAdmin,
        invoiceHistory: mergedHistory,
        lastInvoice: nextLastInvoice,
      };

      const subscription = appState.currentAdmin.subscription || null;
      updateBillingUI(subscription, stripeRole);
    })
    .catch(error => {
      console.error('Unable to hydrate invoice history:', error);
    })
    .finally(() => {
      invoiceHistoryFetchPromise = null;
    });
}

async function fetchInvoicesFromServer(limit = 10) {
  const user = auth.currentUser;
  if (!user) return [];

  const idToken = await user.getIdToken();
  const response = await fetch(`/api/invoices?limit=${limit}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${idToken}` }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = await response.json();
  const invoices = Array.isArray(payload?.invoices) ? payload.invoices : [];
  return invoices
    .map(normalizeInvoiceForUi)
    .filter(Boolean);
}

async function fetchLatestInvoiceFromServer(limit = 1) {
  if (latestInvoiceFetchPromise) return latestInvoiceFetchPromise;

  latestInvoiceFetchPromise = fetchInvoicesFromServer(limit)
    .then(invoices => invoices[0] || null)
    .catch(error => {
      console.error('Failed to fetch invoices:', error);
      showMessage('Unable to load the latest invoice right now.', 'error');
      return null;
    })
    .finally(() => {
      latestInvoiceFetchPromise = null;
    });

  return latestInvoiceFetchPromise;
}

function mergeInvoiceHistories(existing = [], incoming = []) {
  const map = new Map();

  const upsert = (invoice) => {
    const normalized = normalizeInvoiceForUi(invoice);
    if (!normalized) return;
    const key = normalized.id || `invoice:${normalized.created || normalized.recordedAtMs || Date.now()}`;
    const current = map.get(key) || {};
    map.set(key, { ...current, ...normalized });
  };

  (Array.isArray(existing) ? existing : []).forEach(upsert);
  (Array.isArray(incoming) ? incoming : []).forEach(upsert);

  return Array.from(map.values())
    .sort((a, b) => (b.created || 0) - (a.created || 0));
}

function createSubscriptionSnapshot(subscription) {
  if (!subscription || !subscription.id) return null;

  const normalized = normalizeSubscriptionPayload(subscription);
  const interval = normalized?.interval || null;
  const amount = typeof normalized?.amount === 'number' ? normalized.amount : null;
  const currency = (normalized?.currency || 'usd').toUpperCase();
  const planNickname = normalized?.planNickname
    || normalized?.plan?.nickname
    || null;

  const recordedTimestamp = toTimestamp(
    normalized?.recordedAtMs
    ?? normalized?.recordedAt
    ?? normalized?.updatedAt
    ?? normalized?.createdAt
    ?? normalized?.created
    ?? normalized?.currentPeriodStart
    ?? normalized?.current_period_start
  ) || Date.now();

  const periodEnd = toTimestamp(
    normalized?.currentPeriodEnd
    ?? normalized?.current_period_end
  ) || null;
  const periodStart = toTimestamp(
    normalized?.currentPeriodStart
    ?? normalized?.current_period_start
  ) || null;

  return {
    id: normalized?.id || subscription.id,
    status: normalized?.status || subscription.status || null,
    planId: normalized?.plan || normalized?.planId || subscription.plan || null,
    planKey: normalized?.planKey || subscription.planKey || subscription.metadata?.plan_key || null,
    planNickname,
    interval,
    amount,
    currency,
    cancelAtPeriodEnd: normalized?.cancelAtPeriodEnd
      || normalized?.cancel_at_period_end
      || subscription.cancelAtPeriodEnd
      || subscription.cancel_at_period_end
      || false,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    recordedAt: new Date(recordedTimestamp).toISOString(),
    recordedAtMs: recordedTimestamp,
    changeType: 'subscription_snapshot',
    kind: 'subscription',
  };
}

function buildBillingActivityTimeline({
  subscription,
  subscriptionHistory = [],
  invoiceHistory = [],
  latestInvoice = null,
}) {
  const eventMap = new Map();

  const pushEvent = (event) => {
    if (!event) return;
    const key = `${event.type || 'event'}:${event.id || event.dateMs || ''}`;
    const existing = eventMap.get(key);
    if (!existing || (event.dateMs || 0) >= (existing.dateMs || 0)) {
      eventMap.set(key, event);
    }
  };

  (Array.isArray(subscriptionHistory) ? subscriptionHistory : []).forEach(entry => {
    pushEvent(decorateSubscriptionEvent(entry, subscription));
  });

  if (subscription) {
    const snapshot = createSubscriptionSnapshot(subscription);
    const hasSubscriptionEvent = Array.from(eventMap.values()).some(evt => evt?.type === 'subscription');
    if (!hasSubscriptionEvent && snapshot) {
      pushEvent(decorateSubscriptionEvent(snapshot, subscription));
    }
  }

  (Array.isArray(invoiceHistory) ? invoiceHistory : []).forEach(invoice => {
    pushEvent(decorateInvoiceEvent(invoice));
  });

  if (latestInvoice) {
    pushEvent(decorateInvoiceEvent(latestInvoice));
  }

  return Array.from(eventMap.values())
    .filter(Boolean)
    .sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
}

function decorateSubscriptionEvent(entry, subscription) {
  if (!entry) return null;

  const timestamp = toTimestamp(entry.recordedAtMs ?? entry.recordedAt ?? entry.currentPeriodEnd);
  const baseId = entry.id || subscription?.id || 'subscription';
  const eventId = `${baseId}:${timestamp || Date.now()}`;

  const planLabel = entry.planNickname
    || entry.planKey
    || formatIntervalLabel(entry.interval)
    || entry.planId
    || null;

  const rateText = typeof entry.amount === 'number'
    ? `${formatMoney(entry.amount, entry.currency || subscription?.currency || 'USD')}${entry.interval ? ` / ${entry.interval}` : ''}`
    : null;
  const statusText = formatStatusText(entry.status);
  const dateCopy = formatActivityDate(timestamp) || '--';
  const planCopy = planLabel ? planLabel.toLowerCase() : (entry.interval || subscription?.interval || '').toLowerCase();
  const cleanedPlanCopy = planCopy ? planCopy.replace(/plan$/i, '').trim() : null;
  const normalizedPlan = cleanedPlanCopy || planLabel || entry.planId || 'plan';

  let descriptorPrefix = 'Updated';
  if (entry.changeType === 'subscription_created' || entry.changeType === 'subscription_snapshot') {
    descriptorPrefix = 'Activated';
  } else if (entry.changeType === 'subscription_canceled') {
    descriptorPrefix = 'Canceled';
  } else if (entry.changeType === 'plan_changed') {
    descriptorPrefix = 'Plan updated';
  } else if (entry.changeType && entry.changeType.startsWith('status_')) {
    descriptorPrefix = 'Status';
  }

  const descriptorParts = [
    `${descriptorPrefix}: ${dateCopy}`,
    normalizedPlan ? `Plan: ${normalizedPlan}` : null,
    rateText ? `Rate: ${rateText}` : null,
  ].filter(Boolean);

  return {
    id: `subscription:${eventId}`,
    type: 'subscription',
    title: descriptorParts.join(' • '),
    detailParts: [],
    subtitle: entry.cancelAtPeriodEnd ? 'Cancellation scheduled at period end.' : '',
    displayValue: rateText || statusText || 'Updated',
    status: statusText,
    amount: entry.amount ?? null,
    currency: entry.currency || subscription?.currency || 'USD',
    dateMs: timestamp,
  };
}

function decorateInvoiceEvent(invoice) {
  const normalized = normalizeInvoiceForUi(invoice);
  if (!normalized) return null;

  const timestamp = normalized.created || normalized.recordedAtMs || null;
  const shortId = normalized.id ? normalized.id.slice(-8).toUpperCase() : null;
  const title = shortId ? `Invoice ${shortId}` : 'Invoice';
  const amount = typeof normalized.amount_due === 'number'
    ? normalized.amount_due
    : typeof normalized.amountDue === 'number'
      ? normalized.amountDue
      : null;
  const currency = normalized.currency || 'USD';
  const statusText = formatStatusText(normalized.status);
  const amountText = amount != null ? formatMoney(amount, currency) : null;

  const dateText = formatActivityDate(timestamp);
  const detailParts = [];
  if (dateText) detailParts.push(`Billed: ${dateText}`);
  if (statusText) detailParts.push(`Status: ${statusText}`);
  return {
    id: normalized.id ? `invoice:${normalized.id}` : `invoice:${timestamp || Date.now()}`,
    type: 'invoice',
    title,
    detailParts,
    subtitle: detailParts.join(' • '),
    displayValue: amountText || statusText || 'Invoice',
    status: statusText,
    amount,
    currency,
    invoiceUrl: normalized.hosted_invoice_url || normalized.invoice_pdf || null,
    dateMs: timestamp,
  };
}

function renderActivityList(listEl, items) {
  if (!listEl) return;
  if (!Array.isArray(items) || !items.length) {
    listEl.innerHTML = '<li class="empty">No billing activity recorded yet.</li>';
    return;
  }

  const markup = items.map(item => {
    const details = item.subtitle
      ? [item.subtitle]
      : Array.isArray(item.detailParts)
        ? item.detailParts.filter(Boolean)
        : [];
    const detailsHtml = details.length
      ? `<small>${details.map(escapeHtml).join(' • ')}</small>`
      : '';
    const statusClass = item.status
      ? ` status-${item.status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      : '';
    const displayValue = item.displayValue ? escapeHtml(item.displayValue) : '—';
    const titleText = escapeHtml(item.title || 'Activity');
    const titleHtml = item.invoiceUrl
      ? `<a href="${escapeHtml(item.invoiceUrl)}" target="_blank" rel="noopener">${titleText}</a>`
      : titleText;

    return `
      <li>
        <div class="activity-meta">
          <span>${titleHtml}</span>
          ${detailsHtml}
        </div>
        <div class="activity-status${statusClass}">
          ${displayValue}
        </div>
      </li>
    `;
  }).join('');

  listEl.innerHTML = markup;
}

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatActivityDate(ms) {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return null;
  }
}

function toTimestamp(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().getTime();
    } catch (error) {
      return null;
    }
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function formatIntervalLabel(interval) {
  if (!interval) return null;
  const normalized = interval.toString().toLowerCase();
  if (normalized === 'month' || normalized === 'monthly') {
    return 'Monthly plan';
  }
  if (normalized === 'year' || normalized === 'yearly' || normalized === 'annual') {
    return 'Yearly plan';
  }
  return `${capitalize(normalized)} plan`;
}

function formatStatusText(status) {
  if (!status) return null;
  return status
    .toString()
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => capitalize(word))
    .join(' ');
}

function capitalize(value) {
  if (!value) return '';
  const str = value.toString();
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatMoney(amount, currency = 'USD') {
  if (typeof amount !== 'number') return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount / 100);
  } catch (error) {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

function ensureButtonLabel(button, fallbackText = '') {
  if (!button) return null;
  let label = button.querySelector('.btn-label');
  if (label) return label;

  const icon = button.querySelector('i, svg');
  label = document.createElement('span');
  label.className = 'btn-label';

  if (icon) {
    let sibling = icon.nextSibling;
    while (sibling && sibling.nodeType === Node.TEXT_NODE) {
      const next = sibling.nextSibling;
      button.removeChild(sibling);
      sibling = next;
    }
    icon.insertAdjacentElement('afterend', label);
  } else {
    button.textContent = '';
    button.appendChild(label);
  }

  label.textContent = fallbackText || label.textContent || '';
  return label;
}

function lockPlanOptions(activeInterval, unlockAll = false) {
  const intervalKey = (activeInterval || '').toLowerCase();
  const selectorsMonthly = ['#view-billing [data-checkout-plan="monthly"]', '#billingGate [data-checkout-plan="monthly"]', '#signupPlanGate [data-checkout-plan="monthly"]'];
  const selectorsYearly = ['#view-billing [data-checkout-plan="yearly"]', '#billingGate [data-checkout-plan="yearly"]', '#signupPlanGate [data-checkout-plan="yearly"]'];
  const monthlyButtons = document.querySelectorAll(selectorsMonthly.join(', '));
  const yearlyButtons = document.querySelectorAll(selectorsYearly.join(', '));

  const toggleButton = (button, isActive) => {
    if (!button) return;
    if (isActive) {
      button.classList.add('is-current-plan');
      button.setAttribute('aria-disabled', 'true');
      button.disabled = true;
      button.style.opacity = '0.6';
      button.style.pointerEvents = 'none';
    } else {
      button.classList.remove('is-current-plan');
      button.removeAttribute('aria-disabled');
      button.disabled = false;
      button.style.opacity = '';
      button.style.pointerEvents = '';
    }
  };

  monthlyButtons.forEach(button => {
    const isMonthly = !unlockAll && (intervalKey === 'month' || intervalKey === 'monthly');
    toggleButton(button, isMonthly);
  });

  yearlyButtons.forEach(button => {
    const isYearly = !unlockAll && (intervalKey === 'year' || intervalKey === 'yearly' || intervalKey === 'annual');
    toggleButton(button, isYearly);
  });
}

function resolveNextBillingTimestamp(subscription, subscriptionHistory = [], invoiceHistory = []) {
  const now = Date.now();
  const futureDates = [];
  const pastDates = [];

  const subscriptionStatus = (subscription?.status || '').toLowerCase();
  if (subscriptionStatus === 'canceled') {
    return null;
  }

  const registerTimestamp = (value) => {
    const ts = toTimestamp(value);
    if (!ts) return;
    if (ts >= now) {
      futureDates.push(ts);
    } else {
      pastDates.push(ts);
    }
  };

  registerTimestamp(subscription?.currentPeriodEnd ?? subscription?.current_period_end);
  registerTimestamp(subscription?.latest_invoice?.period_end ?? subscription?.latest_invoice?.periodEnd);

  (Array.isArray(subscriptionHistory) ? subscriptionHistory : []).forEach(entry => {
    registerTimestamp(entry?.currentPeriodEnd ?? entry?.current_period_end);
  });

  (Array.isArray(invoiceHistory) ? invoiceHistory : []).forEach(invoice => {
    registerTimestamp(invoice?.period_end ?? invoice?.periodEnd);
  });

  if (futureDates.length) {
    futureDates.sort((a, b) => a - b);
    return futureDates[0];
  }

  if (pastDates.length) {
    pastDates.sort((a, b) => b - a);
    return pastDates[0];
  }

  return null;
}

function formatDisplayDate(timestamp, fallback = '--') {
  if (!timestamp) return fallback;
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return fallback;
  }
}
