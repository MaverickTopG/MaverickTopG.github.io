
import React, { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Fingerprint, 
  Map as MapIcon, 
  BarChart3, 
  Network, 
  MessageSquare, 
  Lock, 
  Cpu, 
  RefreshCw,
  Binary,
  Globe,
  Zap,
  ShieldCheck,
  MousePointer2
} from 'lucide-react';
import KineticCapabilities from '../components/KineticCapabilities';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
  // Optimization: Force hardware acceleration globally for GSAP transforms
  gsap.config({ force3D: true });
}

const UI_STATES = [
  { id: 'NEURAL_MAP', icon: MapIcon, label: 'GEO_SYNTAX', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&q=80&w=800' },
  { id: 'BIO_SENTINEL', icon: Fingerprint, label: 'BIO_AUTH', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800' },
  { id: 'DATA_STREAM', icon: BarChart3, label: 'LIVE_METRICS', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1551288049-bbbda536339a?auto=format&fit=crop&q=80&w=800' },
  { id: 'MESH_NETWORK', icon: Network, label: 'NODE_MESH', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc48?auto=format&fit=crop&q=80&w=800' },
  { id: 'IMPACT_VAULT', icon: Lock, label: 'SECURE_LEDGER', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=800' },
  { id: 'LIVE_COMMS', icon: MessageSquare, label: 'MISSION_FEED', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800' },
  { id: 'SYSTEM_HEALTH', icon: Cpu, label: 'CORE_DIAGNOSTIC', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800' },
  { id: 'SYNC_ENGINE', icon: RefreshCw, label: 'LATENCY_TRACK', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800' },
  { id: 'QUANTUM_BRIDGE', icon: Binary, label: 'QUANTUM_SYNC', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&q=80&w=800' },
  { id: 'ORACLE_NODE', icon: Globe, label: 'GLOBAL_PREDICT', color: '#9EFF4F', img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800' },
];

const DeviceCinematic = () => {
    const sectionRef = useRef<HTMLDivElement>(null);
    const deviceRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [uiIndex, setUiIndex] = useState(0);
    const indexRef = useRef(0);

    useLayoutEffect(() => {
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "top top",
                    end: "+=18000", 
                    pin: true,
                    // Optimization: Increased scrub latency for smoother high-DPI interpolation
                    scrub: 1.5,
                    anticipatePin: 1,
                    onUpdate: (self) => {
                        const progress = self.progress;
                        const newIndex = Math.min(Math.floor(progress * UI_STATES.length), UI_STATES.length - 1);
                        if (newIndex !== indexRef.current) {
                            indexRef.current = newIndex;
                            setUiIndex(newIndex);
                        }
                    }
                }
            });

            // --- PERFORMANCE ENHANCED ENTRANCE ---
            gsap.set(deviceRef.current, { 
                rotationX: 65, 
                rotationY: -80, 
                rotationZ: -20,
                z: -1000,
                opacity: 0,
                scale: 0.1,
                transformPerspective: 2500
            });

            tl.to(deviceRef.current, {
                rotationX: 0,
                rotationY: 0,
                rotationZ: 0,
                z: 0,
                scale: 1,
                opacity: 1,
                duration: 5,
                ease: "expo.out",
                force3D: true
            });

            // --- OPTIMIZED FLIP SEQUENCE ---
            for (let i = 0; i < UI_STATES.length; i++) {
                const targetRotation = (i + 1) * 360;
                
                tl.to(deviceRef.current, { 
                    rotationY: targetRotation, 
                    rotationX: i % 2 === 0 ? 15 : -15,
                    rotationZ: i % 3 === 0 ? 6 : -6,
                    duration: 4, 
                    ease: "power2.inOut",
                    force3D: true
                })
                .to(containerRef.current, {
                    scale: 1.08 + (Math.sin(i * 0.8) * 0.04),
                    z: 120,
                    duration: 4,
                    ease: "sine.inOut"
                }, "-=4");
            }

            // --- CINEMATIC FINALE ---
            tl.to(deviceRef.current, { 
                rotationX: 0, 
                rotationY: UI_STATES.length * 360, 
                rotationZ: 0, 
                scale: 1.2,
                duration: 3,
                ease: "power4.out"
            });

            // Background Parallax with lower scrub frequency for performance
            gsap.to(".bg-grid", {
                opacity: 0.4,
                scale: 1.25,
                scrollTrigger: {
                    trigger: sectionRef.current,
                    scrub: 3
                }
            });

        }, sectionRef);
        return () => ctx.revert();
    }, []);

    const current = UI_STATES[uiIndex];
    const isLeft = uiIndex % 2 === 0;

    return (
        <section ref={sectionRef} className="relative h-screen bg-charcoal overflow-hidden flex items-center justify-center">
            {/* Background Atmosphere */}
            <div className="bg-grid absolute inset-0 opacity-10 pointer-events-none will-change-transform">
                <div className="w-full h-full bg-[linear-gradient(rgba(158,255,79,0.06)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(158,255,79,0.06)_1.5px,transparent_1.5px)] [background-size:110px_110px]"></div>
            </div>
            
            {/* HUD Elements: Elastic Transitioning Layout */}
            <div className={`absolute inset-0 z-[100] p-12 md:p-24 pointer-events-none flex items-start transition-all duration-1000 ease-[cubic-bezier(0.19,1,0.22,1)] ${isLeft ? 'justify-start' : 'justify-end'}`}>
                <motion.div 
                    layout
                    initial={false}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    className={`max-w-sm w-full flex flex-col ${isLeft ? 'items-start text-left' : 'items-end text-right'}`}
                >
                    <div className="mb-14">
                        <div className="flex flex-col mb-4">
                            <span className="text-[10px] font-black text-neon uppercase tracking-widest leading-none mb-3 opacity-40">Active Sequence</span>
                            <AnimatePresence mode="wait">
                                <motion.span 
                                    key={uiIndex}
                                    initial={{ opacity: 0, y: 20, rotateX: -45, filter: 'blur(15px)' }}
                                    animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, y: -20, rotateX: 45, filter: 'blur(15px)' }}
                                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                    className="text-5xl md:text-6xl font-display font-black text-white italic leading-none uppercase tracking-tighter"
                                >
                                    {current.label}
                                </motion.span>
                            </AnimatePresence>
                        </div>
                        <div className="flex items-end gap-5 mb-6">
                            <span className="text-7xl font-display font-black text-white/5 leading-none">NODE::{uiIndex + 1}</span>
                        </div>
                        <div className="w-72 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-neon shadow-[0_0_30px_#9EFF4F]"
                                animate={{ width: `${((uiIndex + 1) / UI_STATES.length) * 100}%` }}
                                transition={{ type: 'spring', stiffness: 150, damping: 25 }}
                            />
                        </div>
                    </div>

                    <motion.div 
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group flex items-center gap-5 px-12 py-7 bg-white text-charcoal rounded-full font-black text-xs uppercase tracking-[0.2em] shadow-premium pointer-events-auto cursor-pointer hover:bg-neon transition-all hover:scale-110 active:scale-95"
                    >
                        <MousePointer2 className="w-5 h-5 text-neon group-hover:text-charcoal" />
                        Execute Interface
                    </motion.div>
                </motion.div>
            </div>

            <div className="container mx-auto px-6 h-full flex items-center justify-center relative z-10 overflow-visible">
                <div ref={containerRef} className="device-container relative perspective-2500 transform-style-3d will-change-transform overflow-visible">
                    
                    {/* The 3D High-Performance Phone Shell */}
                    <div 
                        ref={deviceRef} 
                        className="transform-style-3d relative w-[250px] h-[520px] md:w-[280px] md:h-[580px] shadow-[0_180px_300px_rgba(0,0,0,0.85)] will-change-transform"
                    >
                        {/* FRONT FACE: RENDER OPTIMIZED SCREEN */}
                        <div className="absolute inset-0 transform-style-3d backface-hidden z-20">
                            <div className="absolute inset-0 bg-black rounded-[3.8rem] border-[14px] border-[#141414] shadow-2xl overflow-hidden">
                                <div className="absolute inset-0 rounded-[3rem] overflow-hidden bg-charcoal">
                                    <AnimatePresence mode="wait">
                                        <motion.div 
                                            key={uiIndex}
                                            initial={{ opacity: 0, scale: 1.2, filter: 'brightness(2)' }}
                                            animate={{ opacity: 1, scale: 1, filter: 'brightness(1)' }}
                                            exit={{ opacity: 0, scale: 0.8, filter: 'brightness(0)' }}
                                            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                                            className="w-full h-full relative"
                                        >
                                            <img src={current.img} className="absolute inset-0 w-full h-full object-cover" alt="Node Visual" loading="eager" />
                                            {/* Immersive Deep Vignette */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40"></div>
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>

                        {/* BACK FACE: TECHNICAL ARCHITECTURE LAYER */}
                        <div className="absolute inset-0 transform-style-3d backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
                           <div className="absolute inset-0 bg-[#040404] rounded-[3.8rem] border-[14px] border-[#141414] shadow-2xl overflow-hidden flex items-center justify-center">
                                <div className="text-center p-12">
                                     <ShieldCheck className="w-28 h-28 text-neon mb-10 mx-auto opacity-10 animate-pulse" />
                                     <div className="text-[9px] font-mono text-neon/50 tracking-[1em] uppercase">Architecture_Sync...</div>
                                     <div className="mt-8 flex gap-3 justify-center">
                                         {[1,2,3,4,5].map(i => (
                                             <div key={i} className="w-2 h-2 bg-neon/40 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }}></div>
                                         ))}
                                     </div>
                                </div>
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(158,255,79,0.12)_0%,transparent_80%)]"></div>
                            </div>
                        </div>

                        {/* Hardware Details */}
                        <div className="absolute right-[-16px] top-32 w-3 h-20 bg-[#121212] rounded-l-xl border border-white/5"></div>
                        <div className="absolute left-[-16px] top-36 w-3 h-24 bg-[#121212] rounded-r-xl border border-white/5"></div>
                    </div>
                </div>
            </div>

            <style>{`
                .transform-style-3d { transform-style: preserve-3d; }
                .perspective-2500 { perspective: 2500px; }
                .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; transform: translateZ(0); }
            `}</style>
        </section>
    );
};

const AppPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const ctx = gsap.context(() => {
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
      .from(".app-subtitle", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8");
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="bg-white text-charcoal overflow-x-hidden">
      <section className="relative h-screen flex flex-col items-center justify-center bg-white">
        <div className="text-center container mx-auto px-6">
            <div className="overflow-hidden mb-2">
                 <h1 className="blog-word text-[13vw] md:text-[12rem] font-display font-black tracking-tighter leading-[0.8] text-charcoal">
                    MOBILE
                 </h1>
            </div>
            <div className="overflow-hidden">
                 <h1 className="blog-word text-[13vw] md:text-[12rem] font-display font-black tracking-tighter leading-[0.8] text-transparent" style={{ WebkitTextStroke: '3px #0F1115' }}>
                    SYNTAX.
                 </h1>
            </div>
            <p className="app-subtitle mt-8 text-xl md:text-2xl font-medium text-charcoal/40 max-w-2xl mx-auto italic uppercase tracking-[0.2em]">
                The most powerful companion for every volunteer.
            </p>
        </div>
      </section>

      <DeviceCinematic />

      <div className="relative">
          <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-charcoal to-transparent z-10"></div>
          <KineticCapabilities />
      </div>

      <section className="py-56 bg-white text-center container mx-auto px-6">
        <h2 className="text-7xl md:text-[10vw] font-display font-black tracking-tighter leading-none mb-20">
            READY TO <span className="text-neon bg-charcoal px-10 py-3 italic">SYNC?</span>
        </h2>
        <div className="flex flex-col md:flex-row gap-10 justify-center items-center">
            <button className="group relative px-20 py-10 bg-charcoal text-white rounded-full font-black uppercase tracking-[0.3em] text-sm hover:scale-105 transition-all shadow-premium overflow-hidden">
                <div className="absolute inset-0 bg-neon translate-y-full group-hover:translate-y-0 transition-transform duration-400"></div>
                <span className="relative z-10 group-hover:text-charcoal flex items-center gap-4">
                  Initiate Sync
                  <Zap className="w-5 h-5 fill-current" />
                </span>
            </button>
            <button className="px-20 py-10 border-[3px] border-charcoal/5 rounded-full font-black uppercase tracking-[0.3em] text-sm hover:border-charcoal transition-all">
                System Specs
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

export default AppPage;
