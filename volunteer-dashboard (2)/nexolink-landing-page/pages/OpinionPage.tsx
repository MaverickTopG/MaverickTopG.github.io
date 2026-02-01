import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface OpinionPageProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'story' | 'opinion' | 'login' | 'create' | 'privacy' | 'terms') => void;
}

const OpinionPage: React.FC<OpinionPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const ctx = gsap.context(() => {
      gsap.from(".opinion-hero", {
        y: 80,
        opacity: 0,
        duration: 1,
        ease: "power3.out"
      });
      gsap.from(".opinion-section", {
        y: 30,
        opacity: 0,
        stagger: 0.12,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".opinion-body",
          start: "top 80%"
        }
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="bg-white min-h-screen overflow-x-hidden">
      <section className="relative pt-28 pb-16 bg-white">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="opinion-hero space-y-6">
            <div className="text-xs font-bold uppercase tracking-widest text-charcoal/40">
              Opinion · Sep 15 · Read time: ~3 minutes
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-black text-charcoal leading-tight">
              The end of paper logs is near
            </h1>
            <p className="text-lg md:text-xl font-medium text-charcoal/40 italic uppercase tracking-[0.2em]">
              Why volunteer programs are finally moving past spreadsheets.
            </p>
            <p className="text-xl text-charcoal/50">
              Why volunteer programs are finally moving past clipboards and spreadsheets — and why that matters.
            </p>
            <button
              onClick={() => onNavigate?.('blog')}
              className="px-6 py-3 rounded-full font-bold text-xs uppercase tracking-widest border border-charcoal/10 text-charcoal hover:bg-charcoal hover:text-white transition-all"
            >
              Back to Blog
            </button>
          </div>
        </div>
      </section>

      <section className="opinion-body pb-24">
        <div className="container mx-auto px-6 max-w-4xl space-y-10">
          <div className="opinion-section space-y-4">
            <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
              Paper logs were never designed for the scale and speed of modern community programs. They slow
              down volunteers, create gaps in reporting, and hide the real impact happening every day.
            </p>
            <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
              The shift to digital isn’t about tech for tech’s sake — it’s about honoring people’s time.
              When logging takes seconds instead of weeks, more hours get recorded, more stories get told,
              and more communities get the support they deserve.
            </p>
          </div>

          <div className="opinion-section space-y-4">
            <h2 className="text-2xl md:text-3xl font-black text-charcoal">What changes when logs go digital</h2>
            <ul className="list-disc pl-6 space-y-2 text-lg text-charcoal/70 font-medium">
              <li>Volunteers get instant records they can be proud of.</li>
              <li>Organizations can approve hours in minutes, not months.</li>
              <li>Schools and districts can export clean reports on demand.</li>
              <li>Impact becomes visible — not buried in a file cabinet.</li>
            </ul>
          </div>

          <div className="opinion-section space-y-4">
            <h2 className="text-2xl md:text-3xl font-black text-charcoal">The real win: community momentum</h2>
            <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
              When the admin work disappears, people can focus on the mission. That’s the promise of modern
              volunteer tools — and why paper logs are finally on the way out.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OpinionPage;
