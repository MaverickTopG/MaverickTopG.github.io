
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { User, Mail, Lock, Sparkles, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface VolunteerSignupPageProps {
  onNavigate?: (page: any) => void;
}

const VolunteerSignupPage: React.FC<VolunteerSignupPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      tl.from(".signup-half", {
        y: "100%",
        opacity: 0,
        duration: 1.4,
        stagger: 0.1,
        ease: "power4.inOut"
      })
      .from(".signup-title", {
        y: 60,
        opacity: 0,
        rotateX: -30,
        stagger: 0.1,
        duration: 1,
        ease: "expo.out"
      }, "-=0.8")
      .from(".signup-subtitle", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8")
      .from(".signup-input", {
        x: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 0.8,
        ease: "power3.out"
      }, "-=0.6")
      .from(".signup-visual", {
        scale: 0.5,
        opacity: 0,
        duration: 1.2,
        ease: "back.out(1.7)"
      }, "-=1");

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!firstName || !lastName || !email || !password) {
      setError("All fields are required.");
      setIsLoading(false);
      return;
    }

    try {
      const auth = getAuth();
      await setPersistence(auth, browserSessionPersistence);
      const db = getFirestore();
      
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      await updateProfile(user, { displayName: fullName });

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        email: email.trim().toLowerCase(),
        role: 'volunteer',
        createdAt: serverTimestamp(),
        totalHours: 0,
        completedTasks: 0
      });

      window.location.href = '/volunteer';
    } catch (err: any) {
      setError(err?.message || "Registration failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-charcoal flex flex-col md:flex-row overflow-hidden relative">
      
      {/* LEFT: VISUAL SECTION */}
      <div className="signup-half w-full md:w-[45%] lg:w-[50%] bg-charcoal flex items-center justify-center p-12 relative overflow-hidden order-2 md:order-1 min-h-[400px]">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
          
          <div className="relative z-10 max-w-lg text-center md:text-left">
              <div className="signup-visual mb-12 flex justify-center md:justify-start">
                  <div className="w-24 h-24 bg-neon rounded-3xl flex items-center justify-center shadow-[0_0_60px_rgba(158,255,79,0.4)] rotate-12 group transition-transform hover:rotate-0">
                      <Sparkles className="w-12 h-12 text-charcoal" />
                  </div>
              </div>
              <div className="overflow-hidden">
                <h2 className="signup-title text-4xl md:text-7xl font-display font-black text-white leading-[0.9] tracking-tighter uppercase mb-6 italic">
                    START YOUR <br/> <span className="text-neon">LEGACY.</span>
                </h2>
              </div>
              <p className="signup-subtitle text-white/40 text-lg md:text-xl font-medium italic uppercase tracking-[0.2em] mb-12">
                  Connect with organizations and track your hours.
              </p>

              <div className="signup-title space-y-6">
                  {["Personalized impact dashboard", "Instant verification nodes", "Secure session logging"].map((text, i) => (
                      <div key={i} className="flex items-center gap-4 text-white/60 font-mono text-xs uppercase tracking-widest">
                          <div className="w-6 h-6 rounded-full border border-neon/30 flex items-center justify-center text-neon">
                              <ArrowRight className="w-3 h-3" />
                          </div>
                          {text}
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

      {/* RIGHT: REGISTRATION FORM */}
      <div className="signup-half w-full md:w-[55%] lg:w-[50%] bg-white flex items-center justify-center p-8 md:p-16 lg:p-24 pt-24 md:pt-16 order-1 md:order-2 rounded-b-[4rem] md:rounded-b-none md:rounded-l-[4rem] shadow-2xl relative z-20">
          <div className="max-w-md w-full">
              <div className="mb-14">
                  <span className="font-mono text-[10px] text-neon bg-charcoal px-3 py-1 rounded-full uppercase tracking-widest font-bold mb-6 inline-block">Volunteer Node</span>
                  <h1 className="text-4xl md:text-5xl font-display font-black text-charcoal tracking-tighter uppercase italic leading-none">
                      Create <br/> Account
                  </h1>
              </div>

              <form className="space-y-10" onSubmit={handleSignup}>
                  
                  {/* Name Grid */}
                  <div className="grid grid-cols-2 gap-6">
                      <div className="signup-input relative">
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-500">
                              <User className={`w-5 h-5 transition-colors ${focusedField === 'first' ? 'text-neon' : 'text-charcoal/20'}`} />
                          </div>
                          <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'first' || firstName ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                              First Name
                          </label>
                          <input 
                            type="text"
                            value={firstName}
                            onFocus={() => setFocusedField('first')}
                            onBlur={() => setFocusedField(null)}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="w-full bg-transparent border-b border-charcoal/10 pl-8 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                          />
                      </div>
                      <div className="signup-input relative">
                          <label className={`absolute left-0 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'last' || lastName ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                              Last Name
                          </label>
                          <input 
                            type="text"
                            value={lastName}
                            onFocus={() => setFocusedField('last')}
                            onBlur={() => setFocusedField(null)}
                            onChange={(e) => setLastName(e.target.value)}
                            className="w-full bg-transparent border-b border-charcoal/10 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                          />
                      </div>
                  </div>

                  {/* Email Field */}
                  <div className="signup-input relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Mail className={`w-5 h-5 transition-colors ${focusedField === 'email' ? 'text-neon' : 'text-charcoal/20'}`} />
                      </div>
                      <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'email' || email ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                          Email Address
                      </label>
                      <input 
                        type="email"
                        value={email}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-transparent border-b border-charcoal/10 pl-8 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                      />
                  </div>

                  {/* Password Field */}
                  <div className="signup-input relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Lock className={`w-5 h-5 transition-colors ${focusedField === 'password' ? 'text-neon' : 'text-charcoal/20'}`} />
                      </div>
                      <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'password' || password ? 'text-charcoal -translate-y-12 scale-90 opacity-40' : 'text-charcoal/30'}`}>
                          Create Password
                      </label>
                      <input 
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-transparent border-b border-charcoal/10 pl-8 pr-12 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)} 
                        className="absolute right-0 top-1/2 -translate-y-1/2 text-charcoal/20 hover:text-charcoal transition-colors"
                      >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                  </div>

                  {error && (
                    <div className="text-red-500 text-[10px] font-black uppercase tracking-widest">{error}</div>
                  )}

                  <div className="signup-input pt-4">
                      <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full h-20 bg-charcoal text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] hover:bg-neon hover:text-charcoal transition-all shadow-2xl flex items-center justify-center gap-4 group overflow-hidden relative"
                      >
                          <span className="relative z-10">{isLoading ? "Initializing..." : "Register Account"}</span>
                          <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-2 transition-transform" />
                          <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      </button>
                  </div>

                  <div className="signup-input text-center pt-8">
                      <p className="text-[10px] font-black uppercase tracking-widest text-charcoal/30">
                          Already synchronized? <button onClick={() => onNavigate?.('volunteer-login')} className="text-charcoal hover:text-neon underline decoration-neon decoration-2 underline-offset-4">Log in to NexoLink</button>
                      </p>
                  </div>
              </form>
          </div>
      </div>

    </div>
  );
};

export default VolunteerSignupPage;
