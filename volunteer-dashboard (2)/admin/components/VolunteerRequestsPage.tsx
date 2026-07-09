import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Calendar, Clock } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot as onFirestoreSnapshot, query as firestoreQuery, where as firestoreWhere } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFunctions, getFirestoreDb } from '../lib/firebase';
import { getActiveSubAdminSession, subscribeToOrgAdminContext } from '../lib/orgContext';
import { subscribePendingHourLogs, verifyHourLog, rejectHourLog } from '../lib/hourLogsService';

interface Request {
  id: string;
  type: 'hours' | 'join';
  userId?: string;
  name: string;
  role: string;
  task: string;
  hours: number;
  date: string;
  description?: string;
  createdAtMs?: number;
}

export const VolunteerRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [userMap, setUserMap] = useState<Record<string, { name: string; role: string }>>({});
  const [userId, setUserId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [denyPromptId, setDenyPromptId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [subAdminScopeKey, setSubAdminScopeKey] = useState<string>(() => getActiveSubAdminSession()?.groupId || '');

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
        setUserId('');
        setOrgId('');
        setOrgName('');
        setRequests([]);
        setLoading(false);
        return;
      }
      setUserId(user.uid);
      unsubContext = subscribeToOrgAdminContext(db, user.uid, (context) => {
        setOrgId(context.orgId || '');
        setOrgName(context.orgName || '');
        if (!context.orgId) setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubContext) unsubContext();
    };
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

  // Volunteer directory (name/role enrichment for hour-log requests), same doc shape VolunteersPage.tsx reads.
  useEffect(() => {
    if (!orgId) return;
    const db = getFirestoreDb();
    const volunteersRef = collection(db, 'organizations', orgId, 'volunteers');
    const unsubscribe = onFirestoreSnapshot(volunteersRef, (snap) => {
      const map: Record<string, { name: string; role: string }> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const name = String(data.displayName || data.email || 'Volunteer').trim();
        map[docSnap.id] = { name, role: String(data.role || 'Volunteer') };
      });
      setUserMap(map);
    });
    return () => unsubscribe();
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    const db = getFirestoreDb();
    const unsubscribe = subscribePendingHourLogs(db, orgId, (logs) => {
      const pending: Request[] = logs.map((log) => {
        const userProfile = userMap[log.userId] || { name: '', role: '' };
        return {
          id: log.id,
          type: 'hours',
          userId: log.userId,
          name: userProfile.name || 'Volunteer',
          role: userProfile.role || 'Volunteer',
          task: log.description || 'Volunteer shift',
          hours: log.hours,
          date: formatDateLabel(log.createdAtMs || log.date),
          description: '',
          createdAtMs: log.createdAtMs,
        };
      });
      setRequests((prev) => mergeRequests(prev, pending, 'hours'));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [orgId, userMap]);

  useEffect(() => {
    if (!orgId) return;
    const db = getFirestoreDb();
    const volunteersRef = collection(db, 'organizations', orgId, 'volunteers');
    const pendingQuery = firestoreQuery(volunteersRef, firestoreWhere('status', '==', 'pending'));
    const unsubJoinRequests = onFirestoreSnapshot(pendingQuery, (snap) => {
      const pending: Request[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const joinedAt = data.joinedAt;
        const createdAtMs = resolveTimestampMillis(joinedAt);
        const name = String(data.displayName || data.email || 'Volunteer').trim();
        pending.push({
          id: docSnap.id,
          type: 'join',
          userId: String(data.userId || ''),
          name,
          role: 'Volunteer',
          task: 'Wants to join as a Volunteer',
          hours: 0,
          date: joinedAt ? formatDateLabel(joinedAt) : '—',
          description: '',
          createdAtMs,
        });
      });
      setRequests((prev) => mergeRequests(prev, pending, 'join'));
      setLoading(false);
    });

    return () => unsubJoinRequests();
  }, [orgId, subAdminScopeKey]);

  const handleAccept = async (id: string) => {
    setActionError(null);
    try {
      const functionsInstance = getFirebaseFunctions();
      await verifyHourLog(functionsInstance, orgId, id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to approve this request.');
    }
  };

  const handleDenyClick = (id: string) => {
    setActionError(null);
    setDenyReason('');
    setDenyPromptId(id);
  };

  const handleDenyCancel = () => {
    setDenyPromptId(null);
    setDenyReason('');
  };

  const handleDenyConfirm = async (id: string) => {
    setActionError(null);
    try {
      const functionsInstance = getFirebaseFunctions();
      await rejectHourLog(functionsInstance, orgId, id, denyReason.trim() || 'Denied by admin');
      setDenyPromptId(null);
      setDenyReason('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to deny this request.');
    }
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
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full flex flex-col gap-8 mt-8 pb-10"
    >
      {actionError && (
        <div className="bg-yellow-50 border border-yellow-100 text-yellow-800 px-4 py-3 rounded-2xl text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* List */}
      <div className="flex flex-col gap-4">
        <AnimatePresence mode="popLayout">
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Clock className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Loading requests...</h3>
                <p className="text-gray-500 mt-2">Syncing pending volunteer hours.</p>
              </motion.div>
            ) : requests.length > 0 ? (
                requests.map((req) => (
                    <motion.div
                        key={req.id}
                        layout
                        variants={item}
                        exit={{ scale: 0.95, opacity: 0, transition: { duration: 0.2 } }}
                        className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-start md:items-center group hover:shadow-md transition-all"
                    >
                        {/* User Info (Avatar Removed) */}
                        <div className="flex items-center gap-4 min-w-[200px]">
                             <div>
                                 <h3 className="font-bold text-lg text-gray-900 leading-tight">{req.name}</h3>
                                 <p className="text-sm text-gray-500 font-medium">{req.role}</p>
                             </div>
                        </div>

                        {/* Task Details */}
                        <div className="flex-1 border-l border-gray-100 pl-0 md:pl-6 border-dashed md:border-solid w-full md:w-auto">
                             <div className="flex items-center gap-2 mb-1">
                                <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold uppercase tracking-wide">Task</span>
                                <span className="font-bold text-gray-900">{req.task}</span>
                             </div>
                             {req.description && (
                                 <p className="text-sm text-gray-500 leading-snug max-w-lg mt-1">{req.description}</p>
                             )}
                             <div className="flex items-center gap-4 mt-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {req.date}</span>
                             </div>
                        </div>

                        {/* Hours / Join Badge */}
                        <div className="flex flex-col items-end px-4">
                          {req.type === 'hours' ? (
                            <div className="flex items-baseline gap-1">
                              <span className="text-4xl font-bold text-gray-900 tracking-tight">{req.hours}</span>
                              <span className="text-sm font-bold text-gray-400">hrs</span>
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
                              Join Request
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        {req.type === 'hours' ? (
                          denyPromptId === req.id ? (
                            <div className="flex flex-col gap-2 w-full md:w-64 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-gray-100">
                              <input
                                autoFocus
                                type="text"
                                value={denyReason}
                                onChange={(e) => setDenyReason(e.target.value)}
                                placeholder="Reason for denial (optional)"
                                className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-900"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleDenyConfirm(req.id)}
                                  className="flex-1 h-10 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold text-sm transition-all"
                                >
                                  Confirm Deny
                                </button>
                                <button
                                  onClick={handleDenyCancel}
                                  className="h-10 px-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-lg font-bold text-sm transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-gray-100">
                                 <button
                                    onClick={() => handleAccept(req.id)}
                                    className="flex-1 md:flex-none h-12 px-6 bg-lime-300 hover:bg-lime-400 text-gray-900 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-lime-300/20 hover:-translate-y-0.5"
                                 >
                                    <Check className="w-5 h-5" />
                                    <span className="md:hidden lg:inline">Approve</span>
                                 </button>
                                 <button
                                    onClick={() => handleDenyClick(req.id)}
                                    className="flex-1 md:flex-none h-12 px-4 bg-white border border-gray-200 hover:bg-red-50 hover:border-red-100 hover:text-red-600 text-gray-500 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                 >
                                    <X className="w-5 h-5" />
                                    <span className="md:hidden lg:inline">Deny</span>
                                 </button>
                            </div>
                          )
                        ) : (
                          <div className="w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-gray-100">
                            <p className="text-xs font-semibold text-gray-500">Review in Notifications to accept or decline.</p>
                          </div>
                        )}

                    </motion.div>
                ))
            ) : (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-20 text-center"
                >
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <Check className="w-10 h-10 text-gray-300" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">All caught up!</h3>
                    <p className="text-gray-500 mt-2">No pending hour requests to review.</p>
                </motion.div>
            )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const resolveTimestampMillis = (value: unknown) => {
  if (!value) return 0;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === 'object' && value !== null && (value as { seconds?: number }).seconds) {
    return (value as { seconds: number }).seconds * 1000;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const mergeRequests = (prev: Request[], next: Request[], type: Request['type']) => {
  const map = new Map<string, Request>();
  prev.forEach((req) => {
    if (req.type !== type) map.set(`${req.type}:${req.id}`, req);
  });
  next.forEach((req) => {
    map.set(`${req.type}:${req.id}`, req);
  });
  return Array.from(map.values()).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
};

const formatDateLabel = (value: unknown) => {
  if (!value) return '—';
  let date: Date | null = null;
  if (typeof value === 'number') {
    date = new Date(value);
  } else if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    date = (value as { toDate: () => Date }).toDate();
  } else if (typeof value === 'object' && value !== null && (value as { seconds?: number }).seconds) {
    date = new Date((value as { seconds: number }).seconds * 1000);
  } else {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  if (!date) return '—';

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
