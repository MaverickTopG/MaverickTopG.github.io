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
import { CreateEventPage } from './CreateEventPage';
import { KioskModal } from './KioskModal';
import { Users, Clock, Zap, Heart, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVolunteerMetrics } from '../hooks/useVolunteerMetrics';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { resolveOrgContext } from '../lib/orgContext';

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

export const VolunteerApp: React.FC = () => {
  const [currentView, setCurrentView] = useState('impact');
  const [isKioskOpen, setIsKioskOpen] = useState(false);
  const [orgContext, setOrgContext] = useState<OrgContextState>({ id: '', code: '', name: '' });
  
  const {
    metrics,
    recentLogs,
    weeklySeries,
    monthlySeries,
    yearlySeries,
    weekOffset,
    setWeekOffset,
    loading,
    userProfile
  } = useVolunteerMetrics();

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
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <main className="flex-1 overflow-y-auto no-scrollbar p-6 lg:p-8">
          <div className="max-w-[1600px] mx-auto">
            {/* Header Section */}
            <Header 
              isKioskOpen={false} 
              setIsKioskOpen={() => {}} 
              orgContext={orgContext}
              userProfile={userProfile}
            />

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
                    </div>                    <motion.div variants={item} className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100/50 min-h-[450px]">
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
              ) : currentView === 'messaging' ? (
                <motion.div
                  key="messaging"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <MessagingPage />
                </motion.div>
              ) : currentView === 'events' ? (
                <motion.div
                  key="events"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <EventsPage 
                    onNavigate={setCurrentView} 
                    orgContext={orgContext}
                    userProfile={userProfile}
                  />
                </motion.div>
              ) : currentView === 'browse-events' ? (
                <motion.div
                  key="browse-events"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <VolunteerEventsPage userProfile={userProfile} />
                </motion.div>
              ) : (
                <div key="empty" className="flex items-center justify-center h-[60vh] text-gray-400">
                  Coming Soon
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};
