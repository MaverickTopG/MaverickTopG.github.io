import React, { useMemo, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StatsCard } from './StatsCard';
import { PromoCard } from './PromoCard';
import { AnalyticsChart } from './AnalyticsChart';
import { TopLogsCard } from './TopLogsCard';
import { PersonalImpactPanel } from './PersonalImpactPanel';
import { RecentActivityTable } from './RecentActivityTable';
import { VolunteersPage } from './VolunteersPage';
import { BillingPage } from './BillingPage';
import { SupportPage } from './SupportPage';
import { WhatsNewPage } from './WhatsNewPage';
import { MessagingPage } from './MessagingPage';
import { VolunteerRequestsPage } from './VolunteerRequestsPage';
import { EventsPage } from './EventsPage';
import { VolunteerEventsPage } from './VolunteerEventsPage';
import { VolunteerActivityPage } from './VolunteerActivityPage';
import { ClusterAIPage } from './ClusterAIPage';
import { CreateEventPage } from './CreateEventPage';
import { KioskModal } from './KioskModal';
import { Users, Clock, Zap, Heart, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVolunteerMetrics } from '../hooks/useVolunteerMetrics';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { resolveOrgContext } from '../lib/orgContext';
import {
  extractVolunteerMembership,
  hasPremiumAccessForMembership,
  hydrateVolunteerMembershipPlans,
  mergeVolunteerMemberships,
  type VolunteerMembership,
} from '../lib/membershipAccess';

interface OrgContextState {
  id: string;
  code: string;
  name: string;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 50 } }
};

const normalizeDashboardPath = (pathname: string) => {
  const collapsed = pathname.replace(/\/{2,}/g, '/');
  if (!collapsed) return '/';
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1);
  }
  return collapsed;
};

const VOLUNTEER_VIEW_TO_PATH: Record<string, string> = {
  impact: '/volunteer',
  activity: '/volunteer/activity',
  'cluster-ai': '/volunteer/cluster-ai',
  events: '/volunteer/events',
  'browse-events': '/volunteer/browse-events',
  messaging: '/volunteer/messaging',
};

const VOLUNTEER_PATH_TO_VIEW: Record<string, string> = {
  '/volunteer': 'impact',
  '/volunteer/impact': 'impact',
  '/volunteer/home': 'impact',
  '/volunteer/activity': 'activity',
  '/volunteer/cluster-ai': 'cluster-ai',
  '/volunteer/cluster': 'cluster-ai',
  '/volunteer/events': 'events',
  '/volunteer/browse-events': 'browse-events',
  '/volunteer/messaging': 'messaging',
};

const resolveVolunteerViewFromPath = (pathname: string) => {
  const normalizedPath = normalizeDashboardPath(pathname.toLowerCase());
  return VOLUNTEER_PATH_TO_VIEW[normalizedPath] || 'impact';
};

export const VolunteerApp: React.FC = () => {
  const [currentView, setCurrentView] = useState(() =>
    typeof window === 'undefined' ? 'impact' : resolveVolunteerViewFromPath(window.location.pathname)
  );
  const [isKioskOpen, setIsKioskOpen] = useState(false);
  const [orgContext, setOrgContext] = useState<OrgContextState>({ id: '', code: '', name: '' });
  const [hasPremiumOrgAccess, setHasPremiumOrgAccess] = useState(false);
  const [hasMessagingAccess, setHasMessagingAccess] = useState(false);
  const hasEventAccess = true;
  const [membershipAccessReady, setMembershipAccessReady] = useState(false);
  const isSyncingFromPopStateRef = React.useRef(false);
  
  const {
    metrics,
    recentLogs,
    weeklySeries,
    monthlySeries,
    yearlySeries,
    allLogs,
    weekOffset,
    setWeekOffset,
    loading,
    userProfile
  } = useVolunteerMetrics();

  const planTier = (userProfile?.plan_tier || userProfile?.planTier || 'orbit').toLowerCase();

  React.useEffect(() => {
    const handlePopState = () => {
      isSyncingFromPopStateRef.current = true;
      setCurrentView(resolveVolunteerViewFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isSyncingFromPopStateRef.current) {
      isSyncingFromPopStateRef.current = false;
      return;
    }
    const targetPath = VOLUNTEER_VIEW_TO_PATH[currentView] || '/volunteer';
    const currentPath = normalizeDashboardPath(window.location.pathname.toLowerCase());
    if (currentPath !== targetPath) {
      window.history.pushState({ view: currentView }, '', targetPath);
    }
  }, [currentView]);

  React.useEffect(() => {
    if (!membershipAccessReady) return;
    if (currentView === 'messaging' && !hasMessagingAccess) {
      setCurrentView('impact');
    }
  }, [currentView, hasMessagingAccess, membershipAccessReady]);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    let unsubscribeMembershipsA: (() => void) | null = null;
    let unsubscribeMembershipsB: (() => void) | null = null;
    let rowsA: Array<{ id: string; data: Record<string, unknown> }> = [];
    let rowsB: Array<{ id: string; data: Record<string, unknown> }> = [];

    const clearMembershipListeners = () => {
      if (unsubscribeMembershipsA) {
        unsubscribeMembershipsA();
        unsubscribeMembershipsA = null;
      }
      if (unsubscribeMembershipsB) {
        unsubscribeMembershipsB();
        unsubscribeMembershipsB = null;
      }
      rowsA = [];
      rowsB = [];
    };

    let recomputeSeq = 0;
    const recomputeAccess = async () => {
      const isMembership = (value: VolunteerMembership | null): value is VolunteerMembership =>
        Boolean(value);
      const memberships = [
        ...rowsA
          .map((entry) => extractVolunteerMembership(entry.data, entry.id, 'user_organizations'))
          .filter(isMembership),
        ...rowsB
          .map((entry) => extractVolunteerMembership(entry.data, entry.id, 'users'))
          .filter(isMembership),
      ];
      const runId = ++recomputeSeq;
      const mergedMemberships = mergeVolunteerMemberships(memberships);
      const hydratedMemberships = await hydrateVolunteerMembershipPlans(db as any, mergedMemberships);
      if (runId !== recomputeSeq) return;
      const canAccessPremium = hydratedMemberships.some(hasPremiumAccessForMembership);
      const canAccessMessaging = canAccessPremium;
      setHasPremiumOrgAccess(canAccessPremium);
      setHasMessagingAccess(canAccessMessaging);
      setMembershipAccessReady(true);
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      clearMembershipListeners();
      if (!user) {
        setHasPremiumOrgAccess(false);
        setHasMessagingAccess(false);
        setMembershipAccessReady(true);
        return;
      }
      setMembershipAccessReady(false);

      unsubscribeMembershipsA = onSnapshot(
        query(collection(db, 'user_organizations'), where('user_id', '==', user.uid)),
        (snapshot) => {
          rowsA = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            data: (docSnap.data() || {}) as Record<string, unknown>,
          }));
          void recomputeAccess();
        },
      );

      unsubscribeMembershipsB = onSnapshot(
        query(collection(db, 'users'), where('user_id', '==', user.uid)),
        (snapshot) => {
          rowsB = snapshot.docs
            .filter((docSnap) => docSnap.id !== user.uid)
            .map((docSnap) => ({
              id: docSnap.id,
              data: (docSnap.data() || {}) as Record<string, unknown>,
            }));
          void recomputeAccess();
        },
      );
    });

    return () => {
      clearMembershipListeners();
      unsubscribeAuth();
    };
  }, []);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOrgContext({ id: '', code: '', name: '' });
        return;
      }
      try {
        const context = await resolveOrgContext(db, user.uid);
        setOrgContext({
          id: context.orgId || '',
          code: context.orgCode || '',
          name: context.orgName || ''
        });
      } catch (error) {
        console.error('Failed to resolve org context', error);
      }
    });
    return () => unsubscribe();
  }, []);

  const formatted = useMemo(() => {
    const formatNumber = (value: number, fraction = 0) =>
      value.toLocaleString(undefined, { maximumFractionDigits: fraction });
    
    return {
      totalHours: formatNumber(metrics.totalHours, 1),
      weeklyHours: formatNumber(metrics.weeklyHours, 1),
      socialImpact: formatNumber(metrics.socialImpact, 0),
      streak: metrics.streak.toString(),
      totalLogs: metrics.totalLogs.toString(),
    };
  }, [metrics]);
  const isClusterView = currentView === 'cluster-ai';
  const isMessagingView = currentView === 'messaging';
  const isCalendarView = currentView === 'events';
  const isBrowseEventsView = currentView === 'browse-events';
  const isPremiumSectionView = isMessagingView || isCalendarView || isBrowseEventsView;
  const shouldMountMessagingView = membershipAccessReady ? hasMessagingAccess : true;
  const shouldMountEventViews = membershipAccessReady ? hasEventAccess : true;

  if (loading) {
    return (
      <div className="w-full h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-lime-300 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium anim-pulse">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen bg-[#F3F4F6] overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        hasPremiumOrgAccess={hasPremiumOrgAccess}
        hasMessagingAccess={hasMessagingAccess}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <main className={`flex-1 overflow-y-auto no-scrollbar ${isClusterView ? 'p-0' : 'p-6 lg:p-8'}`}>
          <div className={isClusterView ? 'w-full h-full' : 'max-w-[1600px] mx-auto'}>
            {/* Header Section */}
            {!isClusterView && (
              <Header 
                isKioskOpen={false} 
                setIsKioskOpen={() => {}} 
                orgContext={orgContext}
                userProfile={userProfile}
                planTier={planTier}
              />
            )}

            <AnimatePresence mode="wait">
              {currentView === 'impact' ? (
                <motion.div
                  key="dashboard"
                  variants={container}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, y: 20 }}
                  className="grid grid-cols-12 gap-6 mt-10"
                >
                  <div className="col-span-12 xl:col-span-9 flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <motion.div variants={item} className="h-full">
                        <StatsCard
                          title="Hours Contributed"
                          value={formatted.totalHours}
                          total=""
                          percentage={0}
                          color="lime"
                          trend={metrics.weeklyHoursByDay}
                          showTotal={false}
                          showMenuDots={false}
                          icon={<Clock className="w-5 h-5 text-gray-800" />}
                        />
                      </motion.div>
                      <motion.div variants={item} className="h-full">
                        <StatsCard
                          title="Total Logs"
                          value={formatted.totalLogs}
                          total=""
                          percentage={0}
                          color="white"
                          trend={metrics.weeklyLogsByDay}
                          showTotal={false}
                          showMenuDots={false}
                          icon={<FileText className="w-5 h-5 text-gray-800" />}
                        />
                      </motion.div>
                      <motion.div variants={item} className="h-full">
                         <TopLogsCard logs={metrics.topLogs} />
                      </motion.div>
                    </div>
                    <motion.div variants={item} className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100/50 min-h-[450px]">
                       <AnalyticsChart 
                         weeklyData={weeklySeries}
                         monthlyData={monthlySeries}
                         yearlyData={yearlySeries}
                         weekOffset={weekOffset}
                         onWeekOffsetChange={setWeekOffset}
                       />
                    </motion.div>

                  </div>

                  <motion.div variants={item} className="col-span-12 xl:col-span-3">
                    <PersonalImpactPanel metrics={metrics} />
                  </motion.div>
                </motion.div>
              ) : currentView === 'activity' ? (
                <motion.div
                  key="activity"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <VolunteerActivityPage />
                </motion.div>
              ) : currentView === 'cluster-ai' ? (
                <motion.div
                  key="cluster-ai"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  <ClusterAIPage allLogs={allLogs} />
                </motion.div>
              ) : isPremiumSectionView ? null : (
                <div key="empty" className="flex items-center justify-center h-[60vh] text-gray-400">
                  Coming Soon
                </div>
              )}
            </AnimatePresence>

            {(shouldMountMessagingView || shouldMountEventViews) && (
              <>
                {shouldMountMessagingView && (
                  <div className={isMessagingView ? 'mt-10' : 'hidden'} aria-hidden={!isMessagingView}>
                    <MessagingPage />
                  </div>
                )}
                {shouldMountEventViews && (
                  <>
                    <div className={isCalendarView ? 'mt-10' : 'hidden'} aria-hidden={!isCalendarView}>
                      <EventsPage
                        onNavigate={setCurrentView}
                        orgContext={orgContext}
                        userProfile={userProfile}
                      />
                    </div>
                    <div className={isBrowseEventsView ? 'mt-10' : 'hidden'} aria-hidden={!isBrowseEventsView}>
                      <VolunteerEventsPage userProfile={userProfile} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
