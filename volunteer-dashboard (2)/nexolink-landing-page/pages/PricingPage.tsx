
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, Cpu, Plus, Minus } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const FAQItem: React.FC<{ question: string; answer: string; index: number }> = ({ question, answer, index }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="faq-row group border-b border-charcoal/5 py-8 opacity-0">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left py-2 transition-all duration-500 hover:pl-4"
      >
        <div className="flex items-start gap-6 flex-1 min-w-0">
           <span className="font-mono text-[10px] text-charcoal/30 font-bold">0{index + 1}</span>
           <h4 className="text-xl md:text-3xl font-display font-black tracking-tighter group-hover:text-neon transition-colors duration-300 leading-tight break-words">
             {question}
           </h4>
        </div>
        <div className={`w-10 h-10 rounded-full border border-charcoal/10 flex items-center justify-center transition-all duration-500 shrink-0 ${isOpen ? 'bg-charcoal text-neon border-charcoal' : 'group-hover:border-neon group-hover:bg-neon group-hover:text-charcoal'}`}>
           {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-6 pb-2 pl-14 pr-4 max-w-3xl">
              <p className="text-lg text-charcoal/60 leading-relaxed font-medium">
                {answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface PricingPageProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'story' | 'opinion' | 'login' | 'create' | 'privacy' | 'terms') => void;
}

const PricingPage: React.FC<PricingPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalSectionRef = useRef<HTMLDivElement>(null);
  const horizontalTrackRef = useRef<HTMLDivElement>(null);
  const [isAnnual, setIsAnnual] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; isError?: boolean }>({
    visible: false,
    message: '',
    isError: false
  });

  useEffect(() => {
    // Ensure we start at top
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      // 1. Entrance Hero Animation
      const tl = gsap.timeline();
      tl.from(".blog-word", {
        y: 150,
        opacity: 0,
        rotateX: -30,
        stagger: 0.1,
        duration: 1.4,
        ease: "power4.out",
        delay: 0.2
      })
      .from(".pricing-subtitle", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8")
      .from(".pricing-toggle", {
        y: 20,
        opacity: 0,
        duration: 0.6
      }, "-=0.6");

      // 2. Pricing Cards - No animation as requested

      // 3. Horizontal Scroll Section
      if (horizontalTrackRef.current && horizontalSectionRef.current) {
        const track = horizontalTrackRef.current;
        const section = horizontalSectionRef.current;
        
        gsap.to(track, {
          x: () => -(track.scrollWidth - window.innerWidth),
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${track.scrollWidth - window.innerWidth + 80}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            anticipatePin: 1,
          }
        });
      }

      // 4. FAQ Reveal - Targeted specifically
      gsap.to(".faq-row", {
        y: 0,
        opacity: 1,
        stagger: 0.1,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".faq-list",
          start: "top 85%",
          toggleActions: "play none none none"
        }
      });

      // Refresh on resize/orientation changes to avoid jitter
      const handleRefresh = () => ScrollTrigger.refresh();
      window.addEventListener('resize', handleRefresh);
      window.addEventListener('orientationchange', handleRefresh);
      return () => {
        window.removeEventListener('resize', handleRefresh);
        window.removeEventListener('orientationchange', handleRefresh);
      };
    }, containerRef);

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  const tiers = [
    {
      name: "Organization",
      price: "5",
      annualPrice: "50",
      desc: "For nonprofits and community groups.",
      features: ["Admin dashboard", "Messaging", "Create events", "CSV/Excel exports"],
      theme: "white"
    },
    {
      name: "School",
      price: "5",
      annualPrice: "50",
      desc: "For schools and student programs.",
      features: ["Admin dashboard", "Messaging", "Create events", "CSV/Excel exports"],
      theme: "neon",
      popular: true
    }
  ];

  const faqs = [
    {
      question: "How do you verify volunteer hours?",
      answer: "Organizations can approve hours directly in the admin dashboard. Volunteers submit dates, descriptions, and activity details for quick review."
    },
    {
      question: "Can I export my impact portfolio?",
      answer: "Yes. Volunteers and admins can export verified service history as CSV or PDF for schools, applications, or audits."
    },
    {
      question: "Is there a free trial?",
      answer: "Yes, you have a 14 day free trial when you purchase a plan."
    },
    {
      question: "How secure is my biometric data?",
      answer: "NexoLink uses secure authentication and encrypted storage on Firebase. We only collect what’s needed to verify service and support reporting."
    }
  ];

  const CHECKOUT_SESSION_KEY = 'nexolink_checkout_session_id';
  const CHECKOUT_EMAIL_KEY = 'nexolink_checkout_email';

  const resolveEnvValue = (key: string) => {
    const env = (import.meta as any)?.env || {};
    const w = typeof window !== 'undefined' ? (window as any) : {};
    return w[key] || env[key] || '';
  };

  const resolveCheckoutPrice = (planKey: 'organization' | 'school', intervalKey: 'monthly' | 'yearly') => {
    if (planKey === 'school' && intervalKey === 'yearly') {
      return resolveEnvValue('STRIPE_PRICE_SCHOOL_YEARLY');
    }
    if (planKey === 'school') {
      return resolveEnvValue('STRIPE_PRICE_SCHOOL');
    }
    if (intervalKey === 'yearly') {
      return resolveEnvValue('STRIPE_PRICE_YEARLY');
    }
    return resolveEnvValue('STRIPE_PRICE_MONTHLY');
  };

  const handleCheckout = async (planKey: 'organization' | 'school') => {
    const existingSessionId = localStorage.getItem(CHECKOUT_SESSION_KEY);
    if (existingSessionId) {
      setToast({ visible: true, message: 'Connecting to Stripe', isError: false });
      try {
        const lookup = await fetch(`/api/checkoutSession?id=${encodeURIComponent(existingSessionId)}`);
        const lookupData = await lookup.json();
        if (lookup.ok && lookupData?.email) {
          localStorage.setItem(CHECKOUT_EMAIL_KEY, lookupData.email);
          onNavigate?.('create');
          return;
        }
      } catch {
        // fall through to new checkout
      }
    }

    const intervalKey = isAnnual ? 'yearly' : 'monthly';
    const priceId = resolveCheckoutPrice(planKey, intervalKey);
    const plan = planKey === 'school' ? 'school' : intervalKey;

    setToast({ visible: true, message: 'Connecting to Stripe', isError: false });

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          priceId: priceId || undefined,
          trial: true
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || 'Unable to start checkout.');
      }
      if (data?.sessionId) {
        localStorage.setItem(CHECKOUT_SESSION_KEY, data.sessionId);
      }
      window.location.href = data.url;
    } catch (error: any) {
      setToast({
        visible: true,
        message: error?.message || 'Unable to connect to Stripe.',
        isError: true
      });
      window.setTimeout(() => {
        setToast((prev) => ({ ...prev, visible: false }));
      }, 2400);
    }
  };

  return (
    <div ref={containerRef} className="bg-white min-h-screen text-charcoal selection:bg-neon selection:text-charcoal overflow-x-hidden">
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className={`fixed bottom-8 right-8 z-[2000] rounded-2xl px-6 py-4 shadow-2xl border backdrop-blur-xl ${
              toast.isError ? 'bg-white text-charcoal border-charcoal/10' : 'bg-charcoal text-white border-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              {!toast.isError && (
                <span className="inline-flex h-4 w-4 items-center justify-center">
                  <span className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin"></span>
                </span>
              )}
              <span className="text-xs font-black uppercase tracking-widest">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* SECTION 1: HERO */}
      <section id="hero" className="relative h-screen flex flex-col items-center justify-center bg-white overflow-hidden z-10">
        <div className="container mx-auto px-6 relative z-10">
          <div className="text-center">
            <div className="overflow-hidden mb-2">
                 <h1 className="blog-word text-[13vw] md:text-[12rem] font-display font-black tracking-tighter leading-[0.8] text-charcoal uppercase">
                    INVEST IN
                 </h1>
            </div>
            <div className="overflow-hidden">
                 <h1 className="blog-word text-[13vw] md:text-[12rem] font-display font-black tracking-tighter leading-[0.8] text-transparent uppercase" style={{ WebkitTextStroke: '3px #0F1115' }}>
                    CHANGE.
                 </h1>
            </div>
            <p className="pricing-subtitle mt-8 text-xl md:text-2xl font-medium text-charcoal/40 max-w-2xl mx-auto italic uppercase tracking-[0.2em]">
                Transparent plans for organizations of all sizes.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2: PRICING GRID */}
      <section id="plans" className="relative py-48 bg-white overflow-hidden">
        <div className="container mx-auto px-6 relative z-10">
          <div className="text-center mb-24">
            <div className="pricing-toggle inline-flex items-center bg-softGray p-1.5 rounded-full border border-charcoal/5 shadow-inner">
              <button 
                onClick={() => setIsAnnual(false)}
                className={`px-10 py-4 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 ${!isAnnual ? 'bg-white shadow-premium text-charcoal scale-105' : 'opacity-40 hover:opacity-100'}`}
              >
                Monthly
              </button>
              <button 
                onClick={() => setIsAnnual(true)}
                className={`px-10 py-4 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 ${isAnnual ? 'bg-charcoal text-white shadow-xl scale-105' : 'opacity-40 hover:opacity-100'}`}
              >
                Annual
              </button>
            </div>
          </div>

          <div className="pricing-grid grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto min-h-[600px] justify-center">
            {tiers.map((tier, i) => (
              <div 
                key={i} 
                className={`pricing-card p-12 rounded-[3.5rem] border transition-all duration-500 flex flex-col relative overflow-hidden group
                  ${tier.theme === 'white' ? 'bg-white border-charcoal/10 shadow-premium' : ''}
                  ${tier.theme === 'neon' ? 'bg-neon border-neon shadow-[0_40px_80px_-20px_rgba(158,255,79,0.5)] z-10' : ''}
                  ${tier.theme === 'black' ? 'bg-charcoal border-charcoal text-white shadow-2xl' : ''}
                `}
              >
                
                <h3 className="text-4xl font-black tracking-tighter mb-4 italic uppercase">{tier.name}</h3>
                <p className={`text-sm font-medium mb-12 leading-relaxed ${tier.theme === 'black' ? 'text-white/50' : 'text-charcoal/50'}`}>{tier.desc}</p>
                
                <div className="mb-12">
                  <div className="flex items-baseline gap-1">
                    <span className="text-7xl font-display font-black tracking-tighter">
                      ${isAnnual ? tier.annualPrice : tier.price}
                    </span>
                    <span className={`text-sm font-bold opacity-40`}>{isAnnual ? '/yr' : '/mo'}</span>
                    {isAnnual && (
                      <span className={`ml-3 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${tier.theme === 'neon' ? 'bg-charcoal text-neon' : 'bg-neon text-charcoal'}`}>
                        17% off
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-5 mb-14 flex-1">
                  {tier.features.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${tier.theme === 'neon' ? 'bg-charcoal text-neon' : 'bg-neon text-charcoal'}`}>
                        <Check className="w-3.5 h-3.5 stroke-[4px]" />
                      </div>
                      <span className="text-sm font-bold tracking-tight">{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleCheckout(tier.name.toLowerCase() === 'school' ? 'school' : 'organization')}
                  className={`w-full py-6 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all hover:scale-105 active:scale-95 ${tier.theme === 'white' ? 'bg-charcoal text-white hover:bg-neon hover:text-charcoal shadow-xl' : tier.theme === 'neon' ? 'bg-charcoal text-white shadow-2xl' : 'bg-white text-charcoal hover:bg-neon shadow-xl'}`}
                >
                  Select {tier.name}
                </button>
                <div className={`mt-4 text-[10px] font-black uppercase tracking-[0.3em] ${tier.theme === 'neon' ? 'text-charcoal/60' : 'text-charcoal/40'}`}>
                  14 day free trial
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 2: THE HORIZONTAL TRACK */}
      <section ref={horizontalSectionRef} className="relative bg-softGray overflow-hidden min-h-screen">
        <div ref={horizontalTrackRef} className="flex h-screen items-center whitespace-nowrap will-change-transform">
          <div className="w-full flex-shrink-0 flex items-center justify-center px-12 md:px-32 border-r border-charcoal/5" style={{ width: 'calc(100vw - 80px)' }}>
            <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-20 items-center whitespace-normal">
              <div>
                <h2 className="text-7xl md:text-9xl font-display font-black tracking-tighter mb-8 leading-[0.9]">QR <br/> Kiosk</h2>
                <p className="text-xl md:text-2xl font-medium text-charcoal/40 leading-relaxed max-w-lg">
                  One-scan check‑in and checkout for events. Perfect for fast, verified attendance in busy programs.
                </p>
              </div>
              <div className="aspect-square bg-white rounded-[4.5rem] shadow-premium flex items-center justify-center p-16 relative">
                <div className="w-40 h-40 rounded-3xl border-2 border-charcoal/10 flex items-center justify-center bg-softGray relative overflow-hidden">
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(158,255,79,0.4),transparent)] animate-[scanLine_2.2s_infinite]"></div>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="w-6 h-6 border border-charcoal/20 rounded-sm bg-white"></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full flex-shrink-0 flex items-center justify-center px-12 md:px-32 border-r border-charcoal/5" style={{ width: 'calc(100vw - 80px)' }}>
            <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-20 items-center whitespace-normal">
              <div>
                <h2 className="text-7xl md:text-9xl font-display font-black tracking-tighter mb-8 leading-[0.9]">Real-time <br/> Approvals</h2>
                <p className="text-xl md:text-2xl font-medium text-charcoal/40 leading-relaxed max-w-lg">
                  Admins can approve or reject hours instantly and message volunteers directly.
                </p>
              </div>
              <div className="aspect-square bg-white rounded-[4.5rem] shadow-premium flex items-center justify-center p-16 relative overflow-hidden group">
                <div className="absolute inset-0 bg-neon/10 group-hover:bg-neon/20 transition-colors"></div>
                <Cpu className="w-40 h-40 text-charcoal relative z-10 transition-transform duration-700 group-hover:scale-110" />
              </div>
            </div>
          </div>

          <div className="w-full h-full flex-shrink-0 flex items-center justify-center px-12 md:px-32" style={{ width: 'calc(100vw - 80px)' }}>
            <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-20 items-center whitespace-normal">
              <div>
                <h2 className="text-7xl md:text-9xl font-display font-black tracking-tighter mb-8 leading-[0.9]">Audit- <br/> Ready</h2>
                <p className="text-xl md:text-2xl font-medium text-charcoal/40 leading-relaxed max-w-lg">
                  Export CSV/PDF reports for schools, councils, grants, and compliance.
                </p>
              </div>
              <div className="aspect-square bg-charcoal rounded-[4.5rem] shadow-2xl flex items-center justify-center p-16 group">
                <div className="w-32 h-32 rounded-3xl border border-white/10 flex items-center justify-center bg-white/5">
                  <span className="text-neon font-black text-2xl tracking-widest">CSV</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: FAQ */}
      <section className="py-48 bg-white overflow-hidden min-h-screen">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="mb-12">
            <h2 className="text-6xl md:text-[8rem] font-display font-black tracking-tighter leading-[0.85] mb-6 uppercase">
              FREQUENT <br /> QUESTIONS.
            </h2>
            <p className="text-xl text-charcoal/40 font-medium max-w-2xl leading-relaxed">
              Everything you need to know about NexoLink for volunteers and organizations.
            </p>
          </div>
          <div className="faq-list min-h-[400px] flex flex-col gap-4">
            {faqs.map((faq, i) => (
              <FAQItem key={i} index={i} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: CALL TO ACTION */}
      <section className="pb-48 container mx-auto px-6">
        <div className="bg-neon rounded-[4.5rem] p-16 md:p-32 text-center shadow-[0_60px_100px_-20px_rgba(158,255,79,0.4)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>
          <div className="relative z-10">
            <h2 className="text-6xl md:text-9xl font-display font-black text-charcoal tracking-tighter mb-16 leading-[0.85] italic">
              READY TO <br/> SCALE IMPACT?
            </h2>
            <button
              onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="bg-charcoal text-white px-14 py-8 rounded-3xl font-black text-xl hover:scale-105 hover:bg-sidebar transition-all shadow-2xl flex items-center gap-6 mx-auto group/btn"
            >
              Let's GO!
            </button>
          </div>
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-white/20 blur-[100px] rounded-full pointer-events-none group-hover:scale-150 transition-transform duration-1000"></div>
        </div>
      </section>

      <style>{`
        .will-change-transform {
          will-change: transform;
        }
        .shadow-premium {
          box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.08);
        }
        @keyframes scanLine {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
      `}</style>
    </div>
  );
};

export default PricingPage;
