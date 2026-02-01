
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Building2, Mail, Lock, Plus, ArrowRight } from 'lucide-react';

interface CreatePageProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'login' | 'create') => void;
}

const CreatePage: React.FC<CreatePageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [emailLocked, setEmailLocked] = useState(false);

  const CHECKOUT_SESSION_KEY = 'nexolink_checkout_session_id';
  const CHECKOUT_EMAIL_KEY = 'nexolink_checkout_email';

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
    const storedEmail = localStorage.getItem(CHECKOUT_EMAIL_KEY);
    if (storedEmail) {
      setEmail(storedEmail);
      setEmailLocked(true);
      return;
    }

    const sessionId = localStorage.getItem(CHECKOUT_SESSION_KEY);
    if (!sessionId) return;

    const hydrateEmail = async () => {
      try {
        const res = await fetch(`/api/checkoutSession?id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (res.ok && data?.email) {
          localStorage.setItem(CHECKOUT_EMAIL_KEY, data.email);
          setEmail(data.email);
          setEmailLocked(true);
        }
      } catch {
        // ignore lookup failures for now
      }
    };

    hydrateEmail();
  }, []);

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

              <form className="space-y-10" onSubmit={(e) => e.preventDefault()}>
                  
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
                        onFocus={() => setFocusedField('org')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setOrgName(e.target.value)}
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
                        type="password"
                        value={password}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-transparent border-b border-charcoal/10 pl-8 py-4 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                      />
                  </div>

                  <div className="create-input pt-4">
                      <button className="w-full h-20 bg-charcoal text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] hover:bg-neon hover:text-charcoal transition-all shadow-2xl flex items-center justify-center gap-4 group overflow-hidden relative">
                          <span className="relative z-10">Request Node Access</span>
                          <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-2 transition-transform" />
                          <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      </button>
                  </div>

                  <div className="create-input text-center pt-8">
                      <p className="text-[10px] font-black uppercase tracking-widest text-charcoal/30">
                          Already synchronized? <button onClick={() => onNavigate?.('login')} className="text-charcoal hover:text-neon underline decoration-neon decoration-2 underline-offset-4">Log in to Core</button>
                      </p>
                  </div>
              </form>
          </div>
      </div>

    </div>
  );
};

export default CreatePage;
