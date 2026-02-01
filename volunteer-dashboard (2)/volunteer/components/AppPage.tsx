import React from 'react';
import { ArrowLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } }
};

type AppPageProps = {
  onBack: () => void;
  onEnterAdmin: () => void;
};

const features = [
  {
    title: 'Unified command canvas',
    detail: 'All volunteer signals, approvals, and broadcasts in a single, calm surface.'
  },
  {
    title: 'Automated coverage logic',
    detail: 'Set thresholds once. Atlas triggers updates, reminders, and escalations automatically.'
  },
  {
    title: 'Role-aware access',
    detail: 'Every team member sees exactly what they need, nothing they do not.'
  }
];

const flows = [
  {
    title: 'Incident response',
    steps: ['Dispatch in 90 seconds', 'Live coordination board', 'Post-event analytics']
  },
  {
    title: 'Volunteer onboarding',
    steps: ['Smart intake forms', 'Instant role matching', 'Automated welcome kits']
  },
  {
    title: 'Impact reporting',
    steps: ['Live dashboards', 'Export-ready reports', 'Board-ready summaries']
  }
];

export const AppPage: React.FC<AppPageProps> = ({ onBack, onEnterAdmin }) => {
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
          <button
            onClick={onEnterAdmin}
            className="px-5 py-2.5 rounded-full bg-[#111827] text-white text-sm font-semibold shadow-lg shadow-black/20 hover:bg-black transition"
          >
            Enter Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pt-16 pb-24">
        <motion.div initial="hidden" animate="show" variants={stagger}>
          <motion.p variants={fadeUp} className="text-xs uppercase tracking-[0.35em] text-[#6B7280] font-semibold">
            The App
          </motion.p>
          <motion.h1 variants={fadeUp} className="font-display text-[3.5rem] leading-[1.02] mt-4">
            The command center your volunteers deserve.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 text-xl text-[#4B5563] max-w-3xl">
            Atlas blends human warmth with operational precision. Every workflow, insight, and interaction is designed to keep
            your team focused on impact.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-12 grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
          <motion.div variants={fadeUp} className="p-10 rounded-[2.5rem] bg-white border border-black/5 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Live workspace</p>
            <h2 className="text-2xl font-semibold mt-4">A premium surface for every mission.</h2>
            <p className="mt-4 text-sm text-[#6B7280]">
              Dynamic coverage maps, instant approvals, and collaborative broadcasts live in one polished interface. The result
              is calm, focused execution even at peak demand.
            </p>
            <div className="mt-8 space-y-4">
              {features.map((feature) => (
                <div key={feature.title} className="p-4 rounded-2xl bg-[#F9FAFB] border border-black/5">
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-[#6B7280] mt-2">{feature.detail}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="p-10 rounded-[2.5rem] bg-[#111827] text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-[#D2F677]">Experience flow</p>
            <h2 className="text-2xl font-semibold mt-4">Designed for operational calm.</h2>
            <p className="mt-4 text-sm text-white/70">
              Every tab, card, and notification follows a rhythm: highlight urgency, confirm action, then return to quiet.
            </p>
            <div className="mt-8 space-y-6">
              {flows.map((flow) => (
                <div key={flow.title}>
                  <p className="text-sm font-semibold">{flow.title}</p>
                  <div className="mt-3 space-y-2 text-sm text-white/70">
                    {flow.steps.map((step) => (
                      <div key={step} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D2F677]" />
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-16 grid lg:grid-cols-3 gap-6">
          {[
            {
              title: 'Intelligence layer',
              detail: 'Predictive coverage suggestions and live sentiment markers keep leaders ahead of demand.'
            },
            {
              title: 'Volunteer care',
              detail: 'Built-in recognition moments and feedback loops strengthen retention and morale.'
            },
            {
              title: 'Executive clarity',
              detail: 'Board-ready summaries and audit trails for every program, instantly exportable.'
            }
          ].map((card) => (
            <motion.div key={card.title} variants={fadeUp} className="p-8 rounded-[2rem] bg-white border border-black/5 shadow-lg">
              <h3 className="text-xl font-semibold">{card.title}</h3>
              <p className="mt-3 text-sm text-[#6B7280]">{card.detail}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-16">
          <motion.div variants={fadeUp} className="p-10 rounded-[2.5rem] bg-white border border-black/5 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Ready</p>
              <h3 className="text-2xl font-semibold mt-4">See the command center in action.</h3>
              <p className="mt-3 text-sm text-[#6B7280]">Step inside the admin dashboard and explore the live workspace.</p>
            </div>
            <button
              onClick={onEnterAdmin}
              className="px-6 py-3 rounded-full bg-[#111827] text-white font-semibold shadow-lg shadow-black/20 hover:bg-black transition"
            >
              Open Dashboard
              <ArrowUpRight className="w-4 h-4 inline-block ml-2" />
            </button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};
