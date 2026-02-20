import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { getActiveSubAdminSession, subscribeToOrgCollection } from '../lib/orgContext';
import { normalizeDateValue, type ActivityLog, type VolunteerRecord } from '../lib/metrics';

export type NebulaeOpsActionKey =
  | 'invite_reliable'
  | 'send_log_reminders'
  | 'send_recognition'
  | 'launch_reengagement';

export type NebulaePriorityTone = 'alert' | 'warning' | 'ok' | 'info';

export type NebulaePriority = {
  id: string;
  emoji: string;
  label: string;
  tone: NebulaePriorityTone;
  actionKey?: NebulaeOpsActionKey;
};

export type NebulaeRecommendation = {
  volunteerId: string;
  volunteerName: string;
  reliability: number;
  confidence: number;
  attendedSimilar: number;
  lastActiveDays: number | null;
  reasons: string[];
  dataSource: string;
};

export type NebulaeAction = {
  key: NebulaeOpsActionKey;
  label: string;
  helper: string;
};

type EventRecord = {
  id: string;
  title: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
  city?: string;
  state?: string;
  location?: string;
  capacity?: number | null;
  maxVolunteers?: number | null;
  peoplePerSlot?: number | null;
  timeSlots?: Array<{ id?: string; capacity?: number | null }>;
};

type SignupRecord = {
  id: string;
  eventId: string;
  volunteerId: string;
  volunteerName: string;
  volunteerEmail: string;
  status: string;
};

type LearningActionStats = {
  manualAccepts: number;
  autoRuns: number;
  totalRuns: number;
  lastRunAt: number;
  lastAutoRunAt: number;
};

type LearningTemplateStats = {
  sent: number;
  engaged: number;
  lastSentAt: number;
};

type LearningRun = {
  id: string;
  actionKey: NebulaeOpsActionKey;
  templateId: string;
  at: number;
  targetVolunteerIds: string[];
  evaluated: boolean;
};

type LearningStore = {
  actions: Record<NebulaeOpsActionKey, LearningActionStats>;
  templates: Record<string, LearningTemplateStats>;
  runs: LearningRun[];
  updatedAt: number;
};

type AutopilotSettings = {
  autoInvite: boolean;
  autoReminders: boolean;
  autoRecognition: boolean;
};

type OpsSignal = {
  timestamp: number;
  text: string;
  auto: boolean;
};

type UseNebulaeOpsCenterArgs = {
  enabled: boolean;
  planTier: string;
  orgCode: string;
  orgId: string;
  volunteers: VolunteerRecord[];
  activityLogs: ActivityLog[];
  contextScope?: 'superadmin-only' | 'include-subadmins';
};

type UseNebulaeOpsCenterResult = {
  loading: boolean;
  priorities: NebulaePriority[];
  actions: NebulaeAction[];
  recommendations: NebulaeRecommendation[];
  primaryRecommendation: NebulaeRecommendation | null;
  autopilot: AutopilotSettings;
  toggleAutopilot: (key: keyof AutopilotSettings, value: boolean) => void;
  runAction: (actionKey: NebulaeOpsActionKey, options?: { automatic?: boolean }) => Promise<{ ok: boolean; message: string }>;
  lastSignal: OpsSignal | null;
  learningSummary: {
    acceptedActions: number;
    autoRuns: number;
    invitePrecision: number;
    messageLift: number;
  };
  opsMetrics: {
    upcomingEvents: number;
    totalCapacity: number;
    filledSlots: number;
    staffingShortage: number;
    pendingLogs: number;
    pendingLogsAged: number;
    monthHoursCurrent: number;
    monthHoursPrevious: number;
    monthHoursDelta: number;
    reliableVolunteers: number;
    recommendationsCount: number;
  };
};

const SHOW_STATUSES = new Set(['checked in', 'checked-in', 'attended', 'completed', 'complete']);
const NON_COMMIT_STATUSES = new Set(['cancelled', 'canceled', 'no-show', 'noshow']);
const APPROVED_STATUSES = new Set(['approved', 'accepted']);
const ACTION_COOLDOWNS: Record<NebulaeOpsActionKey, number> = {
  invite_reliable: 1000 * 60 * 60 * 6,
  send_log_reminders: 1000 * 60 * 60 * 12,
  send_recognition: 1000 * 60 * 60 * 24,
  launch_reengagement: 1000 * 60 * 60 * 24,
};

const EMPTY_ACTION_STATS = (): LearningActionStats => ({
  manualAccepts: 0,
  autoRuns: 0,
  totalRuns: 0,
  lastRunAt: 0,
  lastAutoRunAt: 0,
});

const createDefaultLearningStore = (): LearningStore => ({
  actions: {
    invite_reliable: EMPTY_ACTION_STATS(),
    send_log_reminders: EMPTY_ACTION_STATS(),
    send_recognition: EMPTY_ACTION_STATS(),
    launch_reengagement: EMPTY_ACTION_STATS(),
  },
  templates: {},
  runs: [],
  updatedAt: Date.now(),
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!normalized) return null;
    const parsed = Number(normalized[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveEventCapacity = (event: EventRecord, signups: SignupRecord[]) => {
  const directCapacity = parseNumber(event.capacity);
  if (Number.isFinite(directCapacity ?? NaN) && (directCapacity ?? 0) > 0) {
    return Number(directCapacity);
  }
  const maxVolunteers = parseNumber(event.maxVolunteers);
  if (Number.isFinite(maxVolunteers ?? NaN) && (maxVolunteers ?? 0) > 0) {
    return Number(maxVolunteers);
  }
  if (event.peoplePerSlot && Array.isArray(event.timeSlots) && event.timeSlots.length) {
    return event.timeSlots.length * event.peoplePerSlot;
  }
  return Math.max(signups.length, 0);
};

const normalizeScopeToken = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return 'super-admin';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
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
const matchesScopeContext = (
  data: Record<string, unknown> = {},
  activeSubAdminScopeId = '',
  contextScope: 'superadmin-only' | 'include-subadmins' = 'superadmin-only',
) => {
  const scopeId = resolveRecordScopeId(data);
  if (activeSubAdminScopeId) return scopeId === activeSubAdminScopeId;
  if (contextScope === 'include-subadmins') return true;
  return !scopeId;
};

const resolveDate = (value: unknown): Date | null => normalizeDateValue(value);

const formatEventDate = (value?: string) => {
  const date = resolveDate(value);
  if (!date) return 'date TBD';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const getDateOrFallback = (log: ActivityLog) => {
  const raw =
    log.date
    || (log as Record<string, unknown>).created_at
    || (log as Record<string, unknown>).createdAt
    || (log as Record<string, unknown>).updated_at
    || (log as Record<string, unknown>).updatedAt
    || null;
  return resolveDate(raw);
};

const getMonthBounds = (offset: number) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  end.setHours(0, 0, 0, 0);
  return { start, end };
};

const sumHoursInRange = (logs: ActivityLog[], start: Date, end: Date) =>
  logs.reduce((sum, log) => {
    const status = String(log.approve || 'pending').toLowerCase();
    if (!APPROVED_STATUSES.has(status)) return sum;
    const date = getDateOrFallback(log);
    if (!date || date < start || date >= end) return sum;
    return sum + (parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0);
  }, 0);

const storageKeys = (orgKey: string) => ({
  autopilot: `nexolink:nebulae-autopilot:${orgKey}`,
  learning: `nexolink:nebulae-learning:${orgKey}`,
});

const loadJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch (_error) {
    return fallback;
  }
};

const saveJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Ignore storage errors.
  }
};

const resolveDefaultAutopilot = (planTier: string): AutopilotSettings => {
  const normalized = String(planTier || '').toLowerCase();
  if (normalized === 'cosmos') {
    return {
      autoInvite: true,
      autoReminders: true,
      autoRecognition: false,
    };
  }
  return {
    autoInvite: false,
    autoReminders: false,
    autoRecognition: false,
  };
};

export const useNebulaeOpsCenter = ({
  enabled,
  planTier,
  orgCode,
  orgId,
  volunteers,
  activityLogs,
  contextScope = 'superadmin-only',
}: UseNebulaeOpsCenterArgs): UseNebulaeOpsCenterResult => {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [signups, setSignups] = useState<SignupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [autopilot, setAutopilot] = useState<AutopilotSettings>(() => resolveDefaultAutopilot(planTier));
  const [learning, setLearning] = useState<LearningStore>(() => createDefaultLearningStore());
  const [lastSignal, setLastSignal] = useState<OpsSignal | null>(null);
  const [senderName, setSenderName] = useState<string>('Nebulae AI Ops');
  const runningActionRef = useRef(false);

  const normalizedTier = String(planTier || '').toLowerCase();
  const orgKey = useMemo(
    () => String(orgId || orgCode || 'default').toLowerCase(),
    [orgCode, orgId],
  );

  useEffect(() => {
    const keys = storageKeys(orgKey);
    const defaults = resolveDefaultAutopilot(planTier);
    setAutopilot(loadJson<AutopilotSettings>(keys.autopilot, defaults));
    setLearning(loadJson<LearningStore>(keys.learning, createDefaultLearningStore()));
  }, [orgKey, planTier]);

  useEffect(() => {
    const keys = storageKeys(orgKey);
    saveJson(keys.autopilot, autopilot);
  }, [autopilot, orgKey]);

  useEffect(() => {
    const keys = storageKeys(orgKey);
    saveJson(keys.learning, learning);
  }, [learning, orgKey]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSenderName('Nebulae AI Ops');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data() || {};
        const first = String((data as Record<string, unknown>).firstName || (data as Record<string, unknown>).name || '').trim();
        const last = String((data as Record<string, unknown>).lastName || (data as Record<string, unknown>).last_name || '').trim();
        setSenderName([first, last].filter(Boolean).join(' ').trim() || user.email || 'Nebulae AI Ops');
      } catch (_error) {
        setSenderName(user.email || 'Nebulae AI Ops');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!enabled || (!orgCode && !orgId)) {
      setEvents([]);
      setSignups([]);
      setLoading(false);
      return;
    }

    const db = getFirestoreDb();
    let eventsReady = false;
    let signupsReady = false;
    setLoading(true);

    const markReady = () => {
      if (eventsReady && signupsReady) {
        setLoading(false);
      }
    };

    const unsubEvents = subscribeToOrgCollection({
      db,
      collectionName: 'events',
      orgCode,
      orgId,
      onData: (rows) => {
        const activeSubAdminScopeId = String(getActiveSubAdminSession()?.groupId || '').trim();
        const scopedRows = rows.filter((row) =>
          matchesScopeContext(row.data || {}, activeSubAdminScopeId, contextScope),
        );
        const nextEvents = scopedRows
          .map((row) => {
            const data = row.data || {};
            return {
              id: row.id,
              title: String(data.title || 'Untitled Event'),
              startDate: data.startDate ? String(data.startDate) : undefined,
              endDate: data.endDate ? String(data.endDate) : undefined,
              startTime: data.startTime ? String(data.startTime) : undefined,
              endTime: data.endTime ? String(data.endTime) : undefined,
              venue: data.venue ? String(data.venue) : undefined,
              city: data.city ? String(data.city) : undefined,
              state: data.state ? String(data.state) : undefined,
              location: data.location ? String(data.location) : undefined,
              capacity: parseNumber(data.capacity ?? data.capacity_value ?? data.maxCapacity ?? data.max_capacity),
              maxVolunteers: parseNumber(
                data.maxVolunteers
                ?? data.max_volunteers
                ?? data.maxVolunteer
                ?? data.max_volunteer
                ?? (typeof data.requirements === 'object' && data.requirements !== null
                  ? (data.requirements as Record<string, unknown>).maxVolunteers
                    ?? (data.requirements as Record<string, unknown>).max_volunteers
                    ?? (data.requirements as Record<string, unknown>).maxVolunteer
                    ?? (data.requirements as Record<string, unknown>).max_volunteer
                  : undefined)
              ),
              peoplePerSlot: parseNumber(data.peoplePerSlot ?? data.people_per_slot),
              timeSlots: Array.isArray(data.timeSlots) ? (data.timeSlots as Array<{ id?: string; capacity?: number | null }>) : [],
            } as EventRecord;
          })
          .filter((event) => {
              const status = String((scopedRows.find((row) => row.id === event.id)?.data?.status) || 'published').toLowerCase();
              return status !== 'draft' && status !== 'archived';
          });
        setEvents(nextEvents);
        eventsReady = true;
        markReady();
      },
      onError: () => {
        eventsReady = true;
        markReady();
      },
    });

    const unsubSignups = subscribeToOrgCollection({
      db,
      collectionName: 'event_signups',
      orgCode,
      orgId,
      onData: (rows) => {
        const activeSubAdminScopeId = String(getActiveSubAdminSession()?.groupId || '').trim();
        const nextSignups = rows
          .filter((row) => matchesScopeContext(row.data || {}, activeSubAdminScopeId, contextScope))
          .map((row) => {
          const data = row.data || {};
          return {
            id: row.id,
            eventId: String(data.eventId || data.event_id || ''),
            volunteerId: String(data.volunteerId || data.volunteer_id || data.userId || data.user_id || data.uid || '').trim(),
            volunteerName: String(data.volunteerName || data.volunteer_name || data.displayName || data.name || 'Volunteer').trim(),
            volunteerEmail: String(data.volunteerEmail || data.volunteer_email || data.email || '').trim(),
            status: String(data.status || 'pending').trim().toLowerCase(),
          };
        }).filter((signup) => signup.eventId);
        setSignups(nextSignups);
        signupsReady = true;
        markReady();
      },
      onError: () => {
        signupsReady = true;
        markReady();
      },
    });

    return () => {
      unsubEvents();
      unsubSignups();
    };
  }, [contextScope, enabled, orgCode, orgId]);

  const scopedActivityLogs = useMemo(() => {
    const activeSubAdminScopeId = String(getActiveSubAdminSession()?.groupId || '').trim();
    return activityLogs.filter((log) =>
      matchesScopeContext(log as Record<string, unknown>, activeSubAdminScopeId, contextScope),
    );
  }, [activityLogs, contextScope]);

  const volunteerStats = useMemo(() => {
    const volunteerIdByEmail = new Map<string, string>();
    const volunteerIdByName = new Map<string, string>();

    volunteers.forEach((volunteer) => {
      const email = String(volunteer.email || '').trim().toLowerCase();
      const name = `${volunteer.firstName || ''} ${volunteer.lastName || ''}`.trim().toLowerCase();
      if (email) volunteerIdByEmail.set(email, volunteer.id);
      if (name) volunteerIdByName.set(name, volunteer.id);
    });

    type StatAccumulator = {
      attendedSimilar: number;
      opportunities: number;
      approvedLogs: number;
      missed: number;
      lastActiveAt: number;
      lastApprovedAt: number;
    };

    const stats = new Map<string, StatAccumulator>();
    volunteers.forEach((volunteer) => {
      stats.set(volunteer.id, {
        attendedSimilar: 0,
        opportunities: 0,
        approvedLogs: 0,
        missed: 0,
        lastActiveAt: 0,
        lastApprovedAt: 0,
      });
    });

    const resolveVolunteerId = (volunteerId: string, volunteerEmail: string, volunteerName: string) => {
      if (volunteerId && stats.has(volunteerId)) return volunteerId;
      const emailKey = String(volunteerEmail || '').trim().toLowerCase();
      if (emailKey && volunteerIdByEmail.has(emailKey)) return volunteerIdByEmail.get(emailKey) as string;
      const nameKey = String(volunteerName || '').trim().toLowerCase();
      if (nameKey && volunteerIdByName.has(nameKey)) return volunteerIdByName.get(nameKey) as string;
      return '';
    };

    signups.forEach((signup) => {
      const matchedId = resolveVolunteerId(signup.volunteerId, signup.volunteerEmail, signup.volunteerName);
      if (!matchedId) return;
      const entry = stats.get(matchedId);
      if (!entry) return;
      entry.opportunities += 1;
      if (SHOW_STATUSES.has(signup.status)) {
        entry.attendedSimilar += 1;
      }
      if (NON_COMMIT_STATUSES.has(signup.status)) {
        entry.missed += 1;
      }
    });

    scopedActivityLogs.forEach((log) => {
      const logUserId = String(log.user_id || log.userId || log.volunteer_id || log.volunteerId || '').trim();
      const logRecord = log as Record<string, unknown>;
      const logEmail = String(logRecord.volunteer_email || logRecord.email || '').trim();
      const logName = String(logRecord.volunteer_name || logRecord.name || logRecord.firstName || '').trim();
      const matchedId = resolveVolunteerId(logUserId, logEmail, logName);
      if (!matchedId) return;
      const entry = stats.get(matchedId);
      if (!entry) return;
      const date = getDateOrFallback(log);
      if (date) {
        const stamp = date.getTime();
        if (stamp > entry.lastActiveAt) entry.lastActiveAt = stamp;
      }
      const status = String(log.approve || 'pending').toLowerCase();
      if (APPROVED_STATUSES.has(status)) {
        entry.approvedLogs += 1;
        const stamp = date ? date.getTime() : 0;
        if (stamp > entry.lastApprovedAt) entry.lastApprovedAt = stamp;
      }
    });

    const now = Date.now();
    const list: NebulaeRecommendation[] = volunteers
      .map((volunteer) => {
        const entry = stats.get(volunteer.id) || {
          attendedSimilar: 0,
          opportunities: 0,
          approvedLogs: 0,
          missed: 0,
          lastActiveAt: 0,
          lastApprovedAt: 0,
        };

        const baseReliability = entry.opportunities > 0
          ? Math.round((entry.attendedSimilar / Math.max(1, entry.opportunities)) * 100)
          : Math.min(96, 68 + (entry.approvedLogs * 4));
        const reliability = clamp(baseReliability - (entry.missed * 6), 45, 99);
        const sampleSize = entry.opportunities + entry.approvedLogs;
        const sampleSignal = clamp(Math.round((Math.min(sampleSize, 12) / 12) * 100), 30, 100);
        const learningBoost = Math.min(8, (learning.actions.invite_reliable.manualAccepts || 0) / 2);
        const confidence = clamp(Math.round((reliability * 0.72) + (sampleSignal * 0.28) + learningBoost), 35, 99);

        const lastActiveDays = entry.lastActiveAt
          ? Math.max(0, Math.floor((now - entry.lastActiveAt) / (1000 * 60 * 60 * 24)))
          : null;

        const displayName = `${volunteer.firstName || ''} ${volunteer.lastName || ''}`.trim()
          || String(volunteer.email || '').split('@')[0]
          || 'Volunteer';

        const reasons = [
          `Attended ${entry.attendedSimilar} similar events`,
          `${reliability}% attendance reliability`,
          lastActiveDays == null ? 'No recent activity timestamp' : `Last active ${lastActiveDays} day${lastActiveDays === 1 ? '' : 's'} ago`,
        ];

        return {
          volunteerId: volunteer.id,
          volunteerName: displayName,
          reliability,
          confidence,
          attendedSimilar: entry.attendedSimilar,
          lastActiveDays,
          reasons,
          dataSource: 'event_signups + volunteer_logs + activity history',
        };
      })
      .sort((a, b) => {
        if (b.reliability !== a.reliability) return b.reliability - a.reliability;
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        const aDays = a.lastActiveDays ?? Number.MAX_SAFE_INTEGER;
        const bDays = b.lastActiveDays ?? Number.MAX_SAFE_INTEGER;
        return aDays - bDays;
      });

    const availableReliable = list.filter((item) => (item.lastActiveDays ?? 999) <= 14 && item.reliability >= 85);
    const inactive = list.filter((item) => (item.lastActiveDays ?? 0) >= 21).slice(0, 8);

    const lastApprovedByVolunteer = list.reduce<Record<string, number>>((acc, item) => {
      const entry = stats.get(item.volunteerId);
      acc[item.volunteerId] = entry?.lastApprovedAt || 0;
      return acc;
    }, {});

    return {
      list,
      availableReliable,
      inactive,
      lastApprovedByVolunteer,
    };
  }, [learning.actions.invite_reliable.manualAccepts, scopedActivityLogs, signups, volunteers]);

  const eventInsights = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const signupsByEvent = new Map<string, SignupRecord[]>();
    signups.forEach((signup) => {
      const list = signupsByEvent.get(signup.eventId) || [];
      list.push(signup);
      signupsByEvent.set(signup.eventId, list);
    });

    const upcoming = events
      .map((event) => {
        const eventDate = resolveDate(event.startDate);
        if (!eventDate || eventDate < today) {
          return null;
        }

        const allSignups = signupsByEvent.get(event.id) || [];
        const activeSignups = allSignups.filter((signup) => !NON_COMMIT_STATUSES.has(signup.status));
        const capacity = resolveEventCapacity(event, activeSignups);
        const shortage = Math.max(0, capacity - activeSignups.length);
        const isSaturday = eventDate.getDay() === 6;
        const looksLikeCleanup = /cleanup/i.test(event.title || '');

        return {
          event,
          date: eventDate,
          activeSignups: activeSignups.length,
          capacity,
          shortage,
          isSaturday,
          looksLikeCleanup,
        };
      })
      .filter(Boolean) as Array<{
      event: EventRecord;
      date: Date;
      activeSignups: number;
      capacity: number;
      shortage: number;
      isSaturday: boolean;
      looksLikeCleanup: boolean;
    }>;

    const staffingRisk = upcoming
      .filter((snapshot) => snapshot.shortage > 0)
      .sort((a, b) => {
        const score = (value: typeof a) =>
          (value.looksLikeCleanup ? 2 : 0)
          + (value.isSaturday ? 1 : 0)
          - (value.date.getTime() / 1e13);
        return score(b) - score(a);
      })[0] || null;

    return {
      upcoming,
      staffingRisk,
    };
  }, [events, signups]);

  const pendingInsight = useMemo(() => {
    const now = Date.now();
    let pendingOlderThan3Days = 0;
    let pendingTotal = 0;

    scopedActivityLogs.forEach((log) => {
      const status = String(log.approve || 'pending').toLowerCase();
      if (APPROVED_STATUSES.has(status)) return;
      pendingTotal += 1;
      const date = getDateOrFallback(log);
      if (!date) return;
      const ageDays = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays > 3) {
        pendingOlderThan3Days += 1;
      }
    });

    return {
      pendingTotal,
      pendingOlderThan3Days,
    };
  }, [scopedActivityLogs]);

  const activityTrend = useMemo(() => {
    const current = getMonthBounds(0);
    const previous = getMonthBounds(-1);
    const currentHours = sumHoursInRange(scopedActivityLogs, current.start, current.end);
    const previousHours = sumHoursInRange(scopedActivityLogs, previous.start, previous.end);

    let delta = 0;
    if (previousHours > 0) {
      delta = Math.round(((currentHours - previousHours) / previousHours) * 100);
    } else if (currentHours > 0) {
      delta = 100;
    }

    return {
      currentHours,
      previousHours,
      delta,
    };
  }, [scopedActivityLogs]);

  const priorities = useMemo<NebulaePriority[]>(() => {
    const staffingPriority: NebulaePriority = eventInsights.staffingRisk
      ? {
          id: 'staffing-risk',
          emoji: '⚠️',
          label: `${eventInsights.staffingRisk.event.title}: ${eventInsights.staffingRisk.shortage} volunteers short`,
          tone: eventInsights.staffingRisk.shortage >= 4 ? 'alert' : 'warning',
          actionKey: 'invite_reliable',
        }
      : {
          id: 'staffing-risk',
          emoji: '✅',
          label: 'No immediate staffing gap detected for upcoming events',
          tone: 'ok',
        };

    const activityPriority: NebulaePriority = activityTrend.delta < 0
      ? {
          id: 'activity-trend',
          emoji: '📉',
          label: `Activity down ${Math.abs(activityTrend.delta)}% this month`,
          tone: Math.abs(activityTrend.delta) >= 15 ? 'alert' : 'warning',
          actionKey: 'launch_reengagement',
        }
      : {
          id: 'activity-trend',
          emoji: '📈',
          label: `Activity ${activityTrend.delta > 0 ? `up ${activityTrend.delta}%` : 'stable'} this month`,
          tone: activityTrend.delta > 0 ? 'ok' : 'info',
        };

    const reliableCount = volunteerStats.availableReliable.slice(0, 3).length;
    const reliabilityPriority: NebulaePriority = {
      id: 'reliable-nearby',
      emoji: '⭐',
      label: `${reliableCount} high-reliability volunteers available nearby`,
      tone: reliableCount >= 3 ? 'ok' : reliableCount > 0 ? 'warning' : 'info',
      actionKey: 'invite_reliable',
    };

    const pendingPriority: NebulaePriority = {
      id: 'aged-pending-logs',
      emoji: '⏳',
      label: `${pendingInsight.pendingOlderThan3Days} logs waiting > 3 days`,
      tone: pendingInsight.pendingOlderThan3Days >= 6 ? 'alert' : pendingInsight.pendingOlderThan3Days > 0 ? 'warning' : 'ok',
      actionKey: 'send_log_reminders',
    };

    return [
      staffingPriority,
      activityPriority,
      reliabilityPriority,
      pendingPriority,
    ];
  }, [activityTrend.delta, eventInsights.staffingRisk, pendingInsight.pendingOlderThan3Days, volunteerStats.availableReliable]);

  const recommendations = useMemo(
    () => volunteerStats.availableReliable.slice(0, 3),
    [volunteerStats.availableReliable],
  );

  const primaryRecommendation = recommendations[0] || volunteerStats.list[0] || null;

  const actions = useMemo<NebulaeAction[]>(() => [
    {
      key: 'invite_reliable',
      label: 'Auto-invite matching volunteers',
      helper: 'Targets reliable volunteers for upcoming staffing gaps.',
    },
    {
      key: 'send_log_reminders',
      label: 'Send pending-log reminders',
      helper: 'Nudges volunteers to submit delayed activity logs.',
    },
    {
      key: 'send_recognition',
      label: 'Send recognition messages',
      helper: 'Acknowledges high-reliability volunteers automatically.',
    },
    {
      key: 'launch_reengagement',
      label: 'Launch re-engagement campaign',
      helper: 'Re-activates volunteers with recent inactivity.',
    },
  ], []);

  const updateLearningFromRun = useCallback((params: {
    actionKey: NebulaeOpsActionKey;
    automatic: boolean;
    templateId: string;
    targetVolunteerIds: string[];
  }) => {
    const now = Date.now();
    setLearning((prev) => {
      const next = { ...prev };
      const actionStats = { ...(next.actions[params.actionKey] || EMPTY_ACTION_STATS()) };
      actionStats.totalRuns += 1;
      actionStats.lastRunAt = now;
      if (params.automatic) {
        actionStats.autoRuns += 1;
        actionStats.lastAutoRunAt = now;
      } else {
        actionStats.manualAccepts += 1;
      }

      next.actions = {
        ...next.actions,
        [params.actionKey]: actionStats,
      };

      const template = { ...(next.templates[params.templateId] || { sent: 0, engaged: 0, lastSentAt: 0 }) };
      template.sent += Math.max(1, params.targetVolunteerIds.length);
      template.lastSentAt = now;
      next.templates = {
        ...next.templates,
        [params.templateId]: template,
      };

      const run: LearningRun = {
        id: `${params.actionKey}-${now}`,
        actionKey: params.actionKey,
        templateId: params.templateId,
        at: now,
        targetVolunteerIds: params.targetVolunteerIds,
        evaluated: false,
      };
      next.runs = [...next.runs, run].slice(-120);
      next.updatedAt = now;
      return next;
    });
  }, []);

  useEffect(() => {
    const oneHourAgo = Date.now() - (1000 * 60 * 60);
    const lastApproved = volunteerStats.lastApprovedByVolunteer;

    setLearning((prev) => {
      let changed = false;
      const templates = { ...prev.templates };
      const runs = prev.runs.map((run) => {
        if (run.evaluated) return run;
        if (run.at > oneHourAgo) return run;

        const engaged = run.targetVolunteerIds.length === 0
          ? false
          : run.targetVolunteerIds.some((volunteerId) => (lastApproved[volunteerId] || 0) >= run.at);

        if (engaged) {
          const template = { ...(templates[run.templateId] || { sent: 0, engaged: 0, lastSentAt: 0 }) };
          template.engaged += 1;
          templates[run.templateId] = template;
        }

        changed = true;
        return {
          ...run,
          evaluated: true,
        };
      });

      if (!changed) return prev;
      return {
        ...prev,
        templates,
        runs,
        updatedAt: Date.now(),
      };
    });
  }, [volunteerStats.lastApprovedByVolunteer]);

  const postMessage = useCallback(async (params: {
    text: string;
    targetVolunteerId?: string;
    type: 'group' | 'direct';
    templateId: string;
  }) => {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (!currentUser || !orgCode) {
      throw new Error('Missing authenticated user or org code.');
    }

    const activeScope = getActiveSubAdminSession();
    const scopeKey = String(activeScope?.groupId || '').trim();
    const scopeToken = normalizeScopeToken(scopeKey);
    const allThreadId = `org-${orgCode}-scope-${scopeToken}-all`;
    const directThreadId = params.targetVolunteerId
      ? `org-${orgCode}-scope-${scopeToken}-user-${params.targetVolunteerId}`
      : allThreadId;

    const db = getFirestoreDb();
    const payload: Record<string, unknown> = {
      orgCode,
      orgId,
      threadId: params.type === 'group' ? allThreadId : directThreadId,
      type: params.type,
      recipientId: params.type === 'direct' ? params.targetVolunteerId || null : null,
      senderId: currentUser.uid,
      senderName,
      text: params.text,
      createdAt: serverTimestamp(),
      source: 'nebulae_ops',
      templateId: params.templateId,
    };

    if (scopeKey) {
      const scopeName = String(activeScope?.groupName || '').trim();
      payload.target_group_id = scopeKey;
      payload.targetGroupId = scopeKey;
      payload.sub_admin_group_id = scopeKey;
      payload.subAdminGroupId = scopeKey;
      if (scopeName) {
        payload.target_group_name = scopeName;
        payload.targetGroupName = scopeName;
      }
    }

    await addDoc(collection(db, 'messages'), payload);
  }, [orgCode, orgId, senderName]);

  const runAction = useCallback(async (
    actionKey: NebulaeOpsActionKey,
    options?: { automatic?: boolean },
  ) => {
    const automatic = Boolean(options?.automatic);

    if (!enabled || (normalizedTier !== 'nebula' && normalizedTier !== 'cosmos')) {
      return { ok: false, message: 'Nebulae Ops is available on Nebula and Cosmos tiers only.' };
    }

    if (runningActionRef.current) {
      return { ok: false, message: 'Nebulae Ops is still processing the last action.' };
    }

    runningActionRef.current = true;

    try {
      const risk = eventInsights.staffingRisk;

      if (actionKey === 'invite_reliable') {
        if (!risk || risk.shortage <= 0) {
          return { ok: false, message: 'No staffing gap detected for upcoming events.' };
        }

        const targets = volunteerStats.availableReliable
          .filter((candidate) => candidate.volunteerId)
          .slice(0, Math.max(1, Math.min(risk.shortage, 3)));

        if (!targets.length) {
          return { ok: false, message: 'No reliable volunteers available to invite right now.' };
        }

        const eventLine = `${risk.event.title} on ${formatEventDate(risk.event.startDate)}`;

        await Promise.all(
          targets.map((candidate) =>
            postMessage({
              type: 'direct',
              targetVolunteerId: candidate.volunteerId,
              templateId: 'invite_match_v1',
              text: `Hi ${candidate.volunteerName}, we have an urgent staffing gap for ${eventLine}. Your reliability record (${candidate.reliability}%) makes you a strong fit. Can you help cover this event?`,
            }),
          ),
        );

        updateLearningFromRun({
          actionKey,
          automatic,
          templateId: 'invite_match_v1',
          targetVolunteerIds: targets.map((target) => target.volunteerId),
        });

        const message = `Invited ${targets.length} reliable volunteer${targets.length === 1 ? '' : 's'} for ${risk.event.title}.`;
        setLastSignal({ timestamp: Date.now(), text: message, auto: automatic });
        return { ok: true, message };
      }

      if (actionKey === 'send_log_reminders') {
        if (!pendingInsight.pendingOlderThan3Days) {
          return { ok: false, message: 'No logs are older than 3 days right now.' };
        }

        await postMessage({
          type: 'group',
          templateId: 'pending_log_reminder_v1',
          text: `Quick reminder from mission control: ${pendingInsight.pendingOlderThan3Days} volunteer logs are waiting over 3 days. Please submit your hours today so event coverage and recognition stay accurate.`,
        });

        updateLearningFromRun({
          actionKey,
          automatic,
          templateId: 'pending_log_reminder_v1',
          targetVolunteerIds: [],
        });

        const message = 'Sent a pending-log reminder broadcast to volunteers.';
        setLastSignal({ timestamp: Date.now(), text: message, auto: automatic });
        return { ok: true, message };
      }

      if (actionKey === 'send_recognition') {
        const targets = volunteerStats.availableReliable.slice(0, 3);
        if (!targets.length) {
          return { ok: false, message: 'No high-reliability volunteers to recognize yet.' };
        }

        await Promise.all(
          targets.map((candidate) =>
            postMessage({
              type: 'direct',
              targetVolunteerId: candidate.volunteerId,
              templateId: 'recognition_ping_v1',
              text: `Thank you, ${candidate.volunteerName}. Your consistency has been outstanding (${candidate.reliability}% reliability). Your impact keeps this mission moving.`,
            }),
          ),
        );

        updateLearningFromRun({
          actionKey,
          automatic,
          templateId: 'recognition_ping_v1',
          targetVolunteerIds: targets.map((target) => target.volunteerId),
        });

        const message = `Sent recognition messages to ${targets.length} volunteer${targets.length === 1 ? '' : 's'}.`;
        setLastSignal({ timestamp: Date.now(), text: message, auto: automatic });
        return { ok: true, message };
      }

      const inactiveTargets = volunteerStats.inactive.slice(0, 8);
      if (!inactiveTargets.length) {
        return { ok: false, message: 'No inactive volunteers detected for a re-engagement campaign.' };
      }

      await postMessage({
        type: 'group',
        templateId: 'reengagement_campaign_v1',
        text: 'We miss you in the field. New events are open now, and your contribution is needed. Reply in-app if you want a role match this week.',
      });

      updateLearningFromRun({
        actionKey,
        automatic,
        templateId: 'reengagement_campaign_v1',
        targetVolunteerIds: inactiveTargets.map((target) => target.volunteerId),
      });

      const message = `Launched re-engagement outreach for ${inactiveTargets.length} inactive volunteer${inactiveTargets.length === 1 ? '' : 's'}.`;
      setLastSignal({ timestamp: Date.now(), text: message, auto: automatic });
      return { ok: true, message };
    } catch (error: any) {
      const message = error?.message || 'Nebulae Ops could not execute that action.';
      setLastSignal({ timestamp: Date.now(), text: message, auto: automatic });
      return { ok: false, message };
    } finally {
      runningActionRef.current = false;
    }
  }, [
    enabled,
    eventInsights.staffingRisk,
    normalizedTier,
    pendingInsight.pendingOlderThan3Days,
    postMessage,
    updateLearningFromRun,
    volunteerStats.availableReliable,
    volunteerStats.inactive,
  ]);

  useEffect(() => {
    if (!enabled || !autopilot.autoInvite) return;
    const stats = learning.actions.invite_reliable || EMPTY_ACTION_STATS();
    const cooldown = ACTION_COOLDOWNS.invite_reliable;
    if (Date.now() - (stats.lastAutoRunAt || 0) < cooldown) return;
    if (!eventInsights.staffingRisk || eventInsights.staffingRisk.shortage <= 0) return;
    if (!volunteerStats.availableReliable.length) return;
    void runAction('invite_reliable', { automatic: true });
  }, [
    autopilot.autoInvite,
    enabled,
    eventInsights.staffingRisk,
    learning.actions.invite_reliable,
    runAction,
    volunteerStats.availableReliable.length,
  ]);

  useEffect(() => {
    if (!enabled || !autopilot.autoReminders) return;
    const stats = learning.actions.send_log_reminders || EMPTY_ACTION_STATS();
    const cooldown = ACTION_COOLDOWNS.send_log_reminders;
    if (Date.now() - (stats.lastAutoRunAt || 0) < cooldown) return;
    if (pendingInsight.pendingOlderThan3Days < 3) return;
    void runAction('send_log_reminders', { automatic: true });
  }, [
    autopilot.autoReminders,
    enabled,
    learning.actions.send_log_reminders,
    pendingInsight.pendingOlderThan3Days,
    runAction,
  ]);

  useEffect(() => {
    if (!enabled || !autopilot.autoRecognition) return;
    const stats = learning.actions.send_recognition || EMPTY_ACTION_STATS();
    const cooldown = ACTION_COOLDOWNS.send_recognition;
    if (Date.now() - (stats.lastAutoRunAt || 0) < cooldown) return;
    if (!volunteerStats.availableReliable.length) return;
    void runAction('send_recognition', { automatic: true });
  }, [
    autopilot.autoRecognition,
    enabled,
    learning.actions.send_recognition,
    runAction,
    volunteerStats.availableReliable.length,
  ]);

  useEffect(() => {
    if (!lastSignal) return;

    const db = getFirestoreDb();
    const payload = {
      orgCode,
      orgId,
      text: lastSignal.text,
      automatic: lastSignal.auto,
      timestamp: serverTimestamp(),
      source: 'nebulae_ops',
    };

    void addDoc(collection(db, 'nebulae_learning_signals'), payload).catch(() => {
      // Best-effort analytics write; ignore failures silently.
    });
  }, [lastSignal, orgCode, orgId]);

  const toggleAutopilot = useCallback((key: keyof AutopilotSettings, value: boolean) => {
    setAutopilot((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const learningSummary = useMemo(() => {
    const actionStats = Object.values(learning.actions);
    const acceptedActions = actionStats.reduce((sum, entry) => sum + (entry.manualAccepts || 0), 0);
    const autoRuns = actionStats.reduce((sum, entry) => sum + (entry.autoRuns || 0), 0);

    const inviteTemplate = learning.templates.invite_match_v1 || { sent: 0, engaged: 0, lastSentAt: 0 };
    const invitePrecision = inviteTemplate.sent
      ? Math.round((inviteTemplate.engaged / inviteTemplate.sent) * 100)
      : 0;

    const messageSent = Object.values(learning.templates).reduce((sum, item) => sum + (item.sent || 0), 0);
    const messageEngaged = Object.values(learning.templates).reduce((sum, item) => sum + (item.engaged || 0), 0);
    const messageLift = messageSent ? Math.round((messageEngaged / messageSent) * 100) : 0;

    return {
      acceptedActions,
      autoRuns,
      invitePrecision,
      messageLift,
    };
  }, [learning.actions, learning.templates]);

  const opsMetrics = useMemo(() => {
    const upcomingEvents = eventInsights.upcoming.length;
    const totalCapacity = eventInsights.upcoming.reduce(
      (sum, snapshot) => sum + (snapshot.capacity || 0),
      0,
    );
    const filledSlots = eventInsights.upcoming.reduce(
      (sum, snapshot) => sum + (snapshot.activeSignups || 0),
      0,
    );
    const staffingShortage = eventInsights.upcoming.reduce(
      (sum, snapshot) => sum + (snapshot.shortage || 0),
      0,
    );
    return {
      upcomingEvents,
      totalCapacity,
      filledSlots,
      staffingShortage,
      pendingLogs: pendingInsight.pendingTotal,
      pendingLogsAged: pendingInsight.pendingOlderThan3Days,
      monthHoursCurrent: Number(activityTrend.currentHours.toFixed(1)),
      monthHoursPrevious: Number(activityTrend.previousHours.toFixed(1)),
      monthHoursDelta: activityTrend.delta,
      reliableVolunteers: volunteerStats.availableReliable.length,
      recommendationsCount: recommendations.length,
    };
  }, [
    activityTrend.currentHours,
    activityTrend.delta,
    activityTrend.previousHours,
    eventInsights.upcoming,
    pendingInsight.pendingOlderThan3Days,
    pendingInsight.pendingTotal,
    recommendations.length,
    volunteerStats.availableReliable.length,
  ]);

  return {
    loading,
    priorities,
    actions,
    recommendations,
    primaryRecommendation,
    autopilot,
    toggleAutopilot,
    runAction,
    lastSignal,
    learningSummary,
    opsMetrics,
  };
};
