import React from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { BlogPost } from './BlogPage';

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};

type BlogPostPageProps = {
  post: BlogPost;
  onBack: () => void;
};

const paragraphs: Record<string, string[]> = {
  'signal-room': [
    'The Signal Room is the heartbeat of a modern volunteer organization. It aggregates field updates, human escalation, and predictive analytics into a single, calm control plane.',
    'Teams that adopt a signal-first posture make faster decisions without the noise. Every alert is contextual, every action is traceable, and every volunteer understands why they are needed.',
    'In Atlas, we prioritize signal strength by mapping urgency against capacity. When coverage dips, workflows trigger automatically, keeping coordinators focused on people, not spreadsheets.'
  ],
  'trust-stack': [
    'Trust is infrastructure. It begins with role clarity, continues with secure access, and is reinforced by transparent communication throughout every mission.',
    'Volunteer systems must balance privacy with velocity. The most resilient teams pair lightweight onboarding with verification layers that adapt to each role.',
    'Atlas models trust as a living system: policies update as teams grow, audit trails stay visible, and leaders can see risk before it becomes operational friction.'
  ],
  moments: [
    'Retention is a feeling before it is a metric. Recognition moments should be immediate, specific, and deeply aligned to the culture of the organization.',
    'The most effective teams blend automated appreciation with human storytelling. They use data to spot momentum, then elevate volunteers in ways that feel personal.',
    'Atlas brings this to life by routing recognition signals to the right people, at the right time, ensuring every contributor feels seen and supported.'
  ]
};

export const BlogPostPage: React.FC<BlogPostPageProps> = ({ post, onBack }) => {
  const body = paragraphs[post.id] ?? [];

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#0B0D10] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -right-20 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_top,rgba(210,246,119,0.5),rgba(210,246,119,0))] blur-3xl" />
      <div className="pointer-events-none absolute top-44 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(17,24,39,0.18),rgba(17,24,39,0))] blur-3xl" />
      <div className="grain pointer-events-none absolute inset-0" />

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F3F4F6]/80 border-b border-black/5">
        <div className="max-w-[1100px] mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#111827] text-white flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-display text-lg">Volunteer OS</span>
          </div>
          <div className="text-xs uppercase tracking-[0.3em] text-[#6B7280]">Article</div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-6 pt-16 pb-24">
        <motion.div initial="hidden" animate="show" className="space-y-8">
          <motion.div variants={fadeUp}>
            <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">{post.category}</p>
            <h1 className="font-display text-[3.1rem] leading-[1.05] mt-4">{post.title}</h1>
            <div className="mt-4 flex items-center gap-4 text-xs text-[#6B7280]">
              <span>{post.date}</span>
              <span>{post.readTime}</span>
              <span>Volunteer OS Journal</span>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="h-72 rounded-[2.5rem] bg-white border border-black/5 shadow-2xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-3xl bg-[#111827] text-white flex items-center justify-center mx-auto">
                <Sparkles className="w-7 h-7" />
              </div>
              <p className="mt-4 text-sm text-[#6B7280]">Hero visual placeholder</p>
            </div>
          </motion.div>

          {body.map((paragraph) => (
            <motion.p key={paragraph} variants={fadeUp} className="text-lg text-[#4B5563] leading-relaxed">
              {paragraph}
            </motion.p>
          ))}

          <motion.div variants={fadeUp} className="mt-10 p-8 rounded-[2rem] bg-white border border-black/5 shadow-xl">
            <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Insight</p>
            <h3 className="text-2xl font-semibold mt-4">Operational calm is a design decision.</h3>
            <p className="mt-3 text-sm text-[#6B7280]">
              Every process you automate frees a coordinator to focus on volunteers. The best systems remove noise before it ever reaches the front line.
            </p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};
