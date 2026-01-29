import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Users, 
  Plus, 
  MoreVertical, 
  ChevronRight, 
  ArrowLeft,
  Search,
  Mail,
  CheckCircle2,
  MoreHorizontal,
  Phone,
  Filter,
  Download
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { resolveOrgContext, subscribeToOrgCollection } from '../lib/orgContext';

interface EventsPageProps {
  onNavigate: (view: string) => void;
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
}
type Signup = {
  id: string;
  eventId: string;
  volunteerName: string;
  volunteerEmail: string;
  status: string;
  role: string;
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  // Add timezone offset to ensure consistency if needed, 
  // but for simple date comparison we just need the midnight UTC or local.
  // We'll use local midnight for "today" comparisons.
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
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
  capacity: Number.isFinite(data.capacity as number) ? Number(data.capacity) : null,
  maxVolunteers: Number.isFinite(data.maxVolunteers as number) ? Number(data.maxVolunteers) : undefined,
  peoplePerSlot: Number.isFinite(data.peoplePerSlot as number) ? Number(data.peoplePerSlot) : null,
  timeSlots: Array.isArray(data.timeSlots) ? data.timeSlots : [],
  coverImageUrl: data.coverImageUrl ? String(data.coverImageUrl) : undefined,
  isDateRange: !!data.isDateRange,
  shifts: Array.isArray(data.shifts) ? data.shifts : [],
  category: data.category ? String(data.category) : undefined,
  description: data.description ? String(data.description) : undefined,
  location: data.location ? String(data.location) : undefined,
});

const resolveEventCapacity = (event: Event, signups: Signup[]) => {
  if (Number.isFinite(event.capacity ?? NaN) && (event.capacity ?? 0) > 0) {
    return Number(event.capacity);
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

export const EventsPage: React.FC<EventsPageProps> = ({ onNavigate }) => {
  const [filter, setFilter] = useState('Upcoming');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [orgCode, setOrgCode] = useState('');
  const [orgId, setOrgId] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [drafts, setDrafts] = useState<Event[]>([]);
  const [signupsByEvent, setSignupsByEvent] = useState<Record<string, Signup[]>>({});

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
      const context = await resolveOrgContext(db, user.uid);
      setOrgCode(context.orgCode || '');
      setOrgId(context.orgId || '');
    });
    return () => unsubscribe();
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
        const published: Event[] = [];
        const draftItems: Event[] = [];
        rows.forEach((row) => {
          const event = normalizeEvent(row.data || {}, row.id);
          const status = (event.status || 'published').toLowerCase();
          if (status === 'draft') {
            draftItems.push(event);
          } else if (status !== 'archived') {
            published.push(event);
          }
        });
        published.sort((a, b) => {
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
          const eventId = String(data.eventId || data.event_id || '');
          if (!eventId) return;
          const entry: Signup = {
            id: row.id,
            eventId,
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
  }, [orgCode, orgId]);

  const visibleEvents = useMemo(() => {
    if (filter === 'Drafts') return drafts;
    if (filter === 'Past') return events.filter(isPastEvent);
    if (filter === 'Live') return events.filter(isLiveEvent);
    return events.filter(isUpcomingEvent);
  }, [events, drafts, filter]);

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
                <button className="h-12 px-5 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold flex items-center gap-2 hover:bg-gray-50 transition-colors">
                    <Download className="w-4 h-4" />
                    <span className="hidden md:inline">Export Roster</span>
                </button>
                <button className="h-12 px-5 bg-gray-900 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-black transition-colors shadow-lg shadow-gray-900/10">
                    <Mail className="w-4 h-4" />
                    <span className="hidden md:inline">Message All</span>
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
                  <div className="bg-gray-900 rounded-[2.5rem] p-8 shadow-sm border border-gray-800 text-white">
                      <h3 className="font-bold text-white text-lg mb-6">Capacity</h3>
                      <div className="mb-2 flex justify-between items-end">
                          <span className="text-4xl font-bold tracking-tight">{(signupsByEvent[selectedEvent.id] || []).length}</span>
                          <span className="text-gray-400 font-medium mb-1">
                            / {resolveEventCapacity(selectedEvent, signupsByEvent[selectedEvent.id] || [])} Volunteers
                          </span>
                      </div>
                      <div className="h-4 bg-gray-800 rounded-full overflow-hidden w-full mb-6">
                          <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${resolveCapacityPercent(selectedEvent, signupsByEvent[selectedEvent.id] || [])}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className={`h-full rounded-full ${resolveCapacityPercent(selectedEvent, signupsByEvent[selectedEvent.id] || []) >= 100 ? 'bg-red-400' : 'bg-lime-300'}`}
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-800">
                          <div>
                              <span className="block text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Total Hours</span>
                              <span className="text-xl font-bold text-lime-300">48 hrs</span>
                          </div>
                          <div>
                              <span className="block text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Attendance</span>
                              <span className="text-xl font-bold text-white">92%</span>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Right Column: Volunteers List */}
              <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden">
                  <div className="p-8 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                          <h3 className="font-bold text-gray-900 text-lg">Signed Up Volunteers</h3>
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold">{(signupsByEvent[selectedEvent.id] || []).length}</span>
                      </div>
                      <div className="flex items-center gap-3">
                          <div className="relative group">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-lime-600 transition-colors" />
                              <input 
                                  type="text" 
                                  placeholder="Search list..." 
                                  className="h-10 pl-10 pr-4 bg-gray-50 rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none w-48 transition-all"
                              />
                          </div>
                          <button className="h-10 w-10 bg-gray-50 hover:bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 transition-colors">
                              <Filter className="w-4 h-4" />
                          </button>
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
                              {(signupsByEvent[selectedEvent.id] || []).map((vol) => (
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
                                              vol.status.toLowerCase() === 'confirmed' ? 'bg-blue-50 text-blue-700 border-blue-100' :
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
                                              <button className="p-2 hover:bg-lime-100 text-gray-400 hover:text-lime-700 rounded-lg transition-colors" title="Message">
                                                  <Mail className="w-4 h-4" />
                                              </button>
                                              <button className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-900 rounded-lg transition-colors" title="Call">
                                                  <Phone className="w-4 h-4" />
                                              </button>
                                              <button className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-900 rounded-lg transition-colors">
                                                  <MoreHorizontal className="w-4 h-4" />
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
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
                    onClick={() => onNavigate('create-event')}
                    className="w-12 h-12 bg-gray-900 hover:bg-black text-white rounded-2xl flex items-center justify-center shadow-lg shadow-gray-900/20 hover:-translate-y-0.5 transition-all"
                >
                    <Plus className="w-6 h-6" />
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
                    className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 md:items-center group"
                >
                    {/* Cover / Date Badge */}
                    <div className="relative group/cover w-full md:w-32 h-40 md:h-auto shrink-0 bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                        {event.coverImageUrl ? (
                          <img src={event.coverImageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
                    <div className="flex-1">
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
                             <button className="p-2 text-gray-300 hover:text-gray-900 rounded-full transition-colors">
                                <MoreVertical className="w-5 h-5" />
                             </button>
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

                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={() => setSelectedEvent(event)}
                                    className="px-5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
                                >
                                    Manage
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                </motion.div>
            ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
