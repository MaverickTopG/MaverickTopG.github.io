import React, { useMemo, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StatsCard } from './StatsCard';
import { PromoCard } from './PromoCard';
import { AnalyticsChart } from './AnalyticsChart';
import { RightPanel } from './RightPanel';
import { VolunteersPage } from './VolunteersPage';
import { BillingPage } from './BillingPage';
import { AccountPage } from './AccountPage';
import { CreateSubAdminPage } from './CreateSubAdminPage';
import { SupportPage } from './SupportPage';
import { MessagingPage } from './MessagingPage';
import { VolunteerRequestsPage } from './VolunteerRequestsPage';
import { EventsPage } from './EventsPage';
import { CreateEventPage } from './CreateEventPage';
import { NebulaePage } from './NebulaePage';
import { KioskModal } from './KioskModal';
import { AiInsightWidget } from './AiInsightWidget';
import { SignInPage } from './SignInPage';
import { Toast } from './Toast';
import { useGeminiInsight } from '../hooks/useGeminiInsight';
import { useNebulaeOpsCenter } from '../hooks/useNebulaeOpsCenter';
import { Users, Clock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { resolveOrgAdminContext } from '../lib/orgContext';
import { doc, getDoc } from 'firebase/firestore';

interface OrgContextState {
  id: string;
  code: string;
  name: string;
  planTier: string | null;
}
type NebulaeContextScope = 'superadmin-only' | 'include-subadmins';

interface ActiveSubAdminSession {
  subAdminId: string;
  email: string;
  displayName?: string;
  groupId: string;
  groupName?: string;
  startedAt?: any;
}

const SUBADMIN_SESSION_STORAGE_KEY = 'nexolink_active_sub_admin_session';

const DEFAULT_ORBIT_PRICE_ORG_MONTHLY = 'price_1SykFNHbGg7F5Ky7KypyxNOa';
const DEFAULT_ORBIT_PRICE_ORG_YEARLY = 'price_1SykGwHbGg7F5Ky7UwpYUilP';
const DEFAULT_ORBIT_PRICE_SCHOOL_MONTHLY = 'price_1SykGwHbGg7F5Ky7cKrxejRT';
const DEFAULT_ORBIT_PRICE_SCHOOL_YEARLY = 'price_1SykGwHbGg7F5Ky7uQQIQWZr';
const DEFAULT_NEBULA_PRICE_ORG_MONTHLY = 'price_1SykHFHbGg7F5Ky7fAX535eH';
const DEFAULT_NEBULA_PRICE_ORG_YEARLY = 'price_1SykIOHbGg7F5Ky7Mlkx1McR';
const DEFAULT_NEBULA_PRICE_SCHOOL_MONTHLY = 'price_1SykIOHbGg7F5Ky7rHxtzTGr';
const DEFAULT_NEBULA_PRICE_SCHOOL_YEARLY = 'price_1SykIOHbGg7F5Ky7bxPaZPKe';
const DEFAULT_COSMOS_PRICE_ORG_MONTHLY = 'price_1SykIdHbGg7F5Ky7U7BUG1B0';
const DEFAULT_COSMOS_PRICE_ORG_YEARLY = 'price_1SykJaHbGg7F5Ky7HI8bt66o';
const DEFAULT_COSMOS_PRICE_SCHOOL_MONTHLY = 'price_1SykJaHbGg7F5Ky7AlBLBDns';
const DEFAULT_COSMOS_PRICE_SCHOOL_YEARLY = 'price_1SykJaHbGg7F5Ky7VOTb79OH';

const container: any = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item: any = {
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

const ADMIN_VIEW_TO_PATH: Record<string, string> = {
  login: '/admin/login',
  impact: '/admin',
  requests: '/admin/requests',
  volunteers: '/admin/volunteers',
  messaging: '/admin/messaging',
  events: '/admin/events',
  'create-event': '/admin/create-event',
  nebulae: '/admin/nebulae',
  support: '/admin/support',
  billing: '/admin/billing',
  account: '/admin/account',
  'create-subadmin': '/admin/account/create-subadmin',
};

const ADMIN_PATH_TO_VIEW: Record<string, string> = {
  '/admin': 'impact',
  '/admin/impact': 'impact',
  '/admin/home': 'impact',
  '/admin/login': 'login',
  '/admin/requests': 'requests',
  '/admin/volunteers': 'volunteers',
  '/admin/messaging': 'messaging',
  '/admin/events': 'events',
  '/admin/create-event': 'create-event',
  '/admin/nebulae': 'nebulae',
  '/admin/cluster': 'nebulae',
  '/admin/support': 'support',
  '/admin/billing': 'billing',
  '/admin/account': 'account',
  '/admin/account/create-subadmin': 'create-subadmin',
  // Backward-compatible aliases.
  '/admin/create': 'billing',
};

const resolveAdminViewFromPath = (pathname: string) => {
  const normalizedPath = normalizeDashboardPath(pathname.toLowerCase());
  return ADMIN_PATH_TO_VIEW[normalizedPath] || 'impact';
};

const readStoredSubAdminSession = (): ActiveSubAdminSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SUBADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSubAdminSession;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.groupId) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

export const AdminApp: React.FC = () => {
  const [currentView, setCurrentView] = useState(() =>
    typeof window === 'undefined' ? 'impact' : resolveAdminViewFromPath(window.location.pathname)
  );
  const [isKioskOpen, setIsKioskOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orgContext, setOrgContext] = useState<OrgContextState>({ id: '', code: '', name: '', planTier: null });
  const [activeSubAdminSession, setActiveSubAdminSession] = useState<ActiveSubAdminSession | null>(() => readStoredSubAdminSession());
  const [isSubAdmin, setIsSubAdmin] = useState(false);
  const [showOrganizationImpactMode, setShowOrganizationImpactMode] = useState(false);
  const [impactModeToast, setImpactModeToast] = useState<{ isVisible: boolean; message: string }>({
    isVisible: false,
    message: '',
  });
  const [nebulaeContextScope, setNebulaeContextScope] = useState<NebulaeContextScope>('superadmin-only');
  const aiEnabled = true;
  const [insightUpdatedAt, setInsightUpdatedAt] = useState(() => Date.now());
  const isSubAdminPortal = isSubAdmin || Boolean(activeSubAdminSession?.groupId);
  const showVolunteers = currentView === 'volunteers';
  const showEvents = currentView === 'events';
  const showRequests = currentView === 'requests';
  const showMessaging = currentView === 'messaging';
  const showBilling = !isSubAdminPortal && currentView === 'billing';
  const isFullBleedView =
    currentView === 'nebulae' ||
    currentView === 'create-subadmin';
  const showPreloaded = showVolunteers || showEvents || showRequests || showMessaging || showBilling;
  const isSyncingFromPopStateRef = React.useRef(false);
  const volunteersControls = useAnimation();
  const eventsControls = useAnimation();
  const requestsControls = useAnimation();
  const messagingControls = useAnimation();
  const billingControls = useAnimation();
  const {
    orgCode: metricsOrgCode,
    orgId: metricsOrgId,
    activityLogs,
    metrics,
    volunteers,
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
  } = useDashboardMetrics({
    includeAllScopes: showOrganizationImpactMode && !isSubAdminPortal,
  });
  const nebulaeOps = useNebulaeOpsCenter({
    enabled: aiEnabled,
    orgCode: metricsOrgCode,
    orgId: metricsOrgId,
    volunteers,
    activityLogs,
    contextScope: nebulaeContextScope,
  });

  const stripePriceIds = useMemo(() => {
    const globalConfig = (window as unknown as Record<string, string | undefined>);
    return {
      orbitOrgMonthly: globalConfig.ORBIT_PRICE_ORG_MONTHLY || (import.meta as any).env.ORBIT_PRICE_ORG_MONTHLY || DEFAULT_ORBIT_PRICE_ORG_MONTHLY,
      orbitOrgYearly: globalConfig.ORBIT_PRICE_ORG_YEARLY || (import.meta as any).env.ORBIT_PRICE_ORG_YEARLY || DEFAULT_ORBIT_PRICE_ORG_YEARLY,
      orbitSchoolMonthly: globalConfig.ORBIT_PRICE_SCHOOL_MONTHLY || (import.meta as any).env.ORBIT_PRICE_SCHOOL_MONTHLY || DEFAULT_ORBIT_PRICE_SCHOOL_MONTHLY,
      orbitSchoolYearly: globalConfig.ORBIT_PRICE_SCHOOL_YEARLY || (import.meta as any).env.ORBIT_PRICE_SCHOOL_YEARLY || DEFAULT_ORBIT_PRICE_SCHOOL_YEARLY,
      nebulaOrgMonthly: globalConfig.NEBULA_PRICE_ORG_MONTHLY || (import.meta as any).env.NEBULA_PRICE_ORG_MONTHLY || DEFAULT_NEBULA_PRICE_ORG_MONTHLY,
      nebulaOrgYearly: globalConfig.NEBULA_PRICE_ORG_YEARLY || (import.meta as any).env.NEBULA_PRICE_ORG_YEARLY || DEFAULT_NEBULA_PRICE_ORG_YEARLY,
      nebulaSchoolMonthly: globalConfig.NEBULA_PRICE_SCHOOL_MONTHLY || (import.meta as any).env.NEBULA_PRICE_SCHOOL_MONTHLY || DEFAULT_NEBULA_PRICE_SCHOOL_MONTHLY,
      nebulaSchoolYearly: globalConfig.NEBULA_PRICE_SCHOOL_YEARLY || (import.meta as any).env.NEBULA_PRICE_SCHOOL_YEARLY || DEFAULT_NEBULA_PRICE_SCHOOL_YEARLY,
      cosmosOrgMonthly: globalConfig.COSMOS_PRICE_ORG_MONTHLY || (import.meta as any).env.COSMOS_PRICE_ORG_MONTHLY || DEFAULT_COSMOS_PRICE_ORG_MONTHLY,
      cosmosOrgYearly: globalConfig.COSMOS_PRICE_ORG_YEARLY || (import.meta as any).env.COSMOS_PRICE_ORG_YEARLY || DEFAULT_COSMOS_PRICE_ORG_YEARLY,
      cosmosSchoolMonthly: globalConfig.COSMOS_PRICE_SCHOOL_MONTHLY || (import.meta as any).env.COSMOS_PRICE_SCHOOL_MONTHLY || DEFAULT_COSMOS_PRICE_SCHOOL_MONTHLY,
      cosmosSchoolYearly: globalConfig.COSMOS_PRICE_SCHOOL_YEARLY || (import.meta as any).env.COSMOS_PRICE_SCHOOL_YEARLY || DEFAULT_COSMOS_PRICE_SCHOOL_YEARLY,
    };
  }, []);

  const derivePlanTier = (subscription: any) => {
    const key = (
      subscription?.metadata?.plan_key
      || subscription?.metadata?.planKey
      || subscription?.plan?.metadata?.plan_key
      || subscription?.plan?.metadata?.planKey
    );
    if (typeof key === 'string') {
      const normalized = key.toLowerCase();
      if (['orbit', 'nebula', 'cosmos'].includes(normalized)) return normalized;
    }
    const priceId = subscription?.items?.data?.[0]?.price?.id
      || subscription?.plan?.id
      || subscription?.plan
      || null;
    if (!priceId) return null;
    const orbitIds = [
      stripePriceIds.orbitOrgMonthly,
      stripePriceIds.orbitOrgYearly,
      stripePriceIds.orbitSchoolMonthly,
      stripePriceIds.orbitSchoolYearly
    ];
    const nebulaIds = [
      stripePriceIds.nebulaOrgMonthly,
      stripePriceIds.nebulaOrgYearly,
      stripePriceIds.nebulaSchoolMonthly,
      stripePriceIds.nebulaSchoolYearly
    ];
    const cosmosIds = [
      stripePriceIds.cosmosOrgMonthly,
      stripePriceIds.cosmosOrgYearly,
      stripePriceIds.cosmosSchoolMonthly,
      stripePriceIds.cosmosSchoolYearly
    ];
    if (orbitIds.includes(priceId)) return 'orbit';
    if (nebulaIds.includes(priceId)) return 'nebula';
    if (cosmosIds.includes(priceId)) return 'cosmos';
    return null;
  };

  React.useEffect(() => {
    const handlePopState = () => {
      isSyncingFromPopStateRef.current = true;
      setCurrentView(resolveAdminViewFromPath(window.location.pathname));
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
    const blockedSubAdminViews = new Set(['billing', 'account', 'create-subadmin']);
    const effectiveView = isSubAdminPortal && blockedSubAdminViews.has(currentView) ? 'impact' : currentView;
    const targetPath = ADMIN_VIEW_TO_PATH[effectiveView] || '/admin';
    const currentPath = normalizeDashboardPath(window.location.pathname.toLowerCase());
    if (currentPath !== targetPath) {
      window.history.pushState({ view: effectiveView }, '', targetPath);
    }
  }, [currentView, isSubAdminPortal]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSessionEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail || null;
      if (!detail) {
        window.sessionStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
        setActiveSubAdminSession(null);
        return;
      }
      try {
        window.sessionStorage.setItem(SUBADMIN_SESSION_STORAGE_KEY, JSON.stringify(detail));
      } catch (_error) {
        // Ignore storage failures.
      }
      setActiveSubAdminSession(detail as ActiveSubAdminSession);
    };
    window.addEventListener('nexolink:subadmin-session', handleSessionEvent as EventListener);
    setActiveSubAdminSession(readStoredSubAdminSession());
    return () => {
      window.removeEventListener('nexolink:subadmin-session', handleSessionEvent as EventListener);
    };
  }, []);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    let refreshTimer: number | null = null;
    let active = true;

    const refreshOrgContext = async (user: any) => {
      try {
        const context = await resolveOrgAdminContext(db, user.uid);
        if (!active) return;

        const session = readStoredSubAdminSession();
        const nextContext: OrgContextState = {
          id: context.orgId || '',
          code: '',
          name: context.orgName || '',
          planTier: null,
        };

        setOrgContext(nextContext);

        if (session && session.groupId) {
          setActiveSubAdminSession(session);
        } else {
          setActiveSubAdminSession(null);
        }
      } catch (error) {
        console.error('Failed to resolve org context', error);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setOrgContext({ id: '', code: '', name: '', planTier: null });
        setActiveSubAdminSession(null);
        window.sessionStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
        if (refreshTimer) window.clearInterval(refreshTimer);
        setAuthLoading(false);
        return;
      }

      try {
        const idTokenResult = await u.getIdTokenResult();
        const isSubAdminClaim = !!(idTokenResult.claims.sub_admin || idTokenResult.claims.isSubAdmin);
        setIsSubAdmin(isSubAdminClaim);
        
        await refreshOrgContext(u);

        // Robust subadmin session detection
        if (isSubAdminClaim) {
          const stored = readStoredSubAdminSession();
          if (!stored) {
            // Synthesize from user doc if storage is lost but we have the claim
            const userSnap = await getDoc(doc(db, 'users', u.uid));
            const userData = userSnap.data() || {};
            if (userData.activeSubAdminId) {
              const synthesized: ActiveSubAdminSession = {
                subAdminId: String(userData.activeSubAdminId),
                email: String(userData.activeSubAdminEmail || u.email || ''),
                displayName: String(userData.activeSubAdminDisplayName || ''),
                groupId: String(userData.activeSubAdminGroupId || ''),
                groupName: String(userData.activeSubAdminGroupName || ''),
                startedAt: userData.activeSubAdminStartedAt || Date.now(),
              };
              window.sessionStorage.setItem(SUBADMIN_SESSION_STORAGE_KEY, JSON.stringify(synthesized));
              setActiveSubAdminSession(synthesized);
            }
          }
        }

        if (refreshTimer) window.clearInterval(refreshTimer);
        refreshTimer = window.setInterval(() => {
          refreshOrgContext(u);
        }, 30000);
      } catch (error) {
        console.error('Failed to resolve auth context', error);
      } finally {
        setAuthLoading(false);
      }
    });
    return () => {
      active = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCurrentView('login');
    } else if (currentView === 'login') {
      setCurrentView(resolveAdminViewFromPath(window.location.pathname));
    }
  }, [authLoading, user, currentView]);

  React.useEffect(() => {
    if (!isSubAdminPortal) return;
    if (currentView === 'billing' || currentView === 'account' || currentView === 'create-subadmin') {
      setCurrentView('impact');
    }
    setShowOrganizationImpactMode(false);
    setNebulaeContextScope('superadmin-only');
  }, [currentView, isSubAdminPortal]);

  React.useEffect(() => {
    if (showVolunteers) {
      volunteersControls.set({ opacity: 0, y: 20 });
      volunteersControls.start({ opacity: 1, y: 0, transition: { duration: 0.3 } });
    } else {
      volunteersControls.start({ opacity: 0, y: -20, transition: { duration: 0.3 } });
    }
  }, [showVolunteers, volunteersControls]);

  React.useEffect(() => {
    if (showEvents) {
      eventsControls.set({ opacity: 0, y: 20 });
      eventsControls.start({ opacity: 1, y: 0, transition: { duration: 0.3 } });
    } else {
      eventsControls.start({ opacity: 0, y: -20, transition: { duration: 0.3 } });
    }
  }, [eventsControls, showEvents]);

  React.useEffect(() => {
    if (showRequests) {
      requestsControls.set({ opacity: 0, y: 20 });
      requestsControls.start({ opacity: 1, y: 0, transition: { duration: 0.3 } });
    } else {
      requestsControls.start({ opacity: 0, y: -20, transition: { duration: 0.3 } });
    }
  }, [requestsControls, showRequests]);

  React.useEffect(() => {
    if (showMessaging) {
      messagingControls.set({ opacity: 0, y: 20 });
      messagingControls.start({ opacity: 1, y: 0, transition: { duration: 0.3 } });
    } else {
      messagingControls.start({ opacity: 0, y: -20, transition: { duration: 0.3 } });
    }
  }, [messagingControls, showMessaging]);

  React.useEffect(() => {
    if (showBilling) {
      billingControls.set({ opacity: 0, y: 20 });
      billingControls.start({ opacity: 1, y: 0, transition: { duration: 0.3 } });
    } else {
      billingControls.start({ opacity: 0, y: -20, transition: { duration: 0.3 } });
    }
  }, [billingControls, showBilling]);

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

  const impactInsights = useMemo(() => {
    const totalVolunteers = metrics.totalVolunteers || 0;
    const totalHours = metrics.totalHours || 0;
    const monthlyHours = metrics.monthlyHours || 0;
    const weeklyActive = metrics.weeklyActive || 0;
    const engagementRate = totalVolunteers ? Math.round((weeklyActive / totalVolunteers) * 100) : 0;
    const retentionSignal = retentionRate || 0;
    const topName = topVolunteers[0]
      ? `${topVolunteers[0].firstName || ''} ${topVolunteers[0].lastName || ''}`.trim()
      : '';

    const summary = totalVolunteers
      ? `${weeklyActive} active · ${monthlyHours.toLocaleString()} hrs this month · ${totalVolunteers.toLocaleString()} total`
      : 'Waiting on verified hours';

    return {
      summary,
      totalVolunteers,
      totalHours,
      monthlyHours,
      weeklyActive,
      engagementRate,
      retentionSignal,
      topName,
    };
  }, [metrics, retentionRate, topVolunteers]);

  const impactFallback = useMemo(
    () => ({
      summary: impactInsights.summary,
      sections: [
        {
          title: 'Grant Story',
          items: [
            {
              label: 'Draft',
              value: impactInsights.totalVolunteers ? 'Ready' : 'Pending',
              tone: impactInsights.totalVolunteers ? 'ok' : 'info',
              helper: impactInsights.topName ? `Quote: ${impactInsights.topName}` : undefined,
            },
          ],
        },
        {
          title: 'Retention',
          items: [
            {
              label: 'Projected',
              value: `${impactInsights.retentionSignal}%`,
              tone: impactInsights.retentionSignal >= 70 ? 'ok' : 'warning',
              helper: `Engagement ${impactInsights.engagementRate}%`,
            },
          ],
        },
        {
          title: 'Compliance + Equity',
          items: [
            {
              label: 'Verification',
              value: 'Active',
              tone: 'ok',
            },
            {
              label: 'Equity',
              value: 'Tracking',
              tone: 'info',
            },
          ],
        },
      ],
    }),
    [impactInsights],
  );

  const impactSource = useMemo(
    () => ({
      totalVolunteers: impactInsights.totalVolunteers,
      totalHours: impactInsights.totalHours,
      monthlyHours: impactInsights.monthlyHours,
      weeklyActive: impactInsights.weeklyActive,
      retentionRate: impactInsights.retentionSignal,
      engagementRate: impactInsights.engagementRate,
    }),
    [impactInsights],
  );

  const { insight: impactAiInsight } = useGeminiInsight({
    enabled: aiEnabled && currentView === 'impact',
    pageKey: 'impact',
    sourceData: impactSource,
    fallback: impactFallback as any,
  });

  React.useEffect(() => {
    setInsightUpdatedAt(Date.now());
  }, [
    metrics.totalVolunteers,
    metrics.totalHours,
    metrics.monthlyHours,
    metrics.weeklyActive,
    retentionRate,
    topVolunteers,
  ]);

  const insightUpdatedLabel = useMemo(() => {
    const time = new Date(insightUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Live refresh · ${time}`;
  }, [insightUpdatedAt]);

  const openImpactOverview = () => {
    setCurrentView('impact');
    setShowOrganizationImpactMode((prev) => {
      const next = !prev;
      setImpactModeToast({
        isVisible: true,
        message: next ? 'Organization Impact Mode Enabled' : 'Organization Impact Mode Disabled',
      });
      return next;
    });
  };

  React.useEffect(() => {
    if (isSubAdminPortal) {
      setShowOrganizationImpactMode(false);
    }
  }, [isSubAdminPortal]);

  if (authLoading) {
    return (
      <div className="w-full h-screen bg-[#F3F4F6] flex flex-col items-center justify-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="text-gray-900"
        >
          <Loader2 className="w-10 h-10" />
        </motion.div>
        <p className="text-gray-500 font-medium animate-pulse">Authenticating secure session...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <SignInPage
        onSignIn={() => {
          setCurrentView('impact');
          try {
            window.history.pushState({ view: 'impact' }, '', '/admin');
          } catch (_error) {
            // Ignore.
          }
        }}
        onBack={() => {
          window.location.href = '/';
        }}
      />
    );
  }

  const sidebarPortalName = activeSubAdminSession?.groupName || orgContext.name;
  const sidebarPortalSubtitle = isSubAdminPortal
    ? `Super Admin: ${orgContext.name || 'Organization'}`
    : '';

  return (
    <div className="flex w-full h-screen bg-[#F3F4F6] overflow-hidden">
      {/* Left Sidebar */}
      {!isKioskOpen && (
        <Sidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          portalName={sidebarPortalName}
          portalSubtitle={sidebarPortalSubtitle}
          isSubAdminPortal={isSubAdminPortal}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <main className={`flex-1 overflow-y-auto no-scrollbar ${isFullBleedView ? '' : 'p-6 lg:p-8'}`}>
          <div className={`${isFullBleedView ? 'h-full' : 'max-w-[1600px] mx-auto'} relative`}>
            {/* Header Section */}
            {!isFullBleedView && (
              <Header
                isKioskOpen={isKioskOpen}
                setIsKioskOpen={setIsKioskOpen}
                orgContext={orgContext}
                isSubAdminPortal={isSubAdminPortal}
                onOpenImpactOverview={openImpactOverview}
                showImpactOverviewButton={!isSubAdminPortal}
                impactOverviewActive={showOrganizationImpactMode}
              />
            )}

            {!showPreloaded && (
              <AnimatePresence mode="wait">
                {currentView === 'impact' ? (
                <>
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

                  {aiEnabled && (
                    <AiInsightWidget
                      title="Impact Mission Control"
                      subtitle="Live grant + retention"
                      summary={impactAiInsight.summary}
                      pillLabel={`Retention ${impactInsights.retentionSignal}%`}
                      updatedLabel={insightUpdatedLabel}
                      sections={impactAiInsight.sections as any}
                      onOpenCopilot={() => setCurrentView('nebulae')}
                      copilotPrompt="Explain this impact summary in detail and suggest 3 next actions to improve volunteer engagement and grant readiness."
                    />
                  )}
                </>
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
                  <NebulaePage
                    aiEnabled={aiEnabled}
                    opsCenter={aiEnabled ? nebulaeOps : null}
                    contextScope={nebulaeContextScope}
                    onContextScopeChange={setNebulaeContextScope}
                    isSubAdminPortal={isSubAdminPortal}
                  />
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
              ) : currentView === 'account' && !isSubAdminPortal ? (
                <motion.div
                  key="account"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <AccountPage onOpenCreateSubAdmin={() => setCurrentView('create-subadmin')} />
                </motion.div>
              ) : currentView === 'create-subadmin' && !isSubAdminPortal ? (
                <motion.div
                  key="create-subadmin"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  <CreateSubAdminPage onBack={() => setCurrentView('account')} onCreated={() => setCurrentView('account')} />
                </motion.div>
              ) : (
                <div key="empty" className="flex items-center justify-center h-[60vh] text-gray-400">
                  Coming Soon
                </div>
              )}
              </AnimatePresence>
            )}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={volunteersControls}
              className={`w-full ${showVolunteers ? '' : 'pointer-events-none'}`}
              style={{
                display: showVolunteers ? 'block' : 'none',
              }}
              aria-hidden={!showVolunteers}
            >
              <VolunteersPage
                isActive={showVolunteers}
                aiEnabled={aiEnabled}
                onOpenCopilot={() => setCurrentView('nebulae')}
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={eventsControls}
              className={`w-full ${showEvents ? '' : 'pointer-events-none'}`}
              style={{
                display: showEvents ? 'block' : 'none',
              }}
              aria-hidden={!showEvents}
            >
              <EventsPage
                onNavigate={setCurrentView}
                isActive={showEvents}
                aiEnabled={aiEnabled}
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={requestsControls}
              className={`w-full ${showRequests ? '' : 'pointer-events-none'}`}
              style={{
                display: showRequests ? 'block' : 'none',
              }}
              aria-hidden={!showRequests}
            >
              <VolunteerRequestsPage />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={messagingControls}
              className={`w-full ${showMessaging ? '' : 'pointer-events-none'}`}
              style={{
                display: showMessaging ? 'block' : 'none',
              }}
              aria-hidden={!showMessaging}
            >
              <MessagingPage isActive={showMessaging} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={billingControls}
              className={`w-full ${showBilling ? '' : 'pointer-events-none'}`}
              style={{
                display: showBilling ? 'block' : 'none',
              }}
              aria-hidden={!showBilling}
            >
              <BillingPage />
            </motion.div>
          </div>
        </main>
      </div>
      {/* Kiosk Modal */}
      {!isSubAdminPortal && isKioskOpen && (
        <KioskModal 
          isOpen={isKioskOpen} 
          onClose={() => setIsKioskOpen(false)} 
          orgContext={orgContext}
        />
      )}
      <Toast
        isVisible={impactModeToast.isVisible}
        message={impactModeToast.message}
        type="success"
        onClose={() => setImpactModeToast({ isVisible: false, message: '' })}
      />
    </div>
  );
};
