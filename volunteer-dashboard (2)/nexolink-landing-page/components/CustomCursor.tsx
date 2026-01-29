
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const CustomCursor: React.FC = () => {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      
      gsap.to(dotRef.current, {
        x: clientX,
        y: clientY,
        duration: 0.1,
      });
      
      gsap.to(ringRef.current, {
        x: clientX,
        y: clientY,
        duration: 0.3,
      });
    };

    window.addEventListener('mousemove', onMouseMove);

    const handleHover = () => {
        gsap.to(ringRef.current, { scale: 1.5, borderColor: '#9EFF4F', duration: 0.3 });
        gsap.to(dotRef.current, { scale: 0.5, backgroundColor: '#9EFF4F', duration: 0.3 });
    };

    const handleLeave = () => {
        gsap.to(ringRef.current, { scale: 1, borderColor: '#0F1115', duration: 0.3 });
        gsap.to(dotRef.current, { scale: 1, backgroundColor: '#0F1115', duration: 0.3 });
    };

    const targets = document.querySelectorAll('a, button, .feature-card');
    targets.forEach(t => {
        t.addEventListener('mouseenter', handleHover);
        t.addEventListener('mouseleave', handleLeave);
    });

    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  return (
    <>
      <div 
        ref={dotRef} 
        className="fixed top-0 left-0 w-1.5 h-1.5 bg-charcoal rounded-full z-[9999] pointer-events-none -translate-x-1/2 -translate-y-1/2 hidden md:block"
      />
      <div 
        ref={ringRef} 
        className="fixed top-0 left-0 w-10 h-10 border border-charcoal rounded-full z-[9998] pointer-events-none -translate-x-1/2 -translate-y-1/2 opacity-20 hidden md:block"
      />
    </>
  );
};

export default CustomCursor;
