
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Monitor, Smartphone, History, CheckCircle2, ArrowRight } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface VolunteersInfoPageProps {
  onNavigate?: (page: any) => void;
}

const VolunteersInfoPage: React.FC<VolunteersInfoPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      // 1. Hero Entrance
      const tl = gsap.timeline();
      tl.from(".volunteer-word", {
        y: 150,
        opacity: 0,
        rotateX: -30,
        stagger: 0.1,
        duration: 1.4,
        ease: "power4.out",
        delay: 0.2
      })
      .from(".volunteer-subtitle", {
        y: 20,
        opacity: 0,
        duration: 1,
        ease: "power2.out"
      }, "-=0.8");

      // 2. Feature Grid Reveal
      const features = gsap.utils.toArray('.feature-card');
      features.forEach((card: any) => {
        gsap.fromTo(card, 
          { opacity: 0, scale: 0.9, y: 30 },
          { 
            opacity: 1, 
            scale: 1,
            y: 0, 
            duration: 1, 
            ease: "expo.out",
            scrollTrigger: {
              trigger: card,
              start: "top 85%",
            }
          }
        );
      });

      // 3. Dual Platform Animation
      gsap.from(".platform-visual", {
        opacity: 0,
        y: 60,
        duration: 1.5,
        stagger: 0.3,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".dual-platform-section",
          start: "top 70%",
        }
      });

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="bg-white min-h-screen overflow-x-hidden">
        
        {/* 1. Hero Section */}
        <section className="relative h-screen flex flex-col items-center justify-center bg-white z-10">
            <div className="text-center px-6">
                <div className="overflow-hidden mb-2">
                     <h1 className="volunteer-word text-[14vw] md:text-[13rem] font-display font-black tracking-tighter leading-[0.8] text-charcoal">
                        VOLUNTEERS!
                     </h1>
                </div>
                <div className="overflow-hidden">
                     <h1 className="volunteer-word text-[14vw] md:text-[13rem] font-display font-black tracking-tighter leading-[0.8] text-transparent" style={{ WebkitTextStroke: '3px #0F1115' }}>
                        ONE HUB.
                     </h1>
                </div>
                <p className="volunteer-subtitle mt-12 text-xl md:text-3xl font-medium text-charcoal/30 max-w-2xl mx-auto uppercase tracking-wide">
                    The web and the app. Two ways to log, one way to make an impact.
                </p>
            </div>

            {/* Floating particles */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                {Array.from({ length: 20 }).map((_, i) => (
                    <div 
                        key={i} 
                        className="absolute w-1 h-1 bg-neon/30 rounded-full"
                        style={{
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`,
                        }}
                    ></div>
                ))}
            </div>
        </section>

        {/* 2. Registration Highlight */}
        <section className="py-32 bg-charcoal relative overflow-hidden">
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
             
             <div className="container mx-auto px-6 max-w-6xl">
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                     <div className="feature-card">
                         <span className="text-charcoal bg-neon px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest font-bold mb-8 inline-block">Web Registration</span>
                         <h2 className="text-5xl md:text-7xl font-display font-black text-white leading-[0.9] tracking-tighter mb-8 italic">
                             REGISTER <br/> FROM THE <br/> <span className="text-neon">WEB TOO.</span>
                         </h2>
                         <p className="text-xl text-white/50 leading-relaxed font-medium mb-12">
                             No phone? No problem. NexoLink is built to be accessible from any device. Create your account, join organizations, and find opportunities right from your browser.
                         </p>
                         <div className="space-y-4">
                             {[
                                "Complete onboarding in seconds",
                                "Explore local opportunities",
                                "Manage your profile preferences"
                             ].map((text, i) => (
                                 <div key={i} className="flex items-center gap-4 text-white/80 font-bold tracking-tight">
                                     <CheckCircle2 className="w-6 h-6 text-neon" />
                                     {text}
                                 </div>
                             ))}
                         </div>
                     </div>
                     <div className="feature-card relative aspect-square bg-white/5 rounded-[3rem] border border-white/10 flex items-center justify-center overflow-hidden">
                          <Monitor className="w-48 h-48 text-neon/20 absolute -bottom-10 -right-10" />
                          <div className="relative z-10 w-[80%] h-[60%] bg-white rounded-2xl shadow-2xl p-6 overflow-hidden">
                               <div className="flex gap-2 mb-4">
                                   <div className="w-3 h-3 rounded-full bg-red-400"></div>
                                   <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                                   <div className="w-3 h-3 rounded-full bg-green-400"></div>
                               </div>
                               <div className="space-y-3">
                                   <div className="h-4 w-1/3 bg-gray-100 rounded"></div>
                                   <div className="h-20 w-full bg-gray-50 rounded-xl"></div>
                                   <div className="grid grid-cols-2 gap-4">
                                       <div className="h-24 w-full bg-gray-50 rounded-xl"></div>
                                       <div className="h-24 w-full bg-gray-50 rounded-xl"></div>
                                   </div>
                               </div>
                          </div>
                     </div>
                 </div>
             </div>
        </section>

        {/* 3. Dual Logging Section */}
        <section className="py-32 bg-white dual-platform-section">
             <div className="container mx-auto px-6 text-center mb-24">
                 <h2 className="text-5xl md:text-8xl font-display font-black text-charcoal tracking-tighter mb-8">
                     TWO WAYS, <br/> ONE MISSION.
                 </h2>
                 <p className="text-xl text-charcoal/40 font-medium max-w-2xl mx-auto">
                     Whether you're on the go with your phone or sitting at your desk, logging hours has never been more seamless.
                 </p>
             </div>

             <div className="container mx-auto px-6 max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-12">
                 <div className="platform-visual p-12 bg-softGray rounded-[3.5rem] flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl mb-10">
                          <Smartphone className="w-10 h-10 text-charcoal" />
                      </div>
                      <h3 className="text-3xl font-display font-black text-charcoal mb-6 uppercase italic">Mobile App</h3>
                      <p className="text-charcoal/50 font-medium leading-relaxed">
                          Quick logs, QR check-ins, and instant notifications. The perfect companion for active service on the field.
                      </p>
                 </div>
                 <div className="platform-visual p-12 bg-charcoal rounded-[3.5rem] flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-neon rounded-3xl flex items-center justify-center shadow-xl mb-10">
                          <Monitor className="w-10 h-10 text-charcoal" />
                      </div>
                      <h3 className="text-3xl font-display font-black text-white mb-6 uppercase italic">Web Portal</h3>
                      <p className="text-white/40 font-medium leading-relaxed">
                          Bulk logging, detailed history reviews, and organization Discovery. Manage your entire legacy with power and precision.
                      </p>
                 </div>
             </div>
        </section>

        {/* 4. History Tracking */}
        <section className="py-32 bg-neon relative overflow-hidden">
             <div className="container mx-auto px-6 max-w-6xl">
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                     <div className="order-2 lg:order-1 feature-card">
                          <div className="h-[400px] w-full bg-charcoal rounded-[3rem] p-10 relative overflow-hidden shadow-2xl">
                               <div className="flex justify-between items-center mb-8">
                                   <div className="h-4 w-32 bg-white/10 rounded-full"></div>
                                   <History className="w-6 h-6 text-neon" />
                               </div>
                               <div className="space-y-6">
                                   {Array.from({ length: 3 }).map((_, i) => (
                                       <div key={i} className="flex gap-4 items-center">
                                           <div className="w-12 h-12 bg-white/5 rounded-2xl"></div>
                                           <div className="flex-1 space-y-2">
                                               <div className="h-3 w-1/2 bg-white/20 rounded-full"></div>
                                               <div className="h-2 w-1/4 bg-white/10 rounded-full"></div>
                                           </div>
                                           <div className="h-3 w-12 bg-neon/40 rounded-full"></div>
                                       </div>
                                   ))}
                               </div>
                               <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-charcoal to-transparent">
                                    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full w-2/3 bg-neon rounded-full"></div>
                                    </div>
                               </div>
                          </div>
                     </div>
                     <div className="order-1 lg:order-2 feature-card">
                         <span className="text-neon bg-charcoal px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest font-bold mb-8 inline-block">Legacy Tracking</span>
                         <h2 className="text-5xl md:text-7xl font-display font-black text-charcoal leading-[0.9] tracking-tighter mb-8 italic">
                             TRACK YOUR <br/> ENTIRE <br/> <span className="text-white">HISTORY.</span>
                         </h2>
                         <p className="text-xl text-charcoal/60 leading-relaxed font-medium mb-12">
                             Access a complete, verifiable record of every hour you've served. Export reports for college applications, scholarships, or personal milestones—all through the web portal.
                         </p>
                         <button
                            onClick={() => onNavigate?.('volunteer-signup')}
                            className="bg-charcoal text-white px-10 py-5 rounded-full font-black uppercase tracking-widest hover:scale-105 transition-all shadow-2xl flex items-center gap-4 group"
                         >
                             Get Started <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                         </button>
                     </div>
                 </div>
             </div>
        </section>

        {/* 5. Final CTA */}
        <section className="py-32 bg-white">
            <div className="container mx-auto px-6 text-center max-w-3xl">
                <h3 className="text-4xl md:text-6xl font-display font-black text-charcoal mb-8 uppercase italic leading-none">
                    Ready to start your <span className="text-neon-dark underline decoration-charcoal decoration-[6px] underline-offset-[8px]">legacy?</span>
                </h3>
                <p className="text-xl text-charcoal/40 font-medium mb-12">
                    Join the thousands of volunteers who trust NexoLink to power their purpose.
                </p>
                <div className="flex flex-col md:flex-row justify-center gap-6">
                    <button
                        onClick={() => onNavigate?.('volunteer-signup')}
                        className="px-10 py-5 bg-charcoal text-white rounded-full font-black uppercase tracking-widest hover:bg-neon hover:text-charcoal transition-all hover:scale-105 shadow-2xl"
                    >
                        Sign Up on Web
                    </button>
                    <button
                        onClick={() => window.open('https://apps.apple.com', '_blank')}
                        className="px-10 py-5 border-2 border-charcoal/10 text-charcoal rounded-full font-black uppercase tracking-widest hover:border-charcoal hover:bg-charcoal hover:text-white transition-all hover:scale-105"
                    >
                        Download App
                    </button>
                </div>
            </div>
        </section>

    </div>
  );
};

export default VolunteersInfoPage;
