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
} from 'lucide-react';
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AiInsightWidget } from './AiInsightWidget';
import { useGeminiInsight } from '../hooks/useGeminiInsight';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { subscribeToOrgAdminContext } from '../lib/orgContext';

type VolunteerRow = {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'archived';
  hours: number;
  email: string;
  joinedAt: Date | null;
};

interface VolunteersPageProps {
  isActive?: boolean;
  aiEnabled?: boolean;
  onOpenCopilot?: () => void;
  planTier?: string;
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const raw = value as { toDate?: () => Date; seconds?: number };
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (typeof raw.seconds === 'number') return new Date(raw.seconds * 1000);
  return null;
};

const formatRelativeTime = (date: Date | null) => {
  if (!date) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `${Math.max(1, diffHours)} hrs ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

export const VolunteersPage: React.FC<VolunteersPageProps> = ({
  isActive = false,
  aiEnabled = false,
  onOpenCopilot,
  planTier = 'nebula',
}) => {
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
  const [archivePassword, setArchivePassword] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const [orgId, setOrgId] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 7;
  const [insightUpdatedAt, setInsightUpdatedAt] = useState(() => Date.now());

  const filters = ['All Members', 'Highest Hours', 'Lowest Hours', 'Archived'];

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
        setAdminEmail('');
        setVolunteers([]);
        setLoading(false);
        return;
      }
      setAdminEmail(user.email || '');
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
      setVolunteers([]);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    const volunteersRef = collection(db, 'organizations', orgId, 'volunteers');
    const q = query(volunteersRef, where('status', 'in', ['active', 'rejected']));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows: VolunteerRow[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const perOrgStats = (data.perOrgStats as Record<string, unknown>) || {};
          return {
            id: docSnap.id,
            name: String(data.displayName || data.email || 'Volunteer'),
            role: String(data.role || 'Volunteer'),
            status: data.archived ? 'archived' : 'active',
            hours: Number(perOrgStats.hours ?? 0),
            email: String(data.email || ''),
            joinedAt: toDate(data.joinedAt),
          };
        });
        setVolunteers(rows.filter((row) => row.status === 'active' || row.status === 'archived'));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load volunteers', error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [orgId]);

  const activeVolunteers = useMemo(
    () => volunteers.filter((volunteer) => volunteer.status !== 'archived'),
    [volunteers],
  );

  const volunteerInsights = useMemo(() => {
    const now = Date.now();
    const withSignals = activeVolunteers.map((volunteer) => {
      const daysSince = volunteer.joinedAt
        ? Math.floor((now - volunteer.joinedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      let score = 0;
      if (volunteer.hours >= 40) score += 3;
      else if (volunteer.hours >= 25) score += 2;
      else if (volunteer.hours >= 15) score += 1;

      const risk = score >= 4 ? 'high' : score >= 2 ? 'moderate' : 'healthy';
      return { ...volunteer, daysSince, risk, score };
    });

    const high = withSignals.filter((v) => v.risk === 'high');
    const moderate = withSignals.filter((v) => v.risk === 'moderate');
    const healthy = withSignals.filter((v) => v.risk === 'healthy');
    const burnoutHighlights = [...high, ...moderate].sort((a, b) => b.score - a.score).slice(0, 3);
    const reliability = withSignals
      .filter((v) => v.hours >= 20)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 3);

    return { high, moderate, healthy, burnoutHighlights, reliability };
  }, [activeVolunteers]);

  useEffect(() => {
    setInsightUpdatedAt(Date.now());
  }, [activeVolunteers, volunteerInsights.high.length, volunteerInsights.moderate.length]);

  const insightUpdatedLabel = useMemo(() => {
    const time = new Date(insightUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Live refresh · ${time}`;
  }, [insightUpdatedAt]);

  const burnoutItems = volunteerInsights.burnoutHighlights.length
    ? volunteerInsights.burnoutHighlights.map((volunteer) => ({
        label: volunteer.name,
        value: volunteer.risk === 'high' ? 'High' : 'Mod',
        tone: volunteer.risk === 'high' ? 'alert' : 'warning',
        helper: `${volunteer.hours.toFixed(0)}h`,
      }))
    : [{ label: 'All clear', value: 'OK', tone: 'ok' as const }];

  const reliabilityItems = volunteerInsights.reliability.length
    ? volunteerInsights.reliability.map((volunteer) => ({
        label: volunteer.name,
        value: `${volunteer.hours.toFixed(0)}h`,
        tone: 'ok' as const,
      }))
    : [{ label: 'No leaders yet', value: '—', tone: 'info' as const }];

  const fallbackInsight = useMemo(
    () => ({
      summary: `${activeVolunteers.length} active · ${volunteerInsights.high.length} high risk · ${volunteerInsights.moderate.length} moderate`,
      sections: [
        { title: 'Burnout Risk', items: burnoutItems },
        { title: 'Reliability', items: reliabilityItems },
      ],
    }),
    [activeVolunteers.length, burnoutItems, reliabilityItems, volunteerInsights.high.length, volunteerInsights.moderate.length],
  );

  const insightSource = useMemo(
    () => ({
      activeVolunteers: activeVolunteers.length,
      highRiskCount: volunteerInsights.high.length,
      moderateRiskCount: volunteerInsights.moderate.length,
      burnoutHighlights: volunteerInsights.burnoutHighlights.map((volunteer) => ({
        name: volunteer.name,
        hours: volunteer.hours,
      })),
      reliability: volunteerInsights.reliability.map((volunteer) => ({
        name: volunteer.name,
        hours: volunteer.hours,
      })),
    }),
    [activeVolunteers.length, volunteerInsights],
  );

  const { insight: aiInsight } = useGeminiInsight({
    enabled: aiEnabled && isActive,
    planTier,
    pageKey: 'volunteers',
    sourceData: insightSource,
    fallback: fallbackInsight,
  });

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
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleArchiveClick = (id: string, name: string) => {
    setArchiveModal({ isOpen: true, id, name });
    setArchivePassword('');
    setArchiveError('');
  };

  const confirmArchive = async () => {
    if (!archiveModal.id || !orgId) return;
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
      await updateDoc(doc(db, 'organizations', orgId, 'volunteers', archiveModal.id), {
        archived: true,
      });
      setArchiveModal({ isOpen: false, id: null, name: '' });
    } catch (error) {
      console.error('Archive failed', error);
      setArchiveError('Password incorrect. Try again.');
    }
  };

  const handleUnarchive = async (id: string) => {
    if (!orgId) return;
    const db = getFirestoreDb();
    await updateDoc(doc(db, 'organizations', orgId, 'volunteers', id), {
      archived: false,
    });
  };

  const handleMessageAll = () => {
    const activeEmails = Array.from(
      new Set(
        volunteers
          .filter((v) => v.status !== 'archived' && v.email && v.email.includes('@'))
          .map((v) => v.email),
      ),
    );
    if (activeEmails.length === 0) return;
    setEmailModal({
      isOpen: true,
      name: `All Volunteers (${activeEmails.length})`,
      email: activeEmails.join(', '),
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
                    <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowFilterMenu(false)} />
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
                            activeFilter === f ? 'bg-gray-50 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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
          <div className="col-span-5 pl-4">Volunteer Profile</div>
          <div className="col-span-2">Total Hours</div>
          <div className="col-span-3">Joined</div>
          <div className="col-span-2 text-right pr-4">Actions</div>
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
                  <div className="col-span-5 flex items-center gap-4 pl-4">
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

                  <div className="col-span-3">
                    <span className="text-sm font-medium text-gray-500 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      {v.joinedAt ? formatRelativeTime(v.joinedAt) : '—'}
                    </span>
                  </div>

                  <div className="col-span-2 flex justify-end gap-2 pr-2">
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

      {isActive && aiEnabled && (
        <AiInsightWidget
          title="Volunteer Pulse"
          subtitle="Live burnout + retention"
          summary={aiInsight.summary}
          pillLabel={`Burnout ${volunteerInsights.high.length}H`}
          updatedLabel={insightUpdatedLabel}
          sections={aiInsight.sections}
          onOpenCopilot={onOpenCopilot}
          copilotPrompt="Explain these volunteer risk signals, identify the top 3 at-risk volunteers, and recommend immediate actions."
        />
      )}
    </div>
  );
};
