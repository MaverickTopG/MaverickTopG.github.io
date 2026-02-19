import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Calendar, Clock } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { getActiveSubAdminSession, resolveOrgContext, subscribeToOrgCollection } from '../lib/orgContext';

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
  const [orgCode, setOrgCode] = useState('');
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [userMap, setUserMap] = useState<Record<string, { name: string; role: string }>>({});
  const [userId, setUserId] = useState('');
  const [autoProcessingEnabled, setAutoProcessingEnabled] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [subAdminScopeKey, setSubAdminScopeKey] = useState<string>(() => getActiveSubAdminSession()?.groupId || '');
  const autoProcessingIdsRef = useRef<Set<string>>(new Set());
  const maxAutoApproveHours = 12;
  const historyWindowMs = 35 * 24 * 60 * 60 * 1000;

  const resolveLogUserId = (log: Record<string, unknown>) => {
    return String(log.user_id || log.volunteer_id || log.userId || log.volunteerId || '').trim();
  };

  const resolveLogHours = (log: Record<string, unknown>) => {
    return Number((log as { hours_contributed?: unknown; hours?: unknown }).hours_contributed ?? (log as { hours?: unknown }).hours ?? 0);
  };

  const resolveLogDateValue = (log: Record<string, unknown>) => {
    return (
      (log as { date?: unknown }).date
      || (log as { created_at?: unknown }).created_at
      || (log as { createdAt?: unknown }).createdAt
    );
  };

  const isQuestionableLog = (log: Record<string, unknown>, historyByUser?: Map<string, number[]>) => {
    const hours = resolveLogHours(log);
    if (!Number.isFinite(hours) || hours <= 0) return true;
    if (hours > maxAutoApproveHours) return true;

    const flagKeys = [
      'flagged',
      'questionable',
      'needs_review',
      'requires_review',
      'review_required',
      'manual_review',
      'review_status',
      'approval_status',
      'approvalStatus',
    ];
    const flagged = flagKeys.some((key) => {
      const value = (log as Record<string, unknown>)[key];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.toLowerCase();
        return normalized.includes('flag') || normalized.includes('review') || normalized.includes('question');
      }
      return false;
    });
    if (flagged) return true;

    const dateMs = resolveTimestampMillis(resolveLogDateValue(log));
    if (dateMs > Date.now() + 24 * 60 * 60 * 1000) return true;

    const userId = resolveLogUserId(log);
    if (userId && historyByUser && historyByUser.has(userId)) {
      const history = historyByUser.get(userId) || [];
      if (history.length >= 3) {
        const avg = history.reduce((sum, value) => sum + value, 0) / history.length;
        if (avg > 0 && avg <= 2.5 && hours >= avg * 3) {
          return true;
        }
      }
    }

    return false;
  };

  const shouldAutoApproveLog = (log: Record<string, unknown>, historyByUser?: Map<string, number[]>) =>
    !isQuestionableLog(log, historyByUser);

  const autoApproveLog = async (logId: string) => {
    const db = getFirestoreDb();
    const logRef = doc(db, 'volunteer_logs', logId);
    await updateDoc(logRef, {
      approve: 'approved',
      status: 'approved',
      approved_at: serverTimestamp(),
      auto_approved: true,
    });
  };

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOrgCode('');
        setUserId('');
        setRequests([]);
        setLoading(false);
        return;
      }
      setUserId(user.uid);
      const context = await resolveOrgContext(db, user.uid, user.email || null);
      setOrgCode(context.orgCode || '');
      setOrgId(context.orgId || '');
      setOrgName(context.orgName || '');
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
    if (!orgId && !userId) return;
    const db = getFirestoreDb();
    let unsubscribe: (() => void) | null = null;
    let active = true;

    const attachListener = (ref: ReturnType<typeof doc>) => {
      unsubscribe = onSnapshot(ref, (snap) => {
        if (!active) return;
        const data = snap.data() || {};
        setAutoProcessingEnabled(!!(data as { auto_process_logs?: boolean }).auto_process_logs);
      });
    };

    const resolveAutoProcessing = async () => {
      try {
        const collections = ['volunteer_organizations', 'organizations', 'orgs'];
        if (orgId) {
          for (const coll of collections) {
            const ref = doc(db, coll, orgId);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              if (!active) return;
              const data = snap.data() || {};
              setAutoProcessingEnabled(!!(data as { auto_process_logs?: boolean }).auto_process_logs);
              attachListener(ref);
              return;
            }
          }
        }
        if (userId) {
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            if (!active) return;
            const data = userSnap.data() || {};
            setAutoProcessingEnabled(!!(data as { auto_process_logs?: boolean }).auto_process_logs);
            attachListener(userRef);
          }
        }
      } catch (err) {
        console.error('Failed to resolve auto-processing settings', err);
      }
    };

    resolveAutoProcessing();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [orgId, userId]);

  useEffect(() => {
    if (!orgCode && !orgId) return;
    const db = getFirestoreDb();

    const unsubUsers = subscribeToOrgCollection({
      db,
      collectionName: 'users',
      orgCode,
      orgId,
      onData: (rows) => {
        const map: Record<string, { name: string; role: string }> = {};
        rows.forEach((row) => {
          const data = row.data || {};
          const first = (data.firstName || data.name || '').toString().trim();
          const last = (data.lastName || data.last_name || '').toString().trim();
          const email = (data.email || '').toString().trim();
          const name = [first, last].filter(Boolean).join(' ').trim() || email || 'Volunteer';
          map[row.id] = { name, role: (data.role || 'Volunteer').toString() };
        });
        setUserMap(map);
      },
    });

    const unsubLogs = subscribeToOrgCollection({
      db,
      collectionName: 'volunteer_logs',
      orgCode,
      orgId,
      onData: (rows) => {
        const historyByUser = new Map<string, number[]>();
        const now = Date.now();
        rows.forEach((row) => {
          const log = row.data || {};
          const status = resolveLogStatus(log);
          if (status !== 'approved') return;
          const userId = resolveLogUserId(log);
          if (!userId) return;
          const hours = resolveLogHours(log);
          if (!Number.isFinite(hours) || hours <= 0) return;
          const dateMs = resolveTimestampMillis(resolveLogDateValue(log));
          if (!dateMs || now - dateMs > historyWindowMs) return;
          const list = historyByUser.get(userId) || [];
          list.push(hours);
          historyByUser.set(userId, list);
        });

        const pending: Request[] = [];
        rows.forEach((row) => {
          const log = row.data || {};
          const status = resolveLogStatus(log);
          if (status !== 'pending') return;
          if (autoProcessingEnabled && shouldAutoApproveLog(log, historyByUser)) {
            const logId = row.id;
            if (!autoProcessingIdsRef.current.has(logId)) {
              autoProcessingIdsRef.current.add(logId);
              autoApproveLog(logId)
                .catch((err) => {
                  console.error('Auto-approve failed', err);
                })
                .finally(() => {
                  autoProcessingIdsRef.current.delete(logId);
                });
            }
            return;
          }
          const hours = Number(log.hours_contributed ?? log.hours ?? 0);
          const dateLabel = formatDateLabel(log.date);
          const nameFallback = (log.volunteer_name || log.name || '').toString().trim();
          const userId = (log.user_id || log.volunteer_id || '') as string;
          const userProfile = userMap[userId] || { name: '', role: '' };
          const displayName = userProfile.name || nameFallback || 'Volunteer';
          const role =
            log.role
            || log.volunteer_role
            || log.requested_role
            || userProfile.role
            || 'Volunteer';

          pending.push({
            id: row.id,
            type: 'hours',
            userId,
            name: displayName,
            role: role.toString(),
            task: (log.volunteering_task || log.task || log.site || 'Volunteer shift').toString(),
            hours: Number.isNaN(hours) ? 0 : hours,
            date: formatDateLabel(log.created_at || log.createdAt || log.date),
            description: (log.description || log.notes || log.summary || '').toString(),
            createdAtMs: resolveTimestampMillis(log.created_at || log.createdAt || log.date),
          });
        });
        setRequests((prev) => mergeRequests(prev, pending, 'hours'));
        setLoading(false);
      },
    });

    const unsubJoinRequests = subscribeToOrgCollection({
      db,
      collectionName: 'organization_join_requests',
      orgCode,
      orgId,
      onData: (rows) => {
        const pending: Request[] = [];
        rows.forEach((row) => {
          const data = row.data || {};
          const status = String(data.status || 'pending').toLowerCase();
          if (status !== 'pending') return;
          const createdAt = data.created_at || data.createdAt || data.requested_at || data.requestedAt || null;
          const createdAtMs = resolveTimestampMillis(createdAt);
          const name = String(data.user_name || data.userName || data.user_email || 'Volunteer').trim();
          pending.push({
            id: row.id,
            type: 'join',
            userId: (data.user_id || data.userId || '').toString(),
            name,
            role: 'Volunteer',
            task: 'Wants to join as a Volunteer',
            hours: 0,
            date: createdAt ? formatDateLabel(createdAt) : '—',
            description: String(data.message || data.note || '').trim(),
            createdAtMs,
          });
        });
        setRequests((prev) => mergeRequests(prev, pending, 'join'));
        setLoading(false);
      },
    });

    return () => {
      unsubUsers();
      unsubLogs();
      unsubJoinRequests();
    };
  }, [orgCode, orgId, userMap, autoProcessingEnabled, subAdminScopeKey]);

  const handleAction = async (id: string, action: 'accept' | 'deny', type: Request['type']) => {
    const db = getFirestoreDb();
    setActionError(null);
    if (type !== 'hours') return;
    const logRef = doc(db, 'volunteer_logs', id);
    await updateDoc(logRef, {
      approve: action === 'accept' ? 'approved' : 'denied',
      status: action === 'accept' ? 'approved' : 'denied',
      approved_at: serverTimestamp(),
    });
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
                          <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-gray-100">
                               <button 
                                  onClick={() => handleAction(req.id, 'accept', req.type)}
                                  className="flex-1 md:flex-none h-12 px-6 bg-lime-300 hover:bg-lime-400 text-gray-900 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-lime-300/20 hover:-translate-y-0.5"
                               >
                                  <Check className="w-5 h-5" />
                                  <span className="md:hidden lg:inline">Approve</span>
                               </button>
                               <button 
                                  onClick={() => handleAction(req.id, 'deny', req.type)}
                                  className="flex-1 md:flex-none h-12 px-4 bg-white border border-gray-200 hover:bg-red-50 hover:border-red-100 hover:text-red-600 text-gray-500 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                               >
                                  <X className="w-5 h-5" />
                                  <span className="md:hidden lg:inline">Deny</span>
                               </button>
                          </div>
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

const resolveLogStatus = (log: Record<string, unknown>) => {
  const value = String(
    log.approve
      || log.status
      || log.state
      || log.approval_status
      || log.approvalStatus
      || log.request_status
      || log.requestStatus
      || 'pending',
  ).toLowerCase();
  if (['approved', 'accepted'].includes(value)) return 'approved';
  if (['denied', 'declined', 'rejected'].includes(value)) return 'denied';
  return 'pending';
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
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
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
