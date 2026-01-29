
import React, { useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import DashboardPreview from './components/DashboardPreview';
import StatsSection from './components/StatsSection';
import CTA from './components/CTA';
import Footer from './components/Footer';
import CustomCursor from './components/CustomCursor';
import AppPage from './pages/AppPage';
import PricingPage from './pages/PricingPage';
import BlogPage from './pages/BlogPage';
import FounderStoryPage from './pages/FounderStoryPage';
import OpinionPage from './pages/OpinionPage';
import LoginPage from './pages/LoginPage';
import CreatePage from './pages/CreatePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import ImpactNexus from './components/ImpactNexus';
import VelocityStream from './components/VelocityStream';

gsap.registerPlugin(ScrollTrigger);

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'home' | 'app' | 'pricing' | 'blog' | 'story' | 'opinion' | 'login' | 'create' | 'privacy' | 'terms'>('home');

  useEffect(() => {
    window.scrollTo(0, 0);

    const ctx = gsap.context(() => {
      if (currentPage === 'home') {
        const sections = gsap.utils.toArray('.reveal-section');
        sections.forEach((section: any) => {
          gsap.fromTo(section, 
            { opacity: 0, y: 30 },
            { 
              opacity: 1, 
              y: 0, 
              duration: 1, 
              ease: 'power3.out',
              scrollTrigger: {
                trigger: section,
                start: 'top 85%',
                toggleActions: 'play none none reverse'
              }
            }
          );
        });
      }
    });

    const refreshID = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 500); 

    return () => {
      clearTimeout(refreshID);
      ctx.revert();
    };
  }, [currentPage]);

  const renderPage = () => {
    switch(currentPage) {
      case 'app':
        return <AppPage />;
      case 'pricing':
        return <PricingPage onNavigate={setCurrentPage} />;
      case 'blog':
        return <BlogPage onNavigate={setCurrentPage} />;
      case 'story':
        return <FounderStoryPage onNavigate={setCurrentPage} />;
      case 'opinion':
        return <OpinionPage onNavigate={setCurrentPage} />;
      case 'login':
        return <LoginPage onNavigate={setCurrentPage} />;
      case 'create':
        return <CreatePage onNavigate={setCurrentPage} />;
      case 'privacy':
        return <PrivacyPolicyPage />;
      case 'terms':
        return <TermsPage />;
      case 'home':
      default:
        return (
          <>
            <Hero onNavigate={setCurrentPage} />
            <div className="reveal-section">
              <StatsSection />
            </div>
            <ImpactNexus />
            <HowItWorks />
            <VelocityStream />
            <Features />
            <div className="reveal-section">
              <DashboardPreview />
            </div>
            <div className="reveal-section">
              <CTA onNavigate={setCurrentPage} />
            </div>
          </>
        );
    }
  };

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "circOut" } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.4, ease: "easeIn" } }
  };

  const isAuthPage = currentPage === 'login' || currentPage === 'create';

  return (
    <div className="relative selection:bg-neon selection:text-charcoal bg-transparent font-sans text-charcoal min-h-screen">
      <CustomCursor />
      <Navbar onNavigate={setCurrentPage} currentPage={currentPage} />
      
      <main className="md:pl-20 transition-all duration-500">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="min-h-screen"
            style={{ width: '100%', overflow: 'hidden' }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      {!isAuthPage && (
          <div className="md:pl-20 transition-all duration-500">
             <Footer onNavigate={setCurrentPage} />
          </div>
      )}
    </div>
  );
};

export default App;
