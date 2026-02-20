import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  ArrowLeft,
  Search,
  Mail,
  MessageSquare,
  CheckCircle2,
  Download,
  Trash2,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, query, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { getActiveSubAdminSession, resolveOrgContext, subscribeToOrgCollection } from '../lib/orgContext';
import { AiInsightWidget } from './AiInsightWidget';
import { useGeminiInsight } from '../hooks/useGeminiInsight';

interface EventsPageProps {
  onNavigate: (view: string) => void;
  isActive?: boolean;
  aiEnabled?: boolean;
  planTier?: string;
}

interface Event {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  status?: string;
  capacity?: number | null;
  maxVolunteers?: number;
  peoplePerSlot?: number | null;
  timeSlots?: Array<{ id: string; capacity?: number | null }>;
  coverImageUrl?: string;
  isDateRange?: boolean;
  shifts?: Array<{ id: string; startTime: string; endTime: string }>;
  category?: string;
  description?: string;
  location?: string;
  recurrenceType?: 'one-time' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceParentId?: string;
  recurrenceOccurrenceDate?: string;
}
type Signup = {
  id: string;
  eventId: string;
  volunteerId?: string;
  volunteerName: string;
  volunteerEmail: string;
  status: string;
  role: string;
};
type DeleteScope = 'single' | 'series';

const EVENT_DRAFT_EDIT_KEY = 'nexolink:event-edit-id';
const EVENT_REROLL_PREFILL_KEY = 'nexolink:event-reroll-prefill';
const SUBADMIN_LOGIN_API_PATH = '/api/subAdminLogin';
const RECURRING_TYPES = new Set(['weekly', 'biweekly', 'monthly']);
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

const parseDate = (value?: string) => {
  if (!value) return null;
  const raw = String(value).trim();
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const monthIndex = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    const date = new Date(year, monthIndex, day, 0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    0,
    0,
    0,
    0,
  );
};

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addRecurrenceStep = (date: Date, recurrenceType: string) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  if (recurrenceType === 'weekly') {
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (recurrenceType === 'biweekly') {
    next.setDate(next.getDate() + 14);
    return next;
  }
  next.setMonth(next.getMonth() + 1);
  return next;
};

const formatDateBadge = (value?: string) => {
  const date = parseDate(value);
  if (!date) return { day: '—', month: '—' };
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
  };
};

const formatTimeRange = (start?: string, end?: string) => {
  if (!start && !end) return 'Time TBA';
  const format = (raw?: string) => {
    if (!raw) return '';
    const [h, m] = raw.split(':');
    const hours = Number(h);
    if (Number.isNaN(hours)) return raw;
    const date = new Date();
    date.setHours(hours, Number(m || 0), 0, 0);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  if (!end) return format(start);
  return `${format(start)} - ${format(end)}`;
};

const formatLocation = (event: Event) => {
  if (event.location) return event.location;
  return [event.venue, event.addressLine1, [event.city, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
};

const getEventStatus = (event: Event) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const start = parseDate(event.startDate);
  const end = parseDate(event.endDate || event.startDate);
  
  if (!start || !end) return 'unknown';

  if (today.getTime() < start.getTime()) return 'upcoming';
  if (today.getTime() > end.getTime()) return 'past';
  return 'live';
};

const isPastEvent = (event: Event) => getEventStatus(event) === 'past';
const isUpcomingEvent = (event: Event) => getEventStatus(event) === 'upcoming';
const isLiveEvent = (event: Event) => getEventStatus(event) === 'live';
const MAX_PAST_EVENTS = 10;
const isRecurringTemplateEvent = (event: Event) =>
  !event.recurrenceParentId && RECURRING_TYPES.has(String(event.recurrenceType || '').toLowerCase());
const isRecurringSeriesEvent = (event: Event | null) =>
  !!event && (
    !!String(event.recurrenceParentId || '').trim()
    || RECURRING_TYPES.has(String(event.recurrenceType || '').toLowerCase())
  );

const getEventSortTime = (event: Event) => {
  return (
    parseDate(event.endDate || event.startDate)?.getTime() ||
    parseDate(event.startDate)?.getTime() ||
    0
  );
};

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

const resolveCoverImageUrl = (data: Record<string, unknown>) => {
  const coverObject = (typeof data.coverImage === 'object' && data.coverImage !== null)
    ? (data.coverImage as Record<string, unknown>)
    : null;
  const legacyCoverObject = (typeof (data as Record<string, unknown>).cover_image === 'object' && (data as Record<string, unknown>).cover_image !== null)
    ? ((data as Record<string, unknown>).cover_image as Record<string, unknown>)
    : null;
  const raw =
    data.coverImageUrl ||
    data.cover_image_url ||
    (coverObject?.url as unknown) ||
    (legacyCoverObject?.url as unknown) ||
    data.coverImage ||
    data.imageUrl ||
    data.image_url ||
    '';
  const text = String(raw || '').trim();
  return text || undefined;
};

const normalizeEvent = (data: Record<string, unknown>, id: string): Event => ({
  id,
  title: String(data.title || 'Untitled Event'),
  startDate: String(data.startDate || ''),
  endDate: data.endDate ? String(data.endDate) : undefined,
  startTime: data.startTime ? String(data.startTime) : undefined,
  endTime: data.endTime ? String(data.endTime) : undefined,
  venue: data.venue ? String(data.venue) : undefined,
  addressLine1: data.addressLine1 ? String(data.addressLine1) : (data.address ? String(data.address) : undefined),
  city: data.city ? String(data.city) : undefined,
  state: data.state ? String(data.state) : undefined,
  status: data.status ? String(data.status) : 'published',
  capacity: parseNumber(data.capacity ?? data.capacity_value ?? data.maxCapacity ?? data.max_capacity),
  maxVolunteers: parseNumber(
    data.maxVolunteers ??
      data.max_volunteers ??
      data.maxVolunteer ??
      data.max_volunteer ??
      (typeof data.requirements === 'object' && data.requirements !== null
        ? (data.requirements as Record<string, unknown>).maxVolunteers ??
          (data.requirements as Record<string, unknown>).max_volunteers ??
          (data.requirements as Record<string, unknown>).maxVolunteer ??
          (data.requirements as Record<string, unknown>).max_volunteer
        : undefined)
  ) ?? undefined,
  peoplePerSlot: parseNumber(data.peoplePerSlot ?? data.people_per_slot),
  timeSlots: Array.isArray(data.timeSlots) ? data.timeSlots : [],
  coverImageUrl: resolveCoverImageUrl(data),
  isDateRange: !!data.isDateRange,
  shifts: Array.isArray(data.shifts) ? data.shifts : [],
  category: data.category ? String(data.category) : undefined,
  description: data.description ? String(data.description) : undefined,
  location: data.location ? String(data.location) : undefined,
  recurrenceType: data.recurrenceType
    ? (String(data.recurrenceType).toLowerCase() as Event['recurrenceType'])
    : undefined,
  recurrenceParentId: data.recurrenceParentId ? String(data.recurrenceParentId) : undefined,
  recurrenceOccurrenceDate: data.recurrenceOccurrenceDate ? String(data.recurrenceOccurrenceDate) : undefined,
});

const materializeRecurringEvents = async (
  rows: Array<{ id: string; data: Record<string, unknown> }>,
) => {
  const db = getFirestoreDb();
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const eventsByParent = new Map<string, string[]>();

  rows.forEach((row) => {
    const parentId = String((row.data || {}).recurrenceParentId || '').trim();
    if (!parentId) return;
    const list = eventsByParent.get(parentId) || [];
    const candidateDate = String((row.data || {}).startDate || '').trim();
    if (candidateDate) list.push(candidateDate);
    eventsByParent.set(parentId, list);
  });

  const tasks = rows.map(async (row) => {
    const data = row.data || {};
    const recurrenceParentId = String(data.recurrenceParentId || '').trim();
    if (recurrenceParentId) return;
    const recurrenceType = String(data.recurrenceType || 'one-time').toLowerCase();
    if (!RECURRING_TYPES.has(recurrenceType)) return;
    const templateStart = parseDate(String(data.startDate || ''));
    if (!templateStart) return;

    const knownDates = new Set<string>([
      String(data.startDate || '').trim(),
      ...(eventsByParent.get(row.id) || []),
    ]);

    const hasUpcoming = Array.from(knownDates).some((dateText) => {
      const parsed = parseDate(dateText);
      return !!parsed && parsed.getTime() >= startOfToday.getTime();
    });
    if (hasUpcoming) return;

    let nextDate = new Date(templateStart);
    while (nextDate.getTime() < startOfToday.getTime()) {
      nextDate = addRecurrenceStep(nextDate, recurrenceType);
    }

    const nextStartDate = toDateKey(nextDate);
    const templateEnd = parseDate(String(data.endDate || data.startDate || ''));
    const durationDays = templateEnd
      ? Math.max(0, Math.round((templateEnd.getTime() - templateStart.getTime()) / 86400000))
      : 0;
    const nextEndDateObj = new Date(nextDate);
    nextEndDateObj.setDate(nextEndDateObj.getDate() + durationDays);
    const nextEndDate = toDateKey(nextEndDateObj);
    const occurrenceId = `${row.id}__${nextStartDate}`;

    await setDoc(doc(db, 'events', occurrenceId), {
      ...data,
      startDate: nextStartDate,
      endDate: nextEndDate,
      status: 'published',
      recurrenceType,
      recurrenceParentId: row.id,
      recurrenceOccurrenceDate: nextStartDate,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
  });

  await Promise.all(tasks);
};

const resolveEventCapacity = (event: Event, signups: Signup[]) => {
  if (Number.isFinite(event.capacity ?? NaN) && (event.capacity ?? 0) > 0) {
    return Number(event.capacity);
  }
  if (Number.isFinite(event.maxVolunteers ?? NaN) && (event.maxVolunteers ?? 0) > 0) {
    return Number(event.maxVolunteers);
  }
  if (event.peoplePerSlot && Array.isArray(event.timeSlots) && event.timeSlots.length) {
    return event.timeSlots.length * event.peoplePerSlot;
  }
  return Math.max(signups.length, 0);
};

const resolveCapacityPercent = (event: Event, signups: Signup[]) => {
  const max = resolveEventCapacity(event, signups);
  if (!max) return 0;
  return Math.min(100, Math.round((signups.length / max) * 100));
};

export const EventsPage: React.FC<EventsPageProps> = ({
  onNavigate,
  isActive = false,
  aiEnabled = false,
  planTier = 'nebula',
}) => {
  const [filter, setFilter] = useState('Upcoming');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [orgCode, setOrgCode] = useState('');
  const [orgId, setOrgId] = useState('');
  const [subAdminScopeKey, setSubAdminScopeKey] = useState<string>(() => getActiveSubAdminSession()?.groupId || '');
  const [events, setEvents] = useState<Event[]>([]);
  const [drafts, setDrafts] = useState<Event[]>([]);
  const [signupsByEvent, setSignupsByEvent] = useState<Record<string, Signup[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteScope, setDeleteScope] = useState<DeleteScope>('single');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [volunteerSearch, setVolunteerSearch] = useState('');
  const [insightUpdatedAt, setInsightUpdatedAt] = useState(() => Date.now());

  useEffect(() => {
    setVolunteerSearch('');
  }, [selectedEvent?.id]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOrgCode('');
        setOrgId('');
        setEvents([]);
        setDrafts([]);
        setSignupsByEvent({});
        return;
      }
      const context = await resolveOrgContext(db, user.uid, user.email || null);
      setOrgCode(context.orgCode || '');
      setOrgId(context.orgId || '');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const syncScope = () => setSubAdminScopeKey(getActiveSubAdminSession()?.groupId || '');
    window.addEventListener('nexolink:subadmin-session', syncScope);
    window.addEventListener('storage', syncScope);
    return () => {
      window.removeEventListener('nexolink:subadmin-session', syncScope);
      window.removeEventListener('storage', syncScope);
    };
  }, []);

  useEffect(() => {
    if (!orgCode && !orgId) return;
    const db = getFirestoreDb();
    const unsubEvents = subscribeToOrgCollection({
      db,
      collectionName: 'events',
      orgCode,
      orgId,
      onData: (rows) => {
        const scopedRows = rows.filter((row) => matchesScopeContext(row.data || {}, subAdminScopeKey));
        void materializeRecurringEvents(scopedRows);
        const publishedCandidates: Event[] = [];
        const draftItems: Event[] = [];
        scopedRows.forEach((row) => {
          const event = normalizeEvent(row.data || {}, row.id);
          const status = (event.status || 'published').toLowerCase();
          if (status === 'draft') {
            draftItems.push(event);
          } else if (status !== 'archived') {
            publishedCandidates.push(event);
          }
        });

        const pastPublished = publishedCandidates
          .filter(isPastEvent)
          .sort((a, b) => getEventSortTime(b) - getEventSortTime(a));
        const stalePast = pastPublished
          .filter((event) => !isRecurringTemplateEvent(event))
          .slice(MAX_PAST_EVENTS);
        if (stalePast.length) {
          void Promise.allSettled(
            stalePast.map((event) => deleteDoc(doc(db, 'events', event.id))),
          );
        }
        const stalePastIds = new Set(stalePast.map((event) => event.id));
        const published = publishedCandidates
          .filter((event) => !stalePastIds.has(event.id))
          .sort((a, b) => {
            const aDate = parseDate(a.startDate)?.getTime() || 0;
            const bDate = parseDate(b.startDate)?.getTime() || 0;
            return aDate - bDate;
          });

        draftItems.sort((a, b) => {
          const aDate = parseDate(a.startDate)?.getTime() || 0;
          const bDate = parseDate(b.startDate)?.getTime() || 0;
          return bDate - aDate;
        });
        setEvents(published);
        setDrafts(draftItems);
      },
    });

    const unsubSignups = subscribeToOrgCollection({
      db,
      collectionName: 'event_signups',
      orgCode,
      orgId,
      onData: (rows) => {
        const map: Record<string, Signup[]> = {};
        rows.forEach((row) => {
          const data = row.data || {};
          if (!matchesScopeContext(data, subAdminScopeKey)) return;
          const eventId = String(data.eventId || data.event_id || '');
          if (!eventId) return;
          const entry: Signup = {
            id: row.id,
            eventId,
            volunteerId: String(
              data.volunteerId
              || data.volunteer_id
              || data.userId
              || data.user_id
              || data.uid
              || ''
            ).trim(),
            volunteerName: String(data.volunteerName || data.volunteer_name || data.displayName || data.name || 'Volunteer'),
            volunteerEmail: String(data.volunteerEmail || data.volunteer_email || data.email || ''),
            status: String(data.status || 'pending'),
            role: String(data.role || data.volunteerRole || data.slotLabel || 'Volunteer'),
          };
          if (!map[eventId]) map[eventId] = [];
          map[eventId].push(entry);
        });
        setSignupsByEvent(map);
      },
    });

    return () => {
      unsubEvents();
      unsubSignups();
    };
  }, [orgCode, orgId, subAdminScopeKey]);

  const visibleEvents = useMemo(() => {
    if (filter === 'Drafts') return drafts;
    if (filter === 'Past') return events.filter(isPastEvent);
    if (filter === 'Live') return events.filter(isLiveEvent);
    return events.filter(isUpcomingEvent);
  }, [events, drafts, filter]);

  const handleCopyEmail = (email: string) => {
    if (!email) return;
    navigator.clipboard.writeText(email);
  };

  const handleMessageVolunteer = (volunteer: Signup) => {
    const payload = {
      id: volunteer.volunteerId || '',
      email: volunteer.volunteerEmail || '',
      name: volunteer.volunteerName || '',
    };
    sessionStorage.setItem('nexolink:message-target', JSON.stringify(payload));
    onNavigate('messaging');
  };

  const handleOpenEventAction = (event: Event) => {
    const status = String(event.status || '').toLowerCase();
    if (status === 'draft') {
      sessionStorage.removeItem(EVENT_REROLL_PREFILL_KEY);
      sessionStorage.setItem(EVENT_DRAFT_EDIT_KEY, event.id);
      onNavigate('create-event');
      return;
    }
    setSelectedEvent(event);
  };

  const handleRerollEvent = (event: Event) => {
    const payload = {
      title: String(event.title || ''),
      description: String(event.description || ''),
      category: String(event.category || 'Community'),
      location: String(event.location || ''),
      maxVolunteers: event.maxVolunteers != null ? String(event.maxVolunteers) : '',
      coverImageUrl: String(event.coverImageUrl || ''),
      shifts: Array.isArray(event.shifts) ? event.shifts : [],
      recurrenceType: String(event.recurrenceType || 'one-time'),
      // Force fresh scheduling for rerolled events.
      startDate: '',
      endDate: '',
      isDateRange: false,
    };
    sessionStorage.removeItem(EVENT_DRAFT_EDIT_KEY);
    sessionStorage.setItem(EVENT_REROLL_PREFILL_KEY, JSON.stringify(payload));
    onNavigate('create-event');
  };

  const openDeleteModal = (event: Event) => {
    setDeleteTarget(event);
    setDeletePassword('');
    setDeleteScope('single');
    setShowDeletePassword(false);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteTarget(null);
    setDeletePassword('');
    setDeleteScope('single');
    setShowDeletePassword(false);
    setDeleteError(null);
  };

  const handleDeleteEvent = async () => {
    if (!deleteTarget) return;
    if (!deletePassword) {
      setDeleteError('Password is required to delete this event.');
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const auth = getFirebaseAuth();
      const db = getFirestoreDb();
      const user = auth.currentUser;
      if (!user) throw new Error('Auth state invalid.');

      const subAdminSession = getActiveSubAdminSession();
      const emailCandidates = Array.from(
        new Set(
          [user.email, subAdminSession?.email]
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      );

      let verified = false;
      let authError: any = null;

      for (const candidateEmail of emailCandidates) {
        try {
          const credential = EmailAuthProvider.credential(candidateEmail, deletePassword);
          await reauthenticateWithCredential(user, credential);
          await user.getIdToken(true);
          verified = true;
          break;
        } catch (err: any) {
          authError = err;
        }
      }

      // Sub-admin sessions can be signed in with custom token, where password reauth
      // may fail even when credentials are correct. Verify with the same fallback API.
      if (!verified && subAdminSession?.groupId && emailCandidates.length) {
        for (const candidateEmail of emailCandidates) {
          try {
            const resp = await fetch(SUBADMIN_LOGIN_API_PATH, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: candidateEmail, password: deletePassword }),
            });
            if (resp.ok) {
              verified = true;
              break;
            }
          } catch (_err) {
            // Ignore network failures here and keep default auth error handling below.
          }
        }
      }

      if (!verified) {
        throw authError || new Error('Unable to verify login password.');
      }

      const shouldDeleteSeries = isRecurringSeriesEvent(deleteTarget) && deleteScope === 'series';
      if (shouldDeleteSeries) {
        const seriesRootId = String(deleteTarget.recurrenceParentId || deleteTarget.id).trim();
        const seriesSnap = await getDocs(
          query(collection(db, 'events'), where('recurrenceParentId', '==', seriesRootId)),
        );
        const idsToDelete = new Set<string>([seriesRootId]);
        seriesSnap.forEach((docSnap) => idsToDelete.add(docSnap.id));
        await Promise.all(Array.from(idsToDelete).map((id) => deleteDoc(doc(db, 'events', id))));
      } else {
        await deleteDoc(doc(db, 'events', deleteTarget.id));
      }
      closeDeleteModal();
    } catch (err: any) {
      console.error('Failed to delete event', err);
      const code = String(err?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setDeleteError('Incorrect password. Please try again.');
      } else if (code === 'auth/too-many-requests') {
        setDeleteError('Too many attempts. Please wait and try again.');
      } else {
        setDeleteError(err?.message || 'Failed to delete event.');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const selectedSignups = useMemo(() => {
    if (!selectedEvent) return [];
    return signupsByEvent[selectedEvent.id] || [];
  }, [selectedEvent, signupsByEvent]);

  const filteredSignups = useMemo(() => {
    if (!volunteerSearch.trim()) return selectedSignups;
    const query = volunteerSearch.trim().toLowerCase();
    return selectedSignups.filter((signup) => {
      const values = [
        signup.volunteerName,
        signup.volunteerEmail,
        signup.status,
        signup.role,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return values.some((value) => value.includes(query));
    });
  }, [selectedSignups, volunteerSearch]);

  const eventInsights = useMemo(() => {
    const activeEvents = events.filter((event) => !isPastEvent(event));
    const snapshots = activeEvents.map((event) => {
      const signups = signupsByEvent[event.id] || [];
      const capacity = resolveEventCapacity(event, signups);
      const percent = resolveCapacityPercent(event, signups);
      const openSlots = Math.max(capacity - signups.length, 0);
      const pendingCount = signups.filter((signup) => {
        const status = String(signup.status || '').toLowerCase();
        return status !== 'confirmed' && status !== 'checked in' && status !== 'checked-in';
      }).length;
      const pendingRate = signups.length ? Math.round((pendingCount / signups.length) * 100) : 0;
      return {
        event,
        capacity,
        signups: signups.length,
        percent,
        openSlots,
        pendingRate,
        pendingCount,
      };
    });

    const understaffed = snapshots
      .filter((snapshot) => snapshot.capacity > 0 && snapshot.percent < 70)
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 3);
    const overstaffed = snapshots
      .filter((snapshot) => snapshot.capacity > 0 && snapshot.percent >= 100)
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 2);
    const noShowRisk = snapshots
      .filter((snapshot) => snapshot.signups > 0 && snapshot.pendingRate >= 40)
      .sort((a, b) => b.pendingRate - a.pendingRate)
      .slice(0, 3);

    return { activeEvents, understaffed, overstaffed, noShowRisk };
  }, [events, signupsByEvent]);

  useEffect(() => {
    setInsightUpdatedAt(Date.now());
  }, [events, signupsByEvent, eventInsights.understaffed.length, eventInsights.overstaffed.length, eventInsights.noShowRisk.length]);

  const insightUpdatedLabel = useMemo(() => {
    const time = new Date(insightUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Live refresh · ${time}`;
  }, [insightUpdatedAt]);

  const understaffedItems = eventInsights.understaffed.length
    ? eventInsights.understaffed.map((snapshot) => ({
        label: snapshot.event.title,
        value: `${snapshot.signups}/${snapshot.capacity}`,
        tone: 'warning' as const,
        helper: `${snapshot.openSlots} open · ${snapshot.percent}%`,
      }))
    : [
        {
          label: 'All staffed',
          value: 'OK',
          tone: 'ok' as const,
        },
      ];

  const overstaffedItems = eventInsights.overstaffed.length
    ? eventInsights.overstaffed.map((snapshot) => ({
        label: snapshot.event.title,
        value: `+${Math.max(snapshot.signups - snapshot.capacity, 0)}`,
        tone: 'alert' as const,
      }))
    : [
        {
          label: 'No overruns',
          value: 'OK',
          tone: 'ok' as const,
        },
      ];

  const noShowItems = eventInsights.noShowRisk.length
    ? eventInsights.noShowRisk.map((snapshot) => ({
        label: snapshot.event.title,
        value: `${snapshot.pendingRate}%`,
        tone: 'warning' as const,
        helper: `${snapshot.pendingCount} unconfirmed`,
      }))
    : [
        {
          label: 'No-show risk low',
          value: 'OK',
          tone: 'ok' as const,
        },
      ];

  const fallbackInsight = useMemo(
    () => ({
      summary: `${eventInsights.activeEvents.length} active · ${eventInsights.understaffed.length} understaffed · ${eventInsights.noShowRisk.length} no-show risk`,
      sections: [
        { title: 'Understaffed', items: understaffedItems },
        { title: 'Overstaffed', items: overstaffedItems },
        { title: 'No-Show Risk', items: noShowItems },
      ],
    }),
    [eventInsights, understaffedItems, overstaffedItems, noShowItems],
  );

  const insightSource = useMemo(
    () => ({
      activeEvents: eventInsights.activeEvents.length,
      understaffed: eventInsights.understaffed.map((snapshot) => ({
        title: snapshot.event.title,
        signups: snapshot.signups,
        capacity: snapshot.capacity,
        percent: snapshot.percent,
      })),
      overstaffed: eventInsights.overstaffed.map((snapshot) => ({
        title: snapshot.event.title,
        signups: snapshot.signups,
        capacity: snapshot.capacity,
      })),
      noShowRisk: eventInsights.noShowRisk.map((snapshot) => ({
        title: snapshot.event.title,
        pendingRate: snapshot.pendingRate,
        pendingCount: snapshot.pendingCount,
      })),
    }),
    [eventInsights],
  );

  const { insight: aiInsight } = useGeminiInsight({
    enabled: aiEnabled && isActive,
    planTier,
    pageKey: 'events',
    sourceData: insightSource,
    fallback: fallbackInsight,
  });

  const handleExportRoster = () => {
    if (!selectedEvent) return;
    const signups = signupsByEvent[selectedEvent.id] || [];
    if (!signups.length) {
      window.alert('No volunteers to export yet.');
      return;
    }
    const headers = ['Name', 'Email', 'Status', 'Role'];
    const rows = signups.map((signup) => [
      signup.volunteerName,
      signup.volunteerEmail,
      signup.status,
      signup.role,
    ]);
    const escapeCell = (value: string) => `"${value.replace(/\"/g, '""')}"`;
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCell(String(cell || ''))).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const filenameBase = (selectedEvent.title || 'event').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${filenameBase}_roster.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 50 } }
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {selectedEvent ? (
        <motion.div 
          key="detail"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="w-full flex flex-col gap-6 mt-8 pb-10"
        >
          {/* Detail Header */}
          <div className="flex items-center gap-4">
             <button 
                onClick={() => setSelectedEvent(null)}
                className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors group"
             >
                 <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors" />
             </button>
             <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-medium text-gray-900 tracking-tight">{selectedEvent.title}</h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${selectedEvent.status === 'full' ? 'bg-red-100 text-red-600' : 'bg-lime-100 text-lime-700'}`}>
                      {(selectedEvent.status || 'Active').toString()}
                  </span>
                </div>
                <p className="text-gray-500 font-medium">Manage event details and volunteers.</p>
             </div>
             <div className="flex gap-2">
                <button
                  onClick={handleExportRoster}
                  className="h-12 px-5 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-50 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    <span className="hidden md:inline">Export Roster</span>
                </button>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Event Info */}
              <div className="lg:col-span-1 space-y-6">
                  {/* Info Card */}
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 overflow-hidden">
                      {selectedEvent.coverImageUrl && (
                        <div className="h-48 -mx-8 -mt-8 mb-6 overflow-hidden">
                          <img src={selectedEvent.coverImageUrl} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <h3 className="font-bold text-gray-900 text-lg mb-6">Event Overview</h3>
                      <div className="space-y-6">
                          <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-900 shrink-0">
                                  <Calendar className="w-5 h-5" />
                              </div>
                              <div>
                                  <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Date</span>
                                  <span className="font-bold text-gray-900 text-lg">
                                    {formatDateBadge(selectedEvent.startDate).month} {formatDateBadge(selectedEvent.startDate).day}
                                    {selectedEvent.isDateRange && selectedEvent.endDate && (
                                      <> — {formatDateBadge(selectedEvent.endDate).month} {formatDateBadge(selectedEvent.endDate).day}</>
                                    )}
                                  </span>
                              </div>
                          </div>
                          
                          {/* Shifts Display */}
                          <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-900 shrink-0">
                                  <Clock className="w-5 h-5" />
                              </div>
                              <div>
                                  <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Shifts</span>
                                  <div className="space-y-1">
                                    {(selectedEvent.shifts && selectedEvent.shifts.length > 0) ? (
                                      selectedEvent.shifts.map((shift, i) => (
                                        <span key={i} className="block font-bold text-gray-900 text-sm">
                                          {formatTimeRange(shift.startTime, shift.endTime)}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="font-bold text-gray-900 text-lg">{formatTimeRange(selectedEvent.startTime, selectedEvent.endTime)}</span>
                                    )}
                                  </div>
                              </div>
                          </div>

                          <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-900 shrink-0">
                                  <MapPin className="w-5 h-5" />
                              </div>
                              <div>
                                  <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Location</span>
                                  <span className="font-bold text-gray-900 text-lg leading-tight">{formatLocation(selectedEvent)}</span>
                              </div>
                          </div>

                          {selectedEvent.description && (
                            <div className="pt-6 border-t border-gray-50">
                               <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</span>
                               <p className="text-sm text-gray-600 leading-relaxed">{selectedEvent.description}</p>
                            </div>
                          )}
                      </div>
                  </div>

                  {/* Stats Card */}
                  <div className="bg-gray-900 rounded-[2.5rem] p-6 shadow-sm border border-gray-800 text-white">
                      <h3 className="font-bold text-white text-lg mb-6">Capacity</h3>
                      <div className="mb-2 flex justify-between items-end">
                          <span className="text-4xl font-bold tracking-tight">{(signupsByEvent[selectedEvent.id] || []).length}</span>
                          <span className="text-gray-400 font-medium mb-1">
                            / {resolveEventCapacity(selectedEvent, signupsByEvent[selectedEvent.id] || [])} Volunteers
                          </span>
                      </div>
                      <div className="h-4 bg-gray-800 rounded-full overflow-hidden w-full mb-4">
                          <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${resolveCapacityPercent(selectedEvent, signupsByEvent[selectedEvent.id] || [])}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className={`h-full rounded-full ${resolveCapacityPercent(selectedEvent, signupsByEvent[selectedEvent.id] || []) >= 100 ? 'bg-red-400' : 'bg-lime-300'}`}
                          />
                      </div>
                  </div>
              </div>

              {/* Right Column: Volunteers List */}
              <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                  <div className="p-8 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                          <h3 className="font-bold text-gray-900 text-lg">Signed Up Volunteers</h3>
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">
                            {volunteerSearch.trim() ? filteredSignups.length : selectedSignups.length}
                          </span>
                      </div>
                      <div className="flex items-center gap-3">
                          <div className="relative group">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-lime-600 transition-colors" />
                              <input 
                                  type="text" 
                                  placeholder="Search list..." 
                                  value={volunteerSearch}
                                  onChange={(e) => setVolunteerSearch(e.target.value)}
                                  className="h-10 pl-10 pr-4 bg-gray-50 rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none w-48 transition-all"
                              />
                          </div>
                      </div>
                  </div>

                  <div className="flex-1 overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="bg-gray-50/50 border-b border-gray-100">
                                  <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Volunteer</th>
                                  <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                                  <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Role</th>
                                  <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                              </tr>
                          </thead>
                          <tbody>
                              {filteredSignups.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="py-10 px-6 text-center text-sm text-gray-400">
                                    No volunteers found.
                                  </td>
                                </tr>
                              ) : (
                              filteredSignups.map((vol) => (
                                  <tr key={vol.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors group">
                                      <td className="py-4 px-6">
                                          <div className="flex items-center gap-3">
                                              <div>
                                                  <span className="block font-bold text-gray-900 text-sm">{vol.volunteerName}</span>
                                                  <span className="block text-xs text-gray-500">{vol.volunteerEmail || 'Email on file'}</span>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="py-4 px-6">
                                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                              vol.status.toLowerCase() === 'checked in' ? 'bg-lime-50 text-lime-700 border-lime-100' :
                                              vol.status.toLowerCase() === 'confirmed' ? 'bg-green-50 text-green-700 border-green-100' :
                                              vol.status.toLowerCase() === 'cancelled' ? 'bg-red-50 text-red-700 border-red-100' :
                                              'bg-gray-50 text-gray-600 border-gray-100'
                                          }`}>
                                              {vol.status.toLowerCase() === 'checked in' && <CheckCircle2 className="w-3 h-3" />}
                                              {vol.status}
                                          </span>
                                      </td>
                                      <td className="py-4 px-6">
                                          <span className="text-sm font-medium text-gray-600">{vol.role}</span>
                                      </td>
                                      <td className="py-4 px-6 text-right">
                                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <button
                                                onClick={() => handleCopyEmail(vol.volunteerEmail)}
                                                className="p-2 hover:bg-lime-100 text-gray-400 hover:text-lime-700 rounded-lg transition-colors"
                                                title="Copy Email"
                                              >
                                                  <Mail className="w-4 h-4" />
                                              </button>
                                              <button
                                                onClick={() => handleMessageVolunteer(vol)}
                                                className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-900 rounded-lg transition-colors"
                                                title="Message"
                                              >
                                                  <MessageSquare className="w-4 h-4" />
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
        </motion.div>
      ) : (
        <motion.div 
          key="list"
          variants={container}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="w-full flex flex-col gap-6 mt-8 pb-10"
        >
          {/* Header Row: Tabs & Actions */}
          <motion.div variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             {/* Tabs */}
              <div className="flex gap-2">
                {['Live', 'Upcoming', 'Past', 'Drafts'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setFilter(tab)}
                      className={`px-5 py-2.5 text-sm font-bold rounded-full transition-all border ${
                          filter === tab 
                          ? 'bg-gray-900 text-white border-gray-900 shadow-lg shadow-gray-900/10' 
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                      }`}
                    >
                        {tab}
                    </button>
                ))}
              </div>

             {/* Actions */}
             <div className="flex gap-3">
                <button
                  onClick={() => {
                    sessionStorage.removeItem(EVENT_DRAFT_EDIT_KEY);
                    sessionStorage.removeItem(EVENT_REROLL_PREFILL_KEY);
                    onNavigate('create-event');
                  }}
                  className="h-11 px-5 bg-gray-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-black transition-all shadow-sm hover:shadow-md"
                >
                    <Plus className="w-5 h-5" />
                    <span>Create Event</span>
                </button>
             </div>
          </motion.div>

          {/* Events Grid */}
          <div className="grid grid-cols-1 gap-4">
            {visibleEvents.length === 0 ? (
              <motion.div
                variants={item}
                className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                  <Calendar className="w-6 h-6 text-gray-300" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">No events yet</h3>
                <p className="text-sm text-gray-500 mt-2">
                  Create your first volunteer opportunity to get started.
                </p>
              </motion.div>
            ) : (
            visibleEvents.map((event) => (
                <motion.div 
                    key={event.id}
                    variants={item}
                    whileHover={{ scale: 1.005 }}
                    className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 md:items-center group relative"
                >
                    <button
                      onClick={() => openDeleteModal(event)}
                      className="absolute top-6 right-6 p-2 text-red-400 hover:text-red-600 rounded-full transition-colors"
                      title="Delete event"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    {/* Cover / Date Badge */}
                    <div className="relative group/cover w-full sm:w-60 md:w-48 aspect-square shrink-0 bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 self-start">
                        {event.coverImageUrl ? (
                          <img
                            src={event.coverImageUrl}
                            alt={`${event.title} cover`}
                            className="absolute inset-0 block w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-lime-50/50">
                            <Calendar className="w-8 h-8 text-lime-200" />
                          </div>
                        )}
                        <div className="absolute top-3 left-3 flex flex-col items-center justify-center w-12 h-14 bg-white/90 backdrop-blur-sm rounded-xl shadow-sm">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{formatDateBadge(event.startDate).month}</span>
                            <span className="text-xl font-bold text-gray-900">{formatDateBadge(event.startDate).day}</span>
                        </div>
                    </div>

                    {/* Event Details */}
                    <div className="flex-1 pr-24">
                        <div className="flex items-start justify-between mb-2">
                             <div className="flex flex-col gap-1">
                                <h3 className="text-xl font-bold text-gray-900 group-hover:text-lime-600 transition-colors">{event.title}</h3>
                                <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-500">
                                    <span className="flex items-center gap-1.5">
                                      <Clock className="w-4 h-4" /> 
                                      {event.shifts && event.shifts.length > 0 
                                        ? `${event.shifts.length} Shift${event.shifts.length > 1 ? 's' : ''}`
                                        : formatTimeRange(event.startTime, event.endTime)
                                      }
                                    </span>
                                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {formatLocation(event) || 'Location TBA'}</span>
                                </div>
                             </div>
                        </div>

                        {/* Progress & Users */}
                        <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex flex-col gap-2 min-w-[200px]">
                                <div className="flex justify-between text-xs font-bold">
                                    <span className="text-gray-500">Volunteers</span>
                                    <span className={`${resolveCapacityPercent(event, signupsByEvent[event.id] || []) >= 100 ? 'text-red-500' : 'text-gray-900'}`}>
                                        {(signupsByEvent[event.id] || []).length} / {resolveEventCapacity(event, signupsByEvent[event.id] || [])}
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-full">
                                    <div 
                                        className={`h-full rounded-full ${resolveCapacityPercent(event, signupsByEvent[event.id] || []) >= 100 ? 'bg-red-400' : 'bg-lime-400'}`} 
                                        style={{ width: `${resolveCapacityPercent(event, signupsByEvent[event.id] || [])}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="absolute bottom-6 right-6 flex items-center gap-2">
                      {isPastEvent(event) && String(event.status || '').toLowerCase() !== 'draft' && (
                        <button
                          onClick={() => handleRerollEvent(event)}
                          className="px-4 py-2.5 bg-lime-50 hover:bg-lime-100 text-lime-800 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-lime-200"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Reroll
                        </button>
                      )}
                      <button 
                          onClick={() => handleOpenEventAction(event)}
                          className="px-5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
                      >
                          {String(event.status || '').toLowerCase() === 'draft' ? 'Edit' : 'Manage'}
                          <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                </motion.div>
            ))
            )}
          </div>
        </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDeleteModal} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md relative shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 pb-6 flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Delete Event</h3>
                  <p className="text-gray-500 mt-1 text-sm">
                    {isRecurringSeriesEvent(deleteTarget) && deleteScope === 'series'
                      ? `This will permanently delete the full recurring series for “${deleteTarget.title}”.`
                      : `This will permanently delete “${deleteTarget.title}”.`}
                  </p>
                </div>
                <button
                  onClick={closeDeleteModal}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-8 space-y-6 pb-8">
                {isRecurringSeriesEvent(deleteTarget) && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 ml-1">Delete Scope</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDeleteScope('single')}
                        disabled={deleteLoading}
                        className={`h-12 rounded-xl border text-sm font-bold transition-colors ${
                          deleteScope === 'single'
                            ? 'bg-lime-100 text-lime-800 border-lime-300'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        One Time
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteScope('series')}
                        disabled={deleteLoading}
                        className={`h-12 rounded-xl border text-sm font-bold transition-colors ${
                          deleteScope === 'series'
                            ? 'bg-red-100 text-red-700 border-red-300'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Entire Event
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 ml-1">
                      {deleteScope === 'series'
                        ? 'Deletes this recurring event and all related occurrences.'
                        : 'Deletes only this selected occurrence.'}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-red-500 uppercase tracking-widest mb-2 ml-1">Confirm with Password</label>
                  <div className="relative">
                    <input
                      type={showDeletePassword ? 'text' : 'password'}
                      placeholder="Your login password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      disabled={deleteLoading}
                      className="w-full h-14 pl-4 pr-14 bg-gray-50 border-2 border-gray-100 rounded-2xl text-gray-900 font-bold focus:border-red-400 focus:bg-white outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeletePassword((prev) => !prev)}
                      disabled={deleteLoading}
                      aria-label={showDeletePassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {deleteError && (
                  <div className="p-4 rounded-2xl bg-red-50 text-red-600 text-sm font-medium flex items-center gap-3 border border-red-100">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {deleteError}
                  </div>
                )}
                <button
                  onClick={handleDeleteEvent}
                  disabled={deleteLoading}
                  className="w-full py-4 rounded-2xl bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-600 transition-colors disabled:opacity-60"
                >
                  <Trash2 className="w-5 h-5" />
                  {deleteLoading ? 'Deleting...' : 'Delete Event'}
                </button>
                <button
                  onClick={closeDeleteModal}
                  disabled={deleteLoading}
                  className="w-full py-3 rounded-2xl text-gray-500 font-semibold text-sm hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isActive && aiEnabled && (
        <AiInsightWidget
          title="Event Ops"
          subtitle="Live staffing + turnout"
          summary={aiInsight.summary}
          pillLabel={`Understaffed ${eventInsights.understaffed.length}`}
          updatedLabel={insightUpdatedLabel}
          sections={aiInsight.sections}
          onOpenCopilot={() => onNavigate('nebulae')}
          copilotPrompt="Summarize the event staffing risks and recommend fixes for understaffed or high no-show events."
        />
      )}
    </>
  );
};
