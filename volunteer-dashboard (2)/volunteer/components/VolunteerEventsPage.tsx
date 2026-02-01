import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Calendar, Clock, ArrowRight, Filter, Search, Check, ChevronRight } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { EventSignupModal } from './EventSignupModal';

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
  shifts?: any[];
  peoplePerSlot?: number;
  capacity?: number;
}

interface Signup {
  id: string;
  eventId: string;
  status: string;
}

interface VolunteerEventsPageProps {
  userProfile?: any;
}

export const VolunteerEventsPage: React.FC<VolunteerEventsPageProps> = ({ userProfile }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [signups, setSignups] = useState<Record<string, Signup>>({}); // Map eventId -> Signup
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  
  const [activeFilter, setActiveFilter] = useState('All Events');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [hoveringOrganizations, setHoveringOrganizations] = useState(false);
  const [organizations, setOrganizations] = useState<string[]>([]);

  useEffect(() => {
    const db = getFirestoreDb();
    const auth = getFirebaseAuth();
    
    let unsubEvents: (() => void) | null = null;
    let unsubSignups: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setEvents([]);
        setSignups({});
        setLoading(false);
        if (unsubEvents) unsubEvents();
        if (unsubSignups) unsubSignups();
        return;
      }

      // 1. Fetch User's Organizations
      const userOrgsRef = collection(db, 'user_organizations');
      const qUserOrgs = query(userOrgsRef, where('user_id', '==', user.uid));
      
      let myOrgCodes: Set<string> = new Set();
      let myOrgIds: Set<string> = new Set();
      let orgNames: Set<string> = new Set();

      try {
        const orgSnaps = await getDocs(qUserOrgs);
        orgSnaps.forEach(docSnap => {
          const data = docSnap.data();
          const status = String(data.status || '').toLowerCase();
          const whitelist = ['active', 'accepted', 'approved', 'connected', 'granted', 'confirmed', ''];
          if (!whitelist.some(v => status.includes(v))) return;

          if (data.orgCode) myOrgCodes.add(String(data.orgCode).toUpperCase());
          if (data.org_code) myOrgCodes.add(String(data.org_code).toUpperCase());
          if (data.organizationCode) myOrgCodes.add(String(data.organizationCode).toUpperCase());
          if (data.orgId) myOrgIds.add(String(data.orgId));
          if (data.organizationId) myOrgIds.add(String(data.organizationId));
          if (data.org_id) myOrgIds.add(String(data.org_id));

          const name = data.orgName || data.organizationName || data.name || data.schoolName || '';
          if (name) orgNames.add(String(name));
        });
        setOrganizations(Array.from(orgNames).sort());
      } catch (err) {
        console.error("Error fetching user orgs", err);
      }

      // 2. Subscribe to All Events
      const eventsRef = collection(db, 'events');
      const qEvents = query(eventsRef, where('status', '!=', 'draft'));

      if (unsubEvents) unsubEvents();
      unsubEvents = onSnapshot(qEvents, (snapshot) => {
        const loaded: Event[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.status === 'archived') return;
          const evtOrgCode = (data.orgCode || data.org_code || data.organizationCode || '').toString().toUpperCase();
          const evtOrgId = (data.orgId || data.org_id || data.organizationId || '').toString();
          
          const isMatch = (evtOrgCode && myOrgCodes.has(evtOrgCode)) || (evtOrgId && myOrgIds.has(evtOrgId));
          if (isMatch) {
            loaded.push({ id: docSnap.id, ...data } as Event);
          }
        });
        loaded.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        setEvents(loaded);
        setLoading(false);
      }, (err) => {
        console.error("Event subscription error", err);
        setLoading(false);
      });

      // 3. Subscribe to Signups
      const signupsRef = collection(db, 'event_signups');
      const qSignups = query(signupsRef, where('volunteerEmail', '==', user.email));
      
      if (unsubSignups) unsubSignups();
      unsubSignups = onSnapshot(qSignups, (snapshot) => {
        const map: Record<string, Signup> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          map[data.eventId] = { id: docSnap.id, eventId: data.eventId, status: data.status };
        });
        setSignups(map);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubEvents) unsubEvents();
      if (unsubSignups) unsubSignups();
    };
  }, []);

  const handleReserve = async () => {
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

      await addDoc(collection(db, 'event_signups'), {
        eventId: selectedEvent.id,
        volunteerId: user.uid,
        volunteerName: fullName,
        volunteerEmail: user.email,
        status: 'confirmed',
        role: 'Volunteer',
        createdAt: serverTimestamp(),
        // Add minimal event details for easy querying if needed
        eventTitle: selectedEvent.title,
        eventDate: selectedEvent.startDate
      });
      
      setIsReserving(false);
      setSelectedEvent(null); // Close modal
    } catch (err) {
      console.error("Signup failed", err);
      setIsReserving(false);
    }
  };

  const handleCancel = async (eventId: string) => {
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

  const filteredEvents = events.filter(ev => {
    // 1. Search Filter
    const matchesSearch = ev.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (ev.city || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (ev.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    // 2. Organization Filter
    if (activeFilter !== 'All Events') {
       const orgName = (ev as any).orgName || (ev as any).organizationName || (ev as any).name || (ev as any).schoolName || '';
       if (String(orgName) !== activeFilter) return false;
    }
    
    return true;
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: d.getDate(),
      full: d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })
    };
  };

  const formatTime = (start?: string, end?: string) => {
      if (!start) return 'Time TBA';
      const toTime = (t: string) => new Date(`2000-01-01T${t}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return end ? `${toTime(start)} - ${toTime(end)}` : toTime(start);
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
                              className="relative group/orgs"
                              onMouseEnter={() => setHoveringOrganizations(true)}
                              onMouseLeave={() => setHoveringOrganizations(false)}
                            >
                              <button
                                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between text-gray-600 hover:bg-gray-50 hover:text-gray-900`}
                              >
                                <span>Organizations</span>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </button>

                              {/* Sub-menu */}
                              <div className="absolute left-full top-0 ml-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 hidden group-hover/orgs:block">
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
                
                return (
                  <motion.div 
                    key={event.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-8 group"
                  >
                      {/* Date / Image */}
                      <div className="relative w-full md:w-48 h-48 md:h-auto shrink-0 bg-gray-100 rounded-3xl overflow-hidden self-stretch">
                          {event.coverImageUrl ? (
                             <img src={event.coverImageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
                                    : 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}>
                                   {isSignedUp ? 'Registered' : (event.status || 'Open')}
                                </span>
                                {event.shifts && event.shifts.length > 0 && (
                                   <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide bg-blue-50 text-blue-600 border border-blue-100">
                                      {event.shifts.length} Shifts
                                   </span>
                                )}
                             </div>
                             <h3 className="text-2xl font-bold text-gray-900 group-hover:text-lime-600 transition-colors mb-2">
                                {event.title}
                             </h3>
                             <div className="flex flex-wrap gap-4 text-sm font-medium text-gray-500">
                                <div className="flex items-center gap-1.5">
                                   <Clock className="w-4 h-4" />
                                   {formatTime(event.startTime, event.endTime)}
                                </div>
                                <div className="flex items-center gap-1.5">
                                   <MapPin className="w-4 h-4" />
                                   {[event.venue, event.city].filter(Boolean).join(', ') || 'TBA'}
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
