
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const HowItWorks: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      
      // Draw the neon line
      const length = lineRef.current?.getTotalLength() || 0;
      gsap.set(lineRef.current, { strokeDasharray: length, strokeDashoffset: length });

      gsap.to(lineRef.current, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
              trigger: containerRef.current,
              start: "top center",
              end: "bottom center",
              scrub: 1
          }
      });

      // Activate steps
      const steps = gsap.utils.toArray('.process-step');
      steps.forEach((step: any) => {
          gsap.fromTo(step.querySelector('.step-content'), 
             { opacity: 0.2, scale: 0.9, filter: "blur(5px)" },
             { 
                 opacity: 1, 
                 scale: 1, 
                 filter: "blur(0px)",
                 duration: 0.5,
                 scrollTrigger: {
                     trigger: step,
                     start: "top 60%",
                     end: "bottom 40%",
                     toggleActions: "play reverse play reverse"
                 }
             }
          );
          
          // Pulse the node
          gsap.fromTo(step.querySelector('.step-node'),
            { boxShadow: "0 0 0 0px rgba(158, 255, 79, 0)" },
            { 
                boxShadow: "0 0 0 20px rgba(158, 255, 79, 0)",
                repeat: 1,
                duration: 1,
                scrollTrigger: {
                    trigger: step,
                    start: "top 60%",
                    toggleActions: "play none none none"
                }
            }
          );
      });

    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} data-bg="dark" className="py-32 bg-[#050505] relative overflow-hidden">
        
        {/* Central Neon Line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full hidden md:block">
            <svg className="h-full w-[200px] -translate-x-1/2 overflow-visible" preserveAspectRatio="none">
                <path 
                    ref={lineRef}
                    d="M100,0 Q100,200 100,400 T100,800 T100,1200" 
                    fill="none" 
                    stroke="#9EFF4F" 
                    strokeWidth="4"
                    className="drop-shadow-[0_0_10px_rgba(158,255,79,0.8)]"
                />
            </svg>
        </div>

        <div className="container mx-auto px-6 relative z-10">
            <div className="text-center mb-32">
                <h2 className="text-white text-5xl md:text-8xl font-display font-black tracking-tighter">
                    CORE <span className="text-stroke-neon text-transparent" style={{ WebkitTextStroke: '2px #9EFF4F' }}>LOOP</span>
                </h2>
            </div>

            <div className="flex flex-col gap-32">
                {/* Step 1 */}
                <div className="process-step flex flex-col md:flex-row items-center justify-center gap-12 md:gap-32">
                    <div className="step-content md:text-right flex-1">
                        <h3 className="text-4xl text-white font-black mb-4">INITIATE</h3>
                        <p className="text-white/50 text-xl font-medium max-w-sm ml-auto">Create events, define roles, and publish opportunities in minutes.</p>
                    </div>
                    <div className="relative">
                        <div className="step-node w-6 h-6 bg-neon rounded-full border-4 border-black z-20 relative"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-neon/20 rounded-full blur-md"></div>
                    </div>
                    <div className="flex-1 hidden md:block">
                         <div className="w-full max-w-xs h-40 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md p-6 step-content">
                             <div className="flex gap-3 mb-4">
                                 <div className="w-8 h-8 rounded-full bg-neon"></div>
                                 <div className="h-2 w-20 bg-white/20 rounded-full mt-3"></div>
                             </div>
                             <div className="h-2 w-full bg-white/10 rounded-full mb-2"></div>
                             <div className="h-2 w-2/3 bg-white/10 rounded-full"></div>
                         </div>
                    </div>
                </div>

                {/* Step 2 */}
                <div className="process-step flex flex-col md:flex-row items-center justify-center gap-12 md:gap-32">
                    <div className="flex-1 hidden md:block text-right">
                         <div className="w-full max-w-xs ml-auto h-40 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md p-6 step-content flex items-center justify-center">
                             <div className="text-6xl font-black text-white/10">LOG</div>
                             <div className="absolute inset-0 border border-neon/30 rounded-2xl animate-pulse"></div>
                         </div>
                    </div>
                    <div className="relative">
                        <div className="step-node w-6 h-6 bg-charcoal border-2 border-neon rounded-full z-20 relative"></div>
                    </div>
                    <div className="step-content flex-1">
                        <h3 className="text-4xl text-white font-black mb-4">VERIFY</h3>
                        <p className="text-white/50 text-xl font-medium max-w-sm">Volunteers log hours instantly with clear dates and descriptions.</p>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="process-step flex flex-col md:flex-row items-center justify-center gap-12 md:gap-32">
                    <div className="step-content md:text-right flex-1">
                        <h3 className="text-4xl text-white font-black mb-4">SCALE</h3>
                        <p className="text-white/50 text-xl font-medium max-w-sm ml-auto">Admins approve, export reports, and celebrate progress with badges.</p>
                    </div>
                    <div className="relative">
                        <div className="step-node w-6 h-6 bg-neon rounded-full border-4 border-black z-20 relative"></div>
                    </div>
                    <div className="flex-1 hidden md:block">
                         <div className="w-full max-w-xs h-40 bg-neon rounded-2xl border border-neon p-6 step-content flex flex-col justify-center items-center">
                             <div className="text-charcoal font-black text-4xl mb-2">+127%</div>
                             <div className="text-charcoal/60 font-bold uppercase tracking-widest text-xs">Growth</div>
                         </div>
                    </div>
                </div>
            </div>

        </div>
    </div>
  );
};

export default HowItWorks;
