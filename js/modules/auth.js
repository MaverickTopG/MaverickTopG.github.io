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
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import { appState } from "./state.js";
import {
  showDashboardSection,
  showAuthSection,
  initializeDashboard,
  setActiveView,
} from "./dashboard.js";
import {
  showMessage,
  clearInlineAuthMessage,
  showInlineAuthMessage,
} from "./ui.js";

const TAB_SESSION_KEY = `auth_${appState.tabId}`;

let authFormHandlersRegistered = false;

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
}

export function setupAuthModule() {
  if (appState.authInitialized) return;

  onAuthStateChanged(auth, async (user) => {
    try {
      // Add a small delay to allow signIn function to set session storage
      await new Promise(resolve => setTimeout(resolve, 100));

      const sessionHasAuth = sessionStorage.getItem(TAB_SESSION_KEY) === "true";

      if (user && sessionHasAuth) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists() && userDoc.data().role === "admin") {
          const adminData = userDoc.data();
          appState.currentAdmin = { uid: user.uid, ...adminData };
          appState.currentOrgCode = adminData.organizationCode;
          appState.isAuthenticated = true;

          sessionStorage.setItem(TAB_SESSION_KEY, "true");

          showDashboardSection();
          setActiveView('overview');
          await initializeDashboard();
          await initializeDashboard();
          return;
        }

        // If user is not an admin, just sign them out and show auth section.
        // The rest of the logic will handle showing the correct message.
        await signOut(auth);
      }

      const pendingAuthMessage = sessionStorage.getItem("auth_last_message");
      if (pendingAuthMessage) {
        try {
          const parsed = JSON.parse(pendingAuthMessage);
          showInlineAuthMessage(parsed.text || "", parsed.type || "info");
        } catch (parseError) {
          showInlineAuthMessage("Sign in to continue.", "info");
        }
        sessionStorage.removeItem("auth_last_message");
      } else {
        clearInlineAuthMessage();
        if (!user) {
          // Only show default message if there's no user and no pending message
          showInlineAuthMessage("Sign in to continue.", "info");
        }
      }
    } catch (error) {
      console.error("onAuthStateChanged error:", error);
      sessionStorage.removeItem(TAB_SESSION_KEY);
      appState.isAuthenticated = false;
      showAuthSection();
      toggleForm("signIn");
      sessionStorage.removeItem("auth_last_message");
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
  const signupBtn = document.querySelector("#signupForm .btn-primary");
  const signupLabel = signupBtn ? signupBtn.querySelector("span") : null;

  clearInlineAuthMessage();

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

    showInlineAuthMessage(
      "Account created successfully! Sign in with your new credentials.",
      "success"
    );
    renderSuccessState(organizationCode, email);
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
      sessionStorage.setItem(
        "auth_last_message",
        JSON.stringify({ type: "info", text: messageText })
      );
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

    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    console.log("Firestore getDoc result:", userDoc);

    if (!userDoc.exists()) {
      console.log("User document does not exist. Signing out.");
      await signOut(auth);
      showInlineAuthMessage("Admin account not found.", "error");
      return; // Stop execution
    }

    const userData = userDoc.data();
    console.log("User data from Firestore:", userData);

    if (userData.role !== "admin") {
      console.log("User is not an admin. Signing out.");
      await signOut(auth);
      showInlineAuthMessage(
        "Access denied. This portal is for administrators only.",
        "error"
      );
      showMessage(
        "Access denied. This portal is for administrators only.",
        "error"
      );
      return; // Stop execution
    }

    console.log("User is an admin. Proceeding with login.");
    appState.currentAdmin = { uid: user.uid, ...userData };
    appState.currentOrgCode = userData.organizationCode;
    appState.isAuthenticated = true;

    sessionStorage.removeItem("auth_last_message");
    sessionStorage.setItem(TAB_SESSION_KEY, "true");

    showDashboardSection();
    await initializeDashboard();
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
        errorMessage += "Invalid email address.";
        break;
      case "auth/too-many-requests":
        errorMessage += "Too many failed attempts. Please try again later.";
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
