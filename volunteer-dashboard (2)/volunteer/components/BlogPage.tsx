import React from 'react';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export type BlogPost = {
  id: string;
  title: string;
  summary: string;
  category: string;
  date: string;
  readTime: string;
};

type BlogPageProps = {
  onBack: () => void;
  onOpenPost: (id: string) => void;
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } }
};

const posts: BlogPost[] = [
  {
    id: 'signal-room',
    title: 'Inside the Signal Room: orchestrating volunteer velocity',
    summary:
      'How premium operations teams shape calm amid chaos with live coverage, human escalation, and predictive insight.',
    category: 'Operations',
    date: 'Jan 2026',
    readTime: '6 min read'
  },
  {
    id: 'trust-stack',
    title: 'Designing trust systems for high-scale community response',
    summary:
      'A deep dive on permissioned access, identity, and the UX patterns that keep volunteers safe and focused.',
    category: 'Product',
    date: 'Dec 2025',
    readTime: '8 min read'
  },
  {
    id: 'moments',
    title: 'Recognition moments that retain 97% of volunteers',
    summary:
      'Why tailored appreciation flows outperform generic badges, and how to build durable engagement rituals.',
    category: 'Culture',
    date: 'Nov 2025',
    readTime: '5 min read'
  }
];

export const BlogPage: React.FC<BlogPageProps> = ({ onBack, onOpenPost }) => {
  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#0B0D10] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -right-20 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_top,rgba(210,246,119,0.5),rgba(210,246,119,0))] blur-3xl" />
      <div className="pointer-events-none absolute top-44 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(17,24,39,0.18),rgba(17,24,39,0))] blur-3xl" />
      <div className="grain pointer-events-none absolute inset-0" />

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F3F4F6]/80 border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#111827] text-white flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-display text-lg">Volunteer OS</span>
          </div>
          <div className="text-xs uppercase tracking-[0.3em] text-[#6B7280]">Journal</div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pt-16 pb-24">
        <motion.div initial="hidden" animate="show" variants={stagger}>
          <motion.p variants={fadeUp} className="text-xs uppercase tracking-[0.35em] text-[#6B7280] font-semibold">
            Volunteer Journal
          </motion.p>
          <motion.h1 variants={fadeUp} className="font-display text-[3.4rem] leading-[1.04] mt-4">
            Strategy, clarity, and calm for mission-critical operations.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 text-xl text-[#4B5563] max-w-3xl">
            Curated insights from teams running high-trust volunteer programs. Each story is a blueprint for thoughtful scale.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-12 grid lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <motion.button
              key={post.id}
              variants={fadeUp}
              onClick={() => onOpenPost(post.id)}
              className="text-left p-8 rounded-[2.5rem] bg-white border border-black/5 shadow-xl hover:shadow-2xl transition"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">{post.category}</p>
              <h3 className="mt-4 text-2xl font-semibold text-[#111827]">{post.title}</h3>
              <p className="mt-4 text-sm text-[#4B5563]">{post.summary}</p>
              <div className="mt-6 flex items-center justify-between text-xs text-[#6B7280]">
                <span>{post.date}</span>
                <span>{post.readTime}</span>
              </div>
              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#111827]">
                Read article
                <ArrowRight className="w-4 h-4" />
              </div>
            </motion.button>
          ))}
        </motion.div>
      </main>
    </div>
  );
};
