import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { httpsCallable } from 'firebase/functions';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { getFirebaseAuth, getFirebaseFunctions } from '../lib/firebase';
import { Plus, X } from 'lucide-react';

type SubAdminAccount = {
  id: string;
  email: string;
  displayName?: string;
  groupId: string;
  groupName?: string;
  status?: string;
  lastSessionStartedAt?: any;
};

type ActiveSession = {
  subAdminId: string;
  email: string;
  displayName?: string;
  groupId: string;
  groupName?: string;
  startedAt?: any;
} | null;

interface AccountPageProps {
  onOpenCreateSubAdmin: () => void;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 80 } },
};

const toDateString = (raw: any) => {
  if (!raw) return '—';
  if (typeof raw?.toMillis === 'function') return new Date(raw.toMillis()).toLocaleString();
  if (typeof raw?.seconds === 'number') return new Date(raw.seconds * 1000).toLocaleString();
  const num = Number(raw);
  if (Number.isFinite(num)) return new Date(num > 1_000_000_000_000 ? num : num * 1000).toLocaleString();
  const parsed = new Date(String(raw));
  if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
  return '—';
};

export const AccountPage: React.FC<AccountPageProps> = ({ onOpenCreateSubAdmin }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SubAdminAccount[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession>(null);
  const [actioningId, setActioningId] = useState('');
  const [pendingArchiveAccount, setPendingArchiveAccount] = useState<SubAdminAccount | null>(null);
  const [archivePassword, setArchivePassword] = useState('');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSubmitting, setArchiveSubmitting] = useState(false);
  const backfillRequestedRef = useRef(false);

  const functions = useMemo(() => getFirebaseFunctions(), []);

  const fetchDirectory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const call = httpsCallable(functions, 'listSubAdminDirectory');
      const result = await call();
      const data = (result.data || {}) as any;
      const nextAccounts = Array.isArray(data.accounts) ? data.accounts : [];
      setAccounts(nextAccounts);
      setActiveSession(data.activeSession || null);

      // Best-effort: backfill the password index so older sub-admins can log in directly.
      if (!backfillRequestedRef.current) {
        backfillRequestedRef.current = true;
        const backfill = httpsCallable(functions, 'backfillSubAdminPasswordIndex');
        backfill().catch(() => {});
      }
    } catch (fetchError: any) {
      setError(fetchError?.message || 'Unable to load account directory.');
    } finally {
      setLoading(false);
    }
  }, [functions]);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  const onStartSession = async (subAdminId: string) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const call = httpsCallable(functions, 'startSubAdminSession');
      const result = await call({ subAdminId });
      const data = (result.data || {}) as any;
      const session = data.session || null;
      setActiveSession(session);
      if (session) {
        window.sessionStorage.setItem('nexolink_active_sub_admin_session', JSON.stringify(session));
      }
      setNotice('Opening sub-admin portal...');
      window.dispatchEvent(new CustomEvent('nexolink:subadmin-session', { detail: session }));
      window.location.assign('/admin');
      return { ok: true, message: '' };
    } catch (sessionError: any) {
      const message = sessionError?.message || 'Unable to start sub-admin session.';
      setError(message);
      return { ok: false, message };
    } finally {
      setSaving(false);
    }
  };

  const closeArchivePrompt = () => {
    if (archiveSubmitting) return;
    setPendingArchiveAccount(null);
    setArchivePassword('');
    setArchiveError(null);
  };

  const handleToggleArchive = async (subAdminId: string, nextStatus: 'active' | 'archived') => {
    setActioningId(subAdminId);
    setError(null);
    setNotice(null);
    try {
      const call = httpsCallable(functions, 'setSubAdminAccountStatus');
      await call({ subAdminId, status: nextStatus });
      setNotice(nextStatus === 'archived' ? 'Subadmin archived.' : 'Subadmin unarchived.');
      await fetchDirectory();
      return true;
    } catch (err: any) {
      setError(err?.message || 'Unable to update subadmin status.');
      return false;
    } finally {
      setActioningId('');
    }
  };

  const handleConfirmArchive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingArchiveAccount) return;
    if (!archivePassword) {
      setArchiveError('Login password is required.');
      return;
    }
    setArchiveSubmitting(true);
    setArchiveError(null);
    setError(null);
    setNotice(null);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      const loginEmail = currentUser?.email || '';
      if (!currentUser || !loginEmail) {
        throw new Error('Unable to verify your current login session.');
      }
      const credential = EmailAuthProvider.credential(loginEmail, archivePassword);
      await reauthenticateWithCredential(currentUser, credential);
      await currentUser.getIdToken(true);

      const ok = await handleToggleArchive(pendingArchiveAccount.id, 'archived');
      if (ok) closeArchivePrompt();
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setArchiveError('Incorrect login password.');
      } else if (code === 'auth/too-many-requests') {
        setArchiveError('Too many attempts. Please wait a moment and try again.');
      } else {
        setArchiveError(err?.message || 'Unable to verify login password.');
      }
    } finally {
      setArchiveSubmitting(false);
    }
  };

  const onClearSession = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const call = httpsCallable(functions, 'clearSubAdminSession');
      await call();
      setActiveSession(null);
      window.sessionStorage.removeItem('nexolink_active_sub_admin_session');
      setNotice('Returned to super admin portal.');
      window.dispatchEvent(new CustomEvent('nexolink:subadmin-session', { detail: null }));
    } catch (sessionError: any) {
      setError(sessionError?.message || 'Unable to end sub-admin session.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full flex flex-col gap-6 mt-8 pb-10"
    >
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm font-medium">
          {error}
        </div>
      )}
      {notice && (
        <div className="bg-lime-50 border border-lime-100 text-lime-800 px-4 py-3 rounded-2xl text-sm font-medium">
          {notice}
        </div>
      )}

      <motion.div variants={item} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Account Directory</h2>
            <p className="text-sm text-gray-500 mt-1">
              Super admin controls for grouped sub-admin portals.
            </p>
          </div>
          <button
            onClick={onOpenCreateSubAdmin}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold uppercase tracking-[0.14em] hover:bg-black transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Subadmin
          </button>
        </div>
      </motion.div>

      <motion.div variants={item} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Sub-Admin Portals</h3>
            <p className="text-sm text-gray-500 mt-1">Open a sub-admin portal using that sub-admin's credentials.</p>
          </div>
          {activeSession ? (
            <button
              onClick={onClearSession}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Exit Sub-Admin Session
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="p-8 text-sm text-gray-500">Loading directory…</div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-sm text-gray-500">No sub-admin accounts yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {accounts.map((account) => {
              const isActive = activeSession?.subAdminId === account.id;
              const status = String(account.status || 'active').toLowerCase();
              const isArchived = status === 'archived';
              return (
                <div key={account.id} className="p-6 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {account.displayName || account.email}
                    </div>
                    <div className="text-sm text-gray-500">
                      {account.email} · {account.groupName || 'Unassigned Group'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (isArchived) return;
                        onStartSession(account.id);
                      }}
                      disabled={saving || isActive || isArchived}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-gray-900 text-white cursor-default'
                          : isArchived
                            ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      } disabled:opacity-60`}
                    >
                      {isActive ? 'Currently Active' : 'Open Portal'}
                    </button>

                    <button
                      type="button"
                      disabled={actioningId === account.id}
                      onClick={() => {
                        if (isArchived) {
                          handleToggleArchive(account.id, 'active');
                          return;
                        }
                        setPendingArchiveAccount(account);
                        setArchivePassword('');
                        setArchiveError(null);
                      }}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                        isArchived
                          ? 'bg-lime-50 text-lime-800 hover:bg-lime-100'
                          : 'bg-red-50 text-red-700 hover:bg-red-100'
                      }`}
                    >
                      {actioningId === account.id ? 'Saving…' : isArchived ? 'Unarchive' : 'Archive'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {pendingArchiveAccount && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeArchivePrompt} />
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="relative z-10 w-full max-w-md bg-white border border-gray-100 rounded-[2rem] shadow-2xl p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Confirm Archive</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your login password to archive{' '}
                  <span className="font-semibold text-gray-700">
                    {pendingArchiveAccount.displayName || pendingArchiveAccount.email}
                  </span>.
                </p>
              </div>
              <button
                type="button"
                onClick={closeArchivePrompt}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleConfirmArchive}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 ml-1">Login Password</label>
                <input
                  type="password"
                  value={archivePassword}
                  onChange={(e) => setArchivePassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-12 rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-lime-300"
                  placeholder="Enter your password"
                />
              </div>
              {archiveError && (
                <p className="text-xs font-semibold text-red-600">{archiveError}</p>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeArchivePrompt}
                  disabled={archiveSubmitting}
                  className="flex-1 h-12 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={archiveSubmitting}
                  className="flex-1 h-12 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-black transition-colors disabled:opacity-60"
                >
                  {archiveSubmitting ? 'Archiving…' : 'Confirm Archive'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};
