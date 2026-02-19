
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Eye, EyeOff, Lock, Mail, Plus, Shield } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';

interface LoginPageProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'story' | 'opinion' | 'login' | 'create' | 'privacy' | 'terms') => void;
}

const SUBADMIN_SESSION_STORAGE_KEY = 'nexolink_active_sub_admin_session';

const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
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
    const storedEmail = localStorage.getItem('nexolink_admin_email');
    const storedRemember = localStorage.getItem('nexolink_admin_remember') === 'true';
    if (storedEmail) {
      setEmail(storedEmail);
    }
    setRememberMe(storedRemember);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      tl.from(".login-half", {
        y: "100%",
        opacity: 0,
        duration: 1.2,
        stagger: 0.1,
        ease: "power4.out",
        delay: 0.2
      })
      .from(".login-text", {
        y: 50,
        opacity: 0,
        rotateX: -20,
        stagger: 0.05,
        duration: 0.8,
        ease: "expo.out"
      }, "-=0.6")
      .from(".login-subtitle", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.6")
      .from(".input-group", {
        x: -30,
        opacity: 0,
        stagger: 0.1,
        duration: 0.8,
        ease: "power3.out"
      }, "-=0.6")
      .from(".login-art-element", {
        scale: 0,
        opacity: 0,
        rotation: 180,
        stagger: 0.1,
        duration: 1.5,
        ease: "elastic.out(1, 0.75)"
      }, "-=1");

      gsap.to(".login-orb", {
        rotation: 360,
        duration: 20,
        repeat: -1,
        ease: "linear"
      });
      
      gsap.to(".login-orb-reverse", {
        rotation: -360,
        duration: 25,
        repeat: -1,
        ease: "linear"
      });

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-white flex flex-col md:flex-row overflow-hidden relative">
      
      {/* LEFT: VISUAL/STORY SECTION (match Create UI) */}
      <div className="login-half w-full md:w-[45%] lg:w-[50%] bg-white flex items-center justify-center p-12 relative overflow-hidden order-2 md:order-1 min-h-[400px]">
          
          <div className="relative z-10 max-w-lg text-center md:text-left">
              <div className="login-art-element mb-12 flex justify-center md:justify-start">
                  <div className="w-24 h-24 bg-neon rounded-3xl flex items-center justify-center shadow-[0_0_60px_rgba(158,255,79,0.4)] rotate-12 group transition-transform hover:rotate-0">
                      <Shield className="w-12 h-12 text-charcoal" />
                  </div>
              </div>
              <div className="overflow-hidden">
                <h2 className="login-text text-4xl md:text-7xl font-display font-black text-charcoal leading-[0.9] tracking-tighter uppercase mb-6 italic">
                    ADMIN <br/> <span className="text-neon">CENTER.</span>
                </h2>
              </div>
              <p className="login-subtitle text-charcoal/40 text-lg md:text-xl font-medium italic uppercase tracking-[0.2em] mb-12">
                  Sign in to manage your mission operations.
              </p>

              <div className="login-text space-y-6">
                  {[
                      { icon: <Plus className="w-4 h-4" />, text: "fast approvals" },
                      { icon: <Plus className="w-4 h-4" />, text: "messaging built-in" },
                      { icon: <Plus className="w-4 h-4" />, text: "CSV/PDF exports" }
                  ].map((item, i) => (
                      <div key={i} className="flex items-center gap-4 text-charcoal/50 font-mono text-xs uppercase tracking-widest">
                          <div className="w-6 h-6 rounded-full border border-neon/30 flex items-center justify-center text-neon">
                              {item.icon}
                          </div>
                          {item.text}
                      </div>
                  ))}
              </div>
          </div>

          {Array.from({length: 8}).map((_, i) => (
              <div key={i} className="nexus-particle absolute w-1 h-1 bg-neon/20 rounded-full" style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`
              }}></div>
          ))}
      </div>

      {/* RIGHT: LOGIN FORM (match Create UI) */}
      <div className="login-half w-full md:w-[55%] lg:w-[50%] bg-charcoal flex items-center justify-center p-8 md:p-16 lg:p-24 pt-24 md:pt-16 order-1 md:order-2 rounded-b-[4rem] md:rounded-b-none md:rounded-l-[4rem] shadow-2xl relative z-20">
          <div className="max-w-md w-full">
              <div className="mb-14">
                  <span className="font-mono text-[10px] text-charcoal bg-neon px-3 py-1 rounded-full uppercase tracking-widest font-bold mb-6 inline-block">Access Portal</span>
                  <h1 className="text-4xl md:text-5xl font-display font-black text-white tracking-tighter uppercase italic leading-none">
                      Sign <br/> In
                  </h1>
              </div>

              <form
                ref={formRef}
                className="space-y-10"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  setIsLoading(true);
                  if (!email || !password) {
                    setError("Enter your email and password.");
                    setIsLoading(false);
                    return;
                  }
                  try {
                    const auth = getAuth();
                    await setPersistence(
                      auth,
                      rememberMe ? browserLocalPersistence : browserSessionPersistence
                    );
                    await signInWithEmailAndPassword(auth, email.trim(), password);
                    // Ensure we don't carry over a previous sub-admin session into a super-admin login.
                    localStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
                    if (rememberMe) {
                      localStorage.setItem('nexolink_admin_email', email.trim());
                      localStorage.setItem('nexolink_admin_remember', 'true');
                    } else {
                      localStorage.removeItem('nexolink_admin_remember');
                    }
                    window.location.href = '/admin';
                  } catch (err: any) {
                    const code = String(err?.code || '');
                    const shouldTrySubAdmin = code.startsWith('auth/');

                    if (shouldTrySubAdmin) {
                      try {
                        const resp = await fetch('/api/subAdminLogin', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: email.trim(), password }),
                        });

                        const payload = await resp.json().catch(() => ({}));
                        if (!resp.ok) {
                          setError(String(payload?.error || 'Invalid email or password.'));
                          return;
                        }

                        const customToken = String(payload?.customToken || '').trim();
                        if (!customToken) {
                          setError('Unable to sign in.');
                          return;
                        }

                        const session = payload?.session || null;
                        if (session?.groupId) {
                          try {
                            localStorage.setItem(SUBADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
                          } catch (_storageError) {
                            // Ignore.
                          }
                          try {
                            window.dispatchEvent(new CustomEvent('nexolink:subadmin-session', { detail: session }));
                          } catch (_error) {
                            // Ignore.
                          }
                        } else {
                          localStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
                        }

                        const auth = getAuth();
                        await setPersistence(
                          auth,
                          rememberMe ? browserLocalPersistence : browserSessionPersistence
                        );
                        await signInWithCustomToken(auth, customToken);

                        if (rememberMe) {
                          localStorage.setItem('nexolink_admin_email', email.trim());
                          localStorage.setItem('nexolink_admin_remember', 'true');
                        } else {
                          localStorage.removeItem('nexolink_admin_remember');
                        }

                        window.location.href = '/admin';
                        return;
                      } catch (fallbackError) {
                        console.error('Sub-admin login fallback failed', fallbackError);
                      }
                    }

                    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
                      setError('Invalid email or password.');
                      return;
                    }
                    if (code === 'auth/too-many-requests') {
                      setError('Too many failed attempts. Please try again later.');
                      return;
                    }
                    setError("Unable to sign in.");
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                  <div className="create-input relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-500">
                          <Mail className={`w-5 h-5 transition-colors ${focusedField === 'email' ? 'text-neon' : 'text-white/30'}`} />
                      </div>
                      <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'email' || email ? 'text-white -translate-y-12 scale-90 opacity-60' : 'text-white/40'}`}>
                          Email Address
                      </label>
                      <input 
                        type="email"
                        value={email}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-transparent border-b border-white/10 pl-8 py-4 text-lg font-bold text-white focus:outline-none focus:border-neon transition-colors"
                      />
                  </div>

                  <div className="create-input relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-500">
                          <Lock className={`w-5 h-5 transition-colors ${focusedField === 'password' ? 'text-neon' : 'text-white/30'}`} />
                      </div>
                      <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'password' || password ? 'text-white -translate-y-12 scale-90 opacity-60' : 'text-white/40'}`}>
                          Password
                      </label>
                      <input 
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-transparent border-b border-white/10 pl-8 pr-10 py-4 text-lg font-bold text-white focus:outline-none focus:border-neon transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-0 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                      <label className="flex items-center gap-3 cursor-pointer group">
                          <button
                            type="button"
                            onClick={() => setRememberMe((prev) => !prev)}
                            className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                              rememberMe ? 'border-neon bg-neon text-charcoal' : 'border-white/30 text-transparent'
                            }`}
                            aria-pressed={rememberMe}
                          >
                            ✓
                          </button>
                          <span className="text-sm font-bold text-white/60 group-hover:text-white transition-colors">Remember me</span>
                      </label>
                      <button className="text-sm font-bold text-white/60 hover:text-white transition-colors">Forgot Password?</button>
                  </div>

                  {error && (
                    <div className="text-sm text-red-300 font-semibold">{error}</div>
                  )}

                  <div className="input-group">
                      <button type="submit" disabled={isLoading} className="w-full bg-neon text-charcoal h-16 rounded-full font-black text-lg tracking-wide hover:bg-white hover:text-charcoal transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-xl flex items-center justify-center gap-3 group relative overflow-hidden disabled:opacity-60 disabled:hover:scale-100">
                          <span className="relative z-10">{isLoading ? "SIGNING IN..." : "SIGN IN"}</span>
                          <span className="relative z-10 text-xl group-hover:translate-x-1 transition-transform">→</span>
                          <div className="absolute inset-0 bg-charcoal/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                      </button>
                  </div>
              </form>

              <div className="input-group mt-12 text-center pb-12 md:pb-0">
                  <p className="text-white/50 font-medium">
                      Don't have an account? <button 
                        onClick={() => onNavigate?.('pricing')}
                        className="text-white font-bold hover:underline decoration-neon decoration-2 underline-offset-4"
                      >
                          Apply for Access
                      </button>
                  </p>
              </div>
          </div>
      </div>

    </div>
  );
};

export default LoginPage;
