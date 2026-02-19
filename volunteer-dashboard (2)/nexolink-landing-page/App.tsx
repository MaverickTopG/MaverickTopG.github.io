
import React, { useCallback, useEffect, useState } from 'react';
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
import AboutUsPage from './pages/AboutUsPage';
import VolunteersInfoPage from './pages/VolunteersInfoPage';
import DonatePage from './pages/DonatePage';
import OpinionPage from './pages/OpinionPage';
import LoginPage from './pages/LoginPage';
import CreatePage from './pages/CreatePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import ImpactNexus from './components/ImpactNexus';
import VelocityStream from './components/VelocityStream';
import VolunteerLoginPage from './pages/VolunteerLoginPage';
import VolunteerSignupPage from './pages/VolunteerSignupPage';
import ContactPage from './pages/ContactPage';

gsap.registerPlugin(ScrollTrigger);

type AppPage =
  | 'home'
  | 'app'
  | 'pricing'
  | 'blog'
  | 'story'
  | 'opinion'
  | 'login'
  | 'create'
  | 'privacy'
  | 'terms'
  | 'volunteer-login'
  | 'volunteer-signup'
  | 'about'
  | 'volunteers-info'
  | 'donate'
  | 'contact';

const PAGE_PATHS: Record<AppPage, string> = {
  home: '/',
  app: '/app',
  pricing: '/pricing',
  blog: '/blog',
  story: '/story',
  opinion: '/opinion',
  login: '/login',
  create: '/create',
  privacy: '/privacy-policy',
  terms: '/terms',
  'volunteer-login': '/volunteer-login',
  'volunteer-signup': '/volunteer-signup',
  about: '/about',
  'volunteers-info': '/volunteers',
  donate: '/donate',
  contact: '/contact',
};

const PATH_TO_PAGE: Record<string, AppPage> = {
  '/': 'home',
  '/home': 'home',
  '/app': 'app',
  '/pricing': 'pricing',
  '/blog': 'blog',
  '/story': 'story',
  '/founder-story': 'story',
  '/opinion': 'opinion',
  '/login': 'login',
  '/create': 'create',
  '/create-account': 'create',
  '/privacy': 'privacy',
  '/privacy-policy': 'privacy',
  '/terms': 'terms',
  '/terms-of-service': 'terms',
  '/volunteer-login': 'volunteer-login',
  '/volunteer-signup': 'volunteer-signup',
  '/about': 'about',
  '/our-story': 'about',
  '/volunteers': 'volunteers-info',
  '/volunteers-info': 'volunteers-info',
  '/for-volunteers': 'volunteers-info',
  '/donate': 'donate',
  '/contact': 'contact',
};

const normalizePathname = (pathname: string) => {
  const collapsed = pathname.replace(/\/{2,}/g, '/');
  if (!collapsed) return '/';
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1);
  }
  return collapsed;
};

const parseHashPage = (rawHash: string): AppPage | null => {
  const hash = rawHash.replace(/^#/, '').trim();
  if (!hash) return null;

  const [rawHashPath] = hash.split('?');
  const pathLike = rawHashPath.startsWith('/') ? rawHashPath : `/${rawHashPath}`;
  const normalizedPath = normalizePathname(pathLike.toLowerCase());

  if (PATH_TO_PAGE[normalizedPath]) {
    return PATH_TO_PAGE[normalizedPath];
  }

  const legacyPage = normalizedPath.slice(1);
  if ((Object.keys(PAGE_PATHS) as AppPage[]).includes(legacyPage as AppPage)) {
    return legacyPage as AppPage;
  }

  return null;
};

const resolveCurrentPage = (): AppPage => {
  if (typeof window === 'undefined') return 'home';

  const hashPage = parseHashPage(window.location.hash || '');
  if (hashPage) return hashPage;

  const normalizedPath = normalizePathname(window.location.pathname.toLowerCase());
  return PATH_TO_PAGE[normalizedPath] || 'home';
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<AppPage>('home');

  const navigate = useCallback((page: AppPage) => {
    setCurrentPage(page);

    if (typeof window === 'undefined') return;
    const targetPath = PAGE_PATHS[page] || '/';
    const currentPath = normalizePathname(window.location.pathname.toLowerCase());
    if (currentPath === targetPath && !window.location.hash) return;

    window.history.pushState({ page }, '', targetPath);
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      setCurrentPage(resolveCurrentPage());
    };

    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, []);

  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'Home',
      app: 'App',
      pricing: 'Pricing',
      blog: 'Blog',
      story: 'Founder Story',
      opinion: 'Opinion',
      login: 'Login',
      create: 'Create Account',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      'volunteer-login': 'Volunteer Login',
      'volunteer-signup': 'Volunteer Signup',
      'volunteer-dashboard': 'Volunteer Dashboard',
      about: 'Our Story',
      'volunteers-info': 'Volunteers',
      donate: 'Donate',
      contact: 'Contact'
    };
    document.title = `NexoLink | ${titles[currentPage] || 'Volunteer Smarter'}`;
  }, [currentPage]);

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
        return <PricingPage onNavigate={navigate} />;
      case 'blog':
        return <BlogPage onNavigate={navigate} />;
      case 'story':
        return <FounderStoryPage onNavigate={navigate} />;
      case 'opinion':
        return <OpinionPage onNavigate={navigate} />;
      case 'about':
        return <AboutUsPage onNavigate={navigate} />;
      case 'volunteers-info':
        return <VolunteersInfoPage onNavigate={navigate} />;
      case 'donate':
        return <DonatePage onNavigate={navigate} />;
      case 'contact':
        return <ContactPage onNavigate={navigate} />;
      case 'login':
        return <LoginPage onNavigate={navigate} />;
      case 'create':
        return <CreatePage onNavigate={navigate} />;
      case 'privacy':
        return <PrivacyPolicyPage />;
      case 'terms':
        return <TermsPage />;
      case 'volunteer-login':
        return <VolunteerLoginPage onNavigate={navigate} />;
      case 'volunteer-signup':
        return <VolunteerSignupPage onNavigate={navigate} />;
      case 'home':
      default:
        return (
          <>
            <Hero onNavigate={navigate} />
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
              <CTA onNavigate={navigate} />
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

  const isAuthPage = currentPage === 'login' || currentPage === 'create' || currentPage === 'volunteer-login' || currentPage === 'volunteer-signup';

  return (
    <div className="relative selection:bg-neon selection:text-charcoal bg-transparent font-sans text-charcoal min-h-screen">
      <CustomCursor />
      <Navbar onNavigate={navigate} currentPage={currentPage} />
      
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
             <Footer onNavigate={navigate} />
          </div>
      )}
    </div>
  );
};

export default App;
