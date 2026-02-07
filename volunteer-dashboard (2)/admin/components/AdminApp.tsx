import React, { useMemo, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StatsCard } from './StatsCard';
import { PromoCard } from './PromoCard';
import { AnalyticsChart } from './AnalyticsChart';
import { RightPanel } from './RightPanel';
import { VolunteersPage } from './VolunteersPage';
import { BillingPage } from './BillingPage';
import { SupportPage } from './SupportPage';
import { MessagingPage } from './MessagingPage';
import { VolunteerRequestsPage } from './VolunteerRequestsPage';
import { EventsPage } from './EventsPage';
import { CreateEventPage } from './CreateEventPage';
import { NebulaePage } from './NebulaePage';
import { KioskModal } from './KioskModal';
import { Users, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
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

export const AdminApp: React.FC = () => {
  const [currentView, setCurrentView] = useState('impact');
  const [isKioskOpen, setIsKioskOpen] = useState(false);
  const [orgContext, setOrgContext] = useState<OrgContextState>({ id: '', code: '', name: '' });
  const {
    metrics,
    topVolunteers,
    weeklySeries,
    monthlySeries,
    yearlySeries,
    recentHours,
    recentVolunteers,
    weekOffset,
    setWeekOffset,
    retentionRate,
    topVolunteerMonthLabel,
  } = useDashboardMetrics();

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
    const calcDeltaPercent = (series: number[]) => {
      if (!series || series.length < 2) return 0;
      const current = series[series.length - 1] || 0;
      const previous = series[series.length - 2] || 0;
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };
    const volunteersDelta = calcDeltaPercent(recentVolunteers);
    const hoursDelta = calcDeltaPercent(recentHours);
    return {
      activeVolunteers: formatNumber(metrics.weeklyActive),
      totalVolunteers: formatNumber(metrics.totalVolunteers),
      activePercent: volunteersDelta,
      weeklyHours: formatNumber(metrics.totalHours, 1),
      totalHours: formatNumber(metrics.totalHours, 1),
      hoursPercent: hoursDelta,
    };
  }, [metrics, recentHours, recentVolunteers]);

  return (
    <div className="flex w-full h-screen bg-[#F3F4F6] overflow-hidden">
      {/* Left Sidebar */}
      {!isKioskOpen && <Sidebar currentView={currentView} onNavigate={setCurrentView} />}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <main className={`flex-1 overflow-y-auto no-scrollbar ${currentView === 'nebulae' ? '' : 'p-6 lg:p-8'}`}>
          <div className={`${currentView === 'nebulae' ? 'h-full' : 'max-w-[1600px] mx-auto'}`}>
            {/* Header Section */}
            {currentView !== 'nebulae' && (
              <Header 
                isKioskOpen={isKioskOpen} 
                setIsKioskOpen={setIsKioskOpen} 
                orgContext={orgContext}
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
                  {/* Left Column (Main Dashboard) */}
                  <div className="col-span-12 xl:col-span-9 flex flex-col gap-6">
                    {/* Top Row: Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <motion.div variants={item} className="h-full">
                        <StatsCard
                          title="Volunteers"
                          value={formatted.totalVolunteers}
                          total=""
                          percentage={0}
                          color="white"
                          trend={recentVolunteers}
                          showTotal={false}
                          showMenuDots={false}
                          icon={<Users className="w-5 h-5 text-gray-700" />}
                        />
                      </motion.div>
                      <motion.div variants={item} className="h-full">
                        <StatsCard
                          title="Hours Contributed"
                          value={formatted.weeklyHours}
                          total={`${formatted.totalHours} hrs`}
                          percentage={formatted.hoursPercent}
                          color="lime"
                          trend={recentHours}
                          showTotal={false}
                          showMenuDots={false}
                          icon={<Clock className="w-5 h-5 text-gray-800" />}
                        />
                      </motion.div>
                      <motion.div variants={item} className="h-full">
                        <PromoCard volunteers={topVolunteers} monthLabel={topVolunteerMonthLabel} />
                      </motion.div>
                    </div>

                    {/* Bottom Row: Chart */}
                    <motion.div variants={item} className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100/50 flex-1 min-h-[400px]">
                      <AnalyticsChart
                        weeklyData={weeklySeries}
                        monthlyData={monthlySeries}
                        yearlyData={yearlySeries}
                        weekOffset={weekOffset}
                        onWeekOffsetChange={setWeekOffset}
                      />
                    </motion.div>
                  </div>

                  {/* Right Column (Quick Links) */}
                  <motion.div variants={item} className="col-span-12 xl:col-span-3">
                    <RightPanel
                      monthlyHours={metrics.monthlyHours}
                      busiestDay={metrics.busiestDay}
                      avgWeeklyHours={metrics.avgWeeklyHoursPerVolunteer}
                      weeklyHoursByDay={metrics.weeklyHoursByDay}
                      retentionRate={retentionRate}
                      weeklyActive={metrics.weeklyActive}
                    />
                  </motion.div>
                </motion.div>
              ) : currentView === 'volunteers' ? (
                <motion.div
                  key="volunteers"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <VolunteersPage />
                </motion.div>
              ) : currentView === 'requests' ? (
                <motion.div
                  key="requests"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <VolunteerRequestsPage />
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
                  <EventsPage onNavigate={setCurrentView} />
                </motion.div>
              ) : currentView === 'create-event' ? (
                <motion.div
                  key="create-event"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <CreateEventPage onBack={() => setCurrentView('events')} />
                </motion.div>
              ) : currentView === 'nebulae' ? (
                <motion.div
                  key="nebulae"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  <NebulaePage />
                </motion.div>
              ) : currentView === 'billing' ? (
                <motion.div
                  key="billing"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <BillingPage />
                </motion.div>
              ) : currentView === 'support' ? (
                <motion.div
                  key="support"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <SupportPage />
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
      {/* Kiosk Modal */}
      {isKioskOpen && (
        <KioskModal 
          isOpen={isKioskOpen} 
          onClose={() => setIsKioskOpen(false)} 
          orgContext={orgContext}
        />
      )}
    </div>
  );
};
