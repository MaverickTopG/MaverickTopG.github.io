import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
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

import { auth, db } from "./firebase.js";
import { appState } from "./state.js";
import {
  showDashboardSection,
  showAuthSection,
  initializeDashboard,
  setActiveView,
} from "./dashboard.js";
import { showBillingGate, hideBillingGate, bindCheckoutButtons } from "./billing.js";
import {
  showMessage,
  clearInlineAuthMessage,
  showInlineAuthMessage,
} from "./ui.js";

const TAB_SESSION_KEY = `auth_${appState.tabId}`;
const SIGNUP_CHECKOUT_KEY = 'signup_checkout_confirmed';
const SIGNUP_CHECKOUT_EMAIL_KEY = 'signup_checkout_email';
const SIGNUP_FORCE_FORM_KEY = 'signup_force_form';
const AUTH_MESSAGE_KEY = 'auth_last_message';

let authFormHandlersRegistered = false;

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
  } else if (checkoutStatus === 'cancel') {
    sessionStorage.removeItem(SIGNUP_CHECKOUT_KEY);
    sessionStorage.removeItem(SIGNUP_CHECKOUT_EMAIL_KEY);
    params.delete('checkout');
    const newQuery = params.toString();
    const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
    window.history.replaceState({}, '', newUrl);
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
    'trial_end'
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

  normalized.status = (normalized.status || 'inactive').toLowerCase();
  return normalized;
}

function isSubscriptionActive(subscription, legacyPaid = false) {
  if (legacyPaid) return true;
  if (!subscription) return false;
  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes((subscription.status || '').toLowerCase())) {
    return false;
  }
  try {
    if (!subscription.currentPeriodEnd) {
      return true;
    }
    const periodEnd = new Date(subscription.currentPeriodEnd);
    if (Number.isNaN(periodEnd.getTime())) {
      return true;
    }
    return periodEnd.getTime() > Date.now();
  } catch (error) {
    return true;
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
        hideBillingGate();
        showAuthSection();
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

      if (!userDoc.exists() || userDoc.data().role !== 'admin') {
        storeAuthMessage('error', 'This account does not have admin access.');
        await signOut(auth);
        return;
      }

      const adminData = userDoc.data();
      const subscription = normalizeSubscription(adminData.subscription);
      const isActiveSub = isSubscriptionActive(subscription, adminData.paid === true);

      appState.currentAdmin = { uid: user.uid, ...adminData, subscription };
      appState.currentOrgCode = adminData.organizationCode;
      appState.isAuthenticated = true;

      sessionStorage.setItem(TAB_SESSION_KEY, 'true');

      if (!isActiveSub) {
        showBillingGate(subscription);
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

    showInlineAuthMessage(
      "Account created successfully! Sign in with your new credentials.",
      "success"
    );
    renderSuccessState(organizationCode, email);
    sessionStorage.removeItem(SIGNUP_CHECKOUT_KEY);
    sessionStorage.removeItem(SIGNUP_CHECKOUT_EMAIL_KEY);
    ensureSignupControls();
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

function renderSuccessState(organizationCode, email) {
  const signInForm = document.getElementById("signInForm");
  const signupForm = document.getElementById("signupForm");
  const successState = document.getElementById("successState");
  const displayOrgCode = document.getElementById("displayOrgCode");
  const continueBtn = successState
    ? successState.querySelector(".btn-primary")
    : null;
  const signInEmail = document.getElementById("signInEmail");
  const signInPassword = document.getElementById("signInPassword");
  const signInToggle = document.getElementById("signInToggle");
  const signupToggle = document.getElementById("signupToggle");

  if (signInForm) signInForm.classList.add("hidden");
  if (signupForm) signupForm.classList.add("hidden");
  if (successState) successState.classList.remove("hidden");

  if (displayOrgCode) {
    displayOrgCode.textContent = organizationCode;
  }

  if (continueBtn) {
    const label = continueBtn.querySelector("span");
    if (label) {
      label.textContent = "Continue to Sign In";
    } else {
      continueBtn.textContent = "Continue to Sign In";
    }
    continueBtn.onclick = () => {
      if (successState) successState.classList.add("hidden");
      if (signupForm) signupForm.classList.add("hidden");
      if (signInForm) signInForm.classList.remove("hidden");
      if (signInToggle) signInToggle.classList.add("active");
      if (signupToggle) signupToggle.classList.remove("active");

      if (signInEmail) {
        signInEmail.value = email;
      }
      if (signInPassword) {
        signInPassword.value = "";
        signInPassword.focus();
      }

      const messageText =
        "Account created - please sign in with your email and password.";
      storeAuthMessage('info', messageText);
      showInlineAuthMessage(messageText, "info");
      signOut(auth).catch((signOutError) => {
        console.warn("Post-signup signOut failed:", signOutError);
      });
    };
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
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists() || userDoc.data().role !== "admin") {
      console.log("User is not an admin or does not exist. Signing out.");
      await signOut(auth);
      // The onAuthStateChanged listener will handle the UI update and error message.
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
  appState.isAuthenticated = false;

  signOut(auth)
    .then(() => {
      window.location.href = 'signup.html';
    })
    .catch(() => {
      showMessage("Error logging out", "error");
    });
}
