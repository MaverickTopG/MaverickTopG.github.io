
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Eye, EyeOff, Lock, Mail, User, Check } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence
} from 'firebase/auth';

interface VolunteerLoginPageProps {
  onNavigate?: (page: any) => void;
}

const VolunteerLoginPage: React.FC<VolunteerLoginPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
    const storedEmail = localStorage.getItem('nexolink_volunteer_email');
    const storedRemember = localStorage.getItem('nexolink_volunteer_remember') === 'true';
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
      }, "-=0.6");

    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!email || !password) {
      setError("Please fill in all fields.");
      setIsLoading(false);
      return;
    }

    try {
      const auth = getAuth();
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      
      if (rememberMe) {
        localStorage.setItem('nexolink_volunteer_email', email.trim());
        localStorage.setItem('nexolink_volunteer_remember', 'true');
      } else {
        localStorage.removeItem('nexolink_volunteer_remember');
      }

      // Redirect to the dedicated volunteer sub-app
      window.location.href = '/volunteer';
    } catch (err: any) {
      setError(err?.message || "Invalid credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-white flex flex-col md:flex-row overflow-hidden relative">
      <div className="login-half w-full md:w-[45%] lg:w-[50%] bg-white flex items-center justify-center p-12 relative overflow-hidden order-2 md:order-1 min-h-[400px]">
          <div className="relative z-10 max-w-lg text-center md:text-left">
              <div className="login-art-element mb-12 flex justify-center md:justify-start">
                  <div className="w-24 h-24 bg-neon rounded-3xl flex items-center justify-center shadow-[0_0_60px_rgba(158,255,79,0.4)] rotate-12 group transition-transform hover:rotate-0">
                      <User className="w-12 h-12 text-charcoal" />
                  </div>
              </div>
              <div className="overflow-hidden">
                <h2 className="login-text text-4xl md:text-7xl font-display font-black text-charcoal leading-[0.9] tracking-tighter uppercase mb-6 italic">
                    VOLUNTEER <br/> <span className="text-neon">PORTAL.</span>
                </h2>
              </div>
              <p className="login-subtitle text-charcoal/40 text-lg md:text-xl font-medium italic uppercase tracking-[0.2em] mb-12">
                  Access your personal impact history and sessions.
              </p>
          </div>
      </div>

      <div className="login-half w-full md:w-[55%] lg:w-[50%] bg-charcoal flex items-center justify-center p-8 md:p-16 lg:p-24 pt-24 md:pt-16 order-1 md:order-2 rounded-b-[4rem] md:rounded-b-none md:rounded-l-[4rem] shadow-2xl relative z-20">
          <div className="max-w-md w-full">
              <div className="mb-14">
                  <span className="font-mono text-[10px] text-charcoal bg-neon px-3 py-1 rounded-full uppercase tracking-widest font-bold mb-6 inline-block">Volunteer Login</span>
                  <h1 className="text-4xl md:text-5xl font-display font-black text-white tracking-tighter uppercase italic leading-none">
                      Sign <br/> In
                  </h1>
              </div>

              <form onSubmit={handleLogin} className="space-y-10">
                  <div className="relative">
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

                  <div className="relative">
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
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-0 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                  </div>

                  <div className="flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={() => setRememberMe(!rememberMe)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${rememberMe ? 'bg-neon border-neon' : 'border-white/20'}`}
                      >
                        {rememberMe && <Check className="w-3.5 h-3.5 text-charcoal" />}
                      </button>
                      <span className="text-white/40 text-xs font-black uppercase tracking-widest cursor-pointer select-none" onClick={() => setRememberMe(!rememberMe)}>
                        Remember Me
                      </span>
                  </div>

                  {error && (
                    <div className="text-red-400 text-sm font-mono uppercase tracking-tight">{error}</div>
                  )}

                  <div className="input-group">
                      <button type="submit" disabled={isLoading} className="w-full bg-neon text-charcoal h-16 rounded-full font-black text-lg tracking-wide hover:bg-white transition-all duration-300 hover:scale-[1.02] shadow-xl flex items-center justify-center gap-3">
                          {isLoading ? "AUTHENTICATING..." : "ACCESS PORTAL →"}
                      </button>
                  </div>
              </form>

              <div className="mt-12 text-center">
                  <p className="text-white/50 font-medium">
                      New volunteer? <button 
                        onClick={() => onNavigate?.('volunteer-signup')}
                        className="text-white font-bold hover:underline decoration-neon decoration-2 underline-offset-4"
                      >
                          Create Account
                      </button>
                  </p>
              </div>
          </div>
      </div>
    </div>
  );
};

export default VolunteerLoginPage;
