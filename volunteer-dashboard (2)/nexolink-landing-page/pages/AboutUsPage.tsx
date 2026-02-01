
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Heart, Rocket, User, ArrowRight } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface AboutUsPageProps {
  onNavigate?: (page: any) => void;
}

const AboutUsPage: React.FC<AboutUsPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      // 1. Hero Entrance
      const tl = gsap.timeline();
      tl.from(".about-word", {
        y: 150,
        opacity: 0,
        rotateX: -30,
        stagger: 0.1,
        duration: 1.4,
        ease: "power4.out",
        delay: 0.2
      })
      .from(".about-subtitle", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8");

      // 2. Story Sections Reveal
      const sections = gsap.utils.toArray('.story-section');
      sections.forEach((section: any) => {
        gsap.fromTo(section, 
          { opacity: 0, y: 50 },
          { 
            opacity: 1, 
            y: 0, 
            duration: 1, 
            ease: "power3.out",
            scrollTrigger: {
              trigger: section,
              start: "top 80%",
            }
          }
        );
      });

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="bg-white min-h-screen overflow-x-hidden">
        
        {/* 1. Hero Section */}
        <section className="relative h-screen flex flex-col items-center justify-center bg-white z-10">
            <div className="text-center">
                <div className="overflow-hidden mb-2">
                     <h1 className="about-word text-[15vw] md:text-[14rem] font-display font-black tracking-tighter leading-[0.8] text-charcoal">
                        OUR
                     </h1>
                </div>
                <div className="overflow-hidden">
                     <h1 className="about-word text-[15vw] md:text-[14rem] font-display font-black tracking-tighter leading-[0.8] text-transparent" style={{ WebkitTextStroke: '3px #0F1115' }}>
                        STORY.
                     </h1>
                </div>
                <p className="about-subtitle mt-8 text-xl md:text-2xl font-medium text-charcoal/40 max-w-2xl mx-auto px-6 italic uppercase tracking-[0.2em]">
                    A journey from a 9th-grade vision to a community of 1.2k+ volunteers.
                </p>
            </div>
        </section>

        {/* 2. Narrative Section */}
        <section className="py-32 relative bg-softGray overflow-hidden">
            <div className="container mx-auto px-6 max-w-5xl space-y-32">
                
                {/* The Spark */}
                <div className="story-section grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
                    <div>
                        <span className="text-neon bg-charcoal px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest font-bold mb-8 inline-block">The Spark</span>
                        <h2 className="text-4xl md:text-6xl font-display font-black text-charcoal leading-tight mb-8">
                            Ninth Grade & <br/> A Lunchtime Vent.
                        </h2>
                    </div>
                    <div className="text-lg md:text-xl text-charcoal/60 leading-relaxed font-medium space-y-6 pt-4">
                        <p>
                            It began in the 9th grade. I remember sitting at lunch when a friend of mine, frustrated and overwhelmed, vented about how impossible it was to find local volunteering opportunities.
                        </p>
                        <p>
                            At the time, I was focused on a project called 'Articles'—a technical experiment that, while interesting, lacked a real sense of purpose. But that lunchtime conversation changed everything.
                        </p>
                    </div>
                </div>

                {/* The Evolution */}
                <div className="story-section grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
                    <div className="order-1 md:order-2">
                        <span className="text-charcoal bg-neon px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest font-bold mb-8 inline-block">The Evolution</span>
                        <h2 className="text-4xl md:text-6xl font-display font-black text-charcoal leading-tight mb-8">
                            Iterating Without <br/> Empathy.
                        </h2>
                    </div>
                    <div className="order-2 md:order-1 text-lg md:text-xl text-charcoal/60 leading-relaxed font-medium space-y-6 pt-4">
                        <p>
                            I spent the next year iterating and prototyping. Honestly, if you saw the initial versions of NexoLink, you wouldn't recognize it as the platform it is today.
                        </p>
                        <p>
                            It was built for me—a tool only I knew how to navigate, stripped of any consideration for the person on the other side of the screen. My mother was the first to call it out. She wasn't happy with it, and deep down, neither was I. It was then that I truly began to understand the vital importance of user experience (UX).
                        </p>
                    </div>
                </div>

                {/* The Turning Point */}
                <div className="story-section bg-charcoal rounded-[3rem] p-12 md:p-24 relative overflow-hidden shadow-2xl">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <div>
                            <span className="text-charcoal bg-neon px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest font-bold mb-8 inline-block">The Turning Point</span>
                            <h2 className="text-4xl md:text-6xl font-display font-black text-white leading-tight mb-8">
                                Tiburon Library & <br/> Perseverance.
                            </h2>
                            <p className="text-lg text-white/60 leading-relaxed font-medium mb-8">
                                After seven discouraging rejections from local libraries, I felt the weight of a 'failed' project. At the final stop—Tiburon Library—I was ready to give up.
                            </p>
                        </div>
                        <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10 italic text-white/80 text-xl leading-relaxed">
                            "I just wanted to leave, for us to go home and forget the day. But my mother was adamant. She took my phone, walked up to the librarian, and started presenting the app. When they said 'yes,' I finally understood the true definition of perseverance."
                        </div>
                    </div>
                </div>

                {/* The Growth */}
                <div className="story-section grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
                    <div>
                        <span className="text-neon bg-charcoal px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest font-bold mb-8 inline-block">The Growth</span>
                        <h2 className="text-4xl md:text-6xl font-display font-black text-charcoal leading-tight mb-8">
                            A Fictional Concept <br/> Made Reality.
                        </h2>
                    </div>
                    <div className="text-lg md:text-xl text-charcoal/60 leading-relaxed font-medium space-y-6 pt-4">
                        <p>
                            In mid-2025, the first iteration of the Admin Portal came to life. By late December, the Peer Tutoring Club at Redwood High School became our first official partner.
                        </p>
                        <p className="font-bold text-charcoal">
                            Today, in 2026, NexoLink has grown into a community of over 1.2k active volunteers, amassing more than 100,000 combined hours of service.
                        </p>
                    </div>
                </div>

            </div>
        </section>

        {/* 3. Gratitude Footer */}
        <section className="py-32 bg-white">
            <div className="container mx-auto px-6 text-center max-w-3xl">
                <Heart className="w-16 h-16 text-neon mx-auto mb-12" fill="currentColor" />
                <h3 className="text-3xl md:text-5xl font-display font-black text-charcoal mb-8 uppercase italic leading-none">
                    To everyone using this application: THANK YOU.
                </h3>
                <p className="text-xl text-charcoal/40 font-medium mb-12">
                    And most of all, I thank my mother, who helped turn a fictional concept into a reality. <br/><br/>
                    To everyone who has read this far... I hope you will utilize this app to create wondrous journeys of your own!
                </p>
                <button
                    onClick={() => onNavigate?.('create')}
                    className="px-10 py-5 bg-charcoal text-white rounded-full font-black uppercase tracking-widest hover:bg-neon hover:text-charcoal transition-all hover:scale-105 shadow-2xl"
                >
                    Join the Mission
                </button>
            </div>
        </section>

        {/* Background Visuals */}
        <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon rounded-full blur-[120px]"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon rounded-full blur-[120px]"></div>
        </div>

    </div>
  );
};

export default AboutUsPage;
