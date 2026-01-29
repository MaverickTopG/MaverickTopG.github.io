
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface BlogPageProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'story' | 'login' | 'create' | 'privacy' | 'terms') => void;
}

const BlogPage: React.FC<BlogPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      // 1. Hero Entrance
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
      .from(".blog-nav-item", {
        y: 20,
        opacity: 0,
        stagger: 0.05,
        duration: 0.8,
        ease: "power2.out"
      }, "-=0.8");

      // 2. Vertical List Reveal
      const articles = gsap.utils.toArray('.article-row');
      if (articles.length > 0) {
        gsap.fromTo(articles, 
            { opacity: 0, y: 50 },
            { 
                opacity: 1, 
                y: 0, 
                stagger: 0.1, 
                duration: 0.8, 
                scrollTrigger: {
                    trigger: ".article-list",
                    start: "top 75%",
                }
            }
        );
      }

    }, containerRef);

    return () => ctx.revert();
  }, []);

  const founderStory = {
    effective: "December 20, 2025",
    readTime: "~5 minutes",
    title: "How I Built NexoLink: A Founder Story in 5 Minutes",
    subtitle: "Why NexoLink exists, the principles behind the product, and the moments that shaped it.",
    sections: [
      {
        heading: "Why I Started",
        body: [
          "I built NexoLink because volunteering should feel effortless, empowering, and visible. I watched friends and local organizations spend hours chasing down volunteer logs, approvals, and reports. At the same time, volunteers wanted to see the impact of their time in a way that felt real and motivating. The gap was clear: mission-driven people were doing amazing work, but the tools behind the scenes were slow, fragmented, and exhausting.",
          "I wanted to create a platform that treats volunteering with the same care we give to modern product experiences. That meant a volunteer app that feels welcoming and a dashboard that feels intelligent, not intimidating. NexoLink is my answer to that problem."
        ]
      },
      {
        heading: "The Perspective That Shaped the Product",
        body: [
          "I approached NexoLink as a builder who believes software should reduce friction and increase dignity. If a volunteer takes an hour out of their day to help, the system should honor that time. If a nonprofit manager is coordinating dozens of volunteers, the system should give them clarity, not chaos."
        ],
        bullets: [
          "Human-first clarity: The UI should guide, not overwhelm.",
          "Trust in the data: Logs, approvals, and reports must be clean and credible.",
          "Celebration of impact: Progress should be visible and motivating."
        ],
        after: "Those pillars influenced every design decision, from the glassmorphic dashboard cards to the quick actions for approvals."
      },
      {
        heading: "How I Designed the Experience",
        body: [
          "I started with the volunteer journey. The mobile app needed to feel modern and personal, with a focus on discovery, logging, and recognition. That led to:"
        ],
        bullets: [
          "Curated mission cards",
          "Simple check-in and hour logging",
          "Recognition badges and progress snapshots"
        ],
        after: "Then I designed the admin portal as a companion experience. I wanted admins to immediately understand what needed attention and what was going well. That meant:"
      },
      {
        heading: "Admin Portal Priorities",
        bullets: [
          "A high-level impact overview",
          "Volunteer request workflows",
          "Quick access to billing and admin tools"
        ],
        after: "The result is a UI that feels like a control center for good, not a spreadsheet with a login screen."
      },
      {
        heading: "The Build Process",
        body: [
          "I built the product to scale without losing speed. I chose a modern frontend stack and designed the UI system to stay consistent across pages.",
          "The process looked like this:"
        ],
        bullets: [
          "Define the key flows: volunteer discovery, hour logging, approval, reporting.",
          "Build reusable UI components: cards, modals, tables, and navigation that can scale.",
          "Design for fast iteration: a structure that lets me add new pages without breaking the experience.",
          "Optimize for clarity: if a page does not help a user take action, it gets trimmed."
        ],
        after: "I also took time to write clear policy pages and set a high bar for privacy and transparency. Community platforms need trust, and trust is built through clear intent."
      },
      {
        heading: "What I Want NexoLink to Do for Communities",
        body: [
          "My goal is for NexoLink to help communities grow by making volunteering visible, rewarding, and easier to organize.",
          "Specifically, I want it to:"
        ],
        bullets: [
          "Help volunteers feel seen and motivated",
          "Help organizations run reliable, scalable programs",
          "Help schools and districts keep compliance stress-free",
          "Help community leaders tell stronger impact stories"
        ],
        after: "When the tools are better, the mission grows. I want NexoLink to be the platform that lets people focus on people, not paperwork."
      },
      {
        heading: "What Comes Next",
        body: [
          "NexoLink is only the beginning. I plan to keep listening to real users, iterating on the features that matter most, and keeping the experience joyful. Volunteering should never feel like admin work. The product should feel like a celebration of service.",
          "If you are a volunteer, a nonprofit leader, or an educator, I want to hear your story. This platform is built for you, and it will keep evolving with you.",
          "Thanks for being part of the mission."
        ]
      }
    ]
  };

  const recentArticles = [
    { cat: "Opinion", date: "Sep 15", title: "The end of paper logs is near", page: "opinion" as const },
  ];

  return (
    <div ref={containerRef} className="bg-white min-h-screen overflow-x-hidden">
        
        {/* 1. Hero */}
        <section className="relative h-screen flex flex-col items-center justify-center bg-white z-10">
            <div className="text-center">
                <div className="overflow-hidden mb-2">
                     <h1 className="blog-word text-[13vw] md:text-[12rem] font-display font-black tracking-tighter leading-[0.8] text-charcoal">
                        INSIGHT
                     </h1>
                </div>
                <div className="overflow-hidden">
                     <h1 className="blog-word text-[13vw] md:text-[12rem] font-display font-black tracking-tighter leading-[0.8] text-transparent" style={{ WebkitTextStroke: '3px #0F1115' }}>
                        LOG.
                     </h1>
                </div>
            </div>
        </section>

        {/* 2. Featured Story (Static layout, no horizontal animation) */}
        <section className="relative bg-softGray overflow-hidden">
          <div className="flex min-h-screen items-center">
            <div className="w-full flex items-center justify-center px-12 md:px-32">
              <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                <div className="order-2 md:order-1">
                  <span className="text-xs font-black uppercase tracking-[0.4em] mb-8 block text-charcoal/40 bg-white px-4 py-2 rounded-full inline-block shadow-sm">
                    Founder Story · 01
                  </span>
                  <h2 className="text-5xl md:text-7xl font-display font-black mb-6 leading-[0.95] text-charcoal">
                    {founderStory.title}
                  </h2>
                  <p className="text-xl md:text-2xl font-medium leading-relaxed max-w-lg text-charcoal/60">
                    {founderStory.subtitle}
                  </p>
                  <div className="mt-6 text-sm font-bold uppercase tracking-widest text-charcoal/40">
                    Effective: {founderStory.effective} · Read time: {founderStory.readTime}
                  </div>
                  <button
                    onClick={() => onNavigate?.('story')}
                    className="mt-10 px-8 py-4 rounded-full font-bold text-sm uppercase tracking-widest transition-all bg-charcoal text-white hover:bg-neon hover:text-charcoal hover:scale-105 shadow-xl"
                  >
                    Read Article
                  </button>
                </div>

                <div className="order-1 md:order-2 h-[400px] md:h-[500px] w-full">
                  <div className="w-full h-full bg-[#1a1c23] rounded-[2.5rem] p-8 relative overflow-hidden shadow-2xl border border-white/5 flex flex-col font-mono text-sm">
                    <div className="flex gap-2 mb-6">
                      <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                    </div>
                    <div className="space-y-2 text-green-400/80">
                      <div><span className="text-purple-400">const</span> <span className="text-yellow-200">mission</span> = <span className="text-blue-300">"volunteer"</span>;</div>
                      <div className="pl-4"><span className="text-purple-400">const</span> result = <span className="text-blue-300">await</span> log(hours);</div>
                      <div className="pl-4"><span className="text-purple-400">const</span> status = <span className="text-blue-300">await</span> approve(result);</div>
                      <div className="pl-4"><span className="text-purple-400">return</span> impact.report();</div>
                    </div>
                    <div className="mt-auto bg-black/30 p-4 rounded-xl border border-white/5">
                      <div className="flex justify-between text-xs text-white/40 mb-2">
                        <span>Verified Logs</span>
                        <span>Live</span>
                      </div>
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-1/3 bg-green-400 rounded-full"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Vertical List - Latest */}
        <section className="py-32 bg-white container mx-auto px-6 max-w-5xl">
            <div className="mb-20 flex items-end justify-between">
                <div>
                    <h2 className="text-4xl md:text-6xl font-display font-black text-charcoal mb-4">Latest Updates</h2>
                    <p className="text-xl text-charcoal/50">Fresh from the lab.</p>
                </div>
            </div>

            <div className="article-list flex flex-col gap-4">
                {recentArticles.map((article, i) => (
                    <div
                      key={i}
                      onClick={() => onNavigate?.(article.page)}
                      className="article-row group p-8 bg-white border border-charcoal/5 rounded-3xl flex flex-col md:flex-row gap-8 md:items-center justify-between hover:border-charcoal/20 hover:shadow-lg transition-all cursor-pointer"
                    >
                        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
                             <div className="text-xs font-black uppercase tracking-widest text-charcoal/30 w-24">{article.date}</div>
                             <div>
                                 <span className="inline-block px-3 py-1 rounded-full bg-softGray text-[10px] font-bold uppercase tracking-wider mb-3 text-charcoal/60 group-hover:bg-charcoal group-hover:text-white transition-colors">{article.cat}</span>
                                 <h3 className="text-2xl font-bold text-charcoal group-hover:text-neon-dark transition-colors">{article.title}</h3>
                             </div>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-softGray flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-2">
                            →
                        </div>
                    </div>
                ))}
            </div>
        </section>

        {/* 4. Contact CTA */}
        <section className="pb-32 container mx-auto px-6">
            <div className="bg-charcoal rounded-[4rem] p-16 md:p-32 relative overflow-hidden shadow-2xl">
                 <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
                 
                 <div className="relative z-10 text-center">
                     <h2 className="text-5xl md:text-8xl font-display font-black text-white tracking-tighter mb-8">
                         READY TO <br/> <span className="text-neon">TALK?</span>
                     </h2>
                     <p className="text-xl font-medium text-white/60 mb-12 max-w-xl mx-auto">
                         Have a question or want to pilot NexoLink at your organization? Send us a quick note.
                     </p>
                     
                     <div className="flex justify-center">
                         <a
                           href="mailto:ayanshashish@gmail.com?subject=NexoLink%20Inquiry"
                           className="bg-neon text-charcoal px-10 py-4 rounded-full font-black uppercase tracking-widest hover:scale-105 transition-transform"
                         >
                           Send Email
                         </a>
                     </div>
                 </div>
            </div>
        </section>

    </div>
  );
};

export default BlogPage;
