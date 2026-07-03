
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  setPersistence,
  browserSessionPersistence
} from 'firebase/auth';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const env = (import.meta as any)?.env || {};
  const w = typeof window !== 'undefined' ? (window as any) : {};
  const firebaseConfig = {
    apiKey: env.PUBLIC_FIREBASE_API_KEY || w.PUBLIC_FIREBASE_API_KEY,
    authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN || w.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.PUBLIC_FIREBASE_PROJECT_ID || w.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET || w.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || w.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.PUBLIC_FIREBASE_APP_ID || w.PUBLIC_FIREBASE_APP_ID
  };

  if (typeof window !== 'undefined' && !getApps().length) {
    initializeApp(firebaseConfig);
  }

  useEffect(() => {
    document.body.setAttribute('data-nav', 'light');
    const storedRemember = localStorage.getItem('nexolink_admin_remember') === 'true';
    setRememberMe(storedRemember);
    return () => document.body.removeAttribute('data-nav');
  }, []);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    if (!email || !password) {
      setError("Enter your email and password.");
      setIsLoading(false);
      return;
    }

    try {
      const auth = getAuth();
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      if (rememberMe) {
        localStorage.setItem('nexolink_admin_email', email);
        localStorage.setItem('nexolink_admin_remember', 'true');
      } else {
        localStorage.removeItem('nexolink_admin_remember');
      }
      window.location.href = '/admin';
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError("Unable to sign in.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setIsLoading(true);
    try {
      const auth = getAuth();
      await setPersistence(auth, browserSessionPersistence);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      window.location.href = '/admin';
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError("Unable to sign in with Google.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* ── Left: sign-in form ── */}
      <div className="auth-form-col">
        <div className="auth-form-wrap">
          <h1>Welcome</h1>
          <p className="auth-subtitle">Access your account and continue your journey with us</p>

          <form className="auth-form" onSubmit={handleSignIn}>
            <div className="auth-field">
              <label>Email Address</label>
              <div className="auth-input-wrap">
                <input
                  name="email"
                  type="email"
                  className="auth-input"
                  placeholder="Enter your email address"
                  defaultValue={localStorage.getItem('nexolink_admin_email') || ''}
                />
              </div>
            </div>

            <div className="auth-field">
              <label>Password</label>
              <div className="auth-input-wrap auth-input-wrap--pw">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="Enter your password"
                />
                <button type="button" className="auth-toggle-pw" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <div className="auth-row">
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Keep me signed in
              </label>
              <button type="button" className="auth-reset">Reset password</button>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-submit" disabled={isLoading}>
              {isLoading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="auth-divider"><span>Or continue with</span></div>

          <button className="auth-google" onClick={handleGoogleSignIn} disabled={isLoading}>
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"/>
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"/>
            </svg>
            Continue with Google
          </button>

          <p className="auth-switch">
            New to our platform? <Link to="/create">Create Account</Link>
          </p>
        </div>
      </div>

      {/* ── Right: hero visual ── */}
      <div className="auth-hero-col">
        <div className="auth-hero-inner">
          <h2>ADMIN<br/>CENTER.</h2>
          <p className="auth-hero-sub">Sign in to manage your mission operations.</p>
        </div>
      </div>
    </div>
  );
}
