import React from 'react';
import { Mail, MessageSquare, Phone } from 'lucide-react';

interface ContactPageProps {
  onNavigate?: (page: 'home' | 'pricing' | 'create') => void;
}

const ContactPage: React.FC<ContactPageProps> = ({ onNavigate }) => {
  return (
    <section className="relative min-h-screen bg-softGray pt-24 md:pt-32 pb-20 overflow-hidden">
      <div className="absolute -top-28 -right-20 h-80 w-80 rounded-full bg-neon/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-charcoal/10 blur-3xl pointer-events-none" />

      <div className="relative container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-charcoal/40 mb-6">Contact</p>
          <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter leading-[0.9] text-charcoal">
            Lets talk.
          </h1>
          <p className="mt-8 text-lg md:text-xl text-charcoal/60 max-w-2xl">
            For enterprise onboarding, custom deployments, or support questions, reach us directly.
          </p>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
            <a
              href="mailto:support@nexolink.app"
              className="group rounded-3xl border border-charcoal/10 bg-white p-6 shadow-sm hover:shadow-xl transition"
            >
              <Mail className="w-6 h-6 text-charcoal" />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-charcoal/40">Email</p>
              <p className="mt-2 font-bold text-charcoal">support@nexolink.app</p>
            </a>

            <a
              href="mailto:sales@nexolink.app"
              className="group rounded-3xl border border-charcoal/10 bg-white p-6 shadow-sm hover:shadow-xl transition"
            >
              <MessageSquare className="w-6 h-6 text-charcoal" />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-charcoal/40">Sales</p>
              <p className="mt-2 font-bold text-charcoal">sales@nexolink.app</p>
            </a>

            <a
              href="tel:+1-555-010-7000"
              className="group rounded-3xl border border-charcoal/10 bg-white p-6 shadow-sm hover:shadow-xl transition"
            >
              <Phone className="w-6 h-6 text-charcoal" />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-charcoal/40">Phone</p>
              <p className="mt-2 font-bold text-charcoal">+1 (555) 010-7000</p>
            </a>
          </div>

          <div className="mt-12 flex flex-wrap gap-4">
            <button
              onClick={() => onNavigate?.('pricing')}
              className="px-8 py-4 rounded-full bg-charcoal text-white text-xs font-black uppercase tracking-[0.25em] hover:bg-neon hover:text-charcoal transition"
            >
              View Plans
            </button>
            <button
              onClick={() => onNavigate?.('create')}
              className="px-8 py-4 rounded-full bg-white border border-charcoal/10 text-charcoal text-xs font-black uppercase tracking-[0.25em] hover:border-charcoal/30 transition"
            >
              Create Account
            </button>
            <button
              onClick={() => onNavigate?.('home')}
              className="px-8 py-4 rounded-full bg-transparent text-charcoal/70 text-xs font-black uppercase tracking-[0.25em] hover:text-charcoal transition"
            >
              Back Home
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactPage;
