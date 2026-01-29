
import React from 'react';

const BentoGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 grid-rows-2 gap-4 h-auto md:h-[800px]">
      {/* Large Featured Card */}
      <div className="md:col-span-2 md:row-span-2 bg-grey-900 group relative overflow-hidden rounded-3xl p-12 flex flex-col justify-end">
        <div className="absolute top-0 right-0 w-full h-full opacity-20 pointer-events-none">
            <div className="w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-neon via-transparent to-transparent"></div>
        </div>
        <img src="https://picsum.photos/800/800?grayscale" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30 group-hover:scale-110 transition-transform duration-700" alt="Tech" />
        <div className="relative z-10">
          <div className="w-12 h-12 bg-neon rounded-full mb-6 flex items-center justify-center">
            <div className="w-4 h-4 bg-dark rounded-full"></div>
          </div>
          <h3 className="text-4xl md:text-5xl font-display font-bold text-white mb-6">Quantum-Grade Core Protocol</h3>
          <p className="text-grey-400 text-lg max-w-sm">Built on zero-trust architecture for the next generation of industrial connectivity.</p>
        </div>
      </div>

      {/* Top Right Card */}
      <div className="md:col-span-2 bg-neon group relative overflow-hidden rounded-3xl p-10 flex flex-col justify-between">
        <h3 className="text-3xl font-display font-bold text-dark leading-tight">Lightning-Fast <br/>Edge Nodes</h3>
        <div className="flex justify-between items-end">
            <span className="text-dark/60 font-mono text-sm uppercase tracking-widest">0.02ms Latency</span>
            <div className="text-5xl font-black text-dark opacity-20">99.9%</div>
        </div>
      </div>

      {/* Bottom Middle Card */}
      <div className="md:col-span-1 bg-white border border-dark/10 group relative overflow-hidden rounded-3xl p-8 flex flex-col items-center justify-center text-center">
        <div className="w-full h-1 bg-dark/5 absolute top-1/2 -translate-y-1/2"></div>
        <div className="relative z-10">
            <h4 className="text-4xl font-display font-bold mb-2">320+</h4>
            <p className="text-grey-400 text-xs uppercase tracking-widest">API Integrations</p>
        </div>
      </div>

      {/* Bottom Right Card */}
      <div className="md:col-span-1 bg-dark group relative overflow-hidden rounded-3xl p-8 flex flex-col justify-center">
        <div className="absolute inset-0 bg-neon/10 group-hover:opacity-100 opacity-0 transition-opacity duration-500"></div>
        <div className="relative z-10">
            <div className="text-neon mb-4 font-mono">_SEC_AUTH</div>
            <h4 className="text-xl font-bold text-white mb-4">Self-Healing Infrastructure</h4>
            <div className="flex gap-1">
                {[1,2,3,4,5].map(i => <div key={i} className="h-1 w-full bg-neon"></div>)}
            </div>
        </div>
      </div>
    </div>
  );
};

export default BentoGrid;
