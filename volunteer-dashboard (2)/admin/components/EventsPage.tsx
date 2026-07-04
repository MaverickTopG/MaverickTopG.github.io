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
} from 'lucide-react';
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { subscribeToOrgAdminContext } from '../lib/orgContext';
import { AiInsightWidget } from './AiInsightWidget';
import { useGeminiInsight } from '../hooks/useGeminiInsight';
import {
  observeEvents,
  observeRegistrations,
  deleteEventCascade,
  type VolunteerEvent,
  type EventRegistration,
} from '../lib/eventsService';

interface EventsPageProps {
  onNavigate: (view: string) => void;
  isActive?: boolean;
  aiEnabled?: boolean;
}

const EVENT_DRAFT_EDIT_KEY = 'nexolink:event-edit-id';

const formatDateBadge = (value: Date | null) => {
  if (!value) return { day: '—', month: '—' };
  return {
    day: String(value.getDate()).padStart(2, '0'),
    month: value.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
  };
};

const formatDateRange = (event: VolunteerEvent) => {
  if (!event.startDate) return 'Date TBA';
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!event.endDate || event.endDate.getTime() === event.startDate.getTime()) return fmt(event.startDate);
  return `${fmt(event.startDate)} — ${fmt(event.endDate)}`;
};

const getEventStatus = (event: VolunteerEvent): 'unknown' | 'upcoming' | 'past' | 'live' => {
  if (!event.startDate) return 'unknown';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(event.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(event.endDate || event.startDate);
  end.setHours(0, 0, 0, 0);
  if (today.getTime() < start.getTime()) return 'upcoming';
  if (today.getTime() > end.getTime()) return 'past';
  return 'live';
};

const isPastEvent = (event: VolunteerEvent) => getEventStatus(event) === 'past';
const isUpcomingEvent = (event: VolunteerEvent) => getEventStatus(event) === 'upcoming';
const isLiveEvent = (event: VolunteerEvent) => getEventStatus(event) === 'live';

const resolveCapacityPercent = (event: VolunteerEvent) => {
  if (!event.totalCapacity) return 0;
  return Math.min(100, Math.round((event.totalSignedUp / event.totalCapacity) * 100));
};

type RosterRow = EventRegistration & { volunteerEmail: string };

export const EventsPage: React.FC<EventsPageProps> = ({ onNavigate, isActive = false, aiEnabled = false }) => {
  const [filter, setFilter] = useState('Upcoming');
  const [selectedEvent, setSelectedEvent] = useState<VolunteerEvent | null>(null);
  const [orgId, setOrgId] = useState('');
  const [events, setEvents] = useState<VolunteerEvent[]>([]);
  const [registrationsByEvent, setRegistrationsByEvent] = useState<Record<string, RosterRow[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<VolunteerEvent | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
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
    let unsubContext: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubContext) {
        unsubContext();
        unsubContext = null;
      }
      if (!user) {
        setOrgId('');
        setEvents([]);
        setRegistrationsByEvent({});
        return;
      }
      unsubContext = subscribeToOrgAdminContext(db, user.uid, (context) => {
        setOrgId(context.orgId || '');
      });
    });
    return () => {
      unsubscribeAuth();
      if (unsubContext) unsubContext();
    };
  }, []);

  useEffect(() => {
    if (!orgId) {
      setEvents([]);
      return;
    }
    const db = getFirestoreDb();
    const unsubscribe = observeEvents(db, orgId, (rows) => {
      setEvents(rows.sort((a, b) => (a.startDate?.getTime() || 0) - (b.startDate?.getTime() || 0)));
    });
    return () => unsubscribe();
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !selectedEvent) return;
    const db = getFirestoreDb();
    let requestId = 0;
    const unsubscribe = observeRegistrations(db, orgId, selectedEvent.id, (rows) => {
      const thisRequestId = ++requestId;
      Promise.all(
        rows.map(async (row) => {
          let volunteerEmail = '';
          try {
            const volSnap = await getDoc(doc(db, 'organizations', orgId, 'volunteers', row.userId));
            volunteerEmail = String((volSnap.data() || {}).email || '');
          } catch {
            volunteerEmail = '';
          }
          return { ...row, volunteerEmail };
        }),
      ).then((withEmails) => {
        if (thisRequestId !== requestId) return;
        setRegistrationsByEvent((prev) => ({ ...prev, [selectedEvent.id]: withEmails }));
      });
    });
    return () => unsubscribe();
  }, [orgId, selectedEvent]);

  const drafts = useMemo(() => events.filter((e) => e.status === 'draft'), [events]);
  const publishedEvents = useMemo(() => events.filter((e) => e.status !== 'draft'), [events]);

  const visibleEvents = useMemo(() => {
    if (filter === 'Drafts') return drafts;
    if (filter === 'Past') return publishedEvents.filter(isPastEvent);
    if (filter === 'Live') return publishedEvents.filter(isLiveEvent);
    return publishedEvents.filter(isUpcomingEvent);
  }, [publishedEvents, drafts, filter]);

  const handleCopyEmail = (email: string) => {
    if (!email) return;
    navigator.clipboard.writeText(email);
  };

  const handleMessageVolunteer = (row: RosterRow) => {
    const payload = {
      id: row.userId || '',
      email: row.volunteerEmail || '',
      name: row.displayName || '',
    };
    sessionStorage.setItem('nexolink:message-target', JSON.stringify(payload));
    onNavigate('messaging');
  };

  const handleOpenEventAction = (event: VolunteerEvent) => {
    if (event.status === 'draft') {
      sessionStorage.setItem(EVENT_DRAFT_EDIT_KEY, event.id);
      onNavigate('create-event');
      return;
    }
    setSelectedEvent(event);
  };

  const openDeleteModal = (event: VolunteerEvent) => {
    setDeleteTarget(event);
    setDeletePassword('');
    setShowDeletePassword(false);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteTarget(null);
    setDeletePassword('');
    setShowDeletePassword(false);
    setDeleteError(null);
  };

  const handleDeleteEvent = async () => {
    if (!deleteTarget || !orgId) return;
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
      if (!user.email) throw new Error('Unable to verify login password.');

      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, credential);
      await user.getIdToken(true);

      await deleteEventCascade(db, orgId, deleteTarget.id);
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

  const selectedRegistrations = useMemo(() => {
    if (!selectedEvent) return [];
    return registrationsByEvent[selectedEvent.id] || [];
  }, [selectedEvent, registrationsByEvent]);

  const filteredRegistrations = useMemo(() => {
    if (!volunteerSearch.trim()) return selectedRegistrations;
    const query = volunteerSearch.trim().toLowerCase();
    return selectedRegistrations.filter((row) => {
      const values = [row.displayName || '', row.volunteerEmail, row.status, row.roleName].map((v) =>
        String(v).toLowerCase(),
      );
      return values.some((value) => value.includes(query));
    });
  }, [selectedRegistrations, volunteerSearch]);

  const eventInsights = useMemo(() => {
    const activeEvents = publishedEvents.filter((event) => !isPastEvent(event));
    const snapshots = activeEvents.map((event) => ({
      event,
      percent: resolveCapacityPercent(event),
      openSlots: Math.max(event.totalCapacity - event.totalSignedUp, 0),
    }));
    const understaffed = snapshots
      .filter((s) => s.event.totalCapacity > 0 && s.percent < 70)
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 3);
    const overstaffed = snapshots
      .filter((s) => s.event.totalCapacity > 0 && s.percent >= 100)
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 2);
    return { activeEvents, understaffed, overstaffed };
  }, [publishedEvents]);

  useEffect(() => {
    setInsightUpdatedAt(Date.now());
  }, [events, eventInsights.understaffed.length, eventInsights.overstaffed.length]);

  const insightUpdatedLabel = useMemo(() => {
    const time = new Date(insightUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Live refresh · ${time}`;
  }, [insightUpdatedAt]);

  const understaffedItems = eventInsights.understaffed.length
    ? eventInsights.understaffed.map((s) => ({
        label: s.event.title,
        value: `${s.event.totalSignedUp}/${s.event.totalCapacity}`,
        tone: 'warning' as const,
        helper: `${s.openSlots} open · ${s.percent}%`,
      }))
    : [{ label: 'All staffed', value: 'OK', tone: 'ok' as const }];

  const overstaffedItems = eventInsights.overstaffed.length
    ? eventInsights.overstaffed.map((s) => ({
        label: s.event.title,
        value: `+${Math.max(s.event.totalSignedUp - s.event.totalCapacity, 0)}`,
        tone: 'alert' as const,
      }))
    : [{ label: 'No overruns', value: 'OK', tone: 'ok' as const }];

  const fallbackInsight = useMemo(
    () => ({
      summary: `${eventInsights.activeEvents.length} active · ${eventInsights.understaffed.length} understaffed`,
      sections: [
        { title: 'Understaffed', items: understaffedItems },
        { title: 'Overstaffed', items: overstaffedItems },
      ],
    }),
    [eventInsights, understaffedItems, overstaffedItems],
  );

  const insightSource = useMemo(
    () => ({
      activeEvents: eventInsights.activeEvents.length,
      understaffed: eventInsights.understaffed.map((s) => ({ title: s.event.title, percent: s.percent })),
      overstaffed: eventInsights.overstaffed.map((s) => ({ title: s.event.title })),
    }),
    [eventInsights],
  );

  const { insight: aiInsight } = useGeminiInsight({
    enabled: aiEnabled && isActive,
    pageKey: 'events',
    sourceData: insightSource,
    fallback: fallbackInsight,
  });

  const handleExportRoster = () => {
    if (!selectedEvent) return;
    if (!selectedRegistrations.length) {
      window.alert('No volunteers to export yet.');
      return;
    }
    const headers = ['Name', 'Email', 'Shift Date', 'Role', 'Status'];
    const rows = selectedRegistrations.map((row) => [
      row.displayName || '',
      row.volunteerEmail,
      row.shiftDate ? row.shiftDate.toLocaleDateString() : '',
      row.roleName,
      row.status,
    ]);
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map((cell) => escapeCell(String(cell || ''))).join(',')).join('\n');
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

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { y: 20, opacity: 0 }, show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 50 } } };

  return (
    <>
      <AnimatePresence mode="wait">
        {selectedEvent ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-full flex flex-col gap-6 mt-8 pb-10"
          >
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
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-lime-100 text-lime-700">
                    {selectedEvent.status}
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
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 overflow-hidden">
                  {selectedEvent.coverImageURL && (
                    <div className="h-48 -mx-8 -mt-8 mb-6 overflow-hidden">
                      <img src={selectedEvent.coverImageURL} className="w-full h-full object-cover" />
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
                        <span className="font-bold text-gray-900 text-lg">{formatDateRange(selectedEvent)}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-900 shrink-0">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Location</span>
                        <span className="font-bold text-gray-900 text-lg leading-tight">{selectedEvent.location || 'TBA'}</span>
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

                <div className="bg-gray-900 rounded-[2.5rem] p-6 shadow-sm border border-gray-800 text-white">
                  <h3 className="font-bold text-white text-lg mb-6">Capacity</h3>
                  <div className="mb-2 flex justify-between items-end">
                    <span className="text-4xl font-bold tracking-tight">{selectedEvent.totalSignedUp}</span>
                    <span className="text-gray-400 font-medium mb-1">/ {selectedEvent.totalCapacity} Volunteers</span>
                  </div>
                  <div className="h-4 bg-gray-800 rounded-full overflow-hidden w-full mb-4">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${resolveCapacityPercent(selectedEvent)}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className={`h-full rounded-full ${resolveCapacityPercent(selectedEvent) >= 100 ? 'bg-red-400' : 'bg-lime-300'}`}
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                <div className="p-8 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-gray-900 text-lg">Signed Up Volunteers</h3>
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">
                      {volunteerSearch.trim() ? filteredRegistrations.length : selectedRegistrations.length}
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
                        <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Shift Date</th>
                        <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Role</th>
                        <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRegistrations.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 px-6 text-center text-sm text-gray-400">
                            No volunteers found.
                          </td>
                        </tr>
                      ) : (
                        filteredRegistrations.map((row) => (
                          <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors group">
                            <td className="py-4 px-6">
                              <div>
                                <span className="block font-bold text-gray-900 text-sm">{row.displayName || 'Volunteer'}</span>
                                <span className="block text-xs text-gray-500">{row.volunteerEmail || 'Email on file'}</span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-sm font-medium text-gray-600">
                              {row.shiftDate ? row.shiftDate.toLocaleDateString() : '—'}
                            </td>
                            <td className="py-4 px-6 text-sm font-medium text-gray-600">{row.roleName}</td>
                            <td className="py-4 px-6">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                  row.status === 'checkedIn'
                                    ? 'bg-lime-50 text-lime-700 border-lime-100'
                                    : row.status === 'registered'
                                      ? 'bg-green-50 text-green-700 border-green-100'
                                      : row.status === 'cancelled'
                                        ? 'bg-red-50 text-red-700 border-red-100'
                                        : 'bg-gray-50 text-gray-600 border-gray-100'
                                }`}
                              >
                                {row.status === 'checkedIn' && <CheckCircle2 className="w-3 h-3" />}
                                {row.status}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleCopyEmail(row.volunteerEmail)}
                                  className="p-2 hover:bg-lime-100 text-gray-400 hover:text-lime-700 rounded-lg transition-colors"
                                  title="Copy Email"
                                >
                                  <Mail className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleMessageVolunteer(row)}
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
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-full flex flex-col gap-6 mt-8 pb-10"
          >
            <motion.div variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    sessionStorage.removeItem(EVENT_DRAFT_EDIT_KEY);
                    onNavigate('create-event');
                  }}
                  className="h-11 px-5 bg-gray-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-black transition-all shadow-sm hover:shadow-md"
                >
                  <Plus className="w-5 h-5" />
                  <span>Create Event</span>
                </button>
              </div>
            </motion.div>

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
                  <p className="text-sm text-gray-500 mt-2">Create your first volunteer opportunity to get started.</p>
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
                    <div className="relative group/cover w-full sm:w-60 md:w-48 aspect-square shrink-0 bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 self-start">
                      {event.coverImageURL ? (
                        <img
                          src={event.coverImageURL}
                          alt={`${event.title} cover`}
                          className="absolute inset-0 block w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-lime-50/50">
                          <Calendar className="w-8 h-8 text-lime-200" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3 flex flex-col items-center justify-center w-12 h-14 bg-white/90 backdrop-blur-sm rounded-xl shadow-sm">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          {formatDateBadge(event.startDate).month}
                        </span>
                        <span className="text-xl font-bold text-gray-900">{formatDateBadge(event.startDate).day}</span>
                      </div>
                    </div>

                    <div className="flex-1 pr-24">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-xl font-bold text-gray-900 group-hover:text-lime-600 transition-colors">{event.title}</h3>
                          <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-500">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" /> {formatDateRange(event)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <MapPin className="w-4 h-4" /> {event.location || 'Location TBA'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="text-gray-500">Volunteers</span>
                            <span className={resolveCapacityPercent(event) >= 100 ? 'text-red-500' : 'text-gray-900'}>
                              {event.totalSignedUp} / {event.totalCapacity}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-full">
                            <div
                              className={`h-full rounded-full ${resolveCapacityPercent(event) >= 100 ? 'bg-red-400' : 'bg-lime-400'}`}
                              style={{ width: `${resolveCapacityPercent(event)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-6 right-6 flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEventAction(event)}
                        className="px-5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
                      >
                        {event.status === 'draft' ? 'Edit' : 'Manage'}
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6">
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
                    This will permanently delete &ldquo;{deleteTarget.title}&rdquo; and all of its shifts and registrations.
                  </p>
                </div>
                <button onClick={closeDeleteModal} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-8 space-y-6 pb-8">
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
                <button onClick={closeDeleteModal} disabled={deleteLoading} className="w-full py-3 rounded-2xl text-gray-500 font-semibold text-sm hover:text-gray-800 transition-colors">
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
