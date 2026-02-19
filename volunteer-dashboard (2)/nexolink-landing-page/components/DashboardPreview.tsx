
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

        <div className="max-w-6xl mx-auto relative shadow-2xl rounded-[1.5rem] overflow-hidden border border-charcoal/10 bg-white aspect-[3024/1648] group">
            
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
                <img
                    src="/dashboard.png"
                    alt="Dashboard preview"
                    className="w-full h-full object-contain"
                    loading="eager"
                />
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
