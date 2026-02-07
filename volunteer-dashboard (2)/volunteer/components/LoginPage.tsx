import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Mail, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as any } }
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } }
};

type LoginPageProps = {
  onBack: () => void;
  onEnterAdmin: () => void;
};

export const LoginPage: React.FC<LoginPageProps> = ({ onBack, onEnterAdmin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedEmail = localStorage.getItem('nexolink_volunteer_email');
    const savedRemember = localStorage.getItem('nexolink_volunteer_remember') === 'true';
    if (savedEmail) {
      setEmail(savedEmail);
    }
    setRememberMe(savedRemember);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email || !password) return;

    const storedAdminEmail = localStorage.getItem('nexolink_admin_email');
    if (storedAdminEmail && storedAdminEmail.toLowerCase() !== email.trim().toLowerCase()) {
      setError('This account is not authorized for the admin dashboard.');
      return;
    }

    if (rememberMe) {
      localStorage.setItem('nexolink_volunteer_email', email.trim());
      localStorage.setItem('nexolink_volunteer_remember', 'true');
    } else {
      localStorage.removeItem('nexolink_volunteer_remember');
    }

    onEnterAdmin();
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#0B0D10] relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -right-20 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_top,rgba(210,246,119,0.5),rgba(210,246,119,0))] blur-3xl" />
      <div className="pointer-events-none absolute top-44 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(17,24,39,0.18),rgba(17,24,39,0))] blur-3xl" />
      <div className="grain pointer-events-none absolute inset-0" />

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#F3F4F6]/80 border-b border-black/5">
        <div className="max-w-[1100px] mx-auto px-6 py-4 flex items-center justify-between">
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
          <div className="text-xs uppercase tracking-[0.3em] text-[#6B7280]">Secure Login</div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 pt-16 pb-24">
        <motion.div initial="hidden" animate="show" variants={stagger} className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10">
          <motion.div variants={fadeUp}>
            <p className="text-xs uppercase tracking-[0.35em] text-[#6B7280] font-semibold">Member Login</p>
            <h1 className="font-display text-[3.4rem] leading-[1.04] mt-4">Return to your command center.</h1>
            <p className="mt-6 text-xl text-[#4B5563]">
              Authenticate with passkeys, secure links, or organization SSO. Every session is protected by Atlas-grade policy.
            </p>

            <div className="mt-10 space-y-4">
              {[
                { title: 'Secure operations', desc: 'Role-based controls with regional compliance.' },
                { title: 'Instant recovery', desc: 'Automated fallback and secure magic links.' },
                { title: 'Audit clarity', desc: 'Every login logged, verified, and traceable.' }
              ].map((item) => (
                <div key={item.title} className="p-5 rounded-2xl bg-white border border-black/5 shadow-sm">
                  <p className="text-sm font-semibold text-[#111827]">{item.title}</p>
                  <p className="text-sm text-[#6B7280] mt-2">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="p-8 rounded-[2.5rem] bg-white border border-black/5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Sign in</h2>
              <span className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF]">Verified</span>
            </div>
            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-xs uppercase tracking-[0.25em] text-[#9CA3AF]">Work email</label>
                <input
                  type="email"
                  placeholder="team@volunteer.org"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full px-4 py-3 rounded-2xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-black/40"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.25em] text-[#9CA3AF]">Access key</label>
                <div className="relative mt-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-black/10 focus:outline-none focus:ring-2 focus:ring-black/40 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-[#6B7280]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="rounded border-black/20"
                  />
                  Remember me
                </label>
                <button type="button" className="font-semibold text-[#111827]">Use passkey</button>
              </div>
              {error && (
                <div className="text-sm text-red-600 font-medium">{error}</div>
              )}
              <button
                type="submit"
                className="w-full py-3 rounded-full bg-[#111827] text-white font-semibold shadow-lg shadow-black/20 hover:bg-black transition"
              >
                Enter Dashboard
              </button>
            </form>
            <div className="mt-6 p-4 rounded-2xl bg-[#F9FAFB] border border-black/5 text-sm text-[#6B7280] flex items-start gap-3">
              <Mail className="w-4 h-4 mt-0.5" />
              Access links are delivered within 30 seconds. Contact support if you do not receive a code.
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};
