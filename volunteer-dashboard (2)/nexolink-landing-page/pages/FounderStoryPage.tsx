import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface FounderStoryPageProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'story' | 'login' | 'create' | 'privacy' | 'terms') => void;
}

const FounderStoryPage: React.FC<FounderStoryPageProps> = ({ onNavigate }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      gsap.from(".story-hero", {
        y: 80,
        opacity: 0,
        duration: 1,
        ease: "power3.out"
      });

      gsap.from(".story-section", {
        y: 40,
        opacity: 0,
        stagger: 0.12,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".story-body",
          start: "top 80%"
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="bg-white min-h-screen overflow-x-hidden">
      <section className="relative pt-28 pb-16 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="story-hero space-y-6">
            <div className="text-xs font-bold uppercase tracking-widest text-charcoal/40">
              Effective: December 20, 2025 · Read time: ~5 minutes
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-black text-charcoal leading-tight">
              How I Built NexoLink: A Founder Story in 5 Minutes
            </h1>
            <p className="text-lg md:text-xl font-medium text-charcoal/40 italic uppercase tracking-[0.2em]">
              The principles and moments that shaped the mission.
            </p>
            <p className="text-xl text-charcoal/50">
              Why NexoLink exists, the principles behind the product, and the moments that shaped it.
            </p>
            <div className="flex flex-wrap gap-3">
              <span className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-softGray text-charcoal/60">Founder Story</span>
              <span className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-softGray text-charcoal/60">Product Vision</span>
              <span className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest bg-softGray text-charcoal/60">Community Impact</span>
            </div>
          </div>
        </div>
      </section>

      <section className="story-body pb-24">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <aside className="lg:col-span-4">
              <div className="sticky top-24 space-y-6">
                <div className="p-6 rounded-[2rem] border border-charcoal/10 bg-white shadow-[0_20px_40px_-20px_rgba(0,0,0,0.15)]">
                  <div className="text-xs font-bold uppercase tracking-widest text-charcoal/40">On this page</div>
                  <ul className="mt-6 space-y-3 text-sm font-semibold text-charcoal/60">
                    <li>Why I Started</li>
                    <li>The Perspective That Shaped the Product</li>
                    <li>How I Designed the Experience</li>
                    <li>Admin Portal Priorities</li>
                    <li>The Build Process</li>
                    <li>What I Want NexoLink to Do</li>
                    <li>What Comes Next</li>
                  </ul>
                </div>

                <button
                  onClick={() => onNavigate?.('blog')}
                  className="w-full px-6 py-4 rounded-2xl border border-charcoal/10 text-charcoal font-black uppercase tracking-widest text-xs hover:bg-charcoal hover:text-white transition-all"
                >
                  Back to Blog
                </button>
              </div>
            </aside>

            <div className="lg:col-span-8 space-y-12">
              <div className="story-section space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-charcoal">Why I Started</h2>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  I built NexoLink because volunteering should feel effortless, empowering, and visible. I watched friends and local organizations spend hours chasing down volunteer logs, approvals, and reports. At the same time, volunteers wanted to see the impact of their time in a way that felt real and motivating. The gap was clear: mission-driven people were doing amazing work, but the tools behind the scenes were slow, fragmented, and exhausting.
                </p>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  I wanted to create a platform that treats volunteering with the same care we give to modern product experiences. That meant a volunteer app that feels welcoming and a dashboard that feels intelligent, not intimidating. NexoLink is my answer to that problem.
                </p>
              </div>

              <div className="story-section space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-charcoal">The Perspective That Shaped the Product</h2>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  I approached NexoLink as a builder who believes software should reduce friction and increase dignity. If a volunteer takes an hour out of their day to help, the system should honor that time. If a nonprofit manager is coordinating dozens of volunteers, the system should give them clarity, not chaos.
                </p>
                <ul className="list-disc pl-6 space-y-2 text-lg text-charcoal/70 font-medium">
                  <li>Human-first clarity: The UI should guide, not overwhelm.</li>
                  <li>Trust in the data: Logs, approvals, and reports must be clean and credible.</li>
                  <li>Celebration of impact: Progress should be visible and motivating.</li>
                </ul>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  Those pillars influenced every design decision, from the glassmorphic dashboard cards to the quick actions for approvals.
                </p>
              </div>

              <div className="story-section space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-charcoal">How I Designed the Experience</h2>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  I started with the volunteer journey. The mobile app needed to feel modern and personal, with a focus on discovery, logging, and recognition. That led to:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-lg text-charcoal/70 font-medium">
                  <li>Curated mission cards</li>
                  <li>Simple check-in and hour logging</li>
                  <li>Recognition badges and progress snapshots</li>
                </ul>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  Then I designed the admin portal as a companion experience. I wanted admins to immediately understand what needed attention and what was going well. That meant:
                </p>
              </div>

              <div className="story-section space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-charcoal">Admin Portal Priorities</h2>
                <ul className="list-disc pl-6 space-y-2 text-lg text-charcoal/70 font-medium">
                  <li>A high-level impact overview</li>
                  <li>Volunteer request workflows</li>
                  <li>Quick access to billing and admin tools</li>
                </ul>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  The result is a UI that feels like a control center for good, not a spreadsheet with a login screen.
                </p>
              </div>

              <div className="story-section space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-charcoal">The Build Process</h2>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  I built the product to scale without losing speed. I chose a modern frontend stack and designed the UI system to stay consistent across pages.
                </p>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  The process looked like this:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-lg text-charcoal/70 font-medium">
                  <li>Define the key flows: volunteer discovery, hour logging, approval, reporting.</li>
                  <li>Build reusable UI components: cards, modals, tables, and navigation that can scale.</li>
                  <li>Design for fast iteration: a structure that lets me add new pages without breaking the experience.</li>
                  <li>Optimize for clarity: if a page does not help a user take action, it gets trimmed.</li>
                </ul>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  I also took time to write clear policy pages and set a high bar for privacy and transparency. Community platforms need trust, and trust is built through clear intent.
                </p>
              </div>

              <div className="story-section space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-charcoal">What I Want NexoLink to Do for Communities</h2>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  My goal is for NexoLink to help communities grow by making volunteering visible, rewarding, and easier to organize.
                </p>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  Specifically, I want it to:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-lg text-charcoal/70 font-medium">
                  <li>Help volunteers feel seen and motivated</li>
                  <li>Help organizations run reliable, scalable programs</li>
                  <li>Help schools and districts keep compliance stress-free</li>
                  <li>Help community leaders tell stronger impact stories</li>
                </ul>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  When the tools are better, the mission grows. I want NexoLink to be the platform that lets people focus on people, not paperwork.
                </p>
              </div>

              <div className="story-section space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-charcoal">What Comes Next</h2>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  NexoLink is only the beginning. I plan to keep listening to real users, iterating on the features that matter most, and keeping the experience joyful. Volunteering should never feel like admin work. The product should feel like a celebration of service.
                </p>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  If you are a volunteer, a nonprofit leader, or an educator, I want to hear your story. This platform is built for you, and it will keep evolving with you.
                </p>
                <p className="text-lg text-charcoal/70 leading-relaxed font-medium">
                  Thanks for being part of the mission.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default FounderStoryPage;
