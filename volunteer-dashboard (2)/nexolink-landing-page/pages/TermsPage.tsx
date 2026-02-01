
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Gavel, AlertCircle, FileCheck, Scale, ExternalLink, Download } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const TermCard: React.FC<{ title: string; content: string; icon: React.ReactNode; index: number }> = ({ title, content, icon, index }) => {
  return (
    <div className="term-card opacity-0 translate-y-12 relative p-12 bg-white border border-charcoal/5 rounded-[3rem] shadow-premium hover:shadow-2xl transition-all duration-700 group overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <ExternalLink className="w-4 h-4 text-neon" />
        </div>
        
        <div className="relative z-10">
            <div className="flex items-center justify-between mb-10">
                <div className="w-16 h-16 bg-charcoal text-neon rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500">
                    {icon}
                </div>
                <span className="font-mono text-[10px] text-charcoal/20 font-black tracking-[0.5em]">CLAUSE_0{index + 1}</span>
            </div>
            
            <h3 className="text-3xl font-display font-black text-charcoal tracking-tighter mb-6 uppercase italic">
                {title}
            </h3>
            
            <p className="text-lg text-charcoal/50 leading-relaxed font-medium group-hover:text-charcoal transition-colors duration-500">
                {content}
            </p>
        </div>
        
        {/* Animated background detail */}
        <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-neon/5 rounded-full scale-0 group-hover:scale-150 transition-transform duration-1000"></div>
    </div>
  );
};

const TermsPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      // 1. Hero Reveal
      const tl = gsap.timeline();
      tl.from(".terms-hero-text", {
        y: 100,
        opacity: 0,
        stagger: 0.1,
        duration: 1.2,
        ease: "expo.out"
      })
      .from(".terms-hero-sub", {
        opacity: 0,
        y: 20,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8");

      // 2. Terms Reveal
      gsap.to(".term-card", {
        y: 0,
        opacity: 1,
        stagger: 0.1,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".terms-grid",
          start: "top 80%",
        }
      });

      // 3. Horizontal Kinetic Parallax
      gsap.to(".terms-bg-kinetic", {
        xPercent: -40,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: 1.5
        }
      });

    }, containerRef);

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  const terms = [
    {
      title: "Ironclad Agreement",
      content: "By using NexoLink, you agree that the platform is provided 'AS IS'. We are not liable for any inaccuracies, errors, or service failures.",
      icon: <FileCheck className="w-8 h-8" />
    },
    {
      title: "User Obligations",
      content: "Log hours honestly. You are solely responsible for the content you upload and any consequences arising from inaccurate logs.",
      icon: <Scale className="w-8 h-8" />
    },
    {
      title: "Total Liability Waiver",
      content: "NexoLink is NOT responsible for any harm, injury, or loss occurring during volunteer events. We do not vet third parties; all risks are yours.",
      icon: <AlertCircle className="w-8 h-8" />
    },
    {
      title: "Strategic Disclaimer",
      content: "All information is safely stored in Firebase. We make no guarantees regarding platform uptime, data permanence, or the verification of hours. Blame cannot be assigned to NexoLink.",
      icon: <Gavel className="w-8 h-8" />
    }
  ];

  return (
    <div ref={containerRef} className="bg-white min-h-screen selection:bg-neon selection:text-charcoal overflow-x-hidden">
      
      {/* SECTION 1: INDUSTRIAL HERO */}
      <section className="relative h-[85vh] flex flex-col items-center justify-center bg-white overflow-hidden">
        {/* Kinetic Layer */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex flex-col justify-center select-none">
            <div className="terms-bg-kinetic whitespace-nowrap text-[22vw] font-display font-black text-charcoal leading-none">
                TERMS OF SERVICE TERMS OF SERVICE TERMS OF SERVICE
            </div>
        </div>

        <div className="container mx-auto px-6 text-center z-10 relative">
            <div className="mb-12 inline-flex items-center gap-4 px-6 py-2 bg-charcoal rounded-full">
                <span className="font-mono text-[9px] text-neon font-black uppercase tracking-[0.4em]">Protocol_Ruleset_4.2.1</span>
            </div>
            
            <h1 className="terms-hero-text text-8xl md:text-[14rem] font-display font-black tracking-tighter leading-[0.75] mb-12">
                LEGAL <br/> 
                <span className="text-transparent" style={{ WebkitTextStroke: '2.5px #0F1115' }}>SYNTAX.</span>
            </h1>

            <p className="terms-hero-sub mt-8 text-xl md:text-2xl font-medium text-charcoal/40 max-w-2xl mx-auto italic uppercase tracking-[0.2em]">
                Straightforward guidelines for community programs.
            </p>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
            <div className="w-[1px] h-12 bg-gradient-to-b from-charcoal to-transparent"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-charcoal/20">Read Clauses</span>
        </div>
      </section>

      {/* SECTION 2: TERMS GRID */}
      <section className="py-48 bg-softGray relative">
        <div className="container mx-auto px-6 max-w-7xl">
            <div className="terms-grid grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                {terms.map((term, i) => (
                    <TermCard 
                        key={i} 
                        index={i} 
                        title={term.title} 
                        content={term.content} 
                        icon={term.icon} 
                    />
                ))}
            </div>
        </div>
        
        {/* Background typographic detail */}
        <div className="absolute bottom-12 right-12 font-mono text-[8px] text-charcoal/10 uppercase tracking-[1em] rotate-90 origin-right">
            Verification_Integrity_Module
        </div>
      </section>

      {/* SECTION 3: SYSTEM ACCEPTANCE */}
      <section className="py-48 container mx-auto px-6">
        <div className="bg-charcoal rounded-[4rem] p-20 md:p-32 text-center relative overflow-hidden group shadow-2xl">
            <div className="absolute inset-0 bg-neon opacity-0 group-hover:opacity-5 transition-opacity duration-1000"></div>
            <div className="relative z-10">
                <h2 className="text-5xl md:text-8xl font-display font-black text-white tracking-tighter mb-12 uppercase leading-none italic">
                    ACCEPT THE <br/> <span className="text-neon">PROTOCOL.</span>
                </h2>
                <p className="text-xl text-white/40 font-medium mb-16 max-w-lg mx-auto">
                    By proceeding, you acknowledge these terms for using NexoLink.
                </p>
                <div className="flex flex-col md:flex-row gap-6 justify-center">
                    <button className="px-12 py-7 bg-neon text-charcoal rounded-3xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl">
                        I Agree & Accept Responsibility
                    </button>
                </div>
            </div>
            
            {/* Ambient detail */}
            <div className="absolute top-10 left-10 w-2 h-2 bg-neon rounded-full animate-pulse"></div>
            <div className="absolute bottom-10 right-10 w-2 h-2 bg-neon rounded-full animate-pulse delay-500"></div>
        </div>
      </section>

      <style>{`
        .shadow-premium {
          box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.05);
        }
      `}</style>
    </div>
  );
};

export default TermsPage;
