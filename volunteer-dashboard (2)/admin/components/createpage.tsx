import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Building2, Mail, Lock, Plus, ArrowRight, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../lib/firebase';

interface CreatePageProps {
  onBack: () => void;
  onCreated?: () => void;
}

type SubAdminAccount = {
  id: string;
  email: string;
  displayName?: string;
  groupName?: string;
  status?: string;
};

export const CreatePage: React.FC<CreatePageProps> = ({ onBack, onCreated }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const functions = useMemo(() => getFirebaseFunctions(), []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from('.create-half', {
        y: '-100%',
        opacity: 0,
        duration: 1.4,
        stagger: 0.1,
        ease: 'power4.inOut'
      })
      .from('.create-title', {
        y: 60,
        opacity: 0,
        rotateX: -30,
        stagger: 0.1,
        duration: 1,
        ease: 'expo.out'
      }, '-=0.8')
      .from('.create-subtitle', {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: 'power2.out'
      }, '-=0.8')
      .from('.create-input', {
        x: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 0.8,
        ease: 'power3.out'
      }, '-=0.6')
      .from('.create-visual', {
        scale: 0.5,
        opacity: 0,
        duration: 1.2,
        ease: 'back.out(1.7)'
      }, '-=1');

      gsap.to('.nexus-particle', {
        y: 'random(-100, 100)',
        x: 'random(-100, 100)',
        duration: 'random(10, 20)',
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleCreateSubadmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!title.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }

    setIsLoading(true);
    try {
      const call = httpsCallable(functions, 'createSubAdminPortal');
      await call({
        title: title.trim(),
        email: email.trim(),
        password,
      });
      setNotice('Subadmin created successfully.');
      setTitle('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      onCreated?.();
    } catch (err: any) {
      setError(err?.message || 'Unable to create subadmin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div ref={containerRef} data-bg="light" className="w-full h-full min-h-full bg-white flex flex-col md:flex-row overflow-hidden relative">
        <div className="create-half w-full md:w-[45%] lg:w-[50%] bg-white flex items-center justify-center p-12 relative overflow-hidden order-2 md:order-1 min-h-[380px] border-r border-charcoal/10">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none"></div>

        <button
          type="button"
          onClick={onBack}
          className="absolute top-6 left-6 z-30 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-charcoal/20 text-charcoal/70 text-xs font-black uppercase tracking-widest hover:bg-charcoal/5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="relative z-10 max-w-lg text-center md:text-left pt-14 md:pt-0">
          <div className="create-visual mb-12 flex justify-center md:justify-start">
            <div className="w-24 h-24 bg-neon rounded-3xl flex items-center justify-center shadow-[0_0_60px_rgba(158,255,79,0.4)] rotate-12 group transition-transform hover:rotate-0">
              <Building2 className="w-12 h-12 text-charcoal" />
            </div>
          </div>
          <div className="overflow-hidden">
            <h2 className="create-title text-4xl md:text-7xl font-display font-black text-charcoal leading-[0.9] tracking-tighter uppercase mb-6 italic">
              CREATE <br /> <span className="text-neon">SUBADMIN.</span>
            </h2>
          </div>
          <p className="create-subtitle text-charcoal/40 text-lg md:text-xl font-medium italic uppercase tracking-[0.2em] mb-12">
            Same power. Separate group data.
          </p>

          <div className="create-title space-y-6">
            {[
              { icon: <Plus className="w-4 h-4" />, text: 'isolated group portal' },
              { icon: <Plus className="w-4 h-4" />, text: 'shares org code and QR' },
              { icon: <Plus className="w-4 h-4" />, text: 'rolls up to super admin' }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 text-charcoal/60 font-mono text-xs uppercase tracking-widest">
                <div className="w-6 h-6 rounded-full border border-charcoal/20 flex items-center justify-center text-charcoal">
                  {item.icon}
                </div>
                {item.text}
              </div>
            ))}
          </div>
        </div>

        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="nexus-particle absolute w-1 h-1 bg-charcoal/20 rounded-full" style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`
          }}></div>
        ))}
      </div>

        <div className="create-half w-full md:w-[55%] lg:w-[50%] bg-charcoal flex items-center justify-center p-8 md:p-16 lg:p-20 pt-20 md:pt-16 order-1 md:order-2 relative z-20 md:rounded-l-[4rem] md:overflow-hidden shadow-2xl">
          <div className="max-w-md w-full">
          <div className="mb-14">
            <span className="font-mono text-[10px] text-charcoal bg-neon px-3 py-1 rounded-full uppercase tracking-widest font-bold mb-6 inline-block">Account Setup</span>
            <h1 className="text-4xl md:text-5xl font-display font-black text-white tracking-tighter uppercase italic leading-none">
              Initiate <br /> Subadmin
            </h1>
          </div>

          <form className="space-y-10" onSubmit={handleCreateSubadmin}>
            <div className="create-input relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-500">
                <Building2 className={`w-5 h-5 transition-colors ${focusedField === 'title' ? 'text-neon' : 'text-white/20'}`} />
              </div>
              <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'title' || title ? 'text-white -translate-y-12 scale-90 opacity-40' : 'text-white/30'}`}>
                Subadmin Title
              </label>
              <input
                type="text"
                value={title}
                autoComplete="off"
                name="subadmin_title"
                onFocus={() => setFocusedField('title')}
                onBlur={() => setFocusedField(null)}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent border-b border-white/15 pl-8 py-4 text-lg font-bold text-white focus:outline-none focus:border-neon transition-colors"
              />
            </div>

            <div className="create-input relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none">
                <Mail className={`w-5 h-5 transition-colors ${focusedField === 'email' ? 'text-neon' : 'text-white/20'}`} />
              </div>
              <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'email' || email ? 'text-white -translate-y-12 scale-90 opacity-40' : 'text-white/30'}`}>
                Subadmin Email
              </label>
              <input
                type="email"
                value={email}
                autoComplete="email"
                name="subadmin_email"
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border-b border-white/15 pl-8 py-4 text-lg font-bold text-white focus:outline-none focus:border-neon transition-colors"
              />
            </div>

            <div className="create-input relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none">
                <Lock className={`w-5 h-5 transition-colors ${focusedField === 'password' ? 'text-neon' : 'text-white/20'}`} />
              </div>
              <label className={`absolute left-8 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-widest transition-all duration-300 pointer-events-none ${focusedField === 'password' || password ? 'text-white -translate-y-12 scale-90 opacity-40' : 'text-white/30'}`}>
                System Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoComplete="new-password"
                name="subadmin_password"
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border-b border-white/15 pl-8 pr-10 py-4 text-lg font-bold text-white focus:outline-none focus:border-neon transition-colors"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="create-input pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full h-20 bg-white text-charcoal rounded-[2rem] font-black uppercase tracking-[0.2em] text-[10px] transition-all shadow-2xl flex items-center justify-center gap-4 group overflow-hidden relative ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-neon hover:text-charcoal'}`}
              >
                <span className="relative z-10">{isLoading ? 'Creating Subadmin…' : 'Create Subadmin'}</span>
                <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-2 transition-transform" />
                <div className="absolute inset-0 bg-charcoal/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              </button>
            </div>

            {error && (
              <div className="create-input">
                <p className="text-xs font-black uppercase tracking-widest text-red-300">{error}</p>
              </div>
            )}

            {notice && (
              <div className="create-input">
                <p className="text-xs font-black uppercase tracking-widest text-lime-300">{notice}</p>
              </div>
            )}
          </form>
        </div>
      </div>
      </div>
    </>
  );
};
