
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface CTAProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'story' | 'opinion' | 'login' | 'create' | 'privacy' | 'terms') => void;
}

const CTA: React.FC<CTAProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
     // Create a vortex effect
     const words = gsap.utils.toArray('.vortex-word');
     
     gsap.to(words, {
         rotation: "+=360",
         duration: 20,
         repeat: -1,
         ease: "linear",
         transformOrigin: "center center"
     });
     
  }, []);

  return (
    <div ref={containerRef} className="h-screen bg-white relative overflow-hidden flex items-center justify-center">
        
        {/* Vortex Text Rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
             {[1, 2, 3].map((ring) => (
                 <div key={ring} className="vortex-word absolute border border-charcoal rounded-full flex items-center justify-center" 
                      style={{ 
                          width: `${ring * 30}vw`, 
                          height: `${ring * 30}vw`,
                          borderStyle: ring % 2 === 0 ? 'dashed' : 'solid'
                      }}>
                 </div>
             ))}
        </div>

        <div className="relative z-10 text-center">
             <div className="mb-12 overflow-hidden">
                 <h2 className="text-[12vw] font-display font-black leading-none text-charcoal mix-blend-multiply tracking-tighter">
                     IMPACT
                 </h2>
                 <h2 className="text-[12vw] font-display font-black leading-none text-transparent mix-blend-multiply tracking-tighter" style={{ WebkitTextStroke: '2px #0F1115' }}>
                     NOW
                 </h2>
             </div>

             <button
               onClick={() => onNavigate?.('pricing')}
               className="group relative w-48 h-48 md:w-64 md:h-64 rounded-full bg-charcoal text-white flex items-center justify-center overflow-hidden hover:scale-110 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] mx-auto shadow-2xl"
             >
                 <div className="absolute inset-0 bg-neon scale-0 group-hover:scale-100 transition-transform duration-500 rounded-full"></div>
                 <span className="relative z-10 font-bold text-xl md:text-2xl group-hover:text-charcoal transition-colors">
                     Get Access
                 </span>
                 <div className="absolute inset-0 border-2 border-white/20 rounded-full animate-ping opacity-20"></div>
             </button>
        </div>
    </div>
  );
};

export default CTA;
