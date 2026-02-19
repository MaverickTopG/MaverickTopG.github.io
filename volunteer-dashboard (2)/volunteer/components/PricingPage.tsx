import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Sparkles,
  Sun,
  Moon,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } }
};

type PricingPageProps = {
  onBack: () => void;
  onEnterAdmin: () => void;
};

const plans = [
  {
    name: 'Orbit',
    caption: 'Everything you need to get started.',
    monthlyPrice: 5,
    yearlyPrice: 50,
    highlights: [
      'Up to 50 volunteers',
      'Volunteer directory',
      'Manual hour logging & approvals',
      'Core dashboard (total hours, volunteers)',
      'CSV export',
      'Email support'
    ]
  },
  {
    name: 'Nebula',
    caption: 'Automated volunteer operations.',
    monthlyPrice: 10,
    yearlyPrice: 100,
    highlights: [
      'Up to 500 volunteers',
      '50 Nebulae AI prompts / day',
      'Everything in Orbit',
      'Kiosk mode + QR code check-in',
      'Nebulae AI auto-log review',
      'Messaging',
      'Events, shifts, capacity',
      'Advanced analytics (retention, trends)',
      'Priority support'
    ]
  },
  {
    name: 'Cosmos',
    caption: 'Unlimited scale. Total control.',
    monthlyPrice: 15,
    yearlyPrice: 150,
    highlights: [
      'Unlimited volunteers',
      'Unlimited Nebulae AI prompts',
      'Everything in Nebula',
      'Unlimited kiosks & QR sessions',
      'Advanced AI log intelligence',
      'Unlimited messaging',
      'Custom analytics & exports',
      'Organization-wide automation controls',
      'Dedicated support',
      'SLA & uptime guarantees',
      'Early access to new features'
    ]
  }
];

const faqs = [
  {
    q: 'How do volunteer limits work?',
    a: 'Orbit supports up to 50 volunteers, Nebula supports up to 500, and Cosmos removes limits entirely.'
  },
  {
    q: 'What happens when a log looks suspicious?',
    a: 'Nebula and Cosmos auto-approve normal logs and only surface questionable logs for manual review.'
  },
  {
    q: 'Can I upgrade later?',
    a: 'Yes. You can move between Orbit, Nebula, and Cosmos at any time as your organization grows.'
  }
];

export const PricingPage: React.FC<PricingPageProps> = ({ onBack, onEnterAdmin }) => {
  const [openFaq, setOpenFaq] = useState(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [audience, setAudience] = useState<'org' | 'school'>('org');

  const resolvePrice = (plan: { monthlyPrice: number; yearlyPrice: number }) => {
    if (billingCycle === 'monthly') return plan.monthlyPrice;
    return Math.round(plan.yearlyPrice / 12);
  };

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
          <div className="flex items-center gap-3">
            <button className="w-9 h-9 rounded-full border border-black/10 flex items-center justify-center">
              <Sun className="w-4 h-4" />
            </button>
            <button className="w-9 h-9 rounded-full border border-black/10 flex items-center justify-center">
              <Moon className="w-4 h-4" />
            </button>
            <button className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center">
              <Play className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1210px] mx-auto px-6 pt-16 pb-24">
        <motion.div initial="hidden" animate="show" variants={stagger} className="text-center">
          <motion.p variants={fadeUp} className="text-xs uppercase tracking-[0.35em] text-[#6B7280] font-semibold">
            Pricing
          </motion.p>
          <motion.h1 variants={fadeUp} className="font-display text-[3.6rem] leading-[1.03] mt-4">
            Space‑inspired plans for every volunteer mission.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 text-xl text-[#4B5563] max-w-3xl mx-auto">
            Orbit gets you started, Nebula automates operations, and Cosmos removes every ceiling.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-16 text-center">
          <motion.h2 variants={fadeUp} className="text-3xl font-semibold">
            Plans for every mission
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-2 text-base text-[#6B7280]">
            Only pay for what your organization needs.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-10 flex flex-col items-center gap-4">
          <div className="inline-flex items-center rounded-full border border-black/10 bg-white/70 p-1 shadow-sm">
            <button
              onClick={() => setAudience('org')}
              className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
                audience === 'org' ? 'bg-[#111827] text-white' : 'text-[#6B7280]'
              }`}
            >
              Organizations
            </button>
            <button
              onClick={() => setAudience('school')}
              className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
                audience === 'school' ? 'bg-[#111827] text-white' : 'text-[#6B7280]'
              }`}
            >
              School
            </button>
          </div>
          <div className="inline-flex items-center rounded-full border border-black/10 bg-white/70 p-1 shadow-sm">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
                billingCycle === 'monthly' ? 'bg-[#111827] text-white' : 'text-[#6B7280]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
                billingCycle === 'yearly' ? 'bg-[#111827] text-white' : 'text-[#6B7280]'
              }`}
            >
              Yearly
            </button>
          </div>
          <span className="text-xs text-[#6B7280]">
            Yearly saves 17% compared to monthly
          </span>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-12 grid lg:grid-cols-3 gap-6">
          {plans.map((plan, index) => {
            const price = resolvePrice(plan);
            return (
              <motion.div
                key={plan.name}
                variants={fadeUp}
                className={`rounded-[2rem] p-8 border shadow-lg ${
                  index === 1 ? 'bg-[#111827] text-white border-[#111827]' : 'bg-white text-[#111827] border-black/5'
                }`}
              >
                <p className={`text-xs uppercase tracking-[0.3em] ${index === 1 ? 'text-[#D2F677]' : 'text-[#9CA3AF]'}`}>
                  {plan.name}
                </p>
                <h3 className="text-xl font-semibold mt-4">{plan.caption}</h3>
                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-semibold">${price}</span>
                  <span className={`text-xs uppercase tracking-[0.25em] ${index === 1 ? 'text-white/60' : 'text-[#9CA3AF]'}`}>
                    {billingCycle === 'monthly' ? 'per month' : 'per month billed yearly'}
                  </span>
                </div>
                <div className="mt-6 space-y-3 text-base">
                  {plan.highlights.map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          index === 1 ? 'bg-[#D2F677] text-black' : 'bg-[#111827] text-white'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <button
                  className={`mt-8 w-full py-3 rounded-full font-semibold transition ${
                    index === 1 ? 'bg-white text-[#111827]' : 'border border-black/15 hover:border-black/30'
                  }`}
                >
                  {index === 2 ? 'Contact sales' : 'Start plan'}
                </button>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }} variants={stagger} className="mt-20">
          <motion.h3 variants={fadeUp} className="text-3xl font-semibold text-center">
            Pricing FAQs
          </motion.h3>
          <motion.p variants={fadeUp} className="text-base text-[#6B7280] text-center mt-2">
            Quick answers to the most common plan questions.
          </motion.p>
          <div className="mt-10 space-y-4 max-w-2xl mx-auto">
            {faqs.map((faq, idx) => (
              <motion.div key={faq.q} variants={fadeUp} className="bg-white border border-black/5 rounded-2xl p-5 shadow-sm">
                <button
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => setOpenFaq(openFaq === idx ? -1 : idx)}
                >
                  <span className="font-semibold">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 transition ${openFaq === idx ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-base text-[#6B7280] mt-3"
                    >
                      {faq.a}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }} variants={stagger} className="mt-20">
          <motion.div variants={fadeUp} className="bg-white border border-black/5 rounded-[2.5rem] p-12 shadow-xl text-center">
            <h4 className="text-3xl font-semibold">Ready to unlock the admin experience?</h4>
            <p className="text-base text-[#6B7280] mt-3 max-w-xl mx-auto">
              Start your free trial and bring volunteer stats, approvals, and impact reporting into one calm command center.
            </p>
            <button
              onClick={onEnterAdmin}
              className="mt-6 px-6 py-3 rounded-full bg-[#111827] text-white font-semibold shadow-lg shadow-black/20 hover:bg-black transition"
            >
              Start a plan
              <ArrowRight className="w-4 h-4 inline-block ml-2" />
            </button>
          </motion.div>
        </motion.div>

        <motion.footer initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }} variants={stagger} className="mt-20">
          <motion.div variants={fadeUp} className="grid md:grid-cols-4 gap-8 text-sm text-[#6B7280]">
            <div>
              <p className="font-semibold text-[#111827]">NexoLink</p>
              <p className="mt-2">Terms · Privacy Policy</p>
            </div>
            <div>
              <p className="font-semibold text-[#111827]">NexoLink</p>
              <p className="mt-3 space-y-2">
                <span className="block">App</span>
                <span className="block">Pricing</span>
                <span className="block">About Us</span>
                <span className="block">Blog</span>
                <span className="block">Admin Portal</span>
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#111827]">Experience</p>
              <p className="mt-3 space-y-2">
                <span className="block">Volunteer Command Center</span>
                <span className="block">Impact Reporting</span>
                <span className="block">Recognition Moments</span>
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#111827]">Resources</p>
              <p className="mt-3 space-y-2">
                <span className="block">Blog</span>
                <span className="block">Privacy Policy</span>
                <span className="block">Terms</span>
              </p>
            </div>
          </motion.div>
          <motion.div variants={fadeUp} className="mt-12 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#6B7280]">
            <span>© 2026 NexoLink. Designed with purpose and community at heart.</span>
            <div className="flex items-center gap-3">
              <button className="w-9 h-9 rounded-full border border-black/10 flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </button>
              <button className="w-9 h-9 rounded-full border border-black/10 flex items-center justify-center">
                <Play className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </motion.footer>
      </main>
    </div>
  );
};
