
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Shield, Lock, Fingerprint, EyeOff, FileText, ChevronRight, AlertCircle } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const PolicySection: React.FC<{ title: string; content: string; icon: React.ReactNode; index: number }> = ({ title, content, icon, index }) => {
  return (
    <div className="policy-block border-b border-charcoal/5 py-16 md:py-24 group overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
            <div className="md:col-span-1">
                <div className="text-neon font-mono text-xs font-bold tracking-widest opacity-30 group-hover:opacity-100 transition-opacity">
                    0{index + 1}
                </div>
            </div>
            <div className="md:col-span-4 flex flex-col items-start gap-6">
                <div className="w-14 h-14 bg-softGray rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:bg-charcoal group-hover:text-neon group-hover:rotate-12">
                    {icon}
                </div>
                <h3 className="text-3xl md:text-5xl font-display font-black tracking-tighter uppercase leading-none italic">
                    {title}
                </h3>
            </div>
            <div className="md:col-span-7">
                <p className="text-xl md:text-2xl text-charcoal/50 leading-relaxed font-medium group-hover:text-charcoal transition-colors duration-500">
                    {content}
                </p>
                <div className="mt-10 flex items-center gap-2 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-700">
                    <div className="w-12 h-px bg-neon"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-charcoal">Verified Security Node</span>
                </div>
            </div>
        </div>
    </div>
  );
};

const PrivacyPolicyPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      // 1. Hero Reveal
      const tl = gsap.timeline();
      tl.from(".policy-hero-char", {
        y: 100,
        opacity: 0,
        stagger: 0.03,
        duration: 1.2,
        ease: "expo.out"
      })
      .from(".policy-hero-sub", {
        opacity: 0,
        y: 20,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8");

      // 2. Section Stagger
      gsap.from(".policy-block", {
        y: 100,
        opacity: 0,
        stagger: 0.2,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".policy-list",
          start: "top 85%",
        }
      });

      // 3. Kinetic BG
      gsap.to(".bg-kinetic-text", {
        xPercent: -50,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: 1
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const policies = [
    {
      title: "Data Sovereignty",
      content: "We store volunteer profiles, hours, and approvals securely in our Firebase cloud infrastructure. You control your profile and can request access or deletion at any time.",
      icon: <Shield className="w-6 h-6" />
    },
    {
      title: "Neural Enclave",
      content: "We use standard authentication and do not require biometric data. If your device supports biometrics, it stays on your device.",
      icon: <Fingerprint className="w-6 h-6" />
    },
    {
      title: "Audit Transparency",
      content: "Organizations can view hours and approval status for their programs. Personal contact details are shared only with your permission.",
      icon: <EyeOff className="w-6 h-6" />
    },
    {
      title: "Ledger Permanence",
      content: "Verified hours are saved to your service history and can be exported as CSV or PDF whenever you need them.",
      icon: <Lock className="w-6 h-6" />
    },
    {
      title: "Zero Liability Node",
      content: "NexoLink is a facilitation platform. We are not responsible for data loss, service interruptions, or unauthorized access. Users assume all data risks.",
      icon: <AlertCircle className="w-6 h-6" />
    }
  ];

  return (
    <div ref={containerRef} className="bg-white min-h-screen selection:bg-neon selection:text-charcoal overflow-x-hidden">
      
      {/* SECTION 1: KINETIC HERO */}
      <section className="relative h-[80vh] flex flex-col items-center justify-center bg-white overflow-hidden">
        {/* Kinetic Background Text */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex flex-col justify-center select-none">
            <div className="bg-kinetic-text whitespace-nowrap text-[25vw] font-display font-black text-charcoal leading-none">
                PRIVACY PROTOCOL PRIVACY PROTOCOL PRIVACY PROTOCOL
            </div>
        </div>

        <div className="container mx-auto px-6 text-center z-10">
            <div className="mb-10 inline-flex items-center gap-3 px-6 py-2 border border-charcoal/5 rounded-full">
                <div className="w-2 h-2 bg-neon rounded-full animate-pulse"></div>
                <span className="font-mono text-[10px] text-charcoal/50 font-black uppercase tracking-[0.3em]">Compliance v4.2.0</span>
            </div>
            
            <h1 className="text-7xl md:text-[12rem] font-display font-black tracking-tighter leading-[0.8] mb-12">
                <div className="overflow-hidden">
                    {"PRIVACY".split("").map((c, i) => (
                        <span key={i} className="policy-hero-char inline-block">{c}</span>
                    ))}
                </div>
                <div className="overflow-hidden">
                    <span className="text-transparent" style={{ WebkitTextStroke: '2px #0F1115' }}>
                        {"POLICY".split("").map((c, i) => (
                            <span key={i} className="policy-hero-char inline-block">{c}</span>
                        ))}
                    </span>
                </div>
            </h1>

            <p className="policy-hero-sub mt-8 text-xl md:text-2xl font-medium text-charcoal/40 max-w-2xl mx-auto italic uppercase tracking-[0.2em]">
                Clear, student-friendly privacy practices for your mission.
            </p>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
            <div className="w-px h-16 bg-charcoal/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1/2 bg-neon animate-[scrollIndicator_2s_infinite]"></div>
            </div>
        </div>
      </section>

      {/* SECTION 2: THE POLICY MATRIX */}
      <section className="py-32 container mx-auto px-6">
        <div className="policy-list max-w-7xl mx-auto">
            {policies.map((policy, i) => (
                <PolicySection 
                    key={i} 
                    index={i} 
                    title={policy.title} 
                    content={policy.content} 
                    icon={policy.icon} 
                />
            ))}
        </div>
      </section>

      {/* SECTION 3: DATA EXPORT CTA */}
      <section className="py-48 bg-softGray">
        <div className="container mx-auto px-6 max-w-5xl text-center">
            <div className="w-24 h-24 bg-charcoal rounded-3xl flex items-center justify-center mx-auto mb-12 shadow-2xl">
                <FileText className="text-neon w-10 h-10" />
            </div>
            <h2 className="text-5xl md:text-7xl font-display font-black text-charcoal tracking-tighter leading-none mb-10">
                EXPORT YOUR <br/> <span className="text-transparent" style={{ WebkitTextStroke: '1.5px #0F1115' }}>DATASPHERE.</span>
            </h2>
            <p className="text-xl text-charcoal/40 font-medium mb-16 max-w-xl mx-auto">
                Export your service history as CSV or PDF for schools, programs, or records.
            </p>
            <button className="group relative px-14 py-8 bg-charcoal text-white rounded-[2rem] font-black uppercase tracking-widest text-xs overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-2xl">
                <div className="absolute inset-0 bg-neon translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span className="relative z-10 group-hover:text-charcoal flex items-center gap-4">
                    Export My Data
                    <ChevronRight className="w-4 h-4" />
                </span>
            </button>
        </div>
      </section>

      <style>{`
        @keyframes scrollIndicator {
            0% { transform: translateY(-100%); }
            100% { transform: translateY(200%); }
        }
      `}</style>
    </div>
  );
};

export default PrivacyPolicyPage;
