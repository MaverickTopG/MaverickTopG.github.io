
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Heart, Coffee, Star, Rocket, CheckCircle2, ArrowRight, Github } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface DonatePageProps {
  onNavigate?: (page: any) => void;
}

const DonatePage: React.FC<DonatePageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const GOFUNDME_URL = 'https://gofund.me/dc00981c8';
  const GOFUNDME_EMBED_URL =
    'https://www.gofundme.com/f/support-nexolink-making-volunteering-easier-for-all/widget/large?sharesheet=undefined&attribution_id=sl:ca658e9f-2769-4059-82b9-bbd479a0fea1';
  const GOFUNDME_EMBED_SCRIPT = 'https://www.gofundme.com/static/js/embed.js';

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      // 1. Hero Entrance
      const tl = gsap.timeline();
      tl.from(".donate-word", {
        y: 150,
        opacity: 0,
        rotateX: -30,
        stagger: 0.1,
        duration: 1.4,
        ease: "power4.out",
        delay: 0.2
      })
      .from(".donate-subtitle", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8");

      // 2. Donation Cards Entrance
      gsap.fromTo(
        ".donation-card",
        { scale: 0.9, opacity: 0, y: 40 },
        {
          scale: 1,
          opacity: 1,
          y: 0,
          stagger: 0.15,
          duration: 1.2,
          ease: "expo.out",
          immediateRender: false,
          scrollTrigger: {
            trigger: ".donation-grid",
            start: "top 75%",
          }
        }
      );

      // 3. Impact Sections Reveal
      const sections = gsap.utils.toArray('.reveal-section');
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


  const contributionTiers = [
    {
      label: "Support Node",
      amount: "5",
      icon: Coffee,
      desc: "Help keep our servers running smooth for local organizations.",
      features: ["Server maintenance", "Basic API nodes", "Community support"]
    },
    {
      label: "Mission Booster",
      amount: "25",
      icon: Star,
      desc: "Empower us to build faster and reach more high schools.",
      features: ["Feature development", "School pilot programs", "Advanced analytics"],
      featured: true
    },
    {
      label: "Legacy Partner",
      amount: "100",
      icon: Rocket,
      desc: "Drive the global mission to modernize the world's service tracking.",
      features: ["Global scalability", "Mobile app optimizations", "VIP platform access"]
    }
  ];

  return (
    <div ref={containerRef} className="bg-white min-h-screen overflow-x-hidden">
        
        {/* 1. Hero Section */}
        <section className="relative h-screen flex flex-col items-center justify-center bg-white z-10 px-6">
            <div className="text-center">
                <div className="overflow-hidden mb-2">
                     <h1 className="donate-word text-[15vw] md:text-[14rem] font-display font-black tracking-tighter leading-[0.8] text-charcoal">
                        SUPPORT
                     </h1>
                </div>
                <div className="overflow-hidden">
                     <h1 className="donate-word text-[15vw] md:text-[14rem] font-display font-black tracking-tighter leading-[0.8] text-transparent" style={{ WebkitTextStroke: '3px #0F1115' }}>
                        MISSION.
                     </h1>
                </div>
                <p className="donate-subtitle mt-8 text-xl md:text-2xl font-medium text-charcoal/40 max-w-2xl mx-auto italic uppercase tracking-[0.2em]">
                    Every contribution helps NexoLink grow and redefine service.
                </p>
            </div>

            <div className="absolute bottom-12 flex flex-col items-center animate-bounce opacity-20">
                <span className="text-[10px] font-black uppercase tracking-widest mb-4">Express Gratitude</span>
                <div className="w-px h-12 bg-charcoal"></div>
            </div>
        </section>

        {/* 2. Philosophy Section */}
        <section className="py-32 bg-softGray reveal-section">
            <div className="container mx-auto px-6 max-w-5xl text-center">
                 <Heart className="w-16 h-16 text-neon mx-auto mb-12" fill="currentColor" />
                 <h2 className="text-4xl md:text-6xl font-display font-black text-charcoal mb-8 uppercase italic leading-none">
                    Striving for easier volunteering.
                 </h2>
                 <p className="text-xl md:text-2xl text-charcoal/60 leading-relaxed font-medium mb-12">
                    NexoLink was born from the belief that doing good should never be a burden. We strive to make volunteering more than just possible—we make it effortless. 
                 </p>
                 <p className="text-lg md:text-xl text-charcoal/40 leading-relaxed font-medium">
                    We would appreciate any token of gratitude that can help NexoLink grow as a whole. Every dollar is reinvested into building a faster, more intelligent, and more accessible platform for volunteers and organizations worldwide.
                 </p>
            </div>
        </section>

        {/* 3. Contribution Grid */}
        <section className="py-32 bg-white container mx-auto px-6">
            <div className="donation-grid grid grid-cols-1 md:grid-cols-3 gap-8">
                {contributionTiers.map((tier, i) => (
                    <div 
                        key={i} 
                        className={`donation-card p-12 rounded-[3.5rem] border transition-all duration-500 overflow-hidden relative flex flex-col ${
                            tier.featured 
                            ? 'bg-charcoal border-charcoal text-white shadow-[0_40px_100px_rgba(0,0,0,0.15)] scale-105 z-10' 
                            : 'bg-white border-charcoal/5 text-charcoal hover:border-charcoal/20 hover:shadow-xl'
                        }`}
                    >
                        {tier.featured && (
                            <div className="absolute top-0 right-0 bg-neon text-charcoal font-black text-[10px] uppercase tracking-widest px-6 py-2 rounded-bl-3xl">
                                Recommended
                            </div>
                        )}
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-10 transition-colors ${tier.featured ? 'bg-neon text-charcoal' : 'bg-softGray text-charcoal'}`}>
                            <tier.icon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-4 opacity-40">{tier.label}</h3>
                        <div className="flex items-baseline gap-2 mb-8">
                            <span className="text-[10px] font-black uppercase opacity-40">$</span>
                            <span className="text-6xl font-display font-black leading-none">{tier.amount}</span>
                        </div>
                        <p className={`mb-10 font-medium leading-relaxed ${tier.featured ? 'text-white/50' : 'text-charcoal/40'}`}>
                            {tier.desc}
                        </p>
                        <div className="space-y-4 mb-12 flex-1">
                            {tier.features.map((feature, idx) => (
                                <div key={idx} className="flex items-center gap-3 text-xs font-black uppercase tracking-widest">
                                    <CheckCircle2 className={`w-4 h-4 ${tier.featured ? 'text-neon' : 'text-charcoal/20'}`} />
                                    <span className={tier.featured ? 'text-white/80' : 'text-charcoal/60'}>{feature}</span>
                                </div>
                            ))}
                        </div>
                        <a
                          href={GOFUNDME_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all text-center ${
                            tier.featured 
                            ? 'bg-neon text-charcoal hover:bg-white' 
                            : 'bg-charcoal text-white hover:bg-neon hover:text-charcoal'
                          }`}
                          aria-label={`Contribute $${tier.amount} on GoFundMe`}
                        >
                            Contribute →
                        </a>
                    </div>
                ))}
            </div>
        </section>

        {/* 4. Transparency & Impact */}
        <section className="py-32 bg-charcoal text-white reveal-section">
            <div className="container mx-auto px-6 max-w-6xl">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
                     <div>
                         <span className="text-charcoal bg-neon px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest font-bold mb-8 inline-block">Impact Nodes</span>
                         <h2 className="text-5xl md:text-7xl font-display font-black leading-[0.9] tracking-tighter mb-8 italic">
                             WHERE YOUR <br/> GIFT <span className="text-neon">GOES.</span>
                         </h2>
                         <div className="space-y-12 mt-12">
                             {[
                                { title: "Infra Expansion", desc: "Scaling our database nodes to handle thousands of concurrent activity verifications." },
                                { title: "Open Source Research", desc: "Developing tools and APIs that nonprofits can use for free to manage their programs." },
                                { title: "Volunteer Growth", desc: "Onboarding local high schools and training the next generation of community leaders." }
                             ].map((item, i) => (
                                 <div key={i} className="group cursor-default">
                                     <h4 className="text-xl font-bold mb-3 flex items-center gap-4 group-hover:text-neon transition-colors">
                                         <span className="text-[10px] text-neon/40 font-black">0{i+1}</span>
                                         {item.title}
                                     </h4>
                                     <p className="text-white/40 font-medium leading-relaxed max-w-sm">
                                         {item.desc}
                                     </p>
                                 </div>
                             ))}
                         </div>
                     </div>
                     <div className="bg-white/5 rounded-[3rem] border border-white/10 relative overflow-hidden backdrop-blur-sm min-h-[500px]">
                          <Rocket className="w-64 h-64 text-neon/5 absolute -bottom-20 -right-20" />
                          <div className="relative z-10 w-full h-full">
                               <div className="overflow-hidden shadow-2xl h-full w-full">
                                 <img 
                                   src="/gofundme_goal.png" 
                                   alt="GoFundMe Campaign Goal"
                                   className="w-full h-full object-cover"
                                 />
                               </div>
                          </div>
                     </div>
                 </div>
            </div>
        </section>

        {/* 5. Final Gratitude */}
        <section className="py-32 bg-white">
            <div className="container mx-auto px-6 text-center max-w-3xl">
                <h3 className="text-4xl md:text-6xl font-display font-black text-charcoal mb-8 uppercase italic leading-none">
                    WE ARE <span className="text-neon-dark underline decoration-charcoal decoration-[6px] underline-offset-[8px]">GRATEFUL.</span>
                </h3>
                <p className="text-xl text-charcoal/40 font-medium mb-12">
                    Every donation, large or small, validates our mission and keeps the NexoLink momentum alive. Thank you for being a part of this journey.
                </p>
                <div className="flex flex-col md:flex-row justify-center gap-6">
                    <button
                        onClick={() => onNavigate?.('home')}
                        className="px-10 py-5 bg-charcoal text-white rounded-full font-black uppercase tracking-widest hover:bg-neon hover:text-charcoal transition-all hover:scale-105 shadow-2xl"
                    >
                        Return to Hub
                    </button>
                    <a
                      href="mailto:ayanshashish@gmail.com?subject=Strategic%20Partnership%20Inquiry"
                      className="px-10 py-5 border-2 border-charcoal/10 text-charcoal rounded-full font-black uppercase tracking-widest hover:border-charcoal hover:bg-charcoal hover:text-white transition-all hover:scale-105"
                    >
                        Strategic Inquiry
                    </a>
                </div>
            </div>
        </section>

    </div>
  );
};

export default DonatePage;
