import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  Mail,
  Calendar,
  Clock,
  Archive,
  AlertTriangle,
  Check,
  RotateCcw,
  Copy,
  History,
} from 'lucide-react';
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { resolveOrgAdmins, resolveOrgContext, subscribeToOrgCollection } from '../lib/orgContext';

type VolunteerRow = {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'archived';
  hours: number;
  task: string;
  lastLogged: string;
  email: string;
  lastLogDate?: Date | null;
  matchIds: string[];
  matchEmails: string[];
  matchNames: string[];
};

export const VolunteersPage: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState('All Members');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [archiveModal, setArchiveModal] = useState<{ isOpen: boolean; id: string | null; name: string }>({
    isOpen: false,
    id: null,
    name: '',
  });
  const [emailModal, setEmailModal] = useState<{ isOpen: boolean; name: string; email: string }>({
    isOpen: false,
    name: '',
    email: '',
  });
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; name: string; logs: Array<Record<string, unknown>> }>({
    isOpen: false,
    name: '',
    logs: [],
  });
  const [archivePassword, setArchivePassword] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [adminUid, setAdminUid] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [orgAdminIds, setOrgAdminIds] = useState<string[]>([]);
  const [orgAdminEmails, setOrgAdminEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Array<{ id: string; data: Record<string, unknown> }>>([]);
  const [memberLinks, setMemberLinks] = useState<Array<{ id: string; data: Record<string, unknown> }>>([]);
  const [joinRequests, setJoinRequests] = useState<Array<{ id: string; data: Record<string, unknown> }>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [page, setPage] = useState(1);
  const pageSize = 7;

  const filters = ['All Members', 'Highest Hours', 'Lowest Hours', 'Archived'];

  const getLogDate = (log: Record<string, unknown>) => {
    const raw = (log.created_at || log.createdAt || log.date) as { toDate?: () => Date } | undefined;
    if (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
      return (raw as { toDate: () => Date }).toDate();
    }
    if (typeof raw === 'string' || typeof raw === 'number') {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const timestamp = raw as { seconds?: number; nanoseconds?: number } | undefined;
    if (timestamp?.seconds != null && timestamp?.nanoseconds != null) {
      return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1e6));
    }
    return null;
  };

  const formatLogDate = (date: Date | null) => {
    if (!date) return '—';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOrgCode('');
        setAdminUid('');
        setAdminEmail('');
        setUsers([]);
        setLogs([]);
        setLoading(false);
        return;
      }
      setAdminUid(user.uid || '');
      setAdminEmail(user.email || '');
      const context = await resolveOrgContext(db, user.uid);
      setOrgCode(context.orgCode || '');
      setOrgId(context.orgId || '');
      setOrgName(context.orgName || '');
      const adminContext = await resolveOrgAdmins(db, context.orgId, context.orgCode);
      setOrgAdminIds(adminContext.adminIds || []);
      setOrgAdminEmails(adminContext.adminEmails || []);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!orgCode && !orgId) return;
    const db = getFirestoreDb();
    const unsubUsers = subscribeToOrgCollection({
      db,
      collectionName: 'users',
      orgCode,
      orgId,
      onData: (rows) => {
        setUsers(rows);
        setLoading(false);
      },
    });

    const unsubLogs = subscribeToOrgCollection({
      db,
      collectionName: 'volunteer_logs',
      orgCode,
      orgId,
      onData: (rows) => {
        setLogs(rows.map((row) => ({ id: row.id, ...(row.data || {}) })));
      },
    });

    const unsubMembers = subscribeToOrgCollection({
      db,
      collectionName: 'user_organizations',
      orgCode,
      orgId,
      onData: (rows) => {
        setMemberLinks(rows);
      },
    });

    const unsubJoinRequests = subscribeToOrgCollection({
      db,
      collectionName: 'organization_join_requests',
      orgCode,
      orgId,
      onData: (rows) => {
        setJoinRequests(rows);
      },
    });

    return () => {
      unsubUsers();
      unsubLogs();
      unsubMembers();
      unsubJoinRequests();
    };
  }, [orgCode, orgId]);

  const volunteers = useMemo<VolunteerRow[]>(() => {
    const volunteerMap = new Map<string, VolunteerRow>();
    const keyByUserId = new Map<string, string>();
    const keyByEmail = new Map<string, string>();
    const keyByName = new Map<string, string>();

    users.forEach((user) => {
      const data = user.data || {};
      const first = String(data.firstName || data.name || '').trim();
      const last = String(data.lastName || data.last_name || '').trim();
      const email = String(data.email || '').trim();
      const name = [first, last].filter(Boolean).join(' ').trim() || email || 'Volunteer';
      const role = String(data.role || 'Volunteer');
      
      // Strict filters for organizations and admins
      if (orgId && user.id === orgId) return;
      if (adminUid && user.id === adminUid) return;
      if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) return;
      if (orgAdminIds.includes(user.id)) return;
      if (orgAdminEmails.includes(email.toLowerCase())) return;
      
      const cleanOrgName = (orgName || '').trim().toLowerCase();
      if (cleanOrgName && (name.toLowerCase() === cleanOrgName || name.toLowerCase().includes('tutoring club'))) return;

      const archived = Boolean(data.archived || data.status === 'archived');
      const key = buildVolunteerKey(email, name, user.id);
      keyByUserId.set(user.id, key);
      if (email) keyByEmail.set(email.toLowerCase(), key);
      if (name) keyByName.set(name.toLowerCase(), key);
      const existing = volunteerMap.get(key);

      if (!existing) {
        volunteerMap.set(key, {
          id: user.id,
          name,
          role,
          status: archived ? 'archived' : 'active',
          hours: 0,
          task: '—',
          lastLogged: '—',
          email,
          lastLogDate: null,
          matchIds: user.id ? [user.id] : [],
          matchEmails: email ? [email.toLowerCase()] : [],
          matchNames: name ? [name.toLowerCase()] : [],
        });
        return;
      }

      existing.email = existing.email || email;
      existing.name = existing.name || name;
      existing.role = role !== 'Volunteer' ? role : existing.role;
      existing.status = existing.status === 'archived' || archived ? 'archived' : 'active';
      if (user.id && !existing.matchIds.includes(user.id)) {
        existing.matchIds.push(user.id);
      }
      if (email) {
        const normalizedEmail = email.toLowerCase();
        if (!existing.matchEmails.includes(normalizedEmail)) {
          existing.matchEmails.push(normalizedEmail);
        }
      }
      if (name) {
        const normalizedName = name.toLowerCase();
        if (!existing.matchNames.includes(normalizedName)) {
          existing.matchNames.push(normalizedName);
        }
      }
    });

    memberLinks.forEach((link) => {
      const data = link.data || {};
      const userId = String(data.user_id || data.userId || data.uid || link.id || '').trim();
      const email = String(data.email || data.user_email || '').trim();
      const name = String(data.name || data.user_name || '').trim() || email || 'Volunteer';
      const role = String(data.role || 'Volunteer');

      // Strict filters for organizations and admins
      if (orgId && userId === orgId) return;
      if (adminUid && userId === adminUid) return;
      if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) return;
      if (orgAdminIds.includes(userId)) return;
      if (orgAdminEmails.includes(email.toLowerCase())) return;
      
      const cleanOrgName = (orgName || '').trim().toLowerCase();
      if (cleanOrgName && (name.toLowerCase() === cleanOrgName || name.toLowerCase().includes('tutoring club'))) return;

      if (userId && keyByUserId.has(userId)) return;
      if (email && keyByEmail.has(email.toLowerCase())) return;
      if (name && keyByName.has(name.toLowerCase())) return;
      const key = buildVolunteerKey(email, name, userId || link.id);
      keyByUserId.set(userId || key, key);
      if (email) keyByEmail.set(email.toLowerCase(), key);
      if (name) keyByName.set(name.toLowerCase(), key);
      volunteerMap.set(key, {
        id: userId || key,
        name,
        role,
        status: 'active',
        hours: 0,
        task: '—',
        lastLogged: '—',
        email,
        lastLogDate: null,
        matchIds: userId ? [userId] : [],
        matchEmails: email ? [email.toLowerCase()] : [],
        matchNames: name ? [name.toLowerCase()] : [],
      });
    });

    joinRequests.forEach((req) => {
      const data = req.data || {};
      const status = String(data.status || '').toLowerCase();
      if (status !== 'accepted') return;

      const userId = String(data.user_id || data.userId || '').trim();
      const email = String(data.user_email || data.email || '').trim();
      const name = String(data.user_name || data.name || '').trim() || email || 'Volunteer';
      const role = String(data.requested_role || data.role || 'Volunteer');

      if (orgId && userId === orgId) return;
      if (adminUid && userId === adminUid) return;
      if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) return;
      
      if (userId && keyByUserId.has(userId)) return;
      if (email && keyByEmail.has(email.toLowerCase())) return;
      if (name && keyByName.has(name.toLowerCase())) return;

      const key = buildVolunteerKey(email, name, userId || req.id);
      keyByUserId.set(userId || key, key);
      if (email) keyByEmail.set(email.toLowerCase(), key);
      if (name) keyByName.set(name.toLowerCase(), key);
      volunteerMap.set(key, {
        id: userId || key,
        name,
        role,
        status: 'active',
        hours: 0,
        task: '—',
        lastLogged: '—',
        email,
        lastLogDate: null,
        matchIds: userId ? [userId] : [],
        matchEmails: email ? [email.toLowerCase()] : [],
        matchNames: name ? [name.toLowerCase()] : [],
      });
    });

    logs.forEach((log) => {
      const userId = getLogUserId(log);
      const logEmail = String(log.volunteer_email || log.email || '').trim();
      const logName = String(log.volunteer_name || log.name || log.firstName || '').trim();
      const role = String(log.role || log.volunteer_role || 'Volunteer');
      
      // Strict filters for organizations and admins
      if (orgId && userId === orgId) return;
      if (adminUid && userId === adminUid) return;
      if (adminEmail && logEmail.toLowerCase() === adminEmail.toLowerCase()) return;
      if (orgAdminIds.includes(userId)) return;
      if (orgAdminEmails.includes(logEmail.toLowerCase())) return;
      
      const cleanOrgName = (orgName || '').trim().toLowerCase();
      if (cleanOrgName && (logName.toLowerCase() === cleanOrgName || logName.toLowerCase().includes('tutoring club'))) return;

      const key = userId && keyByUserId.has(userId)
        ? keyByUserId.get(userId) as string
        : logEmail && keyByEmail.has(logEmail.toLowerCase())
          ? keyByEmail.get(logEmail.toLowerCase()) as string
          : logName && keyByName.has(logName.toLowerCase())
            ? keyByName.get(logName.toLowerCase()) as string
            : buildVolunteerKey(logEmail, logName, userId);
      const entry = volunteerMap.get(key) || {
        id: userId || key,
        name: logName || logEmail || 'Volunteer',
        role: role,
        status: 'active' as const,
        hours: 0,
        task: '—',
        lastLogged: '—',
        email: logEmail,
        lastLogDate: null,
        matchIds: userId ? [userId] : [],
        matchEmails: logEmail ? [logEmail.toLowerCase()] : [],
        matchNames: logName ? [logName.toLowerCase()] : [],
      };

      const addHours = isApproved(log) ? getLogHours(log) : 0;
      entry.hours += addHours;

      const approved = isApproved(log);
      if (approved) {
        const date = getLogDate(log);
        if (date && (!entry.lastLogDate || date > entry.lastLogDate)) {
          entry.lastLogDate = date;
          entry.lastLogged = formatRelativeTime(date);
          entry.task = String(log.volunteering_task || log.task || log.site || 'Volunteer shift');
        }
      }

      if (!volunteerMap.has(key)) {
        volunteerMap.set(key, entry);
      } else {
        const existing = volunteerMap.get(key);
        if (existing) {
          if (approved && entry.lastLogDate && (!existing.lastLogDate || entry.lastLogDate > existing.lastLogDate)) {
            existing.lastLogDate = entry.lastLogDate;
            existing.lastLogged = entry.lastLogged;
            existing.task = entry.task;
          }
          existing.email = existing.email || entry.email;
          existing.name = existing.name || entry.name;
          entry.matchIds.forEach((id) => {
            if (!existing.matchIds.includes(id)) existing.matchIds.push(id);
          });
          entry.matchEmails.forEach((mail) => {
            if (!existing.matchEmails.includes(mail)) existing.matchEmails.push(mail);
          });
          entry.matchNames.forEach((nameKey) => {
            if (!existing.matchNames.includes(nameKey)) existing.matchNames.push(nameKey);
          });
        }
      }
    });

    return Array.from(volunteerMap.values());
  }, [adminEmail, adminUid, logs, memberLinks, orgAdminEmails, orgAdminIds, users]);

  const buildVolunteerHistory = (volunteer: VolunteerRow) => {
    const normalizedEmail = volunteer.email?.toLowerCase();
    const matchIds = new Set(volunteer.matchIds.filter(Boolean));
    const matchEmails = new Set(volunteer.matchEmails.filter(Boolean));
    const matchNames = new Set(volunteer.matchNames.filter(Boolean));
    const filtered = logs.filter((log) => {
      const userId = getLogUserId(log);
      const logEmail = String(log.volunteer_email || log.email || '').toLowerCase();
      const logName = String(log.volunteer_name || log.name || log.firstName || '').trim().toLowerCase();
      if (userId && matchIds.has(userId)) return true;
      if (logEmail && matchEmails.has(logEmail)) return true;
      if (logName && matchNames.has(logName)) return true;
      if (volunteer.id && userId && userId === volunteer.id) return true;
      if (normalizedEmail && logEmail === normalizedEmail) return true;
      if (volunteer.name && logName === volunteer.name.toLowerCase()) return true;
      return false;
    });
    return filtered
      .map((log) => ({ ...log }))
      .sort((a, b) => {
        const aDate = getLogDate(a);
        const bDate = getLogDate(b);
        return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
      });
  };

  const openHistoryModal = (volunteer: VolunteerRow) => {
    const history = buildVolunteerHistory(volunteer);
    setHistoryModal({
      isOpen: true,
      name: volunteer.name || 'Volunteer',
      logs: history,
    });
  };

  const filteredData = useMemo(() => {
    let data = [...volunteers];

    if (searchQuery) {
      data = data.filter((v) => v.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    switch (activeFilter) {
      case 'Archived':
        return data.filter((v) => v.status === 'archived');
      case 'Highest Hours':
        return data.filter((v) => v.status !== 'archived').sort((a, b) => b.hours - a.hours);
      case 'Lowest Hours':
        return data.filter((v) => v.status !== 'archived').sort((a, b) => a.hours - b.hours);
      case 'All Members':
      default:
        return data.filter((v) => v.status !== 'archived');
    }
  }, [volunteers, activeFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, searchQuery]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleArchiveClick = (id: string, name: string) => {
    setArchiveModal({ isOpen: true, id, name });
    setArchivePassword('');
    setArchiveError('');
  };

  const confirmArchive = async () => {
    if (!archiveModal.id) return;
    if (!archivePassword.trim()) {
      setArchiveError('Password required.');
      return;
    }
    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser || !adminEmail) {
        setArchiveError('Please sign in again.');
        return;
      }
      const credential = EmailAuthProvider.credential(adminEmail, archivePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      const db = getFirestoreDb();
      await updateDoc(doc(db, 'users', archiveModal.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser.uid,
      });
      setArchiveModal({ isOpen: false, id: null, name: '' });
    } catch (error) {
      console.error('Archive failed', error);
      setArchiveError('Password incorrect. Try again.');
    }
  };

  const handleUnarchive = async (id: string) => {
    const db = getFirestoreDb();
    await updateDoc(doc(db, 'users', id), {
      archived: false,
      unarchivedAt: serverTimestamp(),
    });
  };

  const handleMessageAll = () => {
    // Collect all unique emails from non-archived volunteers
    const activeEmails = Array.from(new Set(
      volunteers
        .filter(v => v.status !== 'archived' && v.email && v.email.includes('@'))
        .map(v => v.email)
    ));
    
    if (activeEmails.length === 0) return;
    
    setEmailModal({
      isOpen: true,
      name: `All Volunteers (${activeEmails.length})`,
      email: activeEmails.join(', ')
    });
  };

  return (
    <div className="w-full flex flex-col gap-6 mt-8 relative">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6"
      >
        <div className="flex justify-start">
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-72 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-lime-500 transition-colors" />
              <input
                type="text"
                placeholder="Search volunteers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-12 pr-4 bg-white rounded-2xl border-none shadow-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all"
              />
            </div>

            <div className="relative z-50">
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
                      onClick={() => setShowFilterMenu(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-14 left-0 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 overflow-hidden"
                    >
                      <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Filter By</div>
                      {filters.map((f) => (
                        <button
                          key={f}
                          onClick={() => {
                            setActiveFilter(f);
                            setShowFilterMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                            activeFilter === f
                              ? 'bg-gray-50 text-gray-900'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          {f}
                          {activeFilter === f && <Check className="w-4 h-4 text-lime-600" />}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleMessageAll}
              className="h-12 px-6 bg-white text-gray-500 hover:text-lime-600 hover:bg-lime-50 rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all border border-transparent font-bold"
              title="Message All Active Volunteers"
            >
              <Mail className="w-5 h-5" />
              <span className="hidden md:inline">Message All</span>
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[400px]"
      >
        <div className="grid grid-cols-12 gap-4 p-6 border-b border-gray-100 bg-gray-50/50 text-xs font-bold text-gray-400 uppercase tracking-wider">
          <div className="col-span-4 pl-4">Volunteer Profile</div>
          <div className="col-span-2">Total Hours</div>
          <div className="col-span-3">Latest Task</div>
          <div className="col-span-2">Last Logged</div>
          <div className="col-span-1 text-right pr-4">Actions</div>
        </div>

        <div className="flex flex-col">
          <AnimatePresence mode="popLayout">
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-gray-400"
              >
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Clock className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm font-medium">Loading volunteers...</p>
              </motion.div>
            ) : pagedData.length > 0 ? (
              pagedData.map((v) => (
                <motion.div
                  key={v.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 50, damping: 15 }}
                  className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-gray-50/80 transition-colors group border-b border-gray-50 last:border-0"
                >
                  <div className="col-span-4 flex items-center gap-4 pl-4">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm group-hover:text-lime-700 transition-colors">{v.name}</h4>
                      <p className="text-xs text-gray-500 font-medium">{v.role}</p>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg group-hover:bg-lime-100 transition-colors">
                      <Clock className="w-3.5 h-3.5 text-gray-500 group-hover:text-lime-700" />
                      <span className="text-sm font-bold text-gray-900">
                        {v.hours.toFixed(1)} <span className="text-xs font-normal text-gray-500">hrs</span>
                      </span>
                    </div>
                  </div>

                  <div className="col-span-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.status === 'archived' ? 'bg-gray-300' : 'bg-lime-500'}`} />
                      <span className="text-sm font-medium text-gray-700 truncate">{v.task}</span>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <span className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      {v.lastLogged}
                    </span>
                  </div>

                  <div className="col-span-1 flex justify-end gap-2 pr-2">
                    <button
                      title="View History"
                      onClick={() => openHistoryModal(v)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-lime-600 hover:bg-lime-50 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      title="View Email"
                      onClick={() => setEmailModal({ isOpen: true, name: v.name, email: v.email || 'No email on file' })}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-lime-600 hover:bg-lime-50 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    {v.status !== 'archived' ? (
                      <button
                        onClick={() => handleArchiveClick(v.id, v.name)}
                        title="Archive Volunteer"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUnarchive(v.id)}
                        title="Unarchive Volunteer"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-lime-600 hover:bg-lime-50 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-gray-400"
              >
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm font-medium">No volunteers found</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50/30 flex justify-between items-center mt-auto">
          <span className="text-xs font-semibold text-gray-400">
            {filteredData.length === 0 ? (
              'Showing 0 results'
            ) : (
              <>
                Showing {(currentPage - 1) * pageSize + 1}
                {'-'}
                {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} result{filteredData.length !== 1 ? 's' : ''}
              </>
            )}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="px-4 py-2 bg-gray-900 rounded-xl text-xs font-bold text-white shadow-lg shadow-gray-900/10 hover:bg-black transition-colors disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {archiveModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setArchiveModal({ isOpen: false, id: null, name: '' })}
            />

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md relative shadow-2xl z-10 flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-500">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Archive Volunteer?</h3>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Do you want to archive <span className="font-bold text-gray-900">{archiveModal.name}</span>? They
                will be moved to the archived list and won&apos;t appear in active reports.
              </p>
              <div className="w-full text-left mb-6">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  value={archivePassword}
                  onChange={(event) => setArchivePassword(event.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-200 outline-none"
                  placeholder="Enter your password"
                />
                {archiveError && <p className="text-xs text-red-500 mt-2">{archiveError}</p>}
              </div>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setArchiveModal({ isOpen: false, id: null, name: '' })}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmArchive}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-colors"
                >
                  Yes, Archive
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {emailModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setEmailModal({ isOpen: false, name: '', email: '' })}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md relative shadow-2xl z-10"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">{emailModal.name}</h3>
              <p className="text-sm text-gray-500 mb-6">Volunteer email</p>
              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                <span className="text-sm font-semibold text-gray-800 flex-1">{emailModal.email || 'No email on file'}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(emailModal.email)}
                  className="w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setEmailModal({ isOpen: false, name: '', email: '' })}
                  className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-black"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyModal.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setHistoryModal({ isOpen: false, name: '', logs: [] })}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl p-8 w-full max-w-2xl relative shadow-2xl z-10"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{historyModal.name}</h3>
                  <p className="text-sm text-gray-500">Volunteer log history</p>
                </div>
                <button
                  onClick={() => setHistoryModal({ isOpen: false, name: '', logs: [] })}
                  className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-black"
                >
                  Close
                </button>
              </div>

              {historyModal.logs.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">No volunteer logs found for this person.</div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto no-scrollbar flex flex-col gap-3">
                  {historyModal.logs.map((log, idx) => {
                    const date = getLogDate(log);
                    const hours = getLogHours(log);
                    const task = String(log.volunteering_task || log.task || log.site || 'Volunteer shift');
                    const status = String(
                      log.approve
                        || log.status
                        || log.state
                        || log.approval_status
                        || log.approvalStatus
                        || 'pending',
                    ).toLowerCase();
                    return (
                      <div
                        key={`${log.id || 'log'}-${idx}`}
                        className="border border-gray-100 rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{task}</div>
                          <div className="text-xs text-gray-500 mt-1">{formatLogDate(date)}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-gray-900">{hours.toFixed(1)} hrs</span>
                          <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${status === 'approved' || status === 'accepted' ? 'bg-lime-100 text-lime-700' : 'bg-gray-100 text-gray-500'}`}>
                            {status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const getLogUserId = (log: Record<string, unknown>) => {
  return (log.user_id || log.userId || log.volunteer_id || log.volunteerId || log.uid || '') as string;
};

const isAdminRole = (role: string) => {
  const normalized = role.toLowerCase();
  return ['org-admin', 'admin', 'owner', 'organization'].includes(normalized);
};

const buildVolunteerKey = (email: string, name: string, fallback: string) => {
  if (email) return `email:${email.toLowerCase()}`;
  if (name) return `name:${name.toLowerCase()}`;
  return `id:${fallback}`;
};

const getLogHours = (log: Record<string, unknown>) => {
  const raw = log.hours_contributed ?? log.hours ?? 0;
  const value = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return Number.isNaN(value) ? 0 : value;
};

const isApproved = (log: Record<string, unknown>) => {
  const status = String(
    log.approve
      || log.status
      || log.state
      || log.approval_status
      || log.approvalStatus
      || 'pending',
  ).toLowerCase();
  return status === 'approved' || status === 'accepted';
};

const parseLogDate = (value: unknown) => {
  if (!value) return null;
  const raw = value as { toDate?: () => Date };
  if (typeof raw.toDate === 'function') {
    return raw.toDate();
  }
  if (typeof value === 'object' && value !== null && (value as { seconds?: number }).seconds) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getLatestLog = (userLogs: Array<Record<string, unknown>>) => {
  return userLogs.reduce<{ date: Date | null; task: string }>(
    (acc, log) => {
      const date = parseLogDate(log.date);
      if (!date) return acc;
      if (!acc.date || date > acc.date) {
        return {
          date,
          task: String(log.volunteering_task || log.task || log.site || 'Volunteer shift'),
        };
      }
      return acc;
    },
    { date: null, task: '—' }
  );
};

const formatRelativeTime = (date: Date) => {
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) {
    return `${Math.max(1, diffHours)} hrs ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};
