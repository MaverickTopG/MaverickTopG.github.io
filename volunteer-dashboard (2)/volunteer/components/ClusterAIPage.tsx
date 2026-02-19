import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Layers,
  Compass,
  Globe,
  Cpu,
  Send,
  Plus,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import type { ActivityLog } from '../lib/metrics';
import { normalizeDateValue } from '../lib/metrics';
import {
  extractVolunteerMembership,
  hasPremiumAccessForMembership,
  hydrateVolunteerMembershipPlans,
  mergeVolunteerMemberships,
  type VolunteerMembership,
} from '../lib/membershipAccess';

type ClusterModeKey = 'grants' | 'opportunities' | 'guidance' | 'decision-support';

type ClusterModeConfig = {
  key: ClusterModeKey;
  label: string;
  buttonLabel: string;
  detail: string;
  focus: string;
  inputPlaceholder: string;
  sidebarEyebrow: string;
  sidebarTitle: string;
  sidebarEmpty: string;
  insightLine: string;
  refreshLabel: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type QuickPromptChip = {
  label: string;
  prompt: string;
};

type EventRecord = {
  id: string;
  title: string;
  startDateRaw: unknown;
  location: string;
  capacity: number;
  orgName: string;
  orgCode: string;
};

type EventOpportunity = EventRecord & {
  startDate: Date | null;
  startDateLabel: string;
  filled: number;
  openSlots: number;
  isUpcoming: boolean;
};

interface ClusterAIPageProps {
  allLogs: ActivityLog[];
}

const DAILY_PROMPT_CAP = 20;
const MODE_ORDER: ClusterModeKey[] = ['grants', 'opportunities', 'guidance', 'decision-support'];
const LIME_ACCENT = '#D2F677';
const LIME_GLOW = 'rgba(210,246,119,0.35)';

const MODE_CONFIG: Record<ClusterModeKey, ClusterModeConfig> = {
  grants: {
    key: 'grants',
    label: 'Grant Discovery',
    buttonLabel: 'Grants',
    detail: 'Funding matches based on your impact profile',
    focus: 'Eligibility + deadlines + geography',
    inputPlaceholder: "Ask Anything: 'Find environmental grants that align with my impact profile'...",
    sidebarEyebrow: 'Grant Intelligence',
    sidebarTitle: 'Live Discoveries',
    sidebarEmpty: 'Run a grant query to populate intelligence feed.',
    insightLine: 'Grant stream aligns your profile with likely-fit funding opportunities.',
    refreshLabel: 'Refresh Grant Search',
    icon: Layers,
  },
  opportunities: {
    key: 'opportunities',
    label: 'Opportunity Distribution',
    buttonLabel: 'Distribution',
    detail: 'Best events and open slots for your schedule',
    focus: 'Right volunteers to right opportunities',
    inputPlaceholder: "Ask Anything: 'Distribute me to the highest-impact open opportunities'...",
    sidebarEyebrow: 'Distribution Metrics',
    sidebarTitle: 'Allocation Signals',
    sidebarEmpty: 'Run an opportunities query to populate allocation signals.',
    insightLine: 'Distribution stream tracks open slots, coverage pressure, and scheduling opportunities.',
    refreshLabel: 'Refresh Distribution Feed',
    icon: Compass,
  },
  guidance: {
    key: 'guidance',
    label: 'Portal Guidance',
    buttonLabel: 'Guidance',
    detail: 'What to do next in the volunteer portal',
    focus: 'Workflow steps and execution order',
    inputPlaceholder: "Ask Anything: 'Guide me through clearing pending approvals fast'...",
    sidebarEyebrow: 'Portal Guidance',
    sidebarTitle: 'Workflow Clarity',
    sidebarEmpty: 'Ask a workflow question to populate guidance signals.',
    insightLine: 'Guidance stream highlights blockers and next-step actions.',
    refreshLabel: 'Refresh Guidance Feed',
    icon: Globe,
  },
  'decision-support': {
    key: 'decision-support',
    label: 'Decision Support',
    buttonLabel: 'Decisions',
    detail: 'Priority callouts and action plans',
    focus: 'Tradeoffs, risk, and execution choices',
    inputPlaceholder: "Ask Anything: 'What is my best decision for this week?'...",
    sidebarEyebrow: 'Decision Metrics',
    sidebarTitle: 'Decision Signals',
    sidebarEmpty: 'Run a decision-support query to populate recommendations.',
    insightLine: 'Decision stream surfaces tradeoffs, risk, and next-best actions.',
    refreshLabel: 'Refresh Decision Feed',
    icon: Cpu,
  },
};

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'your',
  'this',
  'that',
  'have',
  'help',
  'hour',
  'hours',
  'event',
  'events',
  'volunteer',
  'volunteering',
  'session',
  'task',
  'work',
  'at',
  'to',
  'of',
  'in',
  'on',
  'a',
  'an',
]);

const formatDate = (value: Date | null) => {
  if (!value) return 'Date TBD';
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const parseEventCapacity = (eventData: Record<string, any>) => {
  const parseNumber = (raw: unknown) => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const matched = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
      if (!matched) return null;
      const parsed = Number(matched[0]);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const directCandidates = [
    eventData.capacity,
    eventData.capacity_value,
    eventData.maxCapacity,
    eventData.max_capacity,
    eventData.maxVolunteers,
    eventData.max_volunteers,
    eventData.maxVolunteer,
    eventData.max_volunteer,
    eventData.requirements?.maxVolunteers,
    eventData.requirements?.max_volunteers,
  ];
  for (const candidate of directCandidates) {
    const parsed = parseNumber(candidate);
    if (parsed && parsed > 0) return parsed;
  }

  if (eventData.peoplePerSlot && Array.isArray(eventData.timeSlots) && eventData.timeSlots.length > 0) {
    return Number(eventData.peoplePerSlot) * eventData.timeSlots.length;
  }

  return 0;
};

const toStatus = (value: unknown) => String(value || '').trim().toLowerCase();

const isDeclinedStatus = (value: unknown) => {
  const status = toStatus(value);
  if (!status) return false;
  return ['declined', 'rejected', 'denied', 'cancelled', 'canceled', 'revoked'].some((token) =>
    status.includes(token),
  );
};

const isApprovedStatus = (value: unknown) => {
  const status = toStatus(value);
  if (!status) return false;
  if (status.startsWith('approved')) return true;
  return ['approved', 'accepted', 'verified', 'self logged', 'self-logged'].includes(status);
};

const isPendingStatus = (value: unknown) => {
  const status = toStatus(value);
  if (!status) return true;
  if (isApprovedStatus(status) || isDeclinedStatus(status)) return false;
  return ['pending', 'awaiting', 'request', 'approval', 'needs approval'].some((token) =>
    status.includes(token),
  );
};

const parseHours = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const usageKeyFor = (uid: string) => {
  const day = new Date().toISOString().slice(0, 10);
  return `nexolink:cluster-ai:usage:${uid || 'anon'}:${day}`;
};

export const ClusterAIPage: React.FC<ClusterAIPageProps> = ({ allLogs }) => {
  const [selectedModes, setSelectedModes] = useState<ClusterModeKey[]>([]);
  const [activeQuickPrompt, setActiveQuickPrompt] = useState('Volunteer');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [userId, setUserId] = useState('');
  const [eventRecords, setEventRecords] = useState<EventRecord[]>([]);
  const [signupCounts, setSignupCounts] = useState<Record<string, number>>({});
  const [promptUsage, setPromptUsage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDeepMode = selectedModes.length >= 2;
  const hasModeSelection = selectedModes.length > 0;
  const primaryMode = selectedModes[0] || null;
  const activeModeConfig = primaryMode ? MODE_CONFIG[primaryMode] : null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setUserId(user?.uid || '');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(usageKeyFor(userId));
    const parsed = Number(raw || 0);
    setPromptUsage(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setEventRecords([]);
      return;
    }
    const db = getFirestoreDb();
    let cancelled = false;
    let unsubscribeEvents: (() => void) | null = null;

    const start = async () => {
      const [userOrgSnap, userMembershipSnap] = await Promise.all([
        getDocs(query(collection(db, 'user_organizations'), where('user_id', '==', userId))),
        getDocs(query(collection(db, 'users'), where('user_id', '==', userId))),
      ]);
      if (cancelled) return;

      const isMembership = (value: VolunteerMembership | null): value is VolunteerMembership =>
        Boolean(value);
      const memberships = [
        ...userOrgSnap.docs
          .map((docSnap) =>
            extractVolunteerMembership(
              (docSnap.data() || {}) as Record<string, unknown>,
              docSnap.id,
              'user_organizations',
            ),
          )
          .filter(isMembership),
        ...userMembershipSnap.docs
          .filter((docSnap) => docSnap.id !== userId)
          .map((docSnap) =>
            extractVolunteerMembership(
              (docSnap.data() || {}) as Record<string, unknown>,
              docSnap.id,
              'users',
            ),
          )
          .filter(isMembership),
      ];
      const resolvedMemberships = await hydrateVolunteerMembershipPlans(
        db as any,
        mergeVolunteerMemberships(memberships),
      );
      const eligibleMemberships = resolvedMemberships.filter(hasPremiumAccessForMembership);
      const orgCodes = new Set<string>(
        eligibleMemberships.map((membership) => membership.code).filter(Boolean),
      );
      const orgIds = new Set<string>(
        eligibleMemberships.map((membership) => membership.id).filter(Boolean),
      );

      if (!orgCodes.size && !orgIds.size) {
        setEventRecords([]);
        return;
      }

      unsubscribeEvents = onSnapshot(collection(db, 'events'), (snapshot) => {
        const nextRecords: EventRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = (docSnap.data() || {}) as Record<string, any>;
          const status = toStatus(data.status);
          if (status === 'draft' || status === 'archived') return;
          const orgCode = String(data.orgCode || data.org_code || data.organizationCode || '').toUpperCase();
          const orgId = String(data.orgId || data.org_id || data.organizationId || '');
          const orgName = String(
            data.orgName ||
              data.org_name ||
              data.organizationName ||
              data.organization_name ||
              (orgCode ? `Org ${orgCode}` : 'Organization'),
          );
          const belongsToOrg = (orgCode && orgCodes.has(orgCode)) || (orgId && orgIds.has(orgId));
          if (!belongsToOrg) return;

          const title = String(data.title || data.name || 'Untitled Event');
          const location = String(data.venue || data.location || data.addressLine1 || data.city || 'TBD');
          const capacity = parseEventCapacity(data);
          nextRecords.push({
            id: docSnap.id,
            title,
            location,
            startDateRaw: data.startDate || data.date || null,
            capacity,
            orgName,
            orgCode,
          });
        });

        nextRecords.sort((a, b) => {
          const left = normalizeDateValue(a.startDateRaw)?.getTime() || 0;
          const right = normalizeDateValue(b.startDateRaw)?.getTime() || 0;
          return left - right;
        });

        setEventRecords(nextRecords);
      });
    };

    void start().catch((error) => {
      console.error('Failed to load cluster events', error);
      setEventRecords([]);
    });

    return () => {
      cancelled = true;
      if (unsubscribeEvents) unsubscribeEvents();
    };
  }, [userId]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!eventRecords.length) {
      setSignupCounts({});
      return;
    }

    const ids = eventRecords.map((record) => record.id);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 10) {
      chunks.push(ids.slice(i, i + 10));
    }

    const unsubscribers = chunks.map((chunk) =>
      onSnapshot(query(collection(db, 'event_signups'), where('eventId', 'in', chunk)), (snapshot) => {
        const counts: Record<string, number> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          const status = toStatus(data.status);
          if (isDeclinedStatus(status)) return;
          const eventId = String(data.eventId || data.event_id || '');
          if (!eventId) return;
          counts[eventId] = (counts[eventId] || 0) + 1;
        });

        setSignupCounts((prev) => {
          const next = { ...prev };
          chunk.forEach((eventId) => delete next[eventId]);
          Object.entries(counts).forEach(([eventId, count]) => {
            next[eventId] = count;
          });
          return next;
        });
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [eventRecords]);

  const opportunities = useMemo<EventOpportunity[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventRecords.map((record) => {
      const startDate = normalizeDateValue(record.startDateRaw);
      const filled = signupCounts[record.id] || 0;
      const openSlots = Math.max(record.capacity - filled, 0);
      const isUpcoming = !!startDate && startDate.getTime() >= today.getTime();
      return {
        ...record,
        startDate,
        startDateLabel: formatDate(startDate),
        filled,
        openSlots,
        isUpcoming,
      };
    });
  }, [eventRecords, signupCounts]);

  const insights = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayMs = 24 * 60 * 60 * 1000;
    let totalLogs = 0;
    let approvedLogs = 0;
    let pendingLogs = 0;
    let declinedLogs = 0;
    let approvedHours = 0;
    let totalHours = 0;
    let hoursLast30 = 0;
    let hoursPrevious30 = 0;
    const activeDays30 = new Set<string>();
    const keywordCounter = new Map<string, number>();

    allLogs.forEach((log) => {
      totalLogs += 1;
      const status = log.approve;
      const hours = parseHours((log as Record<string, unknown>).hours_contributed ?? (log as Record<string, unknown>).hours);
      totalHours += hours;
      const date = normalizeDateValue(log.date);

      if (isDeclinedStatus(status)) {
        declinedLogs += 1;
      } else if (isApprovedStatus(status) || (log as Record<string, any>).is_personal) {
        approvedLogs += 1;
        approvedHours += hours;
        if (date) {
          const diffDays = Math.floor((today.getTime() - date.getTime()) / dayMs);
          if (diffDays >= 0 && diffDays <= 30) {
            hoursLast30 += hours;
            activeDays30.add(date.toISOString().slice(0, 10));
          } else if (diffDays > 30 && diffDays <= 60) {
            hoursPrevious30 += hours;
          }
        }
      } else if (isPendingStatus(status)) {
        pendingLogs += 1;
      }

      const taskLabel = String(
        (log as Record<string, any>).site ||
          (log as Record<string, any>).activity_name ||
          (log as Record<string, any>).task ||
          '',
      )
        .toLowerCase()
        .trim();
      if (!taskLabel) return;
      taskLabel
        .split(/[^a-z0-9]+/g)
        .filter((word) => word && word.length >= 3 && !STOP_WORDS.has(word))
        .forEach((word) => {
          keywordCounter.set(word, (keywordCounter.get(word) || 0) + 1);
        });
    });

    const topKeywords = Array.from(keywordCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word);

    const upcoming = opportunities.filter((opportunity) => opportunity.isUpcoming);
    const totalCapacity = upcoming.reduce((sum, item) => sum + Math.max(item.capacity, 0), 0);
    const filledSlots = upcoming.reduce((sum, item) => sum + Math.max(item.filled, 0), 0);
    const openSlots = upcoming.reduce((sum, item) => sum + Math.max(item.openSlots, 0), 0);
    const coverageRate = totalCapacity > 0 ? Math.min((filledSlots / totalCapacity) * 100, 100) : null;

    const sortedOpen = [...upcoming]
      .sort((a, b) => {
        if (b.openSlots !== a.openSlots) return b.openSlots - a.openSlots;
        const left = a.startDate?.getTime() || Number.MAX_SAFE_INTEGER;
        const right = b.startDate?.getTime() || Number.MAX_SAFE_INTEGER;
        return left - right;
      })
      .slice(0, 4);

    const organizationMap = new Map<string, { events: number; openSlots: number }>();
    upcoming.forEach((opportunity) => {
      const key = opportunity.orgName || opportunity.orgCode || 'Organization';
      const current = organizationMap.get(key) || { events: 0, openSlots: 0 };
      current.events += 1;
      current.openSlots += Math.max(opportunity.openSlots, 0);
      organizationMap.set(key, current);
    });
    const topOrganizations = Array.from(organizationMap.entries())
      .sort((a, b) => {
        if (b[1].openSlots !== a[1].openSlots) return b[1].openSlots - a[1].openSlots;
        return b[1].events - a[1].events;
      })
      .slice(0, 5)
      .map(([name, data]) => ({
        name,
        events: data.events,
        openSlots: data.openSlots,
      }));

    const trendPercent =
      hoursPrevious30 > 0
        ? ((hoursLast30 - hoursPrevious30) / hoursPrevious30) * 100
        : hoursLast30 > 0
          ? 100
          : 0;

    return {
      totalLogs,
      approvedLogs,
      pendingLogs,
      declinedLogs,
      totalHours,
      approvedHours,
      hoursLast30,
      hoursPrevious30,
      trendPercent,
      activeDays30: activeDays30.size,
      upcomingCount: upcoming.length,
      totalCapacity,
      filledSlots,
      openSlots,
      coverageRate,
      topKeywords,
      topOpportunities: sortedOpen,
      topOrganizations,
    };
  }, [allLogs, opportunities]);

  const metricsChips = useMemo<MetricChip[]>(() => {
    const coverageLabel = insights.coverageRate == null ? 'N/A' : `${Math.round(insights.coverageRate)}%`;
    if (!selectedModes.length) {
      return [
        { label: 'Approved hours', value: insights.approvedHours.toFixed(1) },
        { label: 'Pending logs', value: String(insights.pendingLogs) },
        { label: 'Upcoming opportunities', value: String(insights.upcomingCount) },
        { label: 'Coverage', value: coverageLabel },
      ];
    }

    if (isDeepMode) {
      return [
        { label: 'Deep mode', value: `${selectedModes.length} models` },
        { label: 'Open slots', value: String(insights.openSlots) },
        { label: 'Pending approvals', value: String(insights.pendingLogs) },
        { label: '30-day trend', value: `${insights.trendPercent >= 0 ? '+' : ''}${Math.round(insights.trendPercent)}%` },
      ];
    }

    const mode = selectedModes[0];
    if (mode === 'grants') {
      return [
        { label: 'Impact profile tags', value: insights.topKeywords.length ? insights.topKeywords.length.toString() : '0' },
        { label: '30-day approved hours', value: insights.hoursLast30.toFixed(1) },
        { label: 'Upcoming opportunities', value: String(insights.upcomingCount) },
        { label: 'Coverage', value: coverageLabel },
      ];
    }
    if (mode === 'opportunities') {
      return [
        { label: 'Upcoming events', value: String(insights.upcomingCount) },
        { label: 'Total capacity', value: String(insights.totalCapacity) },
        { label: 'Open slots', value: String(insights.openSlots) },
        { label: 'Coverage', value: coverageLabel },
      ];
    }
    if (mode === 'guidance') {
      return [
        { label: 'Total logs', value: String(insights.totalLogs) },
        { label: 'Pending logs', value: String(insights.pendingLogs) },
        { label: 'Active days (30d)', value: String(insights.activeDays30) },
        { label: 'Declined logs', value: String(insights.declinedLogs) },
      ];
    }
    return [
      { label: 'Coverage', value: coverageLabel },
      { label: 'Pending risk', value: String(insights.pendingLogs) },
      { label: 'Open slots', value: String(insights.openSlots) },
      { label: '30-day trend', value: `${insights.trendPercent >= 0 ? '+' : ''}${Math.round(insights.trendPercent)}%` },
    ];
  }, [insights, isDeepMode, selectedModes]);

  const quickPrompts = useMemo(
    (): QuickPromptChip[] => [
      {
        label: 'Volunteer',
        prompt: 'Volunteer: show me how to volunteer step by step.',
      },
      {
        label: 'Organizations',
        prompt: 'Organizations: find organizations I can volunteer with.',
      },
      {
        label: 'NexoLink?',
        prompt: 'NexoLink: what is NexoLink and how does it help me?',
      },
    ],
    [],
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking]);

  const handleModeSelect = (mode: ClusterModeKey) => {
    setSelectedModes((prev) => {
      const exists = prev.includes(mode);
      const next = exists ? prev.filter((entry) => entry !== mode) : [...prev, mode];
      const sorted = [...next].sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
      if (sorted.length > 0) {
        inputRef.current?.focus();
      }
      return sorted;
    });
  };

  const buildResponse = (queryText: string, modes: ClusterModeKey[]) => {
    const lines: string[] = [];
    const trimmed = queryText.trim();
    const normalizedPrompt = trimmed.toLowerCase();
    const wantsVolunteerGuide =
      normalizedPrompt.startsWith('volunteer') ||
      normalizedPrompt.includes('how to volunteer');
    const wantsOrganizationSearch =
      normalizedPrompt.startsWith('organizations') ||
      normalizedPrompt.includes('organization') ||
      normalizedPrompt.includes('organisations');
    const wantsNexoLinkOverview =
      normalizedPrompt.startsWith('nexolink') || normalizedPrompt.includes('what is nexolink');
    const coverageText =
      insights.coverageRate == null
        ? 'No upcoming events are currently published, so coverage is not computable yet.'
        : `Coverage is ${Math.round(insights.coverageRate)}% (${insights.filledSlots}/${insights.totalCapacity} filled).`;

    if (wantsVolunteerGuide) {
      lines.push('How To Volunteer');
      lines.push(`- Approved hours on your profile: ${insights.approvedHours.toFixed(1)}`);
      lines.push(`- Pending logs to resolve first: ${insights.pendingLogs}`);
      lines.push(`- Upcoming opportunities available: ${insights.upcomingCount}`);
      lines.push('');
      lines.push('Step-by-step');
      lines.push('1) Pick one mission you want to support this week.');
      if (insights.topOpportunities.length) {
        lines.push(
          `2) Register for ${insights.topOpportunities[0].title} (${insights.topOpportunities[0].startDateLabel}).`,
        );
      } else {
        lines.push('2) Ask your coordinator to publish upcoming events, then register for the earliest one.');
      }
      lines.push('3) Complete the event and log your hours with task + duration + date.');
      lines.push(
        `4) Follow up on approvals${insights.pendingLogs > 0 ? ` (you currently have ${insights.pendingLogs} pending)` : ''}.`,
      );
      lines.push('5) Repeat weekly to build consistency and stronger impact history.');
      return lines.join('\n');
    }

    if (wantsOrganizationSearch) {
      lines.push('Organization Search');
      if (!insights.topOrganizations.length) {
        lines.push('- No organizations with upcoming published events are visible in your current data.');
        lines.push('- Ask for access codes from org admins, then join to unlock their events and messaging.');
      } else {
        lines.push('- Best orgs to target from your live data:');
        insights.topOrganizations.forEach((org, index) => {
          lines.push(
            `  ${index + 1}) ${org.name}: ${org.events} upcoming event${org.events === 1 ? '' : 's'}, ${org.openSlots} open slot${org.openSlots === 1 ? '' : 's'}.`,
          );
        });
        lines.push('- Prioritize orgs with more open slots and earlier event dates.');
      }
      return lines.join('\n');
    }

    if (wantsNexoLinkOverview) {
      lines.push('What Is NexoLink?');
      lines.push('- NexoLink is your volunteer operating portal: hours logging, approvals, organizations, events, and messaging in one place.');
      lines.push(`- Your current profile has ${insights.totalLogs} total logs and ${insights.approvedLogs} approved logs.`);
      lines.push(`- It currently shows ${insights.upcomingCount} upcoming opportunities tied to your memberships.`);
      lines.push('- Use it to register for events, track impact, and keep organizations synced with your verified activity.');
      return lines.join('\n');
    }

    lines.push('Data Snapshot');
    lines.push(`- Approved hours: ${insights.approvedHours.toFixed(1)}`);
    lines.push(`- Pending logs: ${insights.pendingLogs}`);
    lines.push(`- Upcoming opportunities: ${insights.upcomingCount}`);
    lines.push(`- ${coverageText}`);

    if (!modes.length) {
      lines.push('');
      lines.push('General Plan');
      lines.push('- Prioritize one upcoming opportunity with the highest open-slot pressure.');
      lines.push('- Clear pending logs to improve approval velocity and reporting confidence.');
      lines.push('- Keep 30-day activity consistent to strengthen both reliability and grant readiness.');
    } else if (modes.length >= 2) {
      lines.push('');
      lines.push('Deep Mode Analysis');
      lines.push(`- Active modes: ${modes.map((mode) => MODE_CONFIG[mode].label).join(', ')}`);
      lines.push(`- Cross-factor priority: ${insights.pendingLogs > 0 ? 'clear approval backlog' : 'fill open slots in upcoming events'}.`);
      lines.push(`- Workload signal: ${insights.trendPercent >= 0 ? 'rising' : 'cooling'} (${Math.round(insights.trendPercent)}% vs prior 30 days).`);
      lines.push('- Combined action plan:');
      lines.push('  1) Close pending items with dated follow-ups.');
      lines.push('  2) Commit to the top open opportunities this week.');
      lines.push('  3) Document impact highlights for funding and leadership reporting.');
    } else {
      const mode = modes[0];
      lines.push('');
      if (mode === 'grants') {
        lines.push('Grant Mode');
        lines.push(
          `- Strongest impact keywords from your logs: ${insights.topKeywords.length ? insights.topKeywords.join(', ') : 'not enough tagged activity yet'}.`,
        );
        lines.push('- Use these proof points in grant narratives: verified hours, consistency over 30 days, and mission-aligned task outcomes.');
        lines.push('- Next move: export recent logs and draft a one-page impact summary before searching opportunities.');
      } else if (mode === 'opportunities') {
        lines.push('Opportunity Mode');
        if (!insights.topOpportunities.length) {
          lines.push('- No upcoming opportunities are available yet. Ask your admin to publish events.');
        } else {
          insights.topOpportunities.forEach((opportunity, index) => {
            lines.push(
              `- ${index + 1}. ${opportunity.title} (${opportunity.startDateLabel}) - ${opportunity.openSlots} open slots.`,
            );
          });
        }
        lines.push('- Prioritize events with higher open-slot counts and nearest dates.');
      } else if (mode === 'guidance') {
        lines.push('Portal Guidance Mode');
        lines.push(`- Pending approvals to resolve: ${insights.pendingLogs}.`);
        lines.push('- Workflow sequence: log session -> verify details -> check approval state -> follow up if aging.');
        lines.push('- Keep entries specific (task, duration, date) to reduce approval latency.');
      } else {
        lines.push('Decision Support Mode');
        lines.push(
          `- Primary decision: ${insights.pendingLogs > 0 ? 'clear pending approvals first' : 'focus on highest open-slot opportunities'}.`,
        );
        lines.push(`- Risk level: ${insights.coverageRate == null ? 'unknown (no events yet)' : insights.coverageRate < 70 ? 'elevated' : 'moderate'}.`);
        lines.push('- Execute in this order: immediate tasks, this-week commitments, then month-level optimization.');
      }
    }

    if (trimmed) {
      lines.push('');
      lines.push(`Prompt interpreted: "${trimmed}"`);
    }

    return lines.join('\n');
  };

  const updatePromptUsage = () => {
    const next = promptUsage + 1;
    setPromptUsage(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(usageKeyFor(userId), String(next));
    }
  };

  const handleSend = async (value?: string) => {
    const text = (value ?? input).trim();
    if (!text || isThinking) return;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    if (promptUsage >= DAILY_PROMPT_CAP) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: 'Cluster AI is recalibrating this workspace right now. Try again shortly.',
        },
      ]);
      return;
    }

    updatePromptUsage();
    setIsThinking(true);
    window.setTimeout(() => {
      const content = buildResponse(text, selectedModes);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content,
        },
      ]);
      setIsThinking(false);
    }, 380);
  };

  return (
    <div className="w-full h-full bg-[#FAFAFA] flex overflow-hidden relative font-sans">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-[20%] -right-[10%] w-[1000px] h-[1000px] bg-gradient-to-br from-[#D2F677]/10 to-transparent rounded-full blur-[160px]"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [0, -90, 0],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-[20%] -left-[10%] w-[800px] h-[800px] bg-gradient-to-tr from-gray-200/40 to-transparent rounded-full blur-[140px]"
        />
      </div>

      <div className="flex-1 flex flex-col h-full relative z-10">
        <div className="px-12 py-8 flex items-center justify-start bg-white/60 backdrop-blur-3xl sticky top-0 z-20 border-b border-gray-100">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-4xl font-[1000] text-gray-900 tracking-tighter italic uppercase leading-none">
                Cluster AI
              </h2>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-12 py-10 space-y-12">
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="w-full max-w-6xl px-6">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  className="mb-12 relative"
                >
                  <h1 className="text-6xl md:text-7xl font-[1000] text-gray-900 tracking-tighter italic uppercase leading-[0.9] mb-6">
                    How can I <span className="text-transparent bg-clip-text bg-gradient-to-r from-black via-gray-700 to-[#D2F677] animate-gradient-x">help you</span> today?
                  </h1>
                  <div className="h-1 w-24 bg-[#D2F677] mx-auto rounded-full shadow-[0_0_20px_#D2F677]" />
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.8 }}
                    className="mt-8 text-sm font-bold text-gray-400 uppercase tracking-[0.4em]"
                  >
                    Volunteer Intelligence Ready
                  </motion.p>
                </motion.div>

                <div className="mt-8 w-full max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-4">
                  {quickPrompts.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => {
                        setActiveQuickPrompt(chip.label);
                        void handleSend(chip.prompt);
                      }}
                      className={`min-w-[220px] h-16 px-8 rounded-full border text-[15px] sm:text-[16px] leading-none font-[850] tracking-[0.01em] transition-all duration-200 ${
                        activeQuickPrompt === chip.label
                          ? 'border-[#BFE85E] bg-[#FDFEFB] text-[#0F172A] shadow-[0_8px_20px_rgba(0,0,0,0.04)]'
                          : 'border-[#E5E7EB] bg-[#FFFFFF] text-[#4B5563] hover:border-[#D2F677] hover:text-[#111827]'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] flex flex-col gap-3 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`p-8 rounded-[2.5rem] text-xl font-medium leading-relaxed tracking-tight shadow-lg transition-all whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-black text-white rounded-tr-none'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)]'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">
                    {msg.role === 'user' ? 'Volunteer' : 'Cluster Intelligence'}
                  </span>
                </div>
              </motion.div>
            ))}

            {isThinking && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white border border-gray-100 flex items-center justify-center relative overflow-hidden shadow-sm">
                  <motion.div
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.2, 0.5, 0.2],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute inset-0 bg-[#D2F677]"
                  />
                  <Zap className="w-5 h-5 text-black relative z-10 animate-pulse" />
                </div>
                <span className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] italic">
                  Synthesizing intelligence...
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-10 bg-transparent">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
            className={`max-w-4xl mx-auto flex items-center gap-4 rounded-[3rem] p-3 transition-all duration-300 relative bg-white ${
              hasModeSelection
                ? 'border border-[#D2F677] shadow-[0_0_35px_rgba(210,246,119,0.35)]'
                : 'border border-gray-200 shadow-[0_10px_28px_rgba(15,23,42,0.08)] focus-within:border-[#D2F677] focus-within:shadow-[0_0_30px_rgba(210,246,119,0.1)]'
            }`}
            style={
              hasModeSelection
                ? {
                    borderColor: LIME_ACCENT,
                    boxShadow: `0 0 35px ${LIME_GLOW}`,
                  }
                : undefined
            }
          >
            {hasModeSelection && (
              <div className="absolute -top-7 left-8 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.3em]" style={{ backgroundColor: `${LIME_ACCENT}66`, color: '#0F172A' }}>
                  {isDeepMode ? 'Deep Mode Active' : `${activeModeConfig?.label || 'Mode'} Active`}
                </span>
                <span className="px-3 py-1 rounded-full bg-white text-[10px] font-black uppercase tracking-[0.2em] text-gray-500" style={{ border: `1px solid ${LIME_ACCENT}` }}>
                  {isDeepMode
                    ? `Modes: ${selectedModes.map((mode) => MODE_CONFIG[mode].buttonLabel).join(' + ')}`
                    : `Focus: ${activeModeConfig?.focus || ''}`}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (quickPrompts.length) {
                  setInput(quickPrompts[0].prompt);
                  inputRef.current?.focus();
                }
              }}
              className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <Plus className="w-6 h-6" />
            </button>

            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              ref={inputRef}
              placeholder={
                isDeepMode
                  ? 'Deep Mode active: ask for full cross-factor analysis across selected features...'
                  : activeModeConfig?.inputPlaceholder || 'Select one or more mode buttons above, then ask your question...'
              }
              className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 placeholder:text-gray-400 font-bold text-lg"
            />

            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center hover:bg-gray-800 hover:scale-105 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale shadow-lg"
            >
              <Send className="w-6 h-6" />
            </button>
          </form>
        </div>
      </div>

    </div>
  );
};
