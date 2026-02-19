
import React from 'react';

interface FooterProps {
  onNavigate?: (page: 'home' | 'app' | 'pricing' | 'blog' | 'privacy' | 'terms' | 'about' | 'volunteers-info' | 'donate' | 'contact') => void;
}

const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-white pt-32 pb-12 border-t border-borderLight">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-24 md:items-start">
          <div className="md:col-span-8">
            <button 
              onClick={() => onNavigate?.('home')}
              className="text-2xl font-display font-black tracking-tight mb-6 block text-left"
            >
              NexoLink
            </button>
            <p className="text-charcoal/50 text-sm leading-relaxed max-w-sm font-medium">
              A modern volunteer platform for discovering, logging, verifying, and celebrating service.
            </p>
          </div>
          
          <div className="md:col-span-4 flex flex-col md:items-end">
            <div className="text-left md:text-right">
              <h5 className="font-bold text-[10px] uppercase tracking-[0.3em] mb-8 text-charcoal/30">Pages</h5>
              <ul className="space-y-4 text-sm font-semibold text-charcoal/60">
                <li><button onClick={() => onNavigate?.('home')} className="hover:text-charcoal transition-colors">Home</button></li>
                <li><button onClick={() => onNavigate?.('app')} className="hover:text-charcoal transition-colors">App Details</button></li>
                <li><button onClick={() => onNavigate?.('volunteers-info')} className="hover:text-charcoal transition-colors">For Volunteers</button></li>
                <li><button onClick={() => onNavigate?.('about')} className="hover:text-charcoal transition-colors">Our Story</button></li>
                <li><button onClick={() => onNavigate?.('pricing')} className="hover:text-charcoal transition-colors">Plans & Pricing</button></li>
                <li><button onClick={() => onNavigate?.('blog')} className="hover:text-charcoal transition-colors">Latest News</button></li>
                <li><button onClick={() => onNavigate?.('contact')} className="hover:text-charcoal transition-colors">Contact</button></li>
                <li><button onClick={() => onNavigate?.('donate')} className="hover:text-charcoal transition-colors font-bold text-neon-dark underline decoration-neon/30 underline-offset-4">Support the Mission</button></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-center pt-12 border-t border-borderLight">
          <p className="text-[10px] font-bold tracking-[0.2em] text-charcoal/30 uppercase">© 2026 NEXOLINK</p>
          <div className="flex gap-10 mt-6 md:mt-0 text-[10px] font-bold tracking-[0.2em] text-charcoal/30 uppercase">
            <button onClick={() => onNavigate?.('privacy')} className="hover:text-charcoal transition-colors">Privacy Policy</button>
            <button onClick={() => onNavigate?.('terms')} className="hover:text-charcoal transition-colors">Terms of Service</button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
