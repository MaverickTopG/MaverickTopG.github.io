import React from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Shield,
  Layers,
  Sparkles,
  Globe,
  Bolt,
  Lock,
  Wand2,
  LineChart,
  Mail
} from 'lucide-react';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } }
};

type MarketingSiteProps = {
  onEnterAdmin: () => void;
  onShowPricing: () => void;
  onShowBlog: () => void;
  onShowApp: () => void;
  onShowLogin: () => void;
  onShowAbout: () => void;
};

const navItems = [
  { id: 'home', label: 'Home' },
  { id: 'app', label: 'App' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'about', label: 'About Us' },
  { id: 'blog', label: 'Blog' },
  { id: 'login', label: 'Login' }
];

export const MarketingSite: React.FC<MarketingSiteProps> = ({
  onEnterAdmin,
  onShowPricing,
  onShowBlog,
  onShowApp,
  onShowLogin,
  onShowAbout
}) => {
  const handleNav = (id: string) => {
    if (id === 'pricing') {
      onShowPricing();
      return;
    }
    if (id === 'app') {
      onShowApp();
      return;
    }
    if (id === 'blog') {
      onShowBlog();
      return;
    }
    if (id === 'login') {
      onShowLogin();
      return;
    }
    if (id === 'about') {
      onShowAbout();
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F3EF] text-[#0B0D10] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -right-20 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_top,rgba(210,246,119,0.65),rgba(210,246,119,0))] blur-2xl" />
      <div className="pointer-events-none absolute top-32 -left-40 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_center,rgba(17,24,39,0.15),rgba(17,24,39,0))] blur-2xl" />
      <div className="grain pointer-events-none absolute inset-0" />

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F4F3EF]/80 border-b border-black/5">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#111827] text-white flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#6B7280]">Volunteer OS</p>
              <p className="font-display text-lg">Atlas Edition</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className="text-[#374151] hover:text-black transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleNav('login')}
              className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full border border-black/10 hover:border-black/20 transition"
            >
              Member Login
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              onClick={onEnterAdmin}
              className="px-5 py-2.5 rounded-full bg-[#111827] text-white text-sm font-semibold shadow-lg shadow-black/10 hover:bg-black transition"
            >
              Enter Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="relative">
        <section id="home" className="max-w-[1200px] mx-auto px-6 pt-20 pb-24">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
            <motion.div initial="hidden" animate="show" variants={stagger}>
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border border-black/10">
                <span className="text-[11px] uppercase tracking-[0.28em] text-[#6B7280]">Launch 2026</span>
                <span className="text-xs font-semibold text-[#111827]">Trusted by 1,200+ volunteer teams</span>
              </motion.div>
              <motion.h1
                variants={fadeUp}
                className="mt-6 font-display text-[3.25rem] leading-[1.05] text-[#0B0D10]"
              >
                A premium operating system for volunteer impact.
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-6 text-lg text-[#4B5563] max-w-xl">
                Orchestrate campaigns, automate coordination, and surface insights in a single command center.
                Atlas Edition blends human warmth with precise operational clarity.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={onEnterAdmin}
                  className="px-6 py-3 rounded-full bg-[#111827] text-white font-semibold shadow-xl shadow-black/10 hover:bg-black transition"
                >
                  Launch the App
                </button>
                <button
                  onClick={onShowPricing}
                  className="px-6 py-3 rounded-full bg-white border border-black/10 text-[#111827] font-semibold hover:border-black/20 transition"
                >
                  View Pricing
                </button>
              </motion.div>
              <motion.div variants={fadeUp} className="mt-10 grid grid-cols-2 gap-6 max-w-md">
                {[
                  { label: 'Volunteers managed', value: '82k+' },
                  { label: 'Avg. response time', value: '2.3 min' },
                  { label: 'Automations live', value: '410' },
                  { label: 'Campaign success', value: '98.7%' }
                ].map((stat) => (
                  <div key={stat.label} className="p-4 rounded-3xl bg-white border border-black/5 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.25em] text-[#9CA3AF]">{stat.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-[#111827]">{stat.value}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div initial="hidden" animate="show" variants={fadeUp} className="relative">
              <div className="absolute -top-6 -left-6 w-full h-full rounded-[2.5rem] bg-[#111827] opacity-10" />
              <div className="relative p-8 rounded-[2.5rem] bg-white shadow-2xl border border-black/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Live Overview</p>
                    <p className="text-xl font-semibold text-[#111827] mt-2">Citywide Relief Command</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-[#D2F677] text-black flex items-center justify-center">
                    <Bolt className="w-6 h-6" />
                  </div>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  {[
                    { label: 'Active Shifts', value: '148' },
                    { label: 'Donations', value: '$96k' },
                    { label: 'Coverage', value: '93%' },
                    { label: 'Incidents', value: '2' }
                  ].map((card) => (
                    <div key={card.label} className="p-4 rounded-2xl bg-[#F9FAFB] border border-black/5">
                      <p className="text-xs uppercase tracking-[0.25em] text-[#9CA3AF]">{card.label}</p>
                      <p className="mt-3 text-2xl font-semibold text-[#111827]">{card.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 rounded-2xl bg-[#111827] text-white">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Priority stream</p>
                    <span className="text-xs uppercase tracking-[0.24em] text-[#D2F677]">Auto-brief</span>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-white/10" />
                    <div>
                      <p className="text-sm font-semibold">Deploy 6 responders to Zone A</p>
                      <p className="text-xs text-white/70">Suggested by Atlas AI</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-8 right-10 bg-[#111827] text-white rounded-full px-4 py-2 text-xs uppercase tracking-[0.35em] shadow-lg">
                Premium Workflows
              </div>
            </motion.div>
          </div>
        </section>

        <section id="app" className="relative py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }} variants={stagger}>
              <motion.div variants={fadeUp} className="flex items-center justify-between flex-wrap gap-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">The App</p>
                  <h2 className="font-display text-4xl mt-4">Every team, perfectly orchestrated.</h2>
                </div>
                <button
                  onClick={onEnterAdmin}
                  className="px-5 py-2.5 rounded-full bg-white border border-black/10 text-[#111827] font-semibold hover:border-black/20 transition"
                >
                  See it live
                </button>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-12 grid lg:grid-cols-3 gap-6">
                {[
                  {
                    title: 'Signal-layer dashboards',
                    description: 'Map impact, urgency, and volunteer momentum with predictive context.',
                    icon: <LineChart className="w-5 h-5" />
                  },
                  {
                    title: 'Automated orchestration',
                    description: 'Trigger shifts, approvals, and updates with no manual overhead.',
                    icon: <Wand2 className="w-5 h-5" />
                  },
                  {
                    title: 'Secure volunteer identity',
                    description: 'Permissioned access, role intelligence, and onboarded trust.',
                    icon: <Lock className="w-5 h-5" />
                  }
                ].map((feature) => (
                  <div key={feature.title} className="p-8 rounded-[2rem] bg-white border border-black/5 shadow-lg">
                    <div className="w-12 h-12 rounded-2xl bg-[#111827] text-white flex items-center justify-center">
                      {feature.icon}
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-[#111827]">{feature.title}</h3>
                    <p className="mt-3 text-sm text-[#4B5563]">{feature.description}</p>
                  </div>
                ))}
              </motion.div>

              <motion.div variants={fadeUp} className="mt-10 grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
                <div className="p-10 rounded-[2.5rem] bg-[#111827] text-white shadow-2xl">
                  <p className="text-xs uppercase tracking-[0.35em] text-[#D2F677]">Command Workflows</p>
                  <h3 className="font-display text-3xl mt-4">Build an operating rhythm for every campaign.</h3>
                  <p className="mt-4 text-sm text-white/70">
                    Align frontline teams, finance, and communications in a single narrative.
                    Every action is logged, explainable, and reversible.
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-4">
                    {['Incident triage', 'Volunteer coverage', 'Real-time broadcast', 'Engagement intelligence'].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-[#D2F677]" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-10 rounded-[2.5rem] bg-white border border-black/5 shadow-xl">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Intelligence Layer</p>
                  <h3 className="text-2xl font-semibold mt-4">See what matters before it happens.</h3>
                  <p className="mt-4 text-sm text-[#4B5563]">
                    Atlas synthesizes data, sentiment, and response velocity to forecast coverage gaps.
                  </p>
                  <div className="mt-6 space-y-4">
                    {[90, 76, 62].map((value, idx) => (
                      <div key={value}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#6B7280]">Zone {String.fromCharCode(65 + idx)}</span>
                          <span className="font-semibold">{value}%</span>
                        </div>
                        <div className="h-2 mt-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                          <div className="h-full rounded-full bg-[#111827]" style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section id="pricing" className="py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }} variants={stagger}>
              <motion.div variants={fadeUp} className="text-center max-w-2xl mx-auto">
                <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Pricing</p>
                <h2 className="font-display text-4xl mt-4">Premium by design. Fair by scale.</h2>
                <p className="mt-4 text-sm text-[#4B5563]">
                  Choose a tier that matches the intensity of your operations. Upgrade instantly as your mission grows.
                </p>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-12 grid lg:grid-cols-3 gap-6">
                {[
                  {
                    name: 'Signal',
                    price: '$249',
                    desc: 'Best for emerging community teams.',
                    perks: ['Live dashboards', 'Volunteer onboarding', 'Community support'],
                    cta: 'Start with Signal'
                  },
                  {
                    name: 'Atlas',
                    price: '$690',
                    desc: 'Advanced orchestration for regional scale.',
                    perks: ['Automation suite', 'Predictive coverage', 'Priority support'],
                    highlight: true,
                    cta: 'Move to Atlas'
                  },
                  {
                    name: 'Summit',
                    price: 'Custom',
                    desc: 'Enterprise-grade coordination and controls.',
                    perks: ['Dedicated strategist', 'Security review', 'Custom workflows'],
                    cta: 'Book a call'
                  }
                ].map((tier) => (
                  <div
                    key={tier.name}
                    className={`p-8 rounded-[2.5rem] border shadow-xl ${
                      tier.highlight
                        ? 'bg-[#111827] text-white border-[#111827] shadow-black/20 scale-[1.02]'
                        : 'bg-white text-[#111827] border-black/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-semibold">{tier.name}</h3>
                      {tier.highlight && (
                        <span className="text-xs uppercase tracking-[0.3em] text-[#D2F677]">Most Loved</span>
                      )}
                    </div>
                    <p className={`mt-3 text-sm ${tier.highlight ? 'text-white/70' : 'text-[#4B5563]'}`}>{tier.desc}</p>
                    <div className="mt-6 flex items-end gap-2">
                      <span className="text-4xl font-semibold">{tier.price}</span>
                      <span className={`text-xs uppercase tracking-[0.3em] ${tier.highlight ? 'text-white/60' : 'text-[#9CA3AF]'}`}>
                        per month
                      </span>
                    </div>
                    <div className="mt-6 space-y-3">
                      {tier.perks.map((perk) => (
                        <div key={perk} className="flex items-center gap-2 text-sm">
                          <Check className={`w-4 h-4 ${tier.highlight ? 'text-[#D2F677]' : 'text-[#111827]'}`} />
                          <span>{perk}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      className={`mt-8 w-full py-3 rounded-full font-semibold transition ${
                        tier.highlight
                          ? 'bg-[#D2F677] text-black hover:bg-[#c9ef66]'
                          : 'bg-[#111827] text-white hover:bg-black'
                      }`}
                    >
                      {tier.cta}
                    </button>
                  </div>
                ))}
              </motion.div>

              <motion.div variants={fadeUp} className="mt-12 flex items-center justify-center">
                <button
                  onClick={onShowPricing}
                  className="px-6 py-3 rounded-full bg-[#111827] text-white font-semibold shadow-lg shadow-black/10 hover:bg-black transition"
                >
                  Open full pricing page
                </button>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section id="blog" className="py-24">
          <div className="max-w-[1200px] mx-auto px-6">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }} variants={stagger}>
              <motion.div variants={fadeUp} className="flex items-center justify-between flex-wrap gap-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Journal</p>
                  <h2 className="font-display text-4xl mt-4">Stories from the field.</h2>
                </div>
                <button className="px-5 py-2.5 rounded-full bg-white border border-black/10 text-[#111827] font-semibold hover:border-black/20 transition">
                  View all posts
                </button>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-12 grid lg:grid-cols-3 gap-6">
                {[
                  {
                    title: 'Designing calm during high-stakes volunteer ops',
                    category: 'Operations',
                    date: 'Jan 2026'
                  },
                  {
                    title: 'How Atlas predicts coverage gaps before they appear',
                    category: 'Product',
                    date: 'Dec 2025'
                  },
                  {
                    title: 'Scaling local relief networks without burnout',
                    category: 'Culture',
                    date: 'Nov 2025'
                  }
                ].map((post) => (
                  <article key={post.title} className="p-8 rounded-[2.5rem] bg-white border border-black/5 shadow-lg">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">{post.category}</p>
                    <h3 className="mt-4 text-xl font-semibold text-[#111827]">{post.title}</h3>
                    <div className="mt-6 flex items-center justify-between text-sm text-[#6B7280]">
                      <span>{post.date}</span>
                      <button className="flex items-center gap-2 text-[#111827] font-semibold">
                        Read
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section id="login" className="py-24">
          <div className="max-w-[1100px] mx-auto px-6">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }} variants={stagger} className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10">
              <motion.div variants={fadeUp}>
                <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Member Login</p>
                <h2 className="font-display text-4xl mt-4">Return to your command center.</h2>
                <p className="mt-4 text-sm text-[#4B5563]">
                  Authenticate with secure passkeys, sign-in links, or your organization SSO.
                </p>
                <div className="mt-8 space-y-4">
                  {[{
                    title: 'Secure operations',
                    desc: 'Role-based controls with regional compliance.',
                    icon: <Shield className="w-5 h-5" />
                  }, {
                    title: 'Global-ready',
                    desc: 'Multi-currency, multi-region, multi-language ready.',
                    icon: <Globe className="w-5 h-5" />
                  }, {
                    title: 'Human-first workflow',
                    desc: 'Accessibility-led design across every surface.',
                    icon: <Layers className="w-5 h-5" />
                  }].map((item) => (
                    <div key={item.title} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-[#111827] text-white flex items-center justify-center">
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-[#6B7280] mt-1">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div variants={fadeUp} className="p-8 rounded-[2.5rem] bg-white border border-black/5 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-semibold">Sign in</h3>
                  <span className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Secure</span>
                </div>
                <form className="mt-8 space-y-4">
                  <div>
                    <label className="text-xs uppercase tracking-[0.25em] text-[#9CA3AF]">Work email</label>
                    <input
                      type="email"
                      placeholder="team@volunteer.org"
                      className="mt-2 w-full px-4 py-3 rounded-2xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-[#111827]/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.25em] text-[#9CA3AF]">Access key</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="mt-2 w-full px-4 py-3 rounded-2xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-[#111827]/40"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#6B7280]">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="rounded border-black/20" />
                      Remember me
                    </label>
                    <button type="button" className="font-semibold text-[#111827]">Use passkey</button>
                  </div>
                  <button
                    type="button"
                    onClick={onEnterAdmin}
                    className="w-full py-3 rounded-full bg-[#111827] text-white font-semibold shadow-lg shadow-black/10 hover:bg-black transition"
                  >
                    Enter Atlas
                  </button>
                </form>
                <div className="mt-6 p-4 rounded-2xl bg-[#F9FAFB] border border-black/5 text-xs text-[#6B7280] flex items-start gap-3">
                  <Mail className="w-4 h-4 mt-0.5" />
                  Access links sent within 30 seconds. Contact support if you do not receive a code.
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 bg-white/70">
        <div className="max-w-[1200px] mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="text-sm text-[#6B7280]">Atlas Edition · Volunteer OS</p>
            <p className="text-xs text-[#9CA3AF] mt-2">Crafted for high-trust community operations.</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#6B7280]">
            <span>Security</span>
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
