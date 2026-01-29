import React, { useState, useRef, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue, useMotionTemplate, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Globe, 
  Users, 
  Activity, 
  Zap, 
  Shield, 
  BarChart2, 
  Menu, 
  X,
  Play,
  Layers,
  Smartphone,
  MessageSquare,
  Calendar,
  Command,
  TrendingUp,
  Heart
} from 'lucide-react';

interface LandingPageProps {
  onLoginClick: () => void;
}

// --- Sub-Components ---

const Marquee = () => {
  return (
    <div className="w-full py-12 border-y border-gray-100 bg-white overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white to-transparent z-10" />
      
      <div className="flex overflow-hidden">
        <motion.div 
          initial={{ x: 0 }}
          animate={{ x: "-50%" }}
          transition={{ duration: 20, ease: "linear", repeat: Infinity }}
          className="flex gap-16 pr-16 items-center whitespace-nowrap"
        >
          {[...Array(2)].map((_, i) => (
             <React.Fragment key={i}>
                <span className="text-xl font-bold text-gray-300 flex items-center gap-2"><Command className="w-6 h-6" /> ACME Corp</span>
                <span className="text-xl font-bold text-gray-300 flex items-center gap-2"><Layers className="w-6 h-6" /> StackFlow</span>
                <span className="text-xl font-bold text-gray-300 flex items-center gap-2"><Zap className="w-6 h-6" /> BoltShift</span>
                <span className="text-xl font-bold text-gray-300 flex items-center gap-2"><Globe className="w-6 h-6" /> GlobalBank</span>
                <span className="text-xl font-bold text-gray-300 flex items-center gap-2"><Activity className="w-6 h-6" /> PulseInc</span>
                <span className="text-xl font-bold text-gray-300 flex items-center gap-2"><Shield className="w-6 h-6" /> SecureNet</span>
             </React.Fragment>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

const StickyFeatureSection = () => {
    const targetRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: targetRef,
        offset: ["start start", "end end"]
    });

    const features = [
        {
            title: "Real-time Command Center",
            description: "Monitor every volunteer, hour, and event from a single glass-pane dashboard. Watch your impact grow in real-time with live data streams.",
            icon: <Activity className="w-6 h-6 text-lime-400" />,
            visual: (
                <div className="w-full h-full bg-gray-900 rounded-3xl border border-gray-800 p-6 relative overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Live Impact</div>
                            <div className="text-4xl font-bold text-white">1,240 <span className="text-lime-400 text-lg">+12%</span></div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-lime-400/10 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-lime-400" />
                        </div>
                    </div>
                    <div className="flex-1 flex items-end gap-1">
                        {[40, 60, 45, 80, 55, 90, 70, 85, 60, 75, 50, 95].map((h, i) => (
                            <motion.div 
                                key={i}
                                initial={{ height: "10%" }}
                                whileInView={{ height: `${h}%` }}
                                transition={{ duration: 1, delay: i * 0.05 }}
                                className="flex-1 bg-gray-800 hover:bg-lime-400 transition-colors rounded-t-sm"
                            />
                        ))}
                    </div>
                </div>
            )
        },
        {
            title: "Automated Scheduling",
            description: "Stop chasing spreadsheets. Our AI-driven scheduler matches volunteers to shifts based on skills, availability, and past performance.",
            icon: <Calendar className="w-6 h-6 text-blue-400" />,
            visual: (
                <div className="w-full h-full bg-white rounded-3xl border border-gray-100 p-6 relative overflow-hidden shadow-xl">
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                                    {9 + i}:00
                                </div>
                                <div className="flex-1">
                                    <div className="h-2 w-24 bg-gray-200 rounded-full mb-2" />
                                    <div className="h-1.5 w-16 bg-gray-100 rounded-full" />
                                </div>
                                <div className="flex -space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-gray-300 border-2 border-white" />
                                    <div className="w-8 h-8 rounded-full bg-gray-300 border-2 border-white" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="absolute bottom-6 right-6">
                        <div className="px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg font-bold text-sm flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> Auto-Fill
                        </div>
                    </div>
                </div>
            )
        },
        {
            title: "Mobile Companion",
            description: "Give your volunteers the power to check in, log hours, and chat with coordinators directly from their pocket.",
            icon: <Smartphone className="w-6 h-6 text-purple-400" />,
            visual: (
                <div className="w-full h-full bg-gray-50 rounded-3xl border border-gray-200 flex items-center justify-center overflow-hidden">
                     <div className="w-64 h-[90%] bg-gray-900 rounded-[2.5rem] border-[8px] border-gray-800 shadow-2xl overflow-hidden relative">
                         <div className="absolute top-0 left-0 right-0 h-6 bg-gray-800 z-20 flex justify-center">
                             <div className="w-20 h-4 bg-black rounded-b-xl" />
                         </div>
                         <div className="w-full h-full bg-white pt-10 px-4">
                             <div className="flex justify-between items-center mb-6">
                                 <div className="font-bold text-gray-900">Good Morning</div>
                                 <div className="w-8 h-8 rounded-full bg-gray-200" />
                             </div>
                             <div className="p-4 bg-purple-600 rounded-2xl text-white mb-4 shadow-lg shadow-purple-200">
                                 <div className="text-xs opacity-80 mb-1">Next Shift</div>
                                 <div className="font-bold text-lg">Food Drive</div>
                                 <div className="text-sm opacity-80 mt-1">Today, 2:00 PM</div>
                             </div>
                             <div className="grid grid-cols-2 gap-3">
                                 <div className="h-24 bg-gray-50 rounded-2xl" />
                                 <div className="h-24 bg-gray-50 rounded-2xl" />
                             </div>
                         </div>
                     </div>
                </div>
            )
        }
    ];

    return (
        <section ref={targetRef} className="w-full bg-[#0E0E10] text-white py-20 relative">
            {features.map((feature, i) => {
                // Determine opacity based on scroll position for simple transition
                const rangeStart = i * (1 / features.length);
                const rangeEnd = rangeStart + (1 / features.length);
                const opacity = useTransform(scrollYProgress, [rangeStart, (rangeStart + rangeEnd) / 2, rangeEnd], [0.3, 1, 0.3]);
                const scale = useTransform(scrollYProgress, [rangeStart, (rangeStart + rangeEnd) / 2, rangeEnd], [0.8, 1, 0.8]);
                
                return (
                    <div key={i} className="min-h-screen flex items-center justify-center sticky top-0 px-4">
                        <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            
                            {/* Text Content */}
                            <motion.div 
                                style={{ opacity }}
                                className="space-y-8"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-md">
                                    {feature.icon}
                                </div>
                                <h2 className="text-5xl md:text-7xl font-bold tracking-tight leading-none">
                                    {feature.title}
                                </h2>
                                <p className="text-xl text-gray-400 font-medium leading-relaxed max-w-md">
                                    {feature.description}
                                </p>
                                <button className="text-lime-400 font-bold text-lg flex items-center gap-2 group">
                                    Learn more <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </motion.div>

                            {/* Visual Content */}
                            <motion.div 
                                style={{ scale, opacity }}
                                className="h-[500px] w-full"
                            >
                                {feature.visual}
                            </motion.div>

                        </div>
                    </div>
                );
            })}
        </section>
    );
};

// --- Main Page Component ---

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick }) => {
  const [activeTab, setActiveTab] = useState<'Home' | 'App' | 'About' | 'Blog'>('Home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  // Mouse move effect for Hero
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  function handleMouseMove({ clientX, clientY, currentTarget }: React.MouseEvent) {
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    mouseX.set((clientX - left) / width - 0.5);
    mouseY.set((clientY - top) / height - 0.5);
  }

  const heroRotateX = useTransform(mouseY, [-0.5, 0.5], [10, -10]);
  const heroRotateY = useTransform(mouseX, [-0.5, 0.5], [-10, 10]);

  // Navbar Transition
  const navBackground = useTransform(scrollY, [0, 100], ["rgba(255,255,255,0)", "rgba(255,255,255,0.8)"]);
  const navBackdrop = useTransform(scrollY, [0, 100], ["blur(0px)", "blur(12px)"]);
  const navBorder = useTransform(scrollY, [0, 100], ["transparent", "rgba(229, 231, 235, 0.5)"]);

  const tabs = ['Home', 'App', 'About', 'Blog'];

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 font-sans selection:bg-lime-300 overflow-x-hidden">
      
      {/* Navigation */}
      <motion.nav 
        style={{ backgroundColor: navBackground, backdropFilter: navBackdrop, borderColor: navBorder }}
        className="fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300"
      >
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('Home')}>
                  <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-lime-300 fill-lime-300" />
                  </div>
                  <span className="font-bold text-xl tracking-tight">Volunteer Dash</span>
              </div>

              <div className="hidden md:flex items-center gap-8">
                  {tabs.map((tab) => (
                      <button 
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`text-sm font-bold transition-colors ${activeTab === tab ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                      >
                          {tab}
                      </button>
                  ))}
              </div>

              <div className="flex items-center gap-4">
                  <button onClick={onLoginClick} className="hidden md:flex text-sm font-bold text-gray-900 hover:text-gray-600 transition-colors">
                      Log in
                  </button>
                  <button onClick={onLoginClick} className="px-5 py-2.5 bg-gray-900 text-white rounded-full text-sm font-bold hover:bg-black transition-transform hover:-translate-y-0.5 shadow-lg shadow-gray-900/20">
                      Get Started
                  </button>
                  <button className="md:hidden p-2 text-gray-600" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                      {isMobileMenuOpen ? <X /> : <Menu />}
                  </button>
              </div>
          </div>
      </motion.nav>

      {/* Content */}
      <div className="pt-20">
          <AnimatePresence mode="wait">
              {activeTab === 'Home' ? (
                  <motion.div
                    key="home"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                      {/* --- HERO SECTION --- */}
                      <section 
                        className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden bg-[#F3F4F6] px-4 pt-20"
                        onMouseMove={handleMouseMove}
                      >
                          {/* Background Gradients */}
                          <div className="absolute inset-0 overflow-hidden pointer-events-none">
                              <div className="absolute top-[-20%] left-[-10%] w-[80vw] h-[80vw] bg-lime-200/30 rounded-full blur-[120px]" />
                              <div className="absolute bottom-[-20%] right-[-10%] w-[80vw] h-[80vw] bg-blue-200/30 rounded-full blur-[120px]" />
                          </div>

                          <div className="relative z-10 text-center max-w-5xl mx-auto mb-16">
                              <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6 }}
                                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 shadow-sm mb-8"
                              >
                                  <span className="flex h-2 w-2 relative">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
                                  </span>
                                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">VolunteerOS 2.0 Live</span>
                              </motion.div>

                              <motion.h1 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.1 }}
                                className="text-7xl md:text-9xl font-bold tracking-tighter text-gray-900 mb-6 leading-[0.9]"
                              >
                                  Orchestrate <br />
                                  <span className="text-transparent bg-clip-text bg-gradient-to-br from-lime-500 to-lime-700">Impact.</span>
                              </motion.h1>

                              <motion.p 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.2 }}
                                className="text-xl md:text-2xl text-gray-500 font-medium max-w-2xl mx-auto leading-relaxed mb-10"
                              >
                                  The operating system for modern non-profits. Automate logistics, track hours, and scale your mission without the chaos.
                              </motion.p>

                              <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.3 }}
                                className="flex flex-col sm:flex-row items-center justify-center gap-4"
                              >
                                  <button onClick={onLoginClick} className="h-14 px-8 bg-gray-900 text-white rounded-2xl font-bold text-lg hover:bg-black transition-all shadow-xl shadow-gray-900/20 hover:scale-105 flex items-center gap-2">
                                      Start Free Trial <ArrowRight className="w-5 h-5" />
                                  </button>
                                  <button onClick={() => setActiveTab('App')} className="h-14 px-8 bg-white text-gray-900 rounded-2xl font-bold text-lg border border-gray-200 hover:bg-gray-50 transition-all hover:scale-105 flex items-center gap-2">
                                      <Play className="w-5 h-5 fill-current" /> Demo Video
                                  </button>
                              </motion.div>
                          </div>

                          {/* 3D Dashboard Mockup */}
                          <motion.div 
                             style={{ rotateX: heroRotateX, rotateY: heroRotateY, perspective: 1000 }}
                             className="relative z-10 w-full max-w-6xl mx-auto px-4"
                          >
                              <div className="relative aspect-[16/10] bg-gray-900 rounded-t-[2rem] shadow-2xl overflow-hidden border-t border-x border-gray-800 ring-1 ring-white/10 group">
                                  {/* Glass Reflection */}
                                  <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent z-20 pointer-events-none" />
                                  
                                  {/* Inner Content Mockup */}
                                  <div className="absolute inset-0 p-8 flex flex-col">
                                      <div className="flex items-center gap-4 mb-8">
                                          <div className="w-3 h-3 rounded-full bg-red-500" />
                                          <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                          <div className="w-3 h-3 rounded-full bg-green-500" />
                                      </div>
                                      <div className="flex gap-8 h-full">
                                          <div className="w-64 bg-gray-800/50 rounded-xl border border-white/5" />
                                          <div className="flex-1 bg-gray-800/50 rounded-xl border border-white/5 p-8 relative overflow-hidden">
                                              {/* Animated Bar Chart */}
                                              <div className="flex items-end gap-4 h-full pb-8">
                                                  {[30, 50, 45, 70, 60, 85, 95].map((h, i) => (
                                                      <motion.div 
                                                        key={i}
                                                        initial={{ height: 0 }}
                                                        whileInView={{ height: `${h}%` }}
                                                        transition={{ duration: 1, delay: 0.5 + (i * 0.1) }}
                                                        className="flex-1 bg-lime-400 rounded-t-lg opacity-80"
                                                      />
                                                  ))}
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </motion.div>
                      </section>

                      {/* --- SOCIAL PROOF --- */}
                      <Marquee />

                      {/* --- SCROLL REVEAL TEXT --- */}
                      <section className="py-32 px-6 bg-white">
                          <div className="max-w-5xl mx-auto text-center">
                              <h2 className="text-4xl md:text-7xl font-bold text-gray-200 leading-tight">
                                  Volunteering is <span className="text-gray-900">human connection</span>. <br/>
                                  Managing it shouldn't feel like <span className="text-gray-900">robot work</span>.
                              </h2>
                          </div>
                      </section>

                      {/* --- STICKY FEATURE SCROLL --- */}
                      <StickyFeatureSection />

                      {/* --- BENTO GRID --- */}
                      <section className="py-32 px-4 bg-[#F3F4F6]">
                          <div className="max-w-7xl mx-auto">
                              <div className="mb-20 text-center">
                                  <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight">Batteries Included.</h2>
                                  <p className="text-xl text-gray-500 max-w-2xl mx-auto">Everything you need to launch, manage, and scale your volunteer programs.</p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 grid-rows-2 gap-6 h-auto md:h-[800px]">
                                  {/* Large Card Left */}
                                  <div className="md:col-span-2 md:row-span-2 bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm relative overflow-hidden group">
                                      <div className="relative z-10">
                                          <div className="w-14 h-14 bg-lime-100 rounded-2xl flex items-center justify-center mb-6">
                                              <TrendingUp className="w-7 h-7 text-lime-700" />
                                          </div>
                                          <h3 className="text-3xl font-bold mb-4">Analytics that matter</h3>
                                          <p className="text-gray-500 text-lg leading-relaxed max-w-md">Track retention rates, hours contributed per capita, and economic impact of your volunteer force.</p>
                                      </div>
                                      <div className="absolute right-[-50px] bottom-[-50px] w-[500px] h-[400px] bg-gray-50 rounded-tl-[3rem] border-t border-l border-gray-100 p-8 shadow-inner">
                                          {/* Mock Graph */}
                                          <div className="w-full h-full relative">
                                              <svg className="w-full h-full overflow-visible">
                                                  <motion.path 
                                                    d="M0 300 Q 100 250 200 280 T 400 100"
                                                    fill="none"
                                                    stroke="#D2F677"
                                                    strokeWidth="8"
                                                    initial={{ pathLength: 0 }}
                                                    whileInView={{ pathLength: 1 }}
                                                    transition={{ duration: 2 }}
                                                  />
                                              </svg>
                                          </div>
                                      </div>
                                  </div>

                                  {/* Top Right */}
                                  <div className="bg-gray-900 text-white rounded-[3rem] p-10 relative overflow-hidden group">
                                      <div className="relative z-10">
                                          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-4">
                                              <Shield className="w-6 h-6 text-lime-300" />
                                          </div>
                                          <h3 className="text-2xl font-bold mb-2">Enterprise Security</h3>
                                          <p className="text-gray-400">SOC2 Type II Ready. Data encrypted at rest and in transit.</p>
                                      </div>
                                      <div className="absolute top-0 right-0 w-32 h-32 bg-lime-400/20 rounded-full blur-3xl -mr-10 -mt-10" />
                                  </div>

                                  {/* Bottom Right */}
                                  <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm relative overflow-hidden group">
                                      <div className="relative z-10">
                                          <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                                              <MessageSquare className="w-6 h-6 text-blue-600" />
                                          </div>
                                          <h3 className="text-2xl font-bold mb-2">In-App Chat</h3>
                                          <p className="text-gray-500">Keep personal numbers private. Direct & Group messaging.</p>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </section>

                      {/* --- CTA SECTION --- */}
                      <section className="py-32 px-4 bg-white">
                          <div className="max-w-7xl mx-auto bg-gray-900 rounded-[4rem] p-12 md:p-24 text-center relative overflow-hidden">
                              {/* Background Blobs */}
                              <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                                  <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-lime-500/20 rounded-full blur-[100px]" />
                                  <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-[100px]" />
                              </div>

                              <div className="relative z-10 max-w-3xl mx-auto">
                                  <h2 className="text-5xl md:text-8xl font-bold text-white mb-8 tracking-tight">Start your <br/> movement.</h2>
                                  <p className="text-xl text-gray-400 mb-12 font-medium">Join 2,500+ organizations changing the world with Volunteer Dash.</p>
                                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                      <button onClick={onLoginClick} className="h-16 px-10 bg-lime-300 hover:bg-lime-400 text-gray-900 rounded-full font-bold text-xl transition-all hover:scale-105 shadow-[0_0_40px_rgba(210,246,119,0.3)]">
                                          Get Started Free
                                      </button>
                                      <button className="h-16 px-10 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold text-xl backdrop-blur-md transition-all">
                                          Contact Sales
                                      </button>
                                  </div>
                              </div>
                          </div>
                      </section>

                  </motion.div>
              ) : (
                  // Placeholder for other tabs (preserving structure)
                  <motion.div 
                    key="other"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="min-h-screen flex items-center justify-center bg-gray-50"
                  >
                      <div className="text-center">
                          <h2 className="text-4xl font-bold text-gray-900 mb-4">{activeTab}</h2>
                          <p className="text-gray-500">Content for {activeTab} goes here. (Focused on Home redesign)</p>
                          <button onClick={() => setActiveTab('Home')} className="mt-8 text-lime-600 font-bold underline">Back to Home</button>
                      </div>
                  </motion.div>
              )}
          </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-lime-300 fill-lime-300" />
                  </div>
                  <span className="font-bold text-xl tracking-tight">Volunteer Dash</span>
              </div>
              <div className="text-gray-500 font-medium text-sm">
                  © 2024 Volunteer Dash Inc.
              </div>
              <div className="flex gap-6">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 cursor-pointer transition-colors">
                      <Globe className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 cursor-pointer transition-colors">
                      <Users className="w-5 h-5 text-gray-600" />
                  </div>
              </div>
          </div>
      </footer>

    </div>
  );
};