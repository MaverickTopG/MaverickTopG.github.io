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
    name: 'Organization',
    caption: 'Flexible month-to-month access',
    monthly: '$45',
    annual: '$39',
    highlights: ['Full admin portal access', 'Unlimited volunteer records', 'Automated analytics & reports']
  },
  {
    name: 'School',
    caption: 'Built for schools and districts',
    monthly: '$65',
    annual: '$55',
    highlights: ['Roster uploads and student-friendly sign-ins', 'Compliance-ready reports and exports', 'Centralized reporting for campuses']
  },
  {
    name: 'Enterprise',
    caption: 'Regional or national partners',
    monthly: 'Custom',
    annual: 'Custom',
    highlights: ['Dedicated data governance', 'Custom integrations & workflows', 'Executive analytics suite']
  }
];

const faqs = [
  {
    q: 'What is included with every plan?',
    a: 'All plans include full admin portal access, analytics, and effortless onboarding so your team can start quickly.'
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. Every plan includes a 14-day free trial before billing begins.'
  },
  {
    q: 'Who is the School plan for?',
    a: 'The School plan is designed for schools and districts, with roster uploads, student-friendly sign-ins, and compliance-ready reports.'
  }
];

export const PricingPage: React.FC<PricingPageProps> = ({ onBack, onEnterAdmin }) => {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [openFaq, setOpenFaq] = useState(0);

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

      <main className="max-w-[1100px] mx-auto px-6 pt-16 pb-24">
        <motion.div initial="hidden" animate="show" variants={stagger} className="text-center">
          <motion.p variants={fadeUp} className="text-xs uppercase tracking-[0.35em] text-[#6B7280] font-semibold">
            Pricing
          </motion.p>
          <motion.h1 variants={fadeUp} className="font-display text-[3.6rem] leading-[1.03] mt-4">
            Choose a plan that powers your volunteer impact.
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-6 text-xl text-[#4B5563] max-w-3xl mx-auto">
            Pick the subscription that fits your workspace. All plans include full admin access, analytics, and effortless onboarding.
            Includes a 14-day free trial.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-16 text-center">
          <motion.h2 variants={fadeUp} className="text-3xl font-semibold">
            Plans for every mission
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-2 text-base text-[#6B7280]">
            Only pay for what your organization needs.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-6 inline-flex items-center gap-2 bg-white border border-black/10 rounded-full p-1 shadow-sm">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                billing === 'monthly' ? 'bg-[#111827] text-white shadow-md' : 'text-[#6B7280]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                billing === 'annual' ? 'bg-[#111827] text-white shadow-md' : 'text-[#6B7280]'
              }`}
            >
              Annual
            </button>
          </motion.div>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger} className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan, index) => {
            const price = billing === 'monthly' ? plan.monthly : plan.annual;
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
                  <span className="text-4xl font-semibold">{price}</span>
                  <span className={`text-xs uppercase tracking-[0.25em] ${index === 1 ? 'text-white/60' : 'text-[#9CA3AF]'}`}>
                    per month
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
