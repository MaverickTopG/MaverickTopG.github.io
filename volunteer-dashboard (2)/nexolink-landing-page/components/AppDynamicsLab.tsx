
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CheckCircle2, RefreshCw, ShieldAlert, Cpu, BarChart3, Database } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const AppDynamicsLab: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeState, setActiveState] = useState<'idle' | 'syncing' | 'verified'>('idle');

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Entrance for header
      gsap.from(".lab-header", {
        opacity: 0,
        y: 50,
        duration: 1,
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 70%",
        }
      });

      // Modular UI Entrance
      gsap.from(".ui-module", {
        scale: 0.8,
        opacity: 0,
        rotateX: -20,
        stagger: 0.1,
        duration: 1.2,
        ease: "expo.out",
        scrollTrigger: {
          trigger: ".ui-grid",
          start: "top 75%",
        }
      });

      // Decorative data streams
      gsap.to(".data-stream", {
        y: "100%",
        duration: 2,
        repeat: -1,
        ease: "none",
        stagger: {
          each: 0.5,
          from: "random"
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const triggerSync = () => {
    if (activeState !== 'idle') return;
    setActiveState('syncing');
    
    const tl = gsap.timeline({
      onComplete: () => setActiveState('verified')
    });

    tl.to(".sync-progress", { width: "100%", duration: 2, ease: "power2.inOut" })
      .to(".sync-icon", { rotation: 360, duration: 1, repeat: 1, ease: "none" }, 0);
  };

  const reset = () => {
    setActiveState('idle');
    gsap.set(".sync-progress", { width: "0%" });
  };

  return (
    <div ref={containerRef} className="py-48 bg-white relative overflow-hidden">
      {/* Background Tech Details */}
      <div className="absolute top-0 right-0 p-24 opacity-[0.03] pointer-events-none">
        <Database className="w-96 h-96 text-charcoal" strokeWidth={0.5} />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="lab-header mb-24 max-w-4xl">
          <span className="text-charcoal/30 font-mono text-xs uppercase tracking-[0.5em] mb-4 block">State_Machine_v2</span>
          <h2 className="text-6xl md:text-8xl font-display font-black text-charcoal tracking-tighter leading-none mb-8">
            DYNAMICS <br/> 
            <span className="text-transparent" style={{ WebkitTextStroke: '1.5px #0F1115' }}>LAB.</span>
          </h2>
          <p className="text-xl text-charcoal/50 font-medium max-w-xl">
            A fast, clean workflow for logging hours, approving requests, and exporting impact.
          </p>
        </div>

        <div className="ui-grid grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* LEFT: INTERACTION CONSOLE */}
          <div className="lg:col-span-4 ui-module h-[600px] bg-charcoal rounded-[3rem] p-10 flex flex-col justify-between shadow-2xl relative overflow-hidden">
            {/* Animated Data streams in background */}
            <div className="absolute inset-0 flex justify-around pointer-events-none opacity-10">
                {[1,2,3,4].map(i => (
                    <div key={i} className="data-stream w-[1px] h-full bg-gradient-to-b from-transparent via-neon to-transparent -translate-y-full"></div>
                ))}
            </div>

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-3 h-3 bg-neon rounded-full animate-pulse"></div>
                    <span className="text-neon font-mono text-[10px] uppercase tracking-widest">Interface Status: {activeState.toUpperCase()}</span>
                </div>
                <h3 className="text-3xl text-white font-black tracking-tight mb-6">Action <br/> Dispatcher.</h3>
                
                <div className="space-y-4">
                    <button 
                        onClick={triggerSync}
                        disabled={activeState !== 'idle'}
                        className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-3 ${activeState === 'idle' ? 'bg-neon text-charcoal hover:scale-105' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
                    >
                        {activeState === 'syncing' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
                        {activeState === 'syncing' ? 'Processing...' : 'Initialize Sync'}
                    </button>

                    {activeState === 'verified' && (
                        <button 
                            onClick={reset}
                            className="w-full py-5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white hover:bg-white/5 transition-all"
                        >
                            Reset Module
                        </button>
                    )}
                </div>
            </div>

            <div className="relative z-10 p-6 bg-white/5 rounded-3xl border border-white/10">
                <div className="flex justify-between text-white/40 text-[10px] font-mono mb-2 uppercase">
                    <span>Buffer Usage</span>
                    <span>{activeState === 'syncing' ? '88%' : '2%'}</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className={`sync-progress h-full bg-neon w-0 shadow-[0_0_10px_#9EFF4F]`}></div>
                </div>
            </div>
          </div>

          {/* MIDDLE: VISUAL FEEDBACK */}
          <div className="lg:col-span-8 ui-module h-[600px] bg-softGray rounded-[3rem] p-12 relative flex items-center justify-center shadow-inner border border-charcoal/5">
              
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[80%] h-[80%] border-2 border-dashed border-charcoal/5 rounded-[4rem]"></div>
              </div>

              <div className="relative text-center max-w-md w-full">
                  <div className="mb-12 flex justify-center">
                    {activeState === 'idle' && (
                        <div className="w-32 h-32 rounded-full border-2 border-charcoal/10 flex items-center justify-center animate-bounce">
                            <BarChart3 className="w-12 h-12 text-charcoal/20" />
                        </div>
                    )}
                    {activeState === 'syncing' && (
                        <div className="relative">
                            <RefreshCw className="w-32 h-32 text-neon animate-spin-slow" />
                            <div className="absolute inset-0 bg-neon/10 blur-3xl rounded-full"></div>
                        </div>
                    )}
                    {activeState === 'verified' && (
                        <div className="relative">
                            <CheckCircle2 className="w-32 h-32 text-charcoal" />
                            <div className="absolute -top-4 -right-4 w-12 h-12 bg-neon rounded-full flex items-center justify-center shadow-lg animate-[ping_2s_infinite]">
                                <ShieldAlert className="w-6 h-6 text-charcoal" />
                            </div>
                        </div>
                    )}
                  </div>

                  <h4 className="text-4xl font-black text-charcoal mb-4 tracking-tighter">
                      {activeState === 'idle' && "Awaiting Signal."}
                      {activeState === 'syncing' && "Engine Spooling."}
                      {activeState === 'verified' && "System Integrity Locked."}
                  </h4>
                  <p className="text-charcoal/40 font-medium">
                      {activeState === 'idle' && "Trigger the dispatcher to begin sub-millisecond data encryption."}
                      {activeState === 'syncing' && "Mapping neural connections across edge clusters. Encrypting shards..."}
                      {activeState === 'verified' && "Protocol successfully verified on-chain. Impact ledger immutable."}
                  </p>
              </div>

              {/* Decorative side labels */}
              <div className="absolute left-10 top-1/2 -rotate-90 origin-left text-[8px] font-mono text-charcoal/20 uppercase tracking-[0.8em]">
                  Diagnostic_Visualizer_Node_01
              </div>
          </div>

        </div>
      </div>

      <style>{`
        .animate-spin-slow { animation: spin 4s linear infinite; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AppDynamicsLab;
