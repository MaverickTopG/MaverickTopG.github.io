
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface HeroProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'login' | 'create') => void;
}

const Hero: React.FC<HeroProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  
  const [columns, setColumns] = useState(20);
  const [rows, setRows] = useState(15);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const updateGrid = () => {
      if (!containerRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cellSize = w < 768 ? 40 : 60;
      setColumns(Math.ceil(w / cellSize));
      setRows(Math.ceil(h / cellSize));
    };
    
    updateGrid();
    window.addEventListener('resize', updateGrid);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      
      tl.from(".grid-dot", {
        scale: 0,
        opacity: 0,
        stagger: {
            amount: 1.5,
            grid: [rows, columns],
            from: "center"
        },
        duration: 0.8,
        ease: "power3.out"
      })
      .from(".hero-hud", {
        opacity: 0,
        y: -20,
        duration: 0.8,
        stagger: 0.1,
        ease: "power2.out"
      }, "-=0.5")
      .from(".hero-char", {
        y: 200,
        rotateX: -90,
        opacity: 0,
        stagger: 0.05,
        duration: 1,
        ease: "expo.out"
      }, "-=0.5")
      .from(".hero-btn", {
        opacity: 0,
        y: 20,
        duration: 0.8,
        stagger: 0.1
      }, "-=0.5");

      const dots = gsap.utils.toArray(".grid-dot");
      
      const onMouseMove = (e: MouseEvent) => {
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        dots.forEach((dot: any) => {
           const rect = dot.getBoundingClientRect();
           const dotX = rect.left + rect.width / 2;
           const dotY = rect.top + rect.height / 2;
           
           const dist = Math.hypot(mouseX - dotX, mouseY - dotY);
           const maxDist = 300;

           if (dist < maxDist) {
             const strength = (maxDist - dist) / maxDist;
             const angle = Math.atan2(mouseY - dotY, mouseX - dotX);
             
             gsap.to(dot, {
               x: -Math.cos(angle) * 50 * strength,
               y: -Math.sin(angle) * 50 * strength,
               scale: 1 + strength,
               backgroundColor: dist < 100 ? '#9EFF4F' : '#0F1115',
               duration: 0.4,
               ease: "power2.out"
             });
           } else {
             gsap.to(dot, {
               x: 0,
               y: 0,
               scale: 1,
               backgroundColor: '#e5e7eb',
               duration: 0.6,
               ease: "elastic.out(1, 0.3)"
             });
           }
        });
      };

      window.addEventListener('mousemove', onMouseMove);

      gsap.to(textRef.current, {
        y: 150,
        opacity: 0,
        filter: "blur(10px)",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true
        }
      });

      return () => window.removeEventListener('mousemove', onMouseMove);
    }, containerRef);

    return () => {
        window.removeEventListener('resize', updateGrid);
        ctx.revert();
    }
  }, [columns, rows]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleWatchFilmClick = () => {
    setToastVisible(true);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 2200);
  };

  return (
    <div ref={containerRef} className="relative h-screen w-full bg-white overflow-hidden flex flex-col items-center justify-start pt-32 md:pt-0 md:justify-center">
      {toastVisible && (
        <div className="fixed bottom-8 right-8 z-[2147483647] rounded-2xl px-6 py-4 shadow-2xl border border-white/10 bg-charcoal text-white">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-4 w-4 items-center justify-center">
              <span className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin"></span>
            </span>
            <span className="text-xs font-black uppercase tracking-widest">Coming Soon!</span>
          </div>
        </div>
      )}
      
      <div 
        ref={gridRef}
        className="absolute inset-0 z-0 grid"
        style={{
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`
        }}
      >
        {Array.from({ length: columns * rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-center w-full h-full">
                <div className="grid-dot w-1 h-1 bg-gray-200 rounded-full will-change-transform"></div>
            </div>
        ))}
      </div>



      <div ref={textRef} className="relative z-10 container mx-auto px-6 flex flex-col items-center pointer-events-none">
         
         <div className="text-center w-full mix-blend-hard-light mb-12 md:mb-16">
            <h1 className="flex flex-col items-center justify-center leading-[0.85] font-display font-black text-charcoal tracking-tighter">
                <div className="flex overflow-hidden">
                    {"IMPACT".split("").map((char, i) => (
                        <span key={i} className="hero-char inline-block text-[18vw] md:text-[14rem] select-none hover:text-neon transition-colors duration-300 cursor-default">
                            {char}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-4 md:gap-12 overflow-hidden w-full justify-center">
                     <span className="hero-char text-[5vw] md:text-[4rem] font-medium tracking-normal opacity-50 italic font-serif translate-y-[-1vw]">The</span>
                     <div className="flex">
                        {"OPERATING".split("").map((char, i) => (
                            <span key={i} className="hero-char inline-block text-[12vw] md:text-[9rem] select-none text-transparent" style={{ WebkitTextStroke: '1px #0F1115'}}>
                                {char}
                            </span>
                        ))}
                     </div>
                     <span className="hero-char text-[5vw] md:text-[4rem] font-medium tracking-normal opacity-50 italic font-serif translate-y-[-1vw]">System</span>
                </div>
            </h1>
         </div>

         <div className="hero-btn flex flex-col md:flex-row items-center gap-6 pointer-events-auto">
             <button 
                onClick={() => onNavigate?.('pricing')}
                className="group relative px-10 py-5 bg-charcoal text-white rounded-full overflow-hidden shadow-2xl transition-all hover:scale-105 hover:shadow-neon/50"
             >
                 <div className="absolute inset-0 bg-neon translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
                 <span className="relative z-10 font-bold text-lg tracking-widest uppercase group-hover:text-charcoal transition-colors">Start Project</span>
             </button>
             
             <div
                className="flex items-center gap-4 group cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={handleWatchFilmClick}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleWatchFilmClick();
                  }
                }}
             >
                 <div className="w-12 h-12 border border-charcoal/20 rounded-full flex items-center justify-center group-hover:bg-charcoal group-hover:text-neon transition-colors duration-300">
                     <span className="text-xl">▶</span>
                 </div>
                 <span className="font-bold text-charcoal/60 group-hover:text-charcoal transition-colors uppercase tracking-widest text-xs">Watch The Film</span>
             </div>
         </div>

      </div>

      <div className="hero-hud absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none hidden md:flex">
          <div className="w-[1px] h-12 bg-gradient-to-b from-charcoal to-transparent mb-2"></div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-charcoal/40 pl-[0.3em]">Scroll</span>
      </div>

    </div>
  );
};

export default Hero;
