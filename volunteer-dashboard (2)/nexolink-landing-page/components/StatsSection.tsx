
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const StatsSection: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      
      const metrics = gsap.utils.toArray('.kinetic-metric');
      
      // Initial Chaos State
      gsap.set(metrics, {
        x: (i) => (i % 2 === 0 ? -100 : 100) + Math.random() * 50,
        y: (i) => Math.random() * 200,
        rotation: (i) => Math.random() * 20 - 10,
        opacity: 0,
        scale: 0.5
      });

      // Snap to Order Animation
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: triggerRef.current,
          start: "top 70%",
          end: "top 20%",
          scrub: 1.5,
        }
      });

      tl.to(metrics, {
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        scale: 1,
        stagger: 0.1,
        ease: "expo.out"
      });

      // Floating animation after snap
      metrics.forEach((metric: any) => {
          gsap.to(metric, {
              y: "10px",
              rotation: "2deg",
              duration: "random(2, 4)",
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
              delay: "random(0, 2)"
          })
      });

    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="py-32 bg-white relative overflow-hidden">
        {/* Background typographic noise */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-[0.02]">
            <div className="text-[20vw] font-black leading-none text-charcoal rotate-[-5deg] scale-150">
                DATA DATA DATA DATA
            </div>
        </div>

        <div ref={triggerRef} className="container mx-auto px-6 relative z-10">
            <div className="flex flex-col md:flex-row items-center justify-between mb-24">
                 <h2 className="text-4xl md:text-6xl font-display font-black text-charcoal leading-none">
                     LIVE <span className="text-neon bg-charcoal px-2">FEED</span>
                 </h2>
                 <div className="flex items-center gap-2 mt-4 md:mt-0">
                     <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                     <span className="font-mono text-xs font-bold text-charcoal/50 uppercase tracking-widest">System Synchronized</span>
                 </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 h-auto md:h-[400px]">
                {/* Metric 1 */}
                <div className="kinetic-metric bg-softGray p-8 rounded-[2rem] border border-charcoal/5 flex flex-col justify-between group hover:bg-charcoal hover:text-white transition-colors duration-500">
                    <div className="flex justify-between items-start">
                        <span className="font-mono text-xs uppercase tracking-widest opacity-50">Active Volunteers</span>
                        <svg className="w-6 h-6 opacity-20 group-hover:opacity-100 group-hover:text-neon transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    </div>
                    <div>
                        <div className="text-7xl font-display font-black tracking-tighter mb-2 group-hover:text-neon transition-colors">1.2k</div>
                        <div className="h-1 w-full bg-charcoal/10 rounded-full overflow-hidden group-hover:bg-white/20">
                            <div className="h-full w-[70%] bg-neon rounded-full"></div>
                        </div>
                    </div>
                </div>

                {/* Metric 2 (Center - Large) */}
                <div className="kinetic-metric md:-mt-12 bg-neon p-8 rounded-[2rem] border border-neon flex flex-col justify-between shadow-[0_0_50px_rgba(158,255,79,0.3)] z-20">
                    <div className="flex justify-between items-start text-charcoal">
                        <span className="font-mono text-xs font-bold uppercase tracking-widest">Verified Hours</span>
                        <div className="animate-spin-slow">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                    </div>
                    <div>
                        <div className="text-8xl font-display font-black tracking-tighter mb-2 text-charcoal">100k</div>
                        <span className="font-bold text-charcoal/60 uppercase tracking-wider text-sm">Verified Hours Logged</span>
                    </div>
                </div>

                {/* Metric 3 */}
                <div className="kinetic-metric bg-charcoal text-white p-8 rounded-[2rem] border border-charcoal flex flex-col justify-between group">
                    <div className="flex justify-between items-start">
                        <span className="font-mono text-xs uppercase tracking-widest opacity-50">Organizations</span>
                        <span className="text-neon font-bold text-xs bg-white/10 px-2 py-1 rounded">Schools + NGOs</span>
                    </div>
                    <div>
                        <div className="text-7xl font-display font-black tracking-tighter mb-2">1</div>
                        <div className="flex gap-1">
                            {[1,2,3,4,5,6,7,8].map(i => (
                                <div key={i} className="h-8 flex-1 bg-white/10 rounded-sm hover:bg-neon transition-colors" style={{height: Math.random() * 30 + 10 + 'px'}}></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default StatsSection;
