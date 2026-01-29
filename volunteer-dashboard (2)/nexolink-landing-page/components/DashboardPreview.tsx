
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const DashboardPreview: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scanLineRef = useRef<HTMLDivElement>(null);
  const fullImageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
       // Scanner Animation
       const tl = gsap.timeline({
           scrollTrigger: {
               trigger: containerRef.current,
               start: "top 75%",
               end: "bottom 25%",
               scrub: 0.5,
               invalidateOnRefresh: true,
               refreshPriority: 1
           }
       });

       tl.fromTo(
         scanLineRef.current,
         { top: "0%" },
         { top: "100%", ease: "none" }
       );

       tl.fromTo(
         fullImageRef.current,
         { height: "0%", autoAlpha: 0 },
         { height: "100%", autoAlpha: 1, ease: "none" },
         "<"
       );

    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="py-32 bg-softGray relative overflow-hidden">
        <div className="container mx-auto px-6 text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-display font-black text-charcoal mb-6">
                TOTAL <span className="bg-neon px-2">CLARITY</span>
            </h2>
            <p className="text-charcoal/50 text-xl">From hours logged to verified community impact.</p>
        </div>

        <div className="max-w-6xl mx-auto relative shadow-2xl rounded-[1.5rem] overflow-hidden border border-charcoal/10 bg-white aspect-[16/10] group">
            
            {/* Base Layer: Wireframe (SVG Representation) */}
            <div className="absolute inset-0 bg-[#f0f0f0] p-8 flex flex-col">
                <div className="w-full h-full border-2 border-dashed border-charcoal/10 rounded-xl p-6 relative">
                    <div className="absolute top-6 left-6 w-32 h-8 border-2 border-dashed border-charcoal/10 rounded"></div>
                    <div className="absolute top-6 right-6 w-12 h-12 border-2 border-dashed border-charcoal/10 rounded-full"></div>
                    <div className="mt-16 grid grid-cols-3 gap-6">
                        <div className="h-40 border-2 border-dashed border-charcoal/10 rounded-xl"></div>
                        <div className="h-40 border-2 border-dashed border-charcoal/10 rounded-xl"></div>
                        <div className="h-40 border-2 border-dashed border-charcoal/10 rounded-xl"></div>
                    </div>
                    <div className="mt-6 h-64 border-2 border-dashed border-charcoal/10 rounded-xl flex items-center justify-center text-charcoal/10 font-black text-4xl uppercase">
                        Wireframe Mode
                    </div>
                </div>
            </div>

            {/* Top Layer: Full UI (Clipped) */}
            <div ref={fullImageRef} className="absolute top-0 left-0 w-full overflow-hidden bg-charcoal h-0">
                <div className="w-full aspect-[16/10] bg-[#0F1115] p-8 relative">
                    {/* Simulated High Fidelity UI */}
                    <div className="flex justify-between items-center mb-10">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-neon rounded-lg"></div>
                            <div className="text-white font-bold text-xl">Dashboard</div>
                        </div>
                        <div className="flex gap-4">
                            <div className="px-4 py-2 bg-white/10 rounded-full text-white/60 text-xs font-bold">Export Report</div>
                            <div className="w-8 h-8 rounded-full bg-white/20"></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-6 mb-6">
                         <div className="bg-[#1a1c23] p-6 rounded-2xl border border-white/5">
                             <div className="text-neon font-bold text-2xl mb-1">98.2%</div>
                             <div className="text-white/40 text-xs uppercase tracking-widest">Efficiency</div>
                         </div>
                         <div className="bg-[#1a1c23] p-6 rounded-2xl border border-white/5">
                             <div className="text-white font-bold text-2xl mb-1">1,024</div>
                             <div className="text-white/40 text-xs uppercase tracking-widest">Active Users</div>
                         </div>
                         <div className="bg-neon p-6 rounded-2xl border border-neon text-charcoal">
                             <div className="font-bold text-2xl mb-1">$45k</div>
                             <div className="text-charcoal/60 text-xs uppercase tracking-widest">Value Generated</div>
                         </div>
                    </div>

                    <div className="w-full h-64 bg-[#1a1c23] rounded-2xl border border-white/5 p-6 relative overflow-hidden">
                        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-neon/20 to-transparent"></div>
                        <div className="flex items-end justify-between h-full gap-2 relative z-10 px-4 pb-2">
                             {[40, 60, 30, 70, 50, 80, 65, 90, 70, 60, 85, 95].map((h, i) => (
                                 <div key={i} className="flex-1 bg-neon rounded-t-sm" style={{height: `${h}%`, opacity: 0.5 + (i/24)}}></div>
                             ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Scanner Line */}
            <div ref={scanLineRef} className="absolute top-0 left-0 w-full h-1 bg-neon shadow-[0_0_50px_rgba(158,255,79,1)] z-20">
                <div className="absolute right-4 -top-3 bg-neon text-charcoal text-[10px] font-bold px-2 py-0.5 rounded">RENDERING</div>
            </div>

        </div>
    </div>
  );
};

export default DashboardPreview;
