
import React from 'react';

const services = [
  {
    title: 'Opportunity Discovery',
    desc: 'Browse volunteer roles by category and community need, then join in a few taps.',
    tag: 'Discover'
  },
  {
    title: 'Instant Logging',
    desc: 'Log hours with dates, descriptions, and verification in one clean flow.',
    tag: 'Log'
  },
  {
    title: 'Impact Exports',
    desc: 'Generate CSV or PDF reports for schools, audits, and grant providers.',
    tag: 'Verify'
  }
];

const Services: React.FC = () => {
  return (
    <div className="container mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {services.map((service, idx) => (
          <div 
            key={idx} 
            className="group relative p-12 bg-grey-900 border border-white/5 hover:border-neon/30 transition-all duration-500 cursor-pointer overflow-hidden"
          >
            {/* Hover Background Shift */}
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-neon/5 rounded-full translate-x-1/2 translate-y-1/2 group-hover:scale-[8] transition-transform duration-700"></div>
            
            <div className="relative z-10">
              <span className="text-xs font-mono text-neon mb-12 block tracking-[0.4em] uppercase">{service.tag}</span>
              <h3 className="text-3xl font-display font-bold text-white mb-6 group-hover:text-neon transition-colors">
                {service.title}
              </h3>
              <p className="text-grey-400 leading-relaxed mb-8">
                {service.desc}
              </p>
              <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center group-hover:bg-neon group-hover:border-neon transition-all">
                <svg className="w-5 h-5 text-white group-hover:text-dark transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Services;
