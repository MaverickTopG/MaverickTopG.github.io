
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const VelocityStream: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const layers = gsap.utils.toArray('.velocity-layer');

      layers.forEach((layer: any, i: number) => {
        const speed = (i + 1) * 200;
        gsap.to(layer, {
          x: i % 2 === 0 ? speed : -speed,
          ease: "none",
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top bottom",
            end: "bottom top",
            scrub: 1
          }
        });
      });

      // Z-axis parallax for the foreground text
      gsap.to(".velocity-center", {
        scale: 1.5,
        opacity: 0,
        scrollTrigger: {
            trigger: containerRef.current,
            start: "top center",
            end: "bottom center",
            scrub: true
        }
      });

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={containerRef}
      className="py-24 md:py-32 bg-softGray relative overflow-hidden flex flex-col items-center justify-center min-h-screen w-full"
    >
      
      {/* Layered Typographic Parallax */}
      <div className="absolute inset-0 flex flex-col justify-around pointer-events-none opacity-[0.05] md:opacity-[0.08]">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="velocity-layer whitespace-nowrap text-[12vw] font-display font-black tracking-tighter text-charcoal leading-none">
            INSTANT SYNC INSTANT SYNC INSTANT SYNC INSTANT SYNC INSTANT SYNC INSTANT SYNC
          </div>
        ))}
      </div>

      <div className="relative z-10 container mx-auto px-6 text-center">
        <div className="velocity-center mb-16">
            <h2 className="text-7xl md:text-[12rem] font-display font-black tracking-tighter leading-[0.85] text-charcoal">
                ZERO <br/> 
                <span className="text-transparent" style={{ WebkitTextStroke: '2px #0F1115' }}>LATENCY</span>
            </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-12 md:mt-24">
          <div className="flex flex-col items-center">
            <div className="text-5xl font-black mb-4">3.0</div>
            <div className="h-1 w-24 bg-neon mb-4"></div>
            <p className="text-xs font-bold uppercase tracking-widest text-charcoal/40">Average Log Time</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-5xl font-black mb-4">100%</div>
            <div className="h-1 w-24 bg-neon mb-4"></div>
            <p className="text-xs font-bold uppercase tracking-widest text-charcoal/40">Verified Records</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-5xl font-black mb-4">∞</div>
            <div className="h-1 w-24 bg-neon mb-4"></div>
            <p className="text-xs font-bold uppercase tracking-widest text-charcoal/40">Program Coverage</p>
          </div>
        </div>
      </div>

      {/* Decorative vertical lines */}
      <div className="absolute top-0 left-1/4 h-full w-px bg-charcoal/5"></div>
      <div className="absolute top-0 right-1/4 h-full w-px bg-charcoal/5"></div>
    </div>
  );
};

export default VelocityStream;
