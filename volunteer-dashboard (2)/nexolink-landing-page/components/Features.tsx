
import React, { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Cpu, Globe, Shield, Database } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const features = [
  {
    id: "01",
    title: "OPPORTUNITY DISCOVERY",
    desc: "Discover opportunities by category and community need with fast, student-friendly onboarding.",
    icon: <Cpu className="w-8 h-8" />,
    stat: "1.2k",
    statLabel: "Volunteers"
  },
  {
    id: "02",
    title: "HOUR APPROVALS",
    desc: "Quick approvals and clear records replace paper forms and spreadsheet chaos.",
    icon: <Globe className="w-8 h-8" />,
    stat: "98.1k",
    statLabel: "Hours"
  },
  {
    id: "03",
    title: "SERVICE RECORDS",
    desc: "Build a verified service history with badges and recognition that keep volunteers engaged.",
    icon: <Shield className="w-8 h-8" />,
    stat: "1",
    statLabel: "Organizations"
  },
  {
    id: "04",
    title: "IMPACT EXPORTS",
    desc: "Export CSV/PDF reports for schools, districts, councils, and grant providers.",
    icon: <Database className="w-8 h-8" />,
    stat: "4ms",
    statLabel: "Latency"
  }
];

const Features: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement[]>([]);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      
      const cards = cardsRef.current;
      // Filter out any null refs that might have occurred during re-renders
      const validCards = cards.filter(Boolean);
      
      if (validCards.length === 0) return;

      // 1. Initial State: All cards start below the viewport, except the first one
      gsap.set(validCards, { 
        y: window.innerHeight + 100, 
        scale: 0.9, 
        autoAlpha: 0,
        filter: "blur(10px) brightness(0.5)"
      });
      
      // Set First Card active immediately
      gsap.set(validCards[0], { 
        y: 0, 
        scale: 1, 
        autoAlpha: 1,
        filter: "blur(0px) brightness(1)",
        zIndex: 1
      });

      const totalScroll = 3000;

      // 2. Master Timeline
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: `+=${totalScroll}`,
          pin: true,
          pinSpacing: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        }
      });

      // 3. Stacking Logic
      // Iterate through cards starting from the second one (index 1)
      validCards.forEach((card, i) => {
        if (i === 0) return; 

        // Calculate timing
        const duration = 1;
        const position = i; // Run strictly in sequence based on index

        // A. Animate Current Card IN
        tl.to(card, {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          filter: "blur(0px) brightness(1)",
          zIndex: i + 1, // Ensure it sits on top
          duration: duration,
          ease: "power3.out"
        }, position); // Start at absolute time 'i'

        // B. Animate ALL Previous Cards OUT (Recede into stack)
        // This fixes the issue where only the immediate neighbor moved.
        // We iterate backwards from current index - 1 down to 0.
        for (let j = 0; j < i; j++) {
            const prevCard = validCards[j];
            const distance = i - j; // How far back in the stack it is (1, 2, 3...)
            
            tl.to(prevCard, {
                scale: 1 - (distance * 0.05), // 0.95, 0.90, 0.85...
                y: -(distance * 40),          // Move up slightly to show depth: -40px, -80px...
                filter: `blur(${distance * 2}px) brightness(${1 - (distance * 0.15)})`, // Blur and darken
                duration: duration,
                ease: "power3.out"
            }, position); // Sync with incoming card
        }
      });

      // Progress Line Animation
      tl.to(".progress-bar-fill", {
        height: "100%",
        ease: "none",
        duration: validCards.length // Match total duration of card steps
      }, 0);

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={containerRef}
      data-bg="dark"
      className="bg-charcoal min-h-screen relative overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: '#0F1115' }}
    >
      
      {/* Background Ambience */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute left-0 top-0 w-full h-full bg-[linear-gradient(rgba(158,255,79,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(158,255,79,0.05)_1px,transparent_1px)] [background-size:40px_40px]"></div>
          <div className="absolute right-0 bottom-0 w-96 h-96 bg-neon/20 blur-[150px] rounded-full"></div>
      </div>

      <div className="container mx-auto px-6 h-full flex flex-col md:flex-row items-center relative z-10">
        
        {/* Left Side: Static Title & Progress */}
        <div className="w-full md:w-1/3 h-full flex flex-col justify-center py-12 md:pr-12 pointer-events-none">
            <div className="relative pl-8 border-l border-white/10">
                {/* Progress Bar Track */}
                <div className="absolute left-[-1px] top-0 w-[2px] h-full bg-white/10">
                    <div className="progress-bar-fill w-full h-0 bg-neon shadow-[0_0_10px_#9EFF4F]"></div>
                </div>

                <div className="mb-2 flex items-center gap-2">
                    <div className="w-2 h-2 bg-neon rounded-full animate-pulse"></div>
                    <span className="font-mono text-neon text-xs tracking-widest uppercase">System Architecture</span>
                </div>
                
                <h2 className="text-5xl md:text-7xl font-display font-black text-white leading-none tracking-tighter mb-8">
                    CORE <br/> SYNTAX
                </h2>
                
                <p className="text-white/50 text-lg font-medium max-w-sm leading-relaxed">
                    NexoLink replaces fragmented tools with one intuitive system for real community impact.
                </p>
            </div>
        </div>

        {/* Right Side: Card Stack Container */}
        {/* Added perspective to parent to enhance 3D transforms */}
        <div className="w-full md:w-2/3 h-[500px] md:h-[600px] relative mt-12 md:mt-0" style={{ perspective: '1000px' }}>
            {features.map((feature, i) => (
                <div 
                    key={i}
                    ref={(el) => { cardsRef.current[i] = el!; }}
                    className="absolute inset-0 w-full h-full"
                    style={{ 
                      zIndex: i + 1,
                      willChange: 'transform, opacity, filter'
                    }} 
                >
                    <div className="w-full h-full bg-white rounded-[2.5rem] p-8 md:p-12 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] flex flex-col justify-between border border-white/10 relative overflow-hidden group">
                        
                        {/* Card Background Detail */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-softGray rounded-bl-[100%] -mr-10 -mt-10 z-0 transition-transform duration-700 group-hover:scale-110"></div>
                        
                        {/* Top Row */}
                        <div className="flex justify-between items-start relative z-10">
                             <div className="w-16 h-16 bg-charcoal text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                                 {feature.icon}
                             </div>
                             <div className="text-right">
                                 <div className="font-mono text-charcoal/40 text-xs font-bold uppercase tracking-widest mb-1">Module_0{i+1}</div>
                                 <div className="w-20 h-1 bg-charcoal/10 rounded-full ml-auto overflow-hidden">
                                     <div className="h-full bg-neon w-1/3 animate-[shimmer_2s_infinite]"></div>
                                 </div>
                             </div>
                        </div>

                        {/* Middle Content */}
                        <div className="relative z-10">
                            <h3 className="text-4xl md:text-6xl font-display font-black text-charcoal mb-6 tracking-tighter">
                                {feature.title}
                            </h3>
                            <p className="text-xl text-charcoal/60 font-medium leading-relaxed max-w-md">
                                {feature.desc}
                            </p>
                        </div>

                        {/* Bottom Row */}
                        <div className="flex items-end justify-between border-t border-charcoal/5 pt-8 relative z-10">
                             <div>
                                 <div className="text-5xl font-black text-charcoal tracking-tighter">{feature.stat}</div>
                                 <div className="text-xs font-bold text-charcoal/40 uppercase tracking-widest">{feature.statLabel}</div>
                             </div>
                             
                        </div>

                    </div>
                </div>
            ))}
        </div>

      </div>

      <style>{`
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};

export default Features;
