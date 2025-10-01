import { showMessage } from './ui.js';

let billingHandlersRegistered = false;

const CHECKOUT_ENDPOINT = '/api/checkout';
const PORTAL_ENDPOINT = '/api/stripe/create-portal-session';

function setLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.dataset.originalText || button.innerText;
    button.classList.add('is-loading');
    button.innerText = 'Redirecting…';
    button.disabled = true;
  } else {
    button.classList.remove('is-loading');
    if (button.dataset.originalText) {
      button.innerText = button.dataset.originalText;
      delete button.dataset.originalText;
    }
    button.disabled = false;
  }
}

async function startCheckout(priceId, button) {
  if (!priceId) {
    showMessage('Price ID missing. Configure your Stripe price IDs.', 'error');
    return;
  }

  try {
    setLoading(button, true);
    const emailInput = document.getElementById('signupEmail');
    const email = emailInput ? emailInput.value.trim() : '';
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('signup_selected_plan', priceId);
      } catch (err) {
        // ignore storage failures
      }
    }
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId,
        email,
      })
    });

    if (!response.ok) {
      throw new Error('Unable to create checkout session.');
    }

    const payload = await response.json();
    if (payload.url) {
      window.location.href = payload.url;
      return;
    }

    throw new Error(payload.error || 'Checkout session missing redirect URL.');
  } catch (error) {
    console.error(error);
    showMessage(error.message || 'Unable to start checkout.', 'error');
  } finally {
    setLoading(button, false);
  }
}

async function openCustomerPortal(button) {
  try {
    setLoading(button, true);
    const response = await fetch(PORTAL_ENDPOINT, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Unable to create portal session.');
    }
    const payload = await response.json();
    if (payload.url) {
      window.location.href = payload.url;
      return;
    }
    throw new Error(payload.error || 'Portal session missing redirect URL.');
  } catch (error) {
    console.error(error);
    showMessage(error.message || 'Unable to open customer portal.', 'error');
  } finally {
    setLoading(button, false);
  }
}

function formatDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (error) {
    return '';
  }
}

export function initBillingUi() {
  if (billingHandlersRegistered) return;
  billingHandlersRegistered = true;

  document
    .querySelectorAll('[data-checkout-plan]')
    .forEach((button) => {
      button.addEventListener('click', () => startCheckout(button.dataset.priceId, button));
    });

  const portalBtn = document.querySelector('[data-customer-portal]');
  if (portalBtn) {
    portalBtn.addEventListener('click', () => openCustomerPortal(portalBtn));
  }
}

export function showBillingGate(subscription = {}) {
  const gate = document.getElementById('billingGate');
  const authSection = document.getElementById('authSection');
  const dashboard = document.getElementById('dashboardSection');
  const statusText = document.getElementById('billingStatusText');
  const renewalText = document.getElementById('billingRenewalText');
  const portalBtn = document.querySelector('[data-customer-portal]');
  const navBar = document.querySelector('nav.navbar');
  const navLogout = document.getElementById('navbarLogoutBtn');
  const sideLogout = document.getElementById('logoutBtn');

  if (authSection) authSection.style.display = 'none';
  if (dashboard) dashboard.style.display = 'none';
  if (gate) gate.style.display = 'flex';
  document.body.classList.add('has-aurora');
  if (navBar) navBar.style.display = 'flex';
  if (navLogout) navLogout.style.display = 'block';
  if (sideLogout) sideLogout.style.display = 'none';

  initBillingUi();

  const status = (subscription.status || 'inactive').toLowerCase();
  if (statusText) {
    if (status === 'active') {
      statusText.innerText = 'Your subscription is active. Feel free to manage it below or continue using the dashboard.';
    } else if (status === 'past_due' || status === 'canceled' || status === 'unpaid') {
      statusText.innerText = 'We were unable to renew your subscription. Choose a plan to regain access instantly.';
    } else {
      statusText.innerText = 'Pick a plan to unlock the NexoLink admin experience.';
    }
  }

  if (renewalText) {
    const periodEnd = subscription.currentPeriodEnd || subscription.current_period_end;
    const formatted = periodEnd ? formatDate(periodEnd) : '';
    renewalText.innerText = formatted ? `Current period ends ${formatted}.` : '';
    renewalText.style.display = formatted ? 'block' : 'none';
  }

  if (portalBtn) {
    portalBtn.style.display = status === 'active' ? 'inline-flex' : 'none';
  }
}

export function hideBillingGate() {
  const gate = document.getElementById('billingGate');
  if (gate) gate.style.display = 'none';
  document.body.classList.remove('has-aurora');
}
