
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Cpu, ShieldCheck, Network, Binary, Activity, Fingerprint } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const KineticCapabilities: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Entrance staggered animation for cards
      gsap.from(".kinetic-card", {
        y: 100,
        opacity: 0,
        stagger: 0.15,
        duration: 1,
        ease: "power4.out",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 80%",
        }
      });

      // 2. Continuous scanning animation for Card 1
      gsap.to(".scan-bar", {
        top: "100%",
        duration: 3,
        repeat: -1,
        ease: "linear",
      });

      // 3. Rotating rings for Card 2
      gsap.to(".ring-1", { rotation: 360, duration: 10, repeat: -1, ease: "none" });
      gsap.to(".ring-2", { rotation: -360, duration: 15, repeat: -1, ease: "none" });

      // 4. Parallax Background Text (Bridge to VelocityStream style)
      gsap.to(".bg-parallax-text", {
        x: -500,
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: 1
        }
      });

      // 5. Dynamics rail pulse
      gsap.fromTo(
        ".dynamics-pulse",
        { x: 0 },
        { x: 420, duration: 2.6, repeat: -1, ease: "none" }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} data-bg="dark" className="py-32 bg-charcoal relative overflow-hidden">
      
      {/* Background Parallax Layer */}
      <div className="absolute inset-0 flex items-center pointer-events-none opacity-[0.03]">
        <div className="bg-parallax-text whitespace-nowrap text-[25vw] font-display font-black text-white leading-none">
          SYSTEM_CAPABLE SYSTEM_CAPABLE SYSTEM_CAPABLE
        </div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="mb-24">
            <span className="text-neon font-mono text-[10px] uppercase tracking-[0.6em] mb-4 block">Engine Components</span>
            <h2 className="text-white text-6xl md:text-8xl font-display font-black tracking-tighter leading-none">
                APP <br/> <span className="text-transparent" style={{ WebkitTextStroke: '1.5px white' }}>DYNAMICS.</span>
            </h2>
            <p className="text-white/35 max-w-2xl mt-6 text-lg font-medium">
                A simple, fast system for discovering opportunities, logging hours, and verifying impact.
            </p>
        </div>

        {/* Dynamics Rail */}
        <div className="relative mb-20 rounded-[2.5rem] border border-white/10 bg-white/[0.03] px-8 py-12 overflow-hidden">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(158,255,79,0.08),transparent_60%)]"></div>
            <div className="absolute bottom-0 right-0 w-72 h-72 bg-neon/10 blur-[120px] rounded-full"></div>
          </div>

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            <div>
              <div className="text-white text-2xl md:text-3xl font-black tracking-tight">
                VolunteerScout AI
              </div>
              <p className="text-white/50 text-sm mt-4 leading-relaxed">
                VolunteerScout is built into the NexoLink app to make volunteering feel effortless. It
                learns what a student cares about, filters noisy listings, and recommends the right
                roles based on interests, location, and impact goals. Instead of guessing where to
                start, volunteers get guided to meaningful opportunities, with clear next steps and
                faster onboarding every time they open the app.
              </p>
            </div>

            <div>
              <div className="text-white text-2xl md:text-3xl font-black tracking-tight">
                Smarter Search
              </div>
              <p className="text-white/50 text-sm mt-4 leading-relaxed">
                Search is designed to remove friction, not add it. Volunteers can quickly scan by
                category, time window, and cause, while results stay clean and easy to compare. The
                system highlights what actually matters—hours, requirements, and verification—so
                students spend less time digging and more time showing up. It’s fast, focused, and
                built for real schedules.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* CARD 1: THE NEURAL SCANNER */}
          <div className="kinetic-card group relative bg-white/5 border border-white/10 rounded-[3rem] p-10 h-[600px] overflow-hidden flex flex-col justify-between transition-all duration-500 hover:border-neon/30">
            <div className="absolute inset-0 z-0 opacity-20 group-hover:opacity-40 transition-opacity">
                {/* Visual Scanner Mockup */}
                <div className="w-full h-full font-mono text-[8px] text-neon p-4 space-y-2 select-none overflow-hidden">
                    {Array.from({length: 40}).map((_, i) => (
                        <div key={i} className="whitespace-nowrap">
                            0x{Math.random().toString(16).slice(2, 10).toUpperCase()} :: ANALYZING_USER_SKILLSET_{i} :: MATCH_CONFIDENCE_{Math.floor(Math.random() * 100)}%
                        </div>
                    ))}
                </div>
                {/* The Animated Scan Bar */}
                <div className="scan-bar absolute top-0 left-0 w-full h-1 bg-neon shadow-[0_0_20px_#9EFF4F]"></div>
            </div>

            <div className="relative z-10">
                <div className="w-14 h-14 bg-neon rounded-2xl flex items-center justify-center text-charcoal mb-8 shadow-[0_0_30px_rgba(158,255,79,0.4)]">
                    <Binary className="w-7 h-7" />
                </div>
                <h3 className="text-4xl font-display font-black text-white tracking-tighter mb-4">Quick <br/> Match</h3>
                <p className="text-white/40 font-medium leading-relaxed">
                    Volunteers find roles by category and community need with minimal clicks.
                </p>
            </div>

            <div className="relative z-10 pt-10 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-neon uppercase tracking-widest">Latency: 0.12ms</span>
                <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:bg-neon group-hover:text-charcoal transition-all">
                    <Activity className="w-4 h-4" />
                </div>
            </div>
          </div>

          {/* CARD 2: BIOMETRIC SENTINEL */}
          <div className="kinetic-card group relative bg-white/5 border border-white/10 rounded-[3rem] p-10 h-[600px] overflow-hidden flex flex-col justify-between transition-all duration-500 hover:bg-neon/5 hover:border-neon">
            
            <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
                <div className="ring-1 w-64 h-64 border border-white/5 border-dashed rounded-full"></div>
                <div className="ring-2 absolute w-80 h-80 border border-neon/10 border-dashed rounded-full"></div>
                <div className="absolute w-40 h-40 bg-neon/10 blur-3xl animate-pulse"></div>
            </div>

            <div className="relative z-10">
                <div className="w-14 h-14 bg-charcoal border border-white/10 rounded-2xl flex items-center justify-center text-neon mb-8">
                    <Fingerprint className="w-7 h-7" />
                </div>
                <h3 className="text-4xl font-display font-black text-white tracking-tighter mb-4">Simple <br/> Approval</h3>
                <p className="text-white/40 font-medium leading-relaxed">
                    Admins approve hours and keep clean records for audits and reporting.
                </p>
            </div>

            <div className="relative z-10">
                <div className="flex flex-col gap-2 mb-8">
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full w-2/3 bg-neon"></div>
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-white/30 tracking-widest">
                        <span>SECURITY_LAYER_01</span>
                        <span>ACTIVE</span>
                    </div>
                </div>
                <button className="w-full py-4 bg-white text-charcoal rounded-2xl font-black text-xs uppercase tracking-widest group-hover:bg-neon transition-colors">
                    View Specs
                </button>
            </div>
          </div>

          {/* CARD 3: DYNAMIC MESH */}
          <div className="kinetic-card group relative bg-white/5 border border-white/10 rounded-[3rem] p-10 h-[600px] overflow-hidden flex flex-col justify-between transition-all duration-500 hover:border-neon/30">
            
            <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:opacity-100 group-hover:rotate-12 transition-all duration-700">
                <Network className="w-48 h-48 text-neon" strokeWidth={0.5} />
            </div>

            <div className="relative z-10">
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white mb-8">
                    <Cpu className="w-7 h-7" />
                </div>
                <h3 className="text-4xl font-display font-black text-white tracking-tighter mb-4">Impact <br/> Exports</h3>
                <p className="text-white/40 font-medium leading-relaxed">
                    Generate CSV or PDF reports for schools, districts, and grant providers.
                </p>
            </div>

            <div className="relative z-10">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-charcoal p-4 rounded-2xl border border-white/5">
                        <div className="text-neon font-black text-xl">100%</div>
                        <div className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Uptime</div>
                    </div>
                    <div className="bg-charcoal p-4 rounded-2xl border border-white/5">
                        <div className="text-white font-black text-xl">256B</div>
                        <div className="text-[8px] text-white/30 uppercase font-bold tracking-widest">End-to-End</div>
                    </div>
                </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default KineticCapabilities;
