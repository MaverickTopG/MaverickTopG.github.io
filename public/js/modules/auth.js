import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { app, auth, db } from "./firebase.js";
import { appState } from "./state.js";
import {
  showDashboardSection,
  showAuthSection,
  initializeDashboard,
  setActiveView,
  renderDemoAccountNotice,
} from "./dashboard.js";
import { showBillingGate, hideBillingGate, bindCheckoutButtons } from "./billing.js";
import {
  showMessage,
  clearInlineAuthMessage,
  showInlineAuthMessage,
} from "./ui.js";
import {
  shouldHonorLegacyPaidFlag,
  hasLegacyAccessExpired,
  formatLegacyAccessDeadline,
  isDemoAccount,
} from "./accessControl.js";

const TAB_SESSION_KEY = `auth_${appState.tabId}`;
const SIGNUP_CHECKOUT_KEY = 'signup_checkout_confirmed';
const SIGNUP_CHECKOUT_EMAIL_KEY = 'signup_checkout_email';
const SIGNUP_FORCE_FORM_KEY = 'signup_force_form';
const SIGNUP_SUCCESS_DATA_KEY = 'signup_success_payload';
const AUTH_MESSAGE_KEY = 'auth_last_message';
const SUBADMIN_SESSION_STORAGE_KEY = 'nexolink_active_sub_admin_session';

let authFormHandlersRegistered = false;
const functions = getFunctions(app);

function isAdminPortalUser(userData = {}) {
  if (!userData || typeof userData !== "object") return false;
  const role = String(userData.role || "").toLowerCase();
  if (role === "admin" || role === "owner" || role === "superadmin" || role === "subadmin") {
    return true;
  }
  if (userData.isAdmin === true || userData.is_admin === true || userData.admin === true) {
    return true;
  }
  if (Array.isArray(userData.roles)) {
    return userData.roles.some((entry) => {
      const normalized = String(entry || "").toLowerCase();
      return normalized === "admin" || normalized === "owner" || normalized === "superadmin" || normalized === "subadmin";
    });
  }
  return false;
}

async function bootstrapSubAdminSession(email, password) {
  const callable = httpsCallable(functions, "authenticateSubAdminLogin");
  const response = await callable({ email, password });
  const payload = response?.data || {};
  const session = payload?.session || null;
  if (session && typeof window !== "undefined") {
    try {
      localStorage.setItem(SUBADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
      window.dispatchEvent(new CustomEvent("nexolink:subadmin-session", { detail: session }));
    } catch (error) {
      console.warn("Unable to persist subadmin session", error);
    }
  }
  return payload;
}

function storeAuthMessage(type, text) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AUTH_MESSAGE_KEY, JSON.stringify({ type, text }));
  } catch (error) {
    console.warn('Unable to persist auth message', error);
  }
}

function consumeAuthMessage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_MESSAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(AUTH_MESSAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.text) return null;
    return { type: parsed.type || 'info', text: parsed.text };
  } catch (error) {
    console.warn('Unable to read auth message', error);
    return null;
  }
}

function storeSignupSuccessData(payload) {
  if (!payload) return;
  appState.signupSuccess = payload;
  if (typeof window === 'undefined') {
    if (typeof globalThis !== 'undefined') {
      globalThis.__nexolinkSignupSuccess = payload;
    }
    return;
  }
  try {
    sessionStorage.setItem(SIGNUP_SUCCESS_DATA_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist signup success payload', error);
    window.__nexolinkSignupSuccess = payload;
  }
}

function readSignupSuccessData() {
  if (appState.signupSuccess) return appState.signupSuccess;

  if (typeof window === 'undefined') {
    return typeof globalThis !== 'undefined'
      ? globalThis.__nexolinkSignupSuccess || null
      : null;
  }

  try {
    const raw = sessionStorage.getItem(SIGNUP_SUCCESS_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      appState.signupSuccess = parsed;
      return parsed;
    }
  } catch (error) {
    console.warn('Unable to read signup success payload', error);
  }

  if (window.__nexolinkSignupSuccess) {
    appState.signupSuccess = window.__nexolinkSignupSuccess;
    return window.__nexolinkSignupSuccess;
  }

  return null;
}

function clearSignupSuccessData() {
  appState.signupSuccess = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(SIGNUP_SUCCESS_DATA_KEY);
    } catch (error) {
      console.warn('Unable to clear signup success payload', error);
    }
    delete window.__nexolinkSignupSuccess;
  } else if (typeof globalThis !== 'undefined') {
    delete globalThis.__nexolinkSignupSuccess;
  }
}

async function hydrateEmailFromCheckout(sessionId) {
  if (!sessionId || typeof window === 'undefined') return;

  try {
    const response = await fetch(`/api/checkoutSession?id=${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const { email } = await response.json();
    if (email) {
      sessionStorage.setItem(SIGNUP_CHECKOUT_EMAIL_KEY, email.trim());
      const signupEmail = document.getElementById('signupEmail');
      if (signupEmail && !signupEmail.value) {
        signupEmail.value = email.trim();
      }
    }
  } catch (error) {
    console.warn('Unable to retrieve checkout session details', error);
  } finally {
    try {
      sessionStorage.removeItem('signup_checkout_session_id');
    } catch (error) {
      /* noop */
    }
    ensureSignupControls();
  }
}

function syncSignupCheckoutStatus() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const sessionFlag = params.get('session');
  const checkoutStatus = params.get('checkout');
  const checkoutSessionId = params.get('session_id');

  if (sessionFlag === 'success' || checkoutStatus === 'success') {
    sessionStorage.setItem(SIGNUP_CHECKOUT_KEY, 'true');
    sessionStorage.setItem(SIGNUP_FORCE_FORM_KEY, 'signup');
    if (checkoutStatus === 'success') {
      params.delete('checkout');
    }
    params.delete('session');
    if (params.has('plan')) params.delete('plan');
    const newQuery = params.toString();
    const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
    window.history.replaceState({}, '', newUrl);

    if (typeof document !== 'undefined') {
      const ensureSignupView = () => {
        try {
          toggleForm('signup');
        } catch (error) {
          console.warn('Unable to toggle signup form immediately after checkout success', error);
        }
      };

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        requestAnimationFrame(ensureSignupView);
      } else {
        document.addEventListener('DOMContentLoaded', ensureSignupView, { once: true });
      }
    }
  } else if (checkoutStatus === 'cancel') {
    sessionStorage.removeItem(SIGNUP_CHECKOUT_KEY);
    sessionStorage.removeItem(SIGNUP_CHECKOUT_EMAIL_KEY);
    window.location.replace('/pricing');
    return;
  }

  if (checkoutSessionId) {
    try {
      sessionStorage.setItem('signup_checkout_session_id', checkoutSessionId);
    } catch (error) {
      console.warn('Unable to persist checkout session id', error);
      if (typeof window !== 'undefined') {
        window.__nexolinkCheckoutSessionId = checkoutSessionId;
      }
    }
    params.delete('session_id');
    const newQuery = params.toString();
    const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
    window.history.replaceState({}, '', newUrl);
  }
}

function hasCompletedSignupCheckout() {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SIGNUP_CHECKOUT_KEY) === 'true';
}

function ensureSignupControls() {
  if (typeof document === 'undefined') return;
  const gate = document.getElementById('signupPlanGate');
  const fields = document.getElementById('signupFields');
  const submitBtn = document.getElementById('signupBtn');
  const signupForm = document.getElementById('signupForm');
  const signupEmail = document.getElementById('signupEmail');
  const unlocked = hasCompletedSignupCheckout();

  if (gate) {
    gate.style.display = unlocked ? 'none' : 'flex';
    gate.setAttribute('aria-hidden', unlocked ? 'true' : 'false');
  }

  if (fields) {
    fields.style.display = unlocked ? 'grid' : 'none';
    fields.setAttribute('aria-hidden', unlocked ? 'false' : 'true');
  }

  if (submitBtn) {
    submitBtn.disabled = !unlocked;
  }

  if (unlocked) {
    const storedEmail = typeof window !== 'undefined'
      ? sessionStorage.getItem(SIGNUP_CHECKOUT_EMAIL_KEY)
      : null;

    if (signupEmail) {
      if (!signupEmail.value && storedEmail) {
        signupEmail.value = storedEmail;
      }
      signupEmail.placeholder = 'Use the same email you used during checkout';
    }

    if (signupForm && signupForm.dataset.unlockNotified !== 'true') {
      showInlineAuthMessage('Checkout confirmed! Finish creating your admin account below.', 'success');
      signupForm.dataset.unlockNotified = 'true';
    }
  } else if (signupForm) {
    delete signupForm.dataset.unlockNotified;
  }
}

syncSignupCheckoutStatus();

export function toggleForm(type) {
  const signInForm = document.getElementById("signInForm");
  const signupForm = document.getElementById("signupForm");
  const successState = document.getElementById("successState");
  const signInToggle = document.getElementById("signInToggle");
  const signupToggle = document.getElementById("signupToggle");
  const authHeader = document.querySelector('.auth-header h2');
  const authSubHeader = document.querySelector('.auth-header p');

  if (
    !signInForm ||
    !signupForm ||
    !successState ||
    !signInToggle ||
    !signupToggle
  ) {
    return;
  }

  signInForm.classList.add("hidden");
  signupForm.classList.add("hidden");
  successState.classList.add("hidden");

  signInToggle.classList.remove("active");
  signupToggle.classList.remove("active");

  const targetForm = document.getElementById(`${type}Form`);
  const targetToggle = document.getElementById(`${type}Toggle`);

  if (targetForm) targetForm.classList.remove("hidden");
  if (targetToggle) targetToggle.classList.add("active");

  if (authHeader && authSubHeader) {
    if (type === 'signup') {
      authHeader.textContent = 'Create your Account';
      authSubHeader.textContent = 'Join to manage your volunteer ecosystem';
    } else {
      authHeader.textContent = 'Welcome back';
      authSubHeader.textContent = 'Secure access for administrators';
    }
  }

  clearInlineAuthMessage();

  if (type === 'signup') {
    ensureSignupControls();
  }
}

export function registerAuthFormHandlers() {
  if (authFormHandlersRegistered) return;
  authFormHandlersRegistered = true;

  const signInEmail = document.getElementById("signInEmail");
  const signInPassword = document.getElementById("signInPassword");
  const signupEmail = document.getElementById("signupEmail");
  const signupPassword = document.getElementById("signupPassword");
  const organizationName = document.getElementById("organizationName");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const signInToggle = document.getElementById("signInToggle");
  const signupToggle = document.getElementById("signupToggle");

  bindCheckoutButtons(document.getElementById('signupPlanGate'));

  if (signInToggle) {
    signInToggle.addEventListener('click', () => toggleForm('signIn'));
  }

  if (signupToggle) {
    signupToggle.addEventListener('click', () => toggleForm('signup'));
  }

  if (signInEmail) {
    signInEmail.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && signInPassword) {
        signInPassword.focus();
      }
    });
  }

  if (signInPassword) {
    signInPassword.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        signIn();
      }
    });
  }

  if (signupEmail) {
    signupEmail.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && signupPassword) {
        signupPassword.focus();
      }
    });
  }

  if (signupPassword) {
    signupPassword.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && organizationName) {
        organizationName.focus();
      }
    });
  }

  if (organizationName) {
    organizationName.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        signup();
      }
    });
  }

  const signInBtn = document.getElementById("signInBtn");
  if (signInBtn) {
    signInBtn.addEventListener("click", signIn);
  }

  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) {
    signupBtn.addEventListener("click", signup);
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", handleForgotPassword);
  }

  ensureSignupControls();

  let forceForm = null;
  try {
    forceForm = sessionStorage.getItem(SIGNUP_FORCE_FORM_KEY);
  } catch (error) {
    console.warn('Unable to read signup force form flag', error);
  }

  if (forceForm === 'signup' || hasCompletedSignupCheckout()) {
    toggleForm('signup');
    try {
      sessionStorage.removeItem(SIGNUP_FORCE_FORM_KEY);
    } catch (error) {
      /* noop */
    }
  } else {
    // If we are on the signup page but haven't completed checkout,
    // default to the sign-in form to avoid showing a disabled signup form.
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'signup.html' || currentPage === '') {
      const activeToggle = document.querySelector('.toggle-buttons button.active');
      if (!activeToggle || activeToggle.id !== 'signInToggle') toggleForm('signIn');
    }
  }

  let pendingSessionId = null;
  try {
    pendingSessionId = sessionStorage.getItem('signup_checkout_session_id');
  } catch (error) {
    pendingSessionId = window.__nexolinkCheckoutSessionId || null;
  }

  if (!pendingSessionId && typeof window !== 'undefined') {
    pendingSessionId = window.__nexolinkCheckoutSessionId || null;
  }

  if (pendingSessionId) {
    if (typeof window !== 'undefined') {
      delete window.__nexolinkCheckoutSessionId;
    }
    hydrateEmailFromCheckout(pendingSessionId);
  }
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
  const activeStatuses = ['active', 'trialing'];
  try {
    const periodEnd = subscription.currentPeriodEnd
      || subscription.current_period_end
      || subscription.trialEnd
      || subscription.trial_end
      || null;

    if (!periodEnd) {
      return activeStatuses.includes(status);
    }

    const normalizedEnd = periodEnd instanceof Date
      ? periodEnd
      : new Date(periodEnd);

    if (Number.isNaN(normalizedEnd.getTime())) {
      return activeStatuses.includes(status);
    }
    const hasTimeRemaining = normalizedEnd.getTime() > Date.now();

    if (status === 'canceled') {
      return hasTimeRemaining;
    }
    if (status === 'trialing') {
      return hasTimeRemaining;
    }
    if (!activeStatuses.includes(status)) {
      return false;
    }
    return hasTimeRemaining;
  } catch (error) {
    return activeStatuses.includes(status);
  }
}

export function setupAuthModule() {
  if (appState.authInitialized) return;

  onAuthStateChanged(auth, async (user) => {
    try {
      if (!user) {
        appState.isAuthenticated = false;
        appState.currentAdmin = null;
      appState.currentOrgCode = null;
      sessionStorage.removeItem(TAB_SESSION_KEY);
      localStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
      hideBillingGate();
      showAuthSection();

      const successData = readSignupSuccessData();
      if (successData) {
        renderSuccessState(
          successData.organizationCode,
          successData.email,
          successData.organizationName
        );
        const signInEmail = document.getElementById('signInEmail');
        if (signInEmail && successData.email) {
          signInEmail.value = successData.email;
        }
        return;
      }

      toggleForm('signIn');

      const storedMessage = consumeAuthMessage();
      if (storedMessage) {
        showInlineAuthMessage(storedMessage.text, storedMessage.type);
      } else {
          showInlineAuthMessage('Sign in to continue.', 'info');
        }
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists() || !isAdminPortalUser(userDoc.data())) {
        storeAuthMessage('error', 'This account does not have admin access.');
        localStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
        await signOut(auth);
        return;
      }

      const adminData = userDoc.data();
      const subscription = normalizeSubscription(adminData.subscription);
      const isActiveSub = isSubscriptionActive(subscription, adminData.paid === true);
      const isSubAdminPortal = Boolean(
        adminData.activeSubAdminGroupId
        || adminData.subAdminGroupId
        || adminData.subAdminId
      );
      const legacyOverrideExpired = adminData.paid === true && hasLegacyAccessExpired();
      const demoAccount = isDemoAccount(adminData);

      appState.currentAdmin = { uid: user.uid, ...adminData, subscription };
      appState.currentOrgCode = adminData.organizationCode || adminData.accessCode || adminData.orgCode || null;
      appState.isAuthenticated = true;
      renderDemoAccountNotice(appState.currentAdmin);

      sessionStorage.setItem(TAB_SESSION_KEY, 'true');

      if (!isActiveSub && !isSubAdminPortal) {
        if (legacyOverrideExpired) {
          showMessage(
            `Legacy access expired on ${formatLegacyAccessDeadline()}. Choose a plan to continue.`,
            'warning'
          );
        }
        if (demoAccount) {
          showMessage(
            'Billing is disabled for the shared demo account. Sign up with your own workspace credentials to subscribe.',
            'info'
          );
        }
        showDashboardSection({ locked: true });
        setActiveView('billing');
        return;
      }

      hideBillingGate();
      showDashboardSection();
      setActiveView('overview');
      await initializeDashboard();
    }
    catch (error) {
      console.error("onAuthStateChanged error:", error);
      sessionStorage.removeItem(TAB_SESSION_KEY);
      appState.isAuthenticated = false;
      hideBillingGate();
      showAuthSection();
      toggleForm("signIn");
      showInlineAuthMessage(
        "Authentication error. Please sign in again.",
        "error"
      );
      showMessage("Authentication error. Please sign in again.", "error");
    }
  });

  appState.authInitialized = true;
}

function generateOrganizationCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function isOrganizationCodeUnique(code) {
  const usersRef = collection(db, "users");
  const q = query(
    usersRef,
    where("organizationCode", "==", code),
    where("role", "==", "admin")
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty;
}

async function generateUniqueOrganizationCode() {
  let attempts = 0;
  while (attempts < 10) {
    const code = generateOrganizationCode();
    const unique = await isOrganizationCodeUnique(code);
    if (unique) {
      return code;
    }
    attempts += 1;
  }

  throw new Error(
    "Unable to generate unique organization code. Please try again."
  );
}

async function isOrganizationNameUnique(name) {
  const usersRef = collection(db, "users");
  const q = query(
    usersRef,
    where("organizationName", "==", name),
    where("role", "==", "admin")
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty;
}

export async function signup() {
  const emailInput = document.getElementById("signupEmail");
  const passwordInput = document.getElementById("signupPassword");
  const organizationInput = document.getElementById("organizationName");
  const signupBtn = document.getElementById("signupBtn");
  const signupLabel = signupBtn ? signupBtn.querySelector("span") : null;

  clearInlineAuthMessage();

  if (!hasCompletedSignupCheckout()) {
    showInlineAuthMessage("Choose a plan and complete checkout before creating your account.", "info");
    ensureSignupControls();
    return;
  }

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value || "" : "";
  const organizationName = organizationInput
    ? organizationInput.value.trim()
    : "";

  if (!email || !password || !organizationName) {
    showInlineAuthMessage("Please fill in all fields", "error");
    return;
  }

  if (password.length < 6) {
    showInlineAuthMessage("Password must be at least 6 characters long", "error");
    return;
  }

  if (signupBtn) {
    signupBtn.disabled = true;
    signupBtn.classList.add("loading");
    if (signupLabel) {
      signupLabel.textContent = "Creating Account...";
    }
  }

  try {
    showInlineAuthMessage(
      "Setting up your organization. This may take a few seconds...",
      "info"
    );

    const isOrgNameUnique = await isOrganizationNameUnique(organizationName);
    if (!isOrgNameUnique) {
      showInlineAuthMessage("Organization name is already in use. Please choose another.", "error");
      return;
    }

    const organizationCode = await generateUniqueOrganizationCode();
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email,
      role: "admin",
      organizationCode,
      organizationName,
      volunteers: [],
      createdAt: serverTimestamp(),
    });

    try {
      const pendingRef = doc(db, 'pendingSubscriptions', email.toLowerCase());
      const pendingSnap = await getDoc(pendingRef);
      if (pendingSnap.exists()) {
        await setDoc(doc(db, 'users', user.uid), pendingSnap.data(), { merge: true });
        await deleteDoc(pendingRef);
      }
    } catch (err) {
      console.warn('Unable to merge pending subscription', err);
    }

    sessionStorage.removeItem(SIGNUP_CHECKOUT_KEY);
    sessionStorage.removeItem(SIGNUP_CHECKOUT_EMAIL_KEY);
    ensureSignupControls();

    const successPayload = {
      organizationName,
      organizationCode,
      email
    };
    storeSignupSuccessData(successPayload);
    renderSuccessState(organizationCode, email, organizationName);
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.warn("Post-signup signOut failed:", signOutError);
    }
    return;
  } catch (error) {
    console.error("Signup error:", error);
    let errorMessage;
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = "This email address is already in use.";
    } else {
      errorMessage = `Error: ${error.message || "An unknown error occurred."}`;
    }
    showInlineAuthMessage(errorMessage, "error");

  } finally {
    if (signupBtn) {
      signupBtn.disabled = false;
      signupBtn.classList.remove("loading");
      if (signupLabel) {
        signupLabel.textContent = "Create Account";
      }
    }
  }
}

function renderSuccessState(organizationCode, email, organizationName = '') {
  const signInForm = document.getElementById("signInForm");
  const signupForm = document.getElementById("signupForm");
  const successState = document.getElementById("successState");
  const displayOrgCode = document.getElementById("displayOrgCode");
  const headlineEl = document.getElementById("successOrgHeadline");
  const summaryEl = document.getElementById("successOrgSummary");
  const orgLabelEl = document.getElementById("successOrgNameLabel");
  const continueBtn = document.getElementById("successContinueBtn");
  const signInEmail = document.getElementById("signInEmail");
  const signInPassword = document.getElementById("signInPassword");
  const signInToggle = document.getElementById("signInToggle");
  const signupToggle = document.getElementById("signupToggle");

  if (signInForm) signInForm.classList.add("hidden");
  if (signupForm) signupForm.classList.add("hidden");
  if (successState) successState.classList.remove("hidden");
  if (signInToggle) signInToggle.classList.remove("active");
  if (signupToggle) signupToggle.classList.remove("active");

  if (headlineEl) {
    headlineEl.textContent = organizationName
      ? `${organizationName} is ready to launch!`
      : "Account Created Successfully!";
  }

  if (summaryEl) {
    summaryEl.textContent = organizationName
      ? `${organizationName} has been created successfully. Sign in with your admin credentials to configure your workspace.`
      : "Your new workspace is ready to go. Sign in with the credentials you just created to explore the dashboard.";
  }

  if (orgLabelEl) {
    const baseLabel = organizationName
      ? `${organizationName} organization code`
      : "Your Organization Code";
    orgLabelEl.textContent = `${baseLabel}:`;
  }

  if (displayOrgCode) {
    displayOrgCode.textContent = organizationCode || "Pending — check your inbox";
  }

  if (continueBtn) {
    const label = continueBtn.querySelector("span");
    if (label) {
      label.textContent = "Proceed to Sign In";
    } else {
      continueBtn.textContent = "Proceed to Sign In";
    }

    if (!continueBtn.dataset.bound) {
      continueBtn.addEventListener("click", () => {
        clearSignupSuccessData();
        if (successState) successState.classList.add("hidden");
        if (signInForm) signInForm.classList.remove("hidden");
        if (signupForm) signupForm.classList.add("hidden");
        if (signInToggle) signInToggle.classList.add("active");
        if (signupToggle) signupToggle.classList.remove("active");

        if (signInEmail && email) {
          signInEmail.value = email;
        }
        if (signInPassword) {
          signInPassword.value = "";
          signInPassword.focus();
        }

        showInlineAuthMessage(
          "Sign in with the admin credentials you just created.",
          "success"
        );
      });
      continueBtn.dataset.bound = "true";
    }
  }
}

export async function signIn() {
  console.log("signIn function called");
  const emailInput = document.getElementById("signInEmail");
  const passwordInput = document.getElementById("signInPassword");
  const signInBtn = document.querySelector("#signInForm .btn-primary");
  const signInLabel = signInBtn ? signInBtn.querySelector("span") : null;

  clearInlineAuthMessage();

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value || "" : "";
  console.log(`Attempting to sign in with email: ${email}`);

  if (!email || !password) {
    showInlineAuthMessage("Please fill in all fields", "error");
    console.log("Sign-in failed: email or password empty.");
    return;
  }

  if (signInBtn) {
    signInBtn.disabled = true;
    signInBtn.classList.add("loading");
    if (signInLabel) {
      signInLabel.textContent = "Signing In...";
    }
  }

  try {
    console.log("Entering signIn try block");
    showInlineAuthMessage("Signing you in...", "info");

    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;
    console.log("Firebase signInWithEmailAndPassword success. User:", user);

    // The `onAuthStateChanged` listener is the single source of truth.
    // We only need to verify the user is an admin here. If they are not,
    // we sign them out, which will trigger the listener to show an error.
    const userDocRef = doc(db, "users", user.uid);
    let userDoc = await getDoc(userDocRef);

    if (!userDoc.exists() || !isAdminPortalUser(userDoc.data())) {
      try {
        await bootstrapSubAdminSession(email, password);
        userDoc = await getDoc(userDocRef);
      } catch (subAdminError) {
        console.warn("Subadmin bootstrap failed", subAdminError);
      }
    }

    if (!userDoc.exists() || !isAdminPortalUser(userDoc.data())) {
      console.log("User is not an admin/subadmin or does not exist. Signing out.");
      localStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
      await signOut(auth);
      return;
    }

    // If the user is a valid admin, set the session key. The onAuthStateChanged
    // listener will handle the rest of the UI transition to the dashboard.
    sessionStorage.setItem(TAB_SESSION_KEY, "true");

    // The onAuthStateChanged listener is the single source of truth for all UI
    // updates. Forcing a token refresh will trigger this listener. We must `await`
    // this to ensure that the `finally` block (which re-enables the sign-in
    // button) doesn't execute before the UI has a chance to transition to the
    // dashboard. This prevents the UI from getting stuck on the "Signing you in..."
    // message.
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true); // Force refresh to trigger listener
    }
  } catch (error) {
    console.error("Sign in error:", error);
    let errorMessage;

    switch (error.code) {
      case "auth/invalid-login-credentials":
      case "auth/user-not-found":
      case "auth/wrong-password":
        errorMessage = "Invalid credentials. Please check your email and password.";
        break;
      case "auth/invalid-email":
        errorMessage = "Invalid email address.";
        break;
      case "auth/too-many-requests":
        errorMessage = "Too many failed attempts. Please try again later.";
        break;
      default:
        errorMessage = `Sign in failed: ${error.message || "Unknown error occurred."}`;
    }

    showInlineAuthMessage(errorMessage, "error");
  } finally {
    console.log("Entering signIn finally block");
    if (signInBtn) {
      signInBtn.disabled = false;
      signInBtn.classList.remove("loading");
      if (signInLabel) {
        signInLabel.textContent = "Sign In";
      }
    }
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const emailInput = document.getElementById("signInEmail");
  const email = emailInput ? emailInput.value.trim() : "";

  if (!email) {
    showInlineAuthMessage("Please enter your email address to reset your password.", "error");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showInlineAuthMessage("Password reset email sent! Please check your inbox and spam folder.", "success");
  } catch (error) {
    console.error("Forgot password error:", error);
    showInlineAuthMessage(`Error: ${error.message || "Could not send reset email."}`, "error");
  }
}

export function logout() {
  if (!window.confirm("Are you sure you want to logout?")) {
    return;
  }

  sessionStorage.removeItem(TAB_SESSION_KEY);
  localStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
  appState.isAuthenticated = false;

  signOut(auth)
    .then(() => {
      window.location.href = 'signup.html';
    })
    .catch(() => {
      showMessage("Error logging out", "error");
    });
}
