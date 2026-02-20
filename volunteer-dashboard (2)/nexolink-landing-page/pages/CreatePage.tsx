
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Building2, Mail, Lock, Plus, ArrowRight, User, Eye, EyeOff } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface CreatePageProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'login' | 'create') => void;
}

const CreatePage: React.FC<CreatePageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [orgName, setOrgName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [emailLocked, setEmailLocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const CHECKOUT_SESSION_KEY = 'nexolink_checkout_session_id';
  const CHECKOUT_EMAIL_KEY = 'nexolink_checkout_email';
  const CHECKOUT_FIRST_NAME_KEY = 'nexolink_checkout_first_name';
  const CHECKOUT_LAST_NAME_KEY = 'nexolink_checkout_last_name';
  const CHECKOUT_ORG_NAME_KEY = 'nexolink_checkout_org_name';
  const CHECKOUT_PASSWORD_KEY = 'nexolink_checkout_password';

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

  const getRouteParams = () => {
    if (typeof window === 'undefined') return new URLSearchParams();
    const params = new URLSearchParams(window.location.search || '');
    const rawHash = window.location.hash || '';
    const hashQuery = rawHash.includes('?') ? rawHash.split('?')[1] : '';
    if (hashQuery) {
      const hashParams = new URLSearchParams(hashQuery);
      hashParams.forEach((value, key) => {
        if (!params.has(key)) {
          params.set(key, value);
        }
      });
    }
    return params;
  };

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      // Entrance animation sequence
      tl.from(".create-half", {
        y: "-100%",
        opacity: 0,
        duration: 1.4,
        stagger: 0.1,
        ease: "power4.inOut"
      })
      .from(".create-title", {
        y: 60,
        opacity: 0,
        rotateX: -30,
        stagger: 0.1,
        duration: 1,
        ease: "expo.out"
      }, "-=0.8")
      .from(".create-subtitle", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8")
      .from(".create-input", {
        x: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 0.8,
        ease: "power3.out"
      }, "-=0.6")
      .from(".create-visual", {
        scale: 0.5,
        opacity: 0,
        duration: 1.2,
        ease: "back.out(1.7)"
      }, "-=1");

      // Background ambient motion
      gsap.to(".nexus-particle", {
        y: "random(-100, 100)",
        x: "random(-100, 100)",
        duration: "random(10, 20)",
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const params = getRouteParams();
    const sessionIdParam = params.get('session_id') || params.get('sessionId');
    const emailParam = params.get('email');
    if (sessionIdParam) {
      localStorage.setItem(CHECKOUT_SESSION_KEY, sessionIdParam);
    }
    if (emailParam) {
      localStorage.setItem(CHECKOUT_EMAIL_KEY, emailParam);
    }

    // Always reset non-email fields on entry.
    localStorage.removeItem(CHECKOUT_FIRST_NAME_KEY);
    localStorage.removeItem(CHECKOUT_LAST_NAME_KEY);
    localStorage.removeItem(CHECKOUT_ORG_NAME_KEY);
    sessionStorage.removeItem(CHECKOUT_PASSWORD_KEY);
    setFirstName('');
    setLastName('');
    setOrgName('');
    setPassword('');

    const storedEmail = localStorage.getItem(CHECKOUT_EMAIL_KEY);
    if (storedEmail) {
      setEmail(storedEmail);
      setEmailLocked(true);
    }

    const sessionId = localStorage.getItem(CHECKOUT_SESSION_KEY);
    if (!sessionId) return;

    const hydrateEmail = async () => {
      try {
        const res = await fetch(`/api/checkoutSession?id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (!res.ok) return;
        if (data?.email) {
          localStorage.setItem(CHECKOUT_EMAIL_KEY, data.email);
          setEmail(data.email);
          setEmailLocked(true);
        }
        // Intentionally do not autofill non-email fields.
      } catch {
        // ignore lookup failures for now
      }
    };

    hydrateEmail();
  }, []);

  const handleCreateAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!firstName || !lastName || !orgName || !email || !password) {
      setError("All fields are required.");
      return;
    }

    setIsLoading(true);
    try {
      const auth = getAuth();
      await setPersistence(auth, browserSessionPersistence);
      const db = getFirestore();
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = credential.user;
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (fullName) {
        await updateProfile(user, { displayName: fullName });
      }

      const sessionId = localStorage.getItem(CHECKOUT_SESSION_KEY) || null;
      const token = await user.getIdToken();
      const response = await fetch('/api/createOrganization', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationName: orgName,
          sessionId,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Unable to create organization.');
      }

      const orgData = await response.json();
      const orgId = orgData?.organizationId || null;
      const orgCode = orgData?.organizationCode || null;

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        email: email.trim().toLowerCase(),
        role: 'admin',
        organizationName: orgName.trim(),
        organizationId: orgId,
        accessCode: orgCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      localStorage.removeItem(CHECKOUT_ORG_NAME_KEY);
      localStorage.removeItem(CHECKOUT_FIRST_NAME_KEY);
      localStorage.removeItem(CHECKOUT_LAST_NAME_KEY);
      localStorage.removeItem(CHECKOUT_EMAIL_KEY);
      sessionStorage.removeItem(CHECKOUT_PASSWORD_KEY);

      window.location.href = '/admin';
    } catch (err: any) {
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
          const cancelToken = await currentUser.getIdToken();
          await fetch('/api/cancelSubscription', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cancelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reason: 'account_creation_failed' }),
          });
        }
      } catch {
        // Best-effort cancellation only.
      }
      setError(err?.message || 'Unable to create account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} data-bg="dark" className="min-h-screen bg-charcoal flex flex-col md:flex-row overflow-hidden relative">
      
      {/* LEFT: VISUAL/STORY SECTION */}
      <div className="create-half w-full md:w-[45%] lg:w-[50%] bg-charcoal flex items-center justify-center p-12 relative overflow-hidden order-2 md:order-1 min-h-[400px]">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
          
          <div className="relative z-10 max-w-lg text-center md:text-left">
              <div className="create-visual mb-12 flex justify-center md:justify-start">
                  <div className="w-24 h-24 bg-neon rounded-3xl flex items-center justify-center shadow-[0_0_60px_rgba(158,255,79,0.4)] rotate-12 group transition-transform hover:rotate-0">
                      <Building2 className="w-12 h-12 text-charcoal" />
                  </div>
              </div>
              <div className="overflow-hidden">
                <h2 className="create-title text-4xl md:text-7xl font-display font-black text-white leading-[0.9] tracking-tighter uppercase mb-6 italic">
                    SCALE YOUR <br/> <span className="text-neon">MISSION.</span>
                </h2>
              </div>
              <p className="create-subtitle text-white/40 text-lg md:text-xl font-medium italic uppercase tracking-[0.2em] mb-12">
                  Built for real organizations and school programs.
              </p>

              <div className="create-title space-y-6">
                  {[
                      { icon: <Plus className="w-4 h-4" />, text: "quick event publishing" },
                      { icon: <Plus className="w-4 h-4" />, text: "instant hour approvals" },
                      { icon: <Plus className="w-4 h-4" />, text: "CSV/PDF reporting" }
                  ].map((item, i) => (
                      <div key={i} className="flex items-center gap-4 text-white/60 font-mono text-xs uppercase tracking-widest">
                          <div className="w-6 h-6 rounded-full border border-neon/30 flex items-center justify-center text-neon">
                              {item.icon}
                          </div>
                          {item.text}
                      </div>
                  ))}
              </div>
          </div>

          {/* Random floating elements */}
          {Array.from({length: 8}).map((_, i) => (
              <div key={i} className="nexus-particle absolute w-1 h-1 bg-neon/20 rounded-full" style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`
              }}></div>
          ))}
      </div>

      {/* RIGHT: REGISTRATION FORM */}
      <div className="create-half w-full md:w-[55%] lg:w-[50%] bg-white flex items-center justify-center p-8 md:p-16 lg:p-24 pt-24 md:pt-16 order-1 md:order-2 rounded-b-[4rem] md:rounded-b-none md:rounded-l-[4rem] shadow-2xl relative z-20">
          <div className="max-w-md w-full">
              <div className="mb-14">
                  <span className="font-mono text-[10px] text-neon bg-charcoal px-3 py-1 rounded-full uppercase tracking-widest font-bold mb-6 inline-block">Application Phase</span>
                  <h1 className="text-4xl md:text-5xl font-display font-black text-charcoal tracking-tighter uppercase italic leading-none">
                      Initiate <br/> Registration
                  </h1>
              </div>

              <form className="space-y-10" onSubmit={handleCreateAccount}>

                  {/* Name Grid */}
                  <div className="grid grid-cols-2 gap-6">
                      <div className="create-input relative">
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-500">
                              <User className={`w-5 h-5 transition-colors ${focusedField === 'first' ? 'text-neon' : 'text-charcoal/20'}`} />
                          </div>
                          <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'first' || firstName ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                              First Name
                          </label>
                          <input 
                            type="text"
                            value={firstName}
                            autoComplete="off"
                            name="first_name"
                            onFocus={() => setFocusedField('first')}
                            onBlur={() => setFocusedField(null)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFirstName(value);
                              localStorage.setItem(CHECKOUT_FIRST_NAME_KEY, value);
                            }}
                            className="w-full bg-transparent border-b border-charcoal/10 pl-8 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                          />
                      </div>
                      <div className="create-input relative">
                          <label className={`absolute left-0 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'last' || lastName ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                              Last Name
                          </label>
                          <input 
                            type="text"
                            value={lastName}
                            autoComplete="off"
                            name="last_name"
                            onFocus={() => setFocusedField('last')}
                            onBlur={() => setFocusedField(null)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setLastName(value);
                              localStorage.setItem(CHECKOUT_LAST_NAME_KEY, value);
                            }}
                            className="w-full bg-transparent border-b border-charcoal/10 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                          />
                      </div>
                  </div>
                  
                  {/* Org Name Field */}
                  <div className="create-input relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-500">
                          <Building2 className={`w-5 h-5 transition-colors ${focusedField === 'org' ? 'text-neon' : 'text-charcoal/20'}`} />
                      </div>
                      <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'org' || orgName ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                          Organization Name
                      </label>
                      <input 
                        type="text"
                        value={orgName}
                        autoComplete="off"
                        name="organization_name"
                        onFocus={() => setFocusedField('org')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => {
                          const value = e.target.value;
                          setOrgName(value);
                          localStorage.setItem(CHECKOUT_ORG_NAME_KEY, value);
                        }}
                        className="w-full bg-transparent border-b border-charcoal/10 pl-8 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                      />
                  </div>

                  {/* Email Field */}
                  <div className="create-input relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Mail className={`w-5 h-5 transition-colors ${focusedField === 'email' ? 'text-neon' : 'text-charcoal/20'}`} />
                      </div>
                      <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'email' || email ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                          Admin Email
                      </label>
                      <input 
                        type="email"
                        value={email}
                        autoComplete="email"
                        name="admin_email"
                        onFocus={() => !emailLocked && setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => !emailLocked && setEmail(e.target.value)}
                        readOnly={emailLocked}
                        className={`w-full bg-transparent border-b border-charcoal/10 pl-8 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors ${emailLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                      />
                      {emailLocked && (
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-charcoal/40">
                          Locked
                        </span>
                      )}
                  </div>

                  {/* Password Field */}
                  <div className="create-input relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Lock className={`w-5 h-5 transition-colors ${focusedField === 'password' ? 'text-neon' : 'text-charcoal/20'}`} />
                      </div>
                      <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'password' || password ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                          System Password
                      </label>
                      <input 
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        autoComplete="new-password"
                        name="admin_password"
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPassword(value);
                          sessionStorage.setItem(CHECKOUT_PASSWORD_KEY, value);
                        }}
                        className="w-full bg-transparent border-b border-charcoal/10 pl-8 pr-10 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-0 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal transition-colors"
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                  </div>

                  <div className="create-input pt-4">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full h-20 bg-charcoal text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-2xl flex items-center justify-center gap-4 group overflow-hidden relative ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-neon hover:text-charcoal'}`}
                      >
                          <span className="relative z-10">{isLoading ? 'Creating Account…' : 'Create Account'}</span>
                          <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-2 transition-transform" />
                          <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      </button>
                  </div>

                  {error && (
                    <div className="create-input">
                      <p className="text-xs font-black uppercase tracking-widest text-red-500">{error}</p>
                    </div>
                  )}

              </form>
          </div>
      </div>

    </div>
  );
};

export default CreatePage;
