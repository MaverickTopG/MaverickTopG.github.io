import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Calendar, Clock, ArrowRight, Filter, Search, Check, ChevronRight } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { EventSignupModal } from './EventSignupModal';
import {
  extractVolunteerMembership,
  mergeVolunteerMemberships,
  type VolunteerMembership,
} from '../lib/membershipAccess';

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
  coverImageUrl?: string;
  description?: string;
  location?: string;
  orgId?: string;
  org_id?: string;
  organizationId?: string;
  orgCode?: string;
  org_code?: string;
  organizationCode?: string;
  shifts?: any[];
  peoplePerSlot?: number;
  capacity?: number;
  maxVolunteers?: number;
  max_volunteers?: number;
  maxVolunteer?: number;
  max_volunteer?: number;
  timeSlots?: Array<{ id: string; capacity?: number | null }>;
  matchedOrgName?: string;
  matchedOrgCode?: string;
  matchedOrgId?: string;
  matchedOrgKey?: string;
  matchedScopeId?: string;
  matchedScopeName?: string;
  recurrenceType?: 'one-time' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceParentId?: string;
  recurrenceOccurrenceDate?: string;
}

interface Signup {
  id: string;
  eventId: string;
  status: string;
}

interface VolunteerEventsPageProps {
  userProfile?: any;
}

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

export const VolunteerEventsPage: React.FC<VolunteerEventsPageProps> = ({ userProfile }) => {
  const RECURRING_TYPES = new Set(['weekly', 'biweekly', 'monthly']);
  const UPCOMING_LOOKAHEAD_DAYS = 42;
  const toDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const parseDateOnly = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
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
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
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
  const materializeRecurringEvents = async (rows: Array<{ id: string; data: Record<string, unknown> }>) => {
    const db = getFirestoreDb();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const horizonDate = new Date(startOfToday);
    horizonDate.setDate(horizonDate.getDate() + UPCOMING_LOOKAHEAD_DAYS);
    const datesByParent = new Map<string, string[]>();

    rows.forEach((row) => {
      const parentId = String((row.data || {}).recurrenceParentId || '').trim();
      if (!parentId) return;
      const list = datesByParent.get(parentId) || [];
      const startDate = String((row.data || {}).startDate || '').trim();
      if (startDate) list.push(startDate);
      datesByParent.set(parentId, list);
    });

    const tasks = rows.map(async (row) => {
      const data = row.data || {};
      const recurrenceParentId = String(data.recurrenceParentId || '').trim();
      if (recurrenceParentId) return;
      const recurrenceType = String(data.recurrenceType || 'one-time').toLowerCase();
      if (!RECURRING_TYPES.has(recurrenceType)) return;

      const templateStart = parseDateOnly(data.startDate);
      if (!templateStart) return;

      const templateEnd = parseDateOnly(data.endDate || data.startDate);
      const durationDays = templateEnd
        ? Math.max(0, Math.round((templateEnd.getTime() - templateStart.getTime()) / 86400000))
        : 0;
      const knownDates = new Set<string>(
        [
          String(data.startDate || '').trim(),
          ...(datesByParent.get(row.id) || []),
        ].filter(Boolean),
      );

      let nextDate = new Date(templateStart);
      while (nextDate.getTime() < startOfToday.getTime()) {
        nextDate = addRecurrenceStep(nextDate, recurrenceType);
      }

      while (nextDate.getTime() <= horizonDate.getTime()) {
        const nextStartDate = toDateKey(nextDate);
        if (!knownDates.has(nextStartDate)) {
          const nextEndObj = new Date(nextDate);
          nextEndObj.setDate(nextEndObj.getDate() + durationDays);
          const nextEndDate = toDateKey(nextEndObj);
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
          knownDates.add(nextStartDate);
        }
        nextDate = addRecurrenceStep(nextDate, recurrenceType);
      }
    });
    await Promise.all(tasks);
  };

  const [events, setEvents] = useState<Event[]>([]);
  const [signups, setSignups] = useState<Record<string, Signup>>({}); // Map eventId -> Signup
  const [signupCounts, setSignupCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  
  const [activeFilter, setActiveFilter] = useState('All Events');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [hoveringOrganizations, setHoveringOrganizations] = useState(false);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [eligibleOrgs, setEligibleOrgs] = useState<VolunteerMembership[]>([]);
  const orgHoverTimeoutRef = useRef<number | null>(null);
  const isArchivedVolunteer = Boolean(
    userProfile?.archived === true
    || String(userProfile?.status || '').toLowerCase() === 'archived'
  );

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

  const normalizeScopeId = (value: unknown) => String(value || '').trim();
  const normalizeScopeName = (value: unknown) => String(value || '').trim();
  const resolveRecordScopeId = (record: Record<string, unknown>) =>
    normalizeScopeId(
      record.target_group_id ||
        record.targetGroupId ||
        record.sub_admin_group_id ||
        record.subAdminGroupId ||
        record.group_scope_id ||
        record.groupScopeId ||
        record.group_id ||
        record.groupId,
    );
  const resolveRecordScopeName = (record: Record<string, unknown>) =>
    normalizeScopeName(
      record.target_group_name ||
        record.targetGroupName ||
        record.sub_admin_group_name ||
        record.subAdminGroupName ||
        record.group_scope_name ||
        record.groupScopeName ||
        record.group_name ||
        record.groupName,
    );
  const resolveRecordOrgCode = (record: Record<string, unknown>) =>
    String(
      record.orgCode ||
        record.org_code ||
        record.organizationCode ||
        record.access_code ||
        '',
    )
      .trim()
      .toUpperCase();
  const resolveRecordOrgId = (record: Record<string, unknown>) =>
    String(
      record.orgId ||
        record.org_id ||
        record.organizationId ||
        record.organization_id ||
        record.linked_org_id ||
        '',
    ).trim();
  const membershipMatchesScope = (membership: VolunteerMembership, scopeId: string) => {
    const membershipScope = normalizeScopeId(membership.scopeId);
    if (membershipScope) return membershipScope === scopeId;
    return !scopeId;
  };

  const resolveEventCapacity = (event: Event) => {
    const capacity = parseNumber(event.capacity ?? (event as any).capacity_value ?? (event as any).maxCapacity ?? (event as any).max_capacity);
    if (Number.isFinite(capacity ?? NaN) && (capacity ?? 0) > 0) {
      return Number(capacity);
    }
    const maxVolunteers = parseNumber(
      event.maxVolunteers ??
        event.max_volunteers ??
        event.maxVolunteer ??
        event.max_volunteer ??
        (event as any).requirements?.maxVolunteers ??
        (event as any).requirements?.max_volunteers
    );
    if (Number.isFinite(maxVolunteers ?? NaN) && (maxVolunteers ?? 0) > 0) {
      return Number(maxVolunteers);
    }
    if (event.peoplePerSlot && Array.isArray(event.timeSlots) && event.timeSlots.length) {
      return event.timeSlots.length * event.peoplePerSlot;
    }
    return 0;
  };

  useEffect(() => {
    const db = getFirestoreDb();
    const auth = getFirebaseAuth();
    
    let unsubEvents: (() => void) | null = null;
    let unsubSignups: (() => void) | null = null;
    let unsubMembershipsA: (() => void) | null = null;
    let unsubMembershipsB: (() => void) | null = null;
    let unsubJoinRequestsA: (() => void) | null = null;
    let unsubJoinRequestsB: (() => void) | null = null;
    let membershipRowsA: Array<{ id: string; data: Record<string, unknown> }> = [];
    let membershipRowsB: Array<{ id: string; data: Record<string, unknown> }> = [];
    let joinRowsA: Array<{ id: string; data: Record<string, unknown> }> = [];
    let joinRowsB: Array<{ id: string; data: Record<string, unknown> }> = [];
    const stopSubscriptions = () => {
      if (unsubEvents) {
        unsubEvents();
        unsubEvents = null;
      }
      if (unsubSignups) {
        unsubSignups();
        unsubSignups = null;
      }
    };
    const stopMembershipSubscriptions = () => {
      if (unsubMembershipsA) {
        unsubMembershipsA();
        unsubMembershipsA = null;
      }
      if (unsubMembershipsB) {
        unsubMembershipsB();
        unsubMembershipsB = null;
      }
      if (unsubJoinRequestsA) {
        unsubJoinRequestsA();
        unsubJoinRequestsA = null;
      }
      if (unsubJoinRequestsB) {
        unsubJoinRequestsB();
        unsubJoinRequestsB = null;
      }
      membershipRowsA = [];
      membershipRowsB = [];
      joinRowsA = [];
      joinRowsB = [];
    };

    let membershipSyncSeq = 0;
    const syncMembershipAccess = (user: { uid: string; email?: string | null }) => {
      const isMembership = (value: VolunteerMembership | null): value is VolunteerMembership =>
        Boolean(value);
      const memberships = [
        ...membershipRowsA
          .map((entry) => extractVolunteerMembership(entry.data as Record<string, unknown>, entry.id, 'user_organizations'))
          .filter(isMembership),
        ...membershipRowsB
          .map((entry) => extractVolunteerMembership(entry.data as Record<string, unknown>, entry.id, 'users'))
          .filter(isMembership),
      ];
      const runId = ++membershipSyncSeq;
      const resolvedMemberships = mergeVolunteerMemberships(memberships);
      if (runId !== membershipSyncSeq) return;

      // Orbit, Nebula, and Cosmos all have volunteer events access.
      const eligibleMemberships = resolvedMemberships;
      setEligibleOrgs(eligibleMemberships);
      setOrganizations(
        Array.from(
          new Set(
            eligibleMemberships.map((org) => {
              const scopeLabel = String(org.scopeName || org.scopeId || '').trim();
              return scopeLabel || org.name;
            }),
          ),
        ).sort(),
      );

      if (!eligibleMemberships.length) {
        stopSubscriptions();
        setEvents([]);
        setSignups({});
        setLoading(false);
        return;
      }
      // Stop showing blocking spinner as soon as membership context is ready.
      setLoading(false);

      const membershipsByOrgCode = new Map<string, VolunteerMembership[]>();
      const membershipsByOrgId = new Map<string, VolunteerMembership[]>();
      eligibleMemberships.forEach((membership) => {
        if (membership.code) {
          const key = String(membership.code).toUpperCase();
          const rows = membershipsByOrgCode.get(key) || [];
          rows.push(membership);
          membershipsByOrgCode.set(key, rows);
        }
        if (membership.id) {
          const key = String(membership.id);
          const rows = membershipsByOrgId.get(key) || [];
          rows.push(membership);
          membershipsByOrgId.set(key, rows);
        }
      });
      const acceptedJoinRows = [...joinRowsA, ...joinRowsB].filter((row) => {
        const status = String(row.data?.status || '').toLowerCase();
        return status === 'accepted' || status === 'approved' || status === 'active' || status === 'connected';
      });
      const scopeHintsByOrgCode = new Map<string, Set<string>>();
      const scopeHintsByOrgId = new Map<string, Set<string>>();
      acceptedJoinRows.forEach((row) => {
        const data = row.data || {};
        const scopeId = resolveRecordScopeId(data);
        if (!scopeId) return;
        const code = resolveRecordOrgCode(data);
        const id = resolveRecordOrgId(data);
        if (code) {
          const set = scopeHintsByOrgCode.get(code) || new Set<string>();
          set.add(scopeId);
          scopeHintsByOrgCode.set(code, set);
        }
        if (id) {
          const set = scopeHintsByOrgId.get(id) || new Set<string>();
          set.add(scopeId);
          scopeHintsByOrgId.set(id, set);
        }
      });

      // Subscribe to all events and keep only connected-org matches.
      stopSubscriptions();
      unsubEvents = onSnapshot(collection(db, 'events'), (snapshot) => {
        const allRows = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          data: (docSnap.data() || {}) as Record<string, unknown>,
        }));
        void materializeRecurringEvents(allRows);

        const loaded: Event[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (String(data.status || '').toLowerCase() === 'archived') return;

          const rawCode = String(data.orgCode || data.org_code || data.organizationCode || '').toUpperCase();
          const rawId = String(data.orgId || data.org_id || data.organizationId || '');
          const eventScopeId = resolveRecordScopeId(data as Record<string, unknown>);
          const eventScopeName = resolveRecordScopeName(data as Record<string, unknown>);
          const possibleMemberships = [
            ...(rawCode ? membershipsByOrgCode.get(rawCode) || [] : []),
            ...(rawId ? membershipsByOrgId.get(rawId) || [] : []),
          ];
          const matchedOrgByScope =
            possibleMemberships.find((membership) => membershipMatchesScope(membership, eventScopeId)) || null;
          const joinScopeHints = new Set<string>([
            ...(rawCode ? Array.from(scopeHintsByOrgCode.get(rawCode) || []) : []),
            ...(rawId ? Array.from(scopeHintsByOrgId.get(rawId) || []) : []),
          ]);
          const matchesByJoinScope = eventScopeId ? joinScopeHints.has(eventScopeId) : joinScopeHints.size === 0;
          const matchedOrg =
            matchedOrgByScope ||
            (matchesByJoinScope ? possibleMemberships[0] || null : null);
          if (!matchedOrg) return;

          const coverImageUrl = resolveCoverImageUrl(data as Record<string, unknown>);
          loaded.push({
            id: docSnap.id,
            coverImageUrl,
            ...data,
            matchedOrgName: matchedOrg.name,
            matchedOrgCode: matchedOrg.code,
            matchedOrgId: matchedOrg.id,
            matchedOrgKey: matchedOrg.key,
            matchedScopeId: eventScopeId,
            matchedScopeName: eventScopeName || matchedOrg.scopeName || matchedOrg.scopeId || eventScopeId || '',
          } as Event);
        });
        loaded.sort((a, b) => {
          const aTime = parseDateOnly(a.startDate)?.getTime() || 0;
          const bTime = parseDateOnly(b.startDate)?.getTime() || 0;
          return aTime - bTime;
        });
        setEvents(loaded);
        setLoading(false);
      }, (err) => {
        console.error("Event subscription error", err);
        setLoading(false);
      });

      // Subscribe to current user's event signups.
      if (user.email) {
        unsubSignups = onSnapshot(
          query(collection(db, 'event_signups'), where('volunteerEmail', '==', user.email)),
          (snapshot) => {
            const map: Record<string, Signup> = {};
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              map[data.eventId] = { id: docSnap.id, eventId: data.eventId, status: data.status };
            });
            setSignups(map);
          },
        );
      } else {
        setSignups({});
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      stopMembershipSubscriptions();
      if (!user) {
        stopSubscriptions();
        setEvents([]);
        setSignups({});
        setEligibleOrgs([]);
        setOrganizations([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      unsubMembershipsA = onSnapshot(
        query(collection(db, 'user_organizations'), where('user_id', '==', user.uid)),
        (snapshot) => {
          membershipRowsA = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            data: (docSnap.data() || {}) as Record<string, unknown>,
          }));
          void syncMembershipAccess({ uid: user.uid, email: user.email });
        },
      );

      unsubMembershipsB = onSnapshot(
        query(collection(db, 'users'), where('user_id', '==', user.uid)),
        (snapshot) => {
          membershipRowsB = snapshot.docs
            .filter((docSnap) => docSnap.id !== user.uid)
            .map((docSnap) => ({
              id: docSnap.id,
              data: (docSnap.data() || {}) as Record<string, unknown>,
            }));
          void syncMembershipAccess({ uid: user.uid, email: user.email });
        },
      );
      unsubJoinRequestsA = onSnapshot(
        query(collection(db, 'organization_join_requests'), where('user_id', '==', user.uid)),
        (snapshot) => {
          joinRowsA = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            data: (docSnap.data() || {}) as Record<string, unknown>,
          }));
          void syncMembershipAccess({ uid: user.uid, email: user.email });
        },
      );
      if (user.email) {
        unsubJoinRequestsB = onSnapshot(
          query(collection(db, 'organization_join_requests'), where('user_email', '==', user.email)),
          (snapshot) => {
            joinRowsB = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              data: (docSnap.data() || {}) as Record<string, unknown>,
            }));
            void syncMembershipAccess({ uid: user.uid, email: user.email });
          },
        );
      }
    });

    return () => {
      stopMembershipSubscriptions();
      unsubscribeAuth();
      stopSubscriptions();
    };
  }, []);

  useEffect(() => {
    if (isArchivedVolunteer) {
      setSelectedEvent(null);
    }
  }, [isArchivedVolunteer]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!events.length) {
      setSignupCounts({});
      return;
    }

    const eventIds = events.map((event) => event.id);
    const chunks: string[][] = [];
    for (let i = 0; i < eventIds.length; i += 10) {
      chunks.push(eventIds.slice(i, i + 10));
    }

    setSignupCounts({});

    const unsubscribers = chunks.map((chunk) =>
      onSnapshot(
        query(collection(db, 'event_signups'), where('eventId', 'in', chunk)),
        (snapshot) => {
          const counts: Record<string, number> = {};
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Record<string, any>;
            const eventId = String(data.eventId || data.event_id || '');
            if (!eventId) return;
            counts[eventId] = (counts[eventId] || 0) + 1;
          });
          setSignupCounts((prev) => {
            const next = { ...prev };
            chunk.forEach((id) => {
              delete next[id];
            });
            Object.entries(counts).forEach(([id, count]) => {
              next[id] = count;
            });
            return next;
          });
        },
        (err) => {
          console.error('Event signups subscription error', err);
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [events]);

  useEffect(() => {
    if (!showFilterMenu) {
      setHoveringOrganizations(false);
    }
  }, [showFilterMenu]);

  useEffect(() => {
    return () => {
      if (orgHoverTimeoutRef.current) {
        window.clearTimeout(orgHoverTimeoutRef.current);
      }
    };
  }, []);

  const openOrgMenu = () => {
    if (orgHoverTimeoutRef.current) {
      window.clearTimeout(orgHoverTimeoutRef.current);
      orgHoverTimeoutRef.current = null;
    }
    setHoveringOrganizations(true);
  };

  const closeOrgMenu = () => {
    if (orgHoverTimeoutRef.current) {
      window.clearTimeout(orgHoverTimeoutRef.current);
    }
    orgHoverTimeoutRef.current = window.setTimeout(() => {
      setHoveringOrganizations(false);
    }, 150);
  };

  const handleReserve = async (selection?: { selectedDates: string[]; selectedShifts: Array<{ id?: string; startTime?: string; endTime?: string }> }) => {
    if (isArchivedVolunteer) {
      window.alert('Your volunteer account is archived. Contact your admin to restore access.');
      return;
    }
    if (!selectedEvent) return;
    setIsReserving(true);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Must be logged in");
      
      const db = getFirestoreDb();
      
      // Use userProfile if available for accurate naming
      const firstName = userProfile?.firstName || userProfile?.first_name || '';
      const lastName = userProfile?.lastName || userProfile?.last_name || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || user.displayName || 'Volunteer';

      const resolvedDates = selection?.selectedDates?.length ? selection.selectedDates : (selectedEvent.startDate ? [selectedEvent.startDate] : []);
      const resolvedShifts = selection?.selectedShifts || [];
      const slotLabel = (() => {
        const dateLabel = resolvedDates.length === 0
          ? ''
          : resolvedDates.length === 1
            ? new Date(`${resolvedDates[0]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : `${resolvedDates.length} days`;
        const timeLabel = resolvedShifts.length === 0
          ? ''
          : resolvedShifts.length === 1
            ? formatTimeRange(resolvedShifts[0]?.startTime, resolvedShifts[0]?.endTime)
            : `${resolvedShifts.length} shifts`;
        const combined = [dateLabel, timeLabel].filter(Boolean).join(' • ');
        return combined || 'Volunteer';
      })();

      const capacity = resolveEventCapacity(selectedEvent);
      const currentSignups = signupCounts[selectedEvent.id] || 0;
      if (capacity > 0 && currentSignups >= capacity) {
        window.alert('This event is full.');
        setIsReserving(false);
        return;
      }

      const resolvedOrgId =
        selectedEvent.matchedOrgId ||
        selectedEvent.orgId ||
        selectedEvent.organizationId ||
        selectedEvent.org_id;
      const resolvedOrgCode =
        selectedEvent.matchedOrgCode ||
        selectedEvent.orgCode ||
        selectedEvent.organizationCode ||
        selectedEvent.org_code;
      const resolvedScopeId = String(
        selectedEvent.matchedScopeId ||
          (selectedEvent as any).target_group_id ||
          (selectedEvent as any).targetGroupId ||
          (selectedEvent as any).sub_admin_group_id ||
          (selectedEvent as any).subAdminGroupId ||
          '',
      ).trim();
      const resolvedScopeName = String(
        selectedEvent.matchedScopeName ||
          (selectedEvent as any).target_group_name ||
          (selectedEvent as any).targetGroupName ||
          (selectedEvent as any).sub_admin_group_name ||
          (selectedEvent as any).subAdminGroupName ||
          '',
      ).trim();

      await addDoc(collection(db, 'event_signups'), {
        eventId: selectedEvent.id,
        volunteerId: user.uid,
        volunteerName: fullName,
        volunteerEmail: user.email,
        status: 'confirmed',
        role: slotLabel,
        slotLabel,
        selectedDates: resolvedDates,
        selectedShifts: resolvedShifts,
        orgId: resolvedOrgId || null,
        orgCode: resolvedOrgCode || null,
        target_group_id: resolvedScopeId || null,
        targetGroupId: resolvedScopeId || null,
        sub_admin_group_id: resolvedScopeId || null,
        subAdminGroupId: resolvedScopeId || null,
        target_group_name: resolvedScopeName || null,
        targetGroupName: resolvedScopeName || null,
        sub_admin_group_name: resolvedScopeName || null,
        subAdminGroupName: resolvedScopeName || null,
        createdAt: serverTimestamp(),
        // Add minimal event details for easy querying if needed
        eventTitle: selectedEvent.title,
        eventDate: resolvedDates[0] || selectedEvent.startDate
      });
      
      setIsReserving(false);
      setSelectedEvent(null); // Close modal
    } catch (err) {
      console.error("Signup failed", err);
      setIsReserving(false);
    }
  };

  const handleCancel = async (eventId: string) => {
    if (isArchivedVolunteer) return;
    const signup = signups[eventId];
    if (!signup) return;
    
    if (!window.confirm("Are you sure you want to cancel your reservation?")) return;

    try {
      const db = getFirestoreDb();
      await deleteDoc(doc(db, 'event_signups', signup.id));
    } catch (err) {
      console.error("Cancellation failed", err);
    }
  };

  const parseLocalDate = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
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
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  };

  const getEventTemporalStatus = (event: Event): 'upcoming' | 'live' | 'past' => {
    const start = parseLocalDate(event.startDate);
    const end = parseLocalDate(event.endDate || event.startDate) || start;
    if (!start || !end) return 'upcoming';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    if (startOfToday.getTime() < start.getTime()) return 'upcoming';
    if (startOfToday.getTime() > end.getTime()) return 'past';
    return 'live';
  };

  const filteredEvents = isArchivedVolunteer ? [] : events.filter(ev => {
    // 0. Volunteer portal should only show live + upcoming events.
    const temporalStatus = getEventTemporalStatus(ev);
    if (temporalStatus !== 'live' && temporalStatus !== 'upcoming') return false;
    if (temporalStatus === 'upcoming') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const horizonDate = new Date(startOfToday);
      horizonDate.setDate(horizonDate.getDate() + UPCOMING_LOOKAHEAD_DAYS);
      const start = parseLocalDate(ev.startDate);
      if (!start || start.getTime() > horizonDate.getTime()) return false;
    }

    // 1. Search Filter
    const searchText = searchQuery.toLowerCase();
    const matchesSearch =
      ev.title.toLowerCase().includes(searchText) ||
      (ev.matchedOrgName || '').toLowerCase().includes(searchText) ||
      (ev.matchedScopeName || '').toLowerCase().includes(searchText) ||
      (ev.city || '').toLowerCase().includes(searchText) ||
      (ev.location || '').toLowerCase().includes(searchText) ||
      (ev.venue || '').toLowerCase().includes(searchText) ||
      (ev.addressLine1 || '').toLowerCase().includes(searchText) ||
      (ev.description || '').toLowerCase().includes(searchText);
    
    if (!matchesSearch) return false;

    // 2. Organization Filter
    if (activeFilter !== 'All Events') {
       const baseName =
         ev.matchedOrgName ||
         (ev as any).orgName ||
         (ev as any).organizationName ||
         (ev as any).name ||
         (ev as any).schoolName ||
         '';
       const scopeLabel = String(ev.matchedScopeName || ev.matchedScopeId || '').trim();
       const orgName = scopeLabel || baseName;
       if (String(orgName) !== activeFilter) return false;
    }
    
    return true;
  });

  const formatDate = (dateStr: string) => {
    const d = parseLocalDate(dateStr);
    if (!d) {
      return {
        month: '—',
        day: '—',
        full: 'Date TBA',
      };
    }
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: d.getDate(),
      full: d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })
    };
  };

  const formatTimeRange = (start?: string, end?: string) => {
    if (!start && !end) return 'Time TBA';
    const toTime = (t?: string) => {
      if (!t) return '';
      const [h, m] = t.split(':');
      const hours = Number(h);
      if (Number.isNaN(hours)) return t;
      const date = new Date();
      date.setHours(hours, Number(m || 0), 0, 0);
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };
    if (!end) return toTime(start);
    return `${toTime(start)} - ${toTime(end)}`;
  };

  const formatEventTime = (event: Event) => {
    if (event.startTime || event.endTime) {
      return formatTimeRange(event.startTime, event.endTime);
    }
    const shifts = Array.isArray(event.shifts) ? event.shifts : [];
    if (shifts.length === 0) return 'Time TBA';
    if (shifts.length === 1) {
      return formatTimeRange(shifts[0]?.startTime, shifts[0]?.endTime);
    }
    const toMinutes = (value?: string) => {
      if (!value) return null;
      const [h, m] = value.split(':');
      const hours = Number(h);
      if (Number.isNaN(hours)) return null;
      const minutes = Number(m || 0);
      return hours * 60 + minutes;
    };
    const minutesToTime = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const starts = shifts.map((s) => toMinutes(s?.startTime)).filter((v): v is number => v !== null);
    const ends = shifts.map((s) => toMinutes(s?.endTime ?? s?.startTime)).filter((v): v is number => v !== null);
    if (starts.length === 0 && ends.length === 0) return 'Time TBA';
    const earliest = starts.length ? Math.min(...starts) : null;
    const latest = ends.length ? Math.max(...ends) : null;
    if (earliest == null && latest == null) return 'Time TBA';
    if (earliest == null) return formatTimeRange(undefined, minutesToTime(latest!));
    if (latest == null) return formatTimeRange(minutesToTime(earliest), undefined);
    return formatTimeRange(minutesToTime(earliest), minutesToTime(latest));
  };

  const formatEventLocation = (event: Event) => {
    if (event.location) return event.location;
    return [event.venue, event.addressLine1, [event.city, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full flex flex-col gap-8 mt-8 pb-10"
      >
        {/* Header/Search Section */}
        <div className="flex flex-col gap-6">
           <div className="flex justify-start">
              <div className="flex gap-3 w-full md:w-auto">
                {/* Search Bar */}
                <div className="relative flex-1 md:w-72 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-lime-500 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Search events..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 bg-white rounded-2xl border-none shadow-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all font-bold"
                  />
                </div>

                {/* Filter Button & Dropdown */}
                <div className="relative z-[60]">
                  <button
                    onClick={() => setShowFilterMenu(!showFilterMenu)}
                    className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm transition-all border border-transparent ${showFilterMenu ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                  >
                    <Filter className="w-5 h-5" />
                  </button>

                  <AnimatePresence>
                    {showFilterMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-40 bg-transparent"
                          onClick={() => {
                            setShowFilterMenu(false);
                            setHoveringOrganizations(false);
                          }}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="absolute top-14 left-0 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-[70]"
                        >
                          <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Filter By</div>
                          <button
                            onClick={() => {
                              setActiveFilter('All Events');
                              setShowFilterMenu(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                              activeFilter === 'All Events'
                                ? 'bg-gray-50 text-gray-900'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            <span>All Events</span>
                            {activeFilter === 'All Events' && <Check className="w-4 h-4 text-lime-600 shrink-0" />}
                          </button>
                          
                          {/* Organizations Nested Menu */}
                          {organizations.length > 0 && (
                            <div 
                              className="relative"
                              onMouseEnter={openOrgMenu}
                              onMouseLeave={closeOrgMenu}
                            >
                              <button
                                type="button"
                                onClick={() => setHoveringOrganizations((prev) => !prev)}
                                className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                              >
                                <span>Organizations</span>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </button>

                              {/* Sub-menu */}
                              <div
                                onMouseEnter={openOrgMenu}
                                onMouseLeave={closeOrgMenu}
                                className={`absolute left-full top-0 ml-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 ${hoveringOrganizations ? 'block' : 'hidden'}`}
                              >
                                <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Organization</div>
                                <div className="max-h-[300px] overflow-y-auto">
                                  {organizations.map((org) => (
                                    <button
                                      key={org}
                                      onClick={() => {
                                        setActiveFilter(org);
                                        setShowFilterMenu(false);
                                      }}
                                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                                        activeFilter === org
                                          ? 'bg-gray-50 text-gray-900'
                                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                      }`}
                                    >
                                      <span className="truncate">{org}</span>
                                      {activeFilter === org && <Check className="w-4 h-4 text-lime-600 shrink-0" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
           </div>
        </div>


        {/* Events Grid */}
        <div className="grid grid-cols-1 gap-6">
           {loading ? (
             <div className="text-center py-20 bg-white rounded-[2.5rem] shadow-sm">
                <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-lime-500 rounded-full mx-auto mb-4"/>
                <p className="text-gray-400 font-bold">Loading events...</p>
             </div>
           ) : eligibleOrgs.length === 0 ? (
             <div className="text-center py-20 bg-white rounded-[2.5rem] shadow-sm flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                    <Calendar className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">No connected organizations yet</h3>
                <p className="text-gray-500 mt-2">Connect to an organization to see their upcoming events.</p>
                <p className="text-gray-500">Orbit, Nebula, and Cosmos organizations can all publish volunteer events.</p>
             </div>
           ) : isArchivedVolunteer ? (
             <div className="text-center py-20 bg-white rounded-[2.5rem] shadow-sm flex flex-col items-center">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-6">
                    <Clock className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Account Archived</h3>
                <p className="text-gray-500 mt-2">You can&apos;t view event opportunities while archived.</p>
                <p className="text-gray-500">Once unarchived, all live opportunities will appear again.</p>
             </div>
           ) : filteredEvents.length === 0 ? (
             <div className="text-center py-20 bg-white rounded-[2.5rem] shadow-sm flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                    <Calendar className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">No events found</h3>
                <p className="text-gray-500 mt-2">Try adjusting your filters or check back later.</p>
             </div>
           ) : (
             filteredEvents.map(event => {
                const dateBadge = formatDate(event.startDate);
                const isSignedUp = !!signups[event.id];
                const totalSignups = signupCounts[event.id] || 0;
                const capacity = resolveEventCapacity(event);
                const isFull = capacity > 0 && totalSignups >= capacity;
                const temporalStatus = getEventTemporalStatus(event);
                const temporalStatusLabel = temporalStatus === 'live' ? 'Live' : 'Upcoming';
                
                return (
                  <motion.div 
                    key={event.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-8 group"
                  >
                      {/* Date / Image */}
                      <div className="relative w-full sm:w-64 md:w-52 aspect-square shrink-0 bg-gray-100 rounded-3xl overflow-hidden self-start">
                          {event.coverImageUrl ? (
                             <img
                               src={event.coverImageUrl}
                               alt={`${event.title} cover`}
                               className="absolute inset-0 block w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                             />
                          ) : (
                             <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                <Calendar className="w-10 h-10 text-gray-300" />
                             </div>
                          )}
                          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md rounded-2xl p-3 text-center shadow-lg min-w-[3.5rem]">
                              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider">{dateBadge.month}</span>
                              <span className="block text-2xl font-bold text-gray-900 leading-none mt-1">{dateBadge.day}</span>
                          </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 flex flex-col justify-center py-2">
                          <div className="mb-4">
                             <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide border ${
                                    isSignedUp 
                                    ? 'bg-lime-100 text-lime-700 border-lime-200' 
                                    : isFull
                                      ? 'bg-red-100 text-red-600 border-red-200'
                                      : 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}>
                                   {isSignedUp ? 'Registered' : (isFull ? 'Full' : temporalStatusLabel)}
                                </span>
                                {event.shifts && event.shifts.length > 0 && (
                                   <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide bg-lime-50 text-lime-700 border border-lime-200">
                                      {event.shifts.length} Shifts
                                   </span>
                                )}
                             </div>
                             <h3 className="text-2xl font-bold text-gray-900 group-hover:text-lime-600 transition-colors mb-2">
                                {event.title}
                             </h3>
                             {event.matchedOrgName ? (
                               <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                                 {(() => {
                                   const scopeLabel = String(event.matchedScopeName || event.matchedScopeId || '').trim();
                                   return scopeLabel || event.matchedOrgName;
                                 })()}
                               </p>
                             ) : null}
                             <div className="flex flex-wrap gap-4 text-sm font-medium text-gray-500">
                                <div className="flex items-center gap-1.5">
                                   <Clock className="w-4 h-4" />
                                   {formatEventTime(event)}
                                </div>
                                <div className="flex items-center gap-1.5">
                                   <MapPin className="w-4 h-4" />
                                   {formatEventLocation(event) || 'TBA'}
                                </div>
                             </div>
                          </div>
                          
                          <p className="text-gray-600 line-clamp-2 mb-6 text-sm leading-relaxed">
                             {event.description || 'No description provided.'}
                          </p>

                          <div className="flex items-center gap-4 mt-auto">
                             {isSignedUp ? (
                                <>
                                  <button 
                                      className="px-6 py-3 rounded-xl bg-lime-100 text-lime-800 font-bold text-sm cursor-default flex items-center gap-2"
                                  >
                                      Check Status
                                  </button>
                                  <button 
                                      onClick={() => handleCancel(event.id)}
                                      className="px-6 py-3 rounded-xl border-2 border-gray-100 text-gray-400 font-bold text-sm hover:border-red-100 hover:bg-red-50 hover:text-red-600 transition-all"
                                  >
                                      Cancel Registration
                                  </button>
                                </>
                             ) : isFull ? (
                                <button 
                                    className="px-6 py-3 rounded-xl bg-red-50 text-red-600 font-bold text-sm cursor-not-allowed"
                                >
                                    Event Full
                                </button>
                             ) : (
                                <button 
                                    onClick={() => setSelectedEvent(event)}
                                    className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg shadow-gray-900/10 flex items-center gap-2 group-hover:gap-3"
                                >
                                    Reserve Spot
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                             )}
                          </div>
                      </div>
                  </motion.div>
                );
             })
           )}
        </div>

        <AnimatePresence>
           {selectedEvent && (
              <EventSignupModal 
                 event={selectedEvent} 
                 onClose={() => setSelectedEvent(null)}
                 onConfirm={handleReserve}
                 loading={isReserving}
              />
           )}
        </AnimatePresence>
      </motion.div>
    </>
  );
};
