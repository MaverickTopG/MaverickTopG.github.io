
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Users, Building2, Heart, Share2, ShieldCheck, Zap } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

const ImpactNexus: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Initial 3D Setup
      gsap.set(".shards-container", { perspective: 2000 });
      gsap.set(".shard", { 
        z: -2000, 
        opacity: 0,
        rotationY: (i) => i * 45 - 90,
        rotationX: (i) => i * 10 - 20
      });

      // 2. Timeline for the cinematic "Docking" sequence
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=3000",
          scrub: 1,
          pin: true,
          anticipatePin: 1
        }
      });

      // First, bring the core to life
      tl.to(".core-ring", {
        rotation: 360,
        scale: 1.2,
        opacity: 1,
        stagger: 0.1,
        duration: 1
      });

      // Then fly the shards in from deep space
      tl.to(".shard", {
        z: 0,
        opacity: 1,
        rotationY: 0,
        rotationX: 0,
        stagger: 0.2,
        duration: 2,
        ease: "power2.inOut"
      }, "-=0.5");

      // Shrink and move the core back as shards take the lead
      tl.to(".core-center", {
        scale: 0.8,
        opacity: 0.3,
        duration: 1
      }, "-=1");

      // Ambient floating after docking
      gsap.to(".shard", {
        y: "20px",
        duration: 3,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.1
      });

      // Mouse reactivity (Tilting the floor)
      const onMouseMove = (e: MouseEvent) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;
        gsap.to(".shards-container", {
          rotationY: x,
          rotationX: -y,
          duration: 1,
          ease: "power2.out"
        });
      };
      window.addEventListener('mousemove', onMouseMove);

      return () => window.removeEventListener('mousemove', onMouseMove);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const shards = [
    { title: "Students", label: "SERVICE RECORD", icon: <Users />, desc: "Discover roles, log hours, and build a verified service history." },
    { title: "Schools", label: "CLEAR REPORTING", icon: <Building2 />, desc: "Approve hours, export CSV/PDFs, and simplify compliance." },
    { title: "Nonprofits", label: "VOLUNTEER OPS", icon: <Heart />, desc: "Publish events, message volunteers, and track impact in one place." },
    { title: "Communities", label: "LOCAL IMPACT", icon: <Share2 />, desc: "Keep service accessible for clubs, councils, and civic groups." }
  ];

  return (
    <div ref={sectionRef} data-bg="dark" className="bg-charcoal min-h-screen relative overflow-hidden flex items-center justify-center">
      
      {/* 1. ATMOSPHERIC 3D GRID */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-10">
        <div className="w-[200%] h-[200%] absolute top-[-50%] left-[-50%] bg-[linear-gradient(rgba(158,255,79,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(158,255,79,0.2)_1px,transparent_1px)] [background-size:100px_100px] [transform:rotateX(60deg)]"></div>
      </div>

      {/* 2. THE CORE (Engine) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="core-center relative w-96 h-96 flex items-center justify-center">
            <div className="core-ring absolute inset-0 border-2 border-neon/20 rounded-full opacity-0"></div>
            <div className="core-ring absolute inset-8 border border-white/10 rounded-full opacity-0"></div>
            <div className="core-ring absolute inset-16 border-2 border-neon/40 rounded-full border-dashed opacity-0"></div>
            <div className="absolute w-24 h-24 bg-neon/10 rounded-full blur-3xl animate-pulse"></div>
            <Zap className="text-neon w-12 h-12 relative z-10 animate-bounce" />
        </div>
      </div>

      {/* 3. THE SHARDS (3D Perspective) */}
      <div className="container mx-auto px-6 relative z-10">
        <div className="mb-24 text-center">
            <h2 className="text-neon font-mono text-xs uppercase tracking-[0.6em] mb-4 animate-pulse">Impact Architecture</h2>
            <h3 className="text-white text-6xl md:text-[8vw] font-display font-black tracking-tighter leading-none">
                THE NEXUS <br/> <span className="text-transparent" style={{ WebkitTextStroke: '1.5px white' }}>PROTOCOL.</span>
            </h3>
        </div>

        <div className="shards-container transform-style-3d grid grid-cols-1 md:grid-cols-4 gap-8">
          {shards.map((shard, i) => (
            <div key={i} className="shard relative transform-style-3d group cursor-pointer">
              <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 h-full transition-all duration-500 group-hover:bg-neon group-hover:text-charcoal group-hover:scale-105 group-hover:-translate-y-4 shadow-2xl">
                
                <div className="mb-8 w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center group-hover:bg-charcoal group-hover:text-neon transition-colors">
                    {shard.icon}
                </div>

                <div className="mb-2 text-neon font-mono text-[10px] font-bold uppercase tracking-widest group-hover:text-charcoal/60">
                    {shard.label}
                </div>
                
                <h4 className="text-white text-3xl font-black tracking-tighter mb-4 group-hover:text-charcoal transition-colors">
                    {shard.title}
                </h4>

                <p className="text-white/40 font-medium text-sm leading-relaxed group-hover:text-charcoal/80">
                    {shard.desc}
                </p>

                
              </div>

              {/* Reflective Shadow */}
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-neon/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. DATA OVERLAY */}
      <div className="absolute bottom-12 left-12 font-mono text-[8px] text-white/20 space-y-1 hidden lg:block">
        <div>HOURS::VERIFIED</div>
        <div>PROGRAMS::ACTIVE</div>
        <div>STATUS::SYNCHRONIZED</div>
      </div>

      <style>{`
        .transform-style-3d { transform-style: preserve-3d; }
        .perspective-2000 { perspective: 2000px; }
      `}</style>
    </div>
  );
};

export default ImpactNexus;
