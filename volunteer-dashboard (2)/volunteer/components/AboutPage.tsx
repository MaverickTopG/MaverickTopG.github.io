import React from 'react';
import {
  Sparkles,
  Sun,
  Play,
  Globe,
  HeartHandshake,
  ShieldCheck,
  ArrowUpRight
} from 'lucide-react';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } }
};

type AboutPageProps = {
  onShowApp: () => void;
  onShowPricing: () => void;
  onShowBlog: () => void;
  onShowAdmin: () => void;
};

export const AboutPage: React.FC<AboutPageProps> = ({ onShowApp, onShowPricing, onShowBlog, onShowAdmin }) => {
  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#0B0D10] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-48 -right-28 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_top,rgba(210,246,119,0.55),rgba(210,246,119,0))] blur-3xl" />
      <div className="pointer-events-none absolute top-56 -left-44 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(17,24,39,0.2),rgba(17,24,39,0))] blur-3xl" />
      <div className="grain pointer-events-none absolute inset-0" />

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F3F4F6]/80 border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#111827] text-white flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display text-lg">NexoLink</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#111827]">
            <button onClick={onShowApp} className="hover:text-black transition">App</button>
            <button onClick={onShowPricing} className="hover:text-black transition">Pricing</button>
            <span className="text-[#6B7280]">About Us</span>
            <button onClick={onShowBlog} className="hover:text-black transition">Blog</button>
            <button onClick={onShowAdmin} className="hover:text-black transition">Admin Portal</button>
          </nav>
          <div className="flex items-center gap-3">
            <button className="w-9 h-9 rounded-full border border-black/10 flex items-center justify-center">
              <Sun className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-2 py-1 rounded-full border border-black/10 bg-white shadow-sm">
              <button className="w-9 h-9 rounded-full flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </button>
              <button className="w-9 h-9 rounded-full flex items-center justify-center">
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pt-20 pb-24">
        <motion.div initial="hidden" animate="show" variants={stagger}>
          <motion.p variants={fadeUp} className="text-xs uppercase tracking-[0.35em] text-[#6B7280] font-semibold">
            About Us
          </motion.p>
          <motion.h1 variants={fadeUp} className="font-display text-[3.6rem] leading-[1.02] mt-4">
            A calm operating system for teams who serve their communities.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 text-xl text-[#4B5563] max-w-3xl">
            NexoLink exists to help volunteer organizations scale with dignity. We design systems that feel premium, human, and
            quietly powerful — so leaders can focus on people, not process.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-14 grid lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Global context, local nuance',
              detail: 'We partner with civic leaders to respect regional workflows and cultural rhythms.',
              icon: <Globe className="w-5 h-5" />
            },
            {
              title: 'Human-first design',
              detail: 'Every surface is built to reduce cognitive load and invite clarity.',
              icon: <HeartHandshake className="w-5 h-5" />
            },
            {
              title: 'Security by default',
              detail: 'Audit trails, privacy controls, and consent-driven access keep teams protected.',
              icon: <ShieldCheck className="w-5 h-5" />
            }
          ].map((card) => (
            <motion.div key={card.title} variants={fadeUp} className="p-8 rounded-[2rem] bg-white border border-black/5 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-[#111827] text-white flex items-center justify-center">
                {card.icon}
              </div>
              <h3 className="mt-6 text-xl font-semibold">{card.title}</h3>
              <p className="mt-3 text-sm text-[#6B7280]">{card.detail}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-16">
          <motion.div variants={fadeUp} className="p-12 rounded-[2.5rem] bg-[#111827] text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-[#D2F677]">Our Promise</p>
            <h2 className="font-display text-3xl mt-4">We design for calm, even in the storm.</h2>
            <p className="mt-4 text-sm text-white/70 max-w-2xl">
              Volunteer leaders deserve the same premium tooling as enterprise operators. NexoLink is built to feel cinematic
              yet quiet, powerful yet welcoming.
            </p>
            <button
              onClick={onShowAdmin}
              className="mt-8 px-6 py-3 rounded-full bg-[#D2F677] text-black font-semibold shadow-lg shadow-black/20"
            >
              Visit Admin Portal
              <ArrowUpRight className="w-4 h-4 inline-block ml-2" />
            </button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};
