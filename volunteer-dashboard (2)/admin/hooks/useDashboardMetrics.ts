import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { getActiveSubAdminSession, subscribeToOrgAdminContext } from '../lib/orgContext';
import {
  computeDashboardMetrics,
  computeVolunteerHours,
  buildWeeklySeries,
  buildMonthlySeries,
  buildYearlySeries,
  buildLastNDaysSeries,
  normalizeDateValue,
  type ActivityLog,
  type VolunteerRecord,
  type DashboardMetrics,
  type ChartPoint,
} from '../lib/metrics';

type MetricsState = {
  loading: boolean;
  error: string | null;
  orgCode: string;
  orgId: string;
  activityLogs: ActivityLog[];
  metrics: DashboardMetrics;
  volunteers: VolunteerRecord[];
  topVolunteers: VolunteerRecord[];
  weeklySeries: ChartPoint[];
  monthlySeries: ChartPoint[];
  yearlySeries: ChartPoint[];
  recentHours: number[];
  recentVolunteers: number[];
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  retentionRate: number;
  topVolunteerMonthLabel: string;
};

const resolveRecordScopeId = (data: Record<string, unknown> = {}) =>
  String(
    data.target_group_id
    || data.targetGroupId
    || data.sub_admin_group_id
    || data.subAdminGroupId
    || data.group_scope_id
    || data.groupScopeId
    || data.groupId
    || data.group_id
    || '',
  ).trim();

const matchesScopeContext = (data: Record<string, unknown> = {}, activeScopeId = '') => {
  const scopeId = resolveRecordScopeId(data);
  if (activeScopeId) return scopeId === activeScopeId;
  return !scopeId;
};

const emptyMetrics: DashboardMetrics = {
  totalVolunteers: 0,
  weeklyActive: 0,
  totalHours: 0,
  weeklyHours: 0,
  monthlyHours: 0,
  busiestDay: '—',
  weeklyHoursByDay: new Array(7).fill(0),
  avgWeeklyHoursPerVolunteer: 0,
  dailyGoalPercent: 0,
};

export const useDashboardMetrics = (
  options: { includeAllScopes?: boolean } = {},
): MetricsState => {
  const includeAllScopes = Boolean(options.includeAllScopes);
  const [orgCode, setOrgCode] = useState<string>('');
  const [orgId, setOrgId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerRecord[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [adminUid, setAdminUid] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [subAdminScopeKey, setSubAdminScopeKey] = useState<string>(() => getActiveSubAdminSession()?.groupId || '');

  useEffect(() => {
    const syncScope = () => {
      setSubAdminScopeKey(getActiveSubAdminSession()?.groupId || '');
    };
    const onScopeEvent = () => syncScope();
    window.addEventListener('nexolink:subadmin-session', onScopeEvent);
    window.addEventListener('storage', onScopeEvent);
    return () => {
      window.removeEventListener('nexolink:subadmin-session', onScopeEvent);
      window.removeEventListener('storage', onScopeEvent);
    };
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    let unsubContext: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubContext) {
        unsubContext();
        unsubContext = null;
      }
      if (!user) {
        setOrgCode('');
        setOrgId('');
        setAdminUid('');
        setAdminEmail('');
        setLoading(false);
        return;
      }
      setAdminUid(user.uid || '');
      setAdminEmail((user.email || '').toLowerCase());
      unsubContext = subscribeToOrgAdminContext(db, user.uid, (context) => {
        setOrgId(context.orgId || '');
        setError(null);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubContext) unsubContext();
    };
  }, []);

  useEffect(() => {
    if (!orgId) {
      setVolunteers([]);
      setLogs([]);
      return;
    }

    const db = getFirestoreDb();
    const volunteersRef = collection(db, 'organizations', orgId, 'volunteers');
    const activeVolunteersQuery = query(volunteersRef, where('status', '==', 'active'));
    const unsubVolunteers = onSnapshot(
      activeVolunteersQuery,
      (snap) => {
        const data: VolunteerRecord[] = snap.docs.map((docSnap) => {
          const docData = docSnap.data() as Record<string, unknown>;
          const email = String(docData.email || '').trim();
          const displayName = String(docData.displayName || '').trim();
          const [firstName, ...rest] = displayName ? displayName.split(' ') : [];
          return {
            id: docSnap.id,
            firstName: firstName || (email.includes('@') ? email.split('@')[0] : email) || 'Volunteer',
            lastName: rest.join(' '),
            email,
            role: String(docData.role || 'volunteer'),
            totalHours: 0,
            lastActivity: null,
          };
        });
        setVolunteers(data);
      },
      () => setError('Unable to load volunteers.'),
    );

    const hourLogsRef = collection(db, 'organizations', orgId, 'hourLogs');
    const unsubLogs = onSnapshot(
      hourLogsRef,
      (snap) => {
        const data: ActivityLog[] = snap.docs.map((docSnap) => {
          const docData = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            userId: String(docData.userId || ''),
            hours: Number(docData.hours || 0),
            approve: docData.status === 'verified' ? 'approved' : 'pending',
            date: docData.date,
          };
        });
        setLogs(data);
      },
      () => setError('Unable to load volunteer logs.'),
    );

    return () => {
      unsubVolunteers();
      unsubLogs();
    };
  }, [orgId, subAdminScopeKey]);

  const computed = useMemo(() => {
    const isAdminLikeRole = (role: unknown) => {
      const normalized = String(role || '').trim().toLowerCase();
      return ['org-admin', 'admin', 'subadmin', 'sub-admin', 'owner', 'organization'].includes(normalized);
    };

    const filteredVolunteers = volunteers.filter((volunteer) => {
      if (adminUid && volunteer.id === adminUid) return false;
      if (adminEmail && (volunteer.email || '').toLowerCase() === adminEmail) return false;
      if (isAdminLikeRole(volunteer.role)) return false;
      return true;
    });
    const filteredLogs = logs.filter((log) => {
      const logUserId = (log.user_id || log.userId || log.volunteer_id || log.volunteerId || '') as string;
      const logEmail = String((log as Record<string, unknown>).volunteer_email || (log as Record<string, unknown>).email || '').toLowerCase();
      if (adminUid && logUserId === adminUid) return false;
      if (adminEmail && logEmail === adminEmail) return false;
      const logRole = (log as Record<string, unknown>).role || (log as Record<string, unknown>).volunteer_role;
      if (isAdminLikeRole(logRole)) return false;
      return true;
    });
    const scopedVolunteers = includeAllScopes
      ? filteredVolunteers
      : filteredVolunteers.filter((volunteer) =>
          matchesScopeContext(volunteer as unknown as Record<string, unknown>, subAdminScopeKey),
        );
    const scopedLogs = includeAllScopes
      ? filteredLogs
      : filteredLogs.filter((log) =>
          matchesScopeContext((log as Record<string, unknown>) || {}, subAdminScopeKey),
        );

    const dedupedVolunteers = dedupeVolunteers(scopedVolunteers);
    const enriched = computeVolunteerHours(dedupedVolunteers, scopedLogs);
    const metrics = computeDashboardMetrics(enriched, scopedLogs);
    const topVolunteers = [...enriched]
      .filter((v) => !isAdminLikeRole(v.role))
      .map((volunteer) => ({
        ...volunteer,
        totalHours: getMonthHoursForVolunteer(volunteer, scopedLogs),
      }))
      .sort((a, b) => (b.totalHours || 0) - (a.totalHours || 0))
      .slice(0, 3);
    const weeklySeries = buildWeeklySeries(enriched, scopedLogs, weekOffset);
    const monthlySeries = buildMonthlySeries(enriched, scopedLogs);
    const yearlySeries = buildYearlySeries(enriched, scopedLogs);
    const recent = buildLastNDaysSeries(enriched, scopedLogs, 10);
    const eligible = enriched.filter((v) => !isAdminLikeRole(v.role));
    const retained = eligible.filter((v) => (v.totalHours || 0) > 0).length;
    const retentionRate = eligible.length ? Math.round((retained / eligible.length) * 100) : 0;

    const currentMonthLabel = new Date().toLocaleDateString(undefined, { month: 'long' });
    return {
      logs: scopedLogs,
      metrics,
      volunteers: enriched,
      topVolunteers,
      weeklySeries,
      monthlySeries,
      yearlySeries,
      recentHours: recent.hours,
      recentVolunteers: recent.volunteers,
      retentionRate,
      topVolunteerMonthLabel: `${currentMonthLabel} • Monthly`,
    };
  }, [
    adminEmail,
    adminUid,
    includeAllScopes,
    logs,
    subAdminScopeKey,
    volunteers,
    weekOffset,
  ]);

  return {
    loading,
    error,
    orgCode,
    orgId,
    activityLogs: computed.logs,
    metrics: computed.metrics,
    volunteers: computed.volunteers,
    topVolunteers: computed.topVolunteers,
    weeklySeries: computed.weeklySeries,
    monthlySeries: computed.monthlySeries,
    yearlySeries: computed.yearlySeries,
    recentHours: computed.recentHours,
    recentVolunteers: computed.recentVolunteers,
    retentionRate: computed.retentionRate,
    topVolunteerMonthLabel: computed.topVolunteerMonthLabel,
    weekOffset,
    setWeekOffset,
  };
};

const getMonthHoursForVolunteer = (volunteer: VolunteerRecord, logs: ActivityLog[]) => {
  const today = normalizeDateValue(new Date());
  const currentMonth = today ? today.getMonth() : new Date().getMonth();
  const currentYear = today ? today.getFullYear() : new Date().getFullYear();
  const volunteerId = volunteer.id;
  const volunteerEmail = (volunteer.email || '').trim().toLowerCase();
  const volunteerName = `${volunteer.firstName || ''} ${volunteer.lastName || ''}`.trim().toLowerCase();
  return logs.reduce((sum, log) => {
    const logId = (log.user_id || log.userId || log.volunteer_id || log.volunteerId || '') as string;
    const logRecord = log as Record<string, unknown>;
    const logEmail = String(logRecord.volunteer_email || logRecord.email || '').trim().toLowerCase();
    const logName = String(logRecord.volunteer_name || logRecord.name || logRecord.firstName || '').trim().toLowerCase();
    if (logId !== volunteerId && (!volunteerEmail || logEmail !== volunteerEmail) && (!volunteerName || logName !== volunteerName)) {
      return sum;
    }
    const status = String(log.approve || 'pending').toLowerCase();
    if (status !== 'approved' && status !== 'accepted') return sum;
    const date = normalizeDateValue(log.date);
    if (!date) return sum;
    if (date.getFullYear() !== currentYear || date.getMonth() !== currentMonth) return sum;
    return sum + (parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0);
  }, 0);
};

const buildVolunteerKey = (volunteer: VolunteerRecord) => {
  const email = (volunteer.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = `${volunteer.firstName || ''} ${volunteer.lastName || ''}`.trim().toLowerCase();
  if (name) return `name:${name}`;
  return `id:${volunteer.id}`;
};

const dedupeVolunteers = (list: VolunteerRecord[]) => {
  const map = new Map<string, VolunteerRecord>();
  list.forEach((volunteer) => {
    const key = buildVolunteerKey(volunteer);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, volunteer);
      return;
    }
    map.set(key, {
      ...existing,
      ...volunteer,
      totalHours: (existing.totalHours || 0) + (volunteer.totalHours || 0),
      lastActivity: existing.lastActivity || volunteer.lastActivity || null,
    });
  });
  return Array.from(map.values());
};
