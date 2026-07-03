import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { collection, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirestoreDb, getFirebaseFunctions } from '../lib/firebase';
import { subscribeToOrgAdminContext } from '../lib/orgContext';
import { Plus, X, Trash2 } from 'lucide-react';

type OrgAdminRow = {
  id: string;
  email: string;
  displayName?: string;
  role: string;
};

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

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coordinator: 'Coordinator',
  eventLead: 'Event Lead',
  viewer: 'Viewer',
};

export const AccountPage: React.FC<AccountPageProps> = ({ onOpenCreateSubAdmin }) => {
  const [orgId, setOrgId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [admins, setAdmins] = useState<OrgAdminRow[]>([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [actioningId, setActioningId] = useState('');
  const [pendingRemoveAdmin, setPendingRemoveAdmin] = useState<OrgAdminRow | null>(null);
  const [removePassword, setRemovePassword] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const functions = useMemo(() => getFirebaseFunctions(), []);

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
        setCurrentEmail('');
        setAdmins([]);
        setLoading(false);
        return;
      }
      setCurrentEmail(user.email || '');
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
      setAdmins([]);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    const unsubscribe = onSnapshot(
      collection(db, 'organizations', orgId, 'orgAdmins'),
      (snap) => {
        const rows: OrgAdminRow[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            email: String(data.email || ''),
            displayName: data.displayName ? String(data.displayName) : undefined,
            role: String(data.role || 'admin'),
          };
        });
        rows.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
        setAdmins(rows);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || 'Unable to load admin directory.');
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [orgId]);

  const closeRemovePrompt = () => {
    if (removeSubmitting) return;
    setPendingRemoveAdmin(null);
    setRemovePassword('');
    setRemoveError(null);
  };

  const handleConfirmRemove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingRemoveAdmin || !orgId) return;
    if (!removePassword) {
      setRemoveError('Login password is required.');
      return;
    }
    setRemoveSubmitting(true);
    setRemoveError(null);
    setError(null);
    setNotice(null);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser || !currentEmail) {
        throw new Error('Unable to verify your current login session.');
      }
      const credential = EmailAuthProvider.credential(currentEmail, removePassword);
      await reauthenticateWithCredential(currentUser, credential);

      setActioningId(pendingRemoveAdmin.id);
      const call = httpsCallable(functions, 'removeOrgAdmin');
      await call({ orgId, uid: pendingRemoveAdmin.id });
      setNotice('Admin removed.');
      closeRemovePrompt();
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setRemoveError('Incorrect login password.');
      } else if (code === 'auth/too-many-requests') {
        setRemoveError('Too many attempts. Please wait a moment and try again.');
      } else {
        setRemoveError(err?.message || 'Unable to remove admin.');
      }
    } finally {
      setActioningId('');
      setRemoveSubmitting(false);
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
              Admins with access to this organization's dashboard.
            </p>
          </div>
          <button
            onClick={onOpenCreateSubAdmin}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold uppercase tracking-[0.14em] hover:bg-black transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Admin
          </button>
        </div>
      </motion.div>

      <motion.div variants={item} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-lg">Organization Admins</h3>
          <p className="text-sm text-gray-500 mt-1">Each admin signs in with their own email and password.</p>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-gray-500">Loading directory…</div>
        ) : admins.length === 0 ? (
          <div className="p-8 text-sm text-gray-500">No admins yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {admins.map((admin) => (
              <div key={admin.id} className="p-6 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-semibold text-gray-900">
                    {admin.displayName || admin.email}
                  </div>
                  <div className="text-sm text-gray-500">
                    {admin.email} · {ROLE_LABELS[admin.role] || admin.role}
                  </div>
                </div>
                {admin.role !== 'owner' && (
                  <button
                    type="button"
                    disabled={actioningId === admin.id}
                    onClick={() => {
                      setPendingRemoveAdmin(admin);
                      setRemovePassword('');
                      setRemoveError(null);
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 bg-red-50 text-red-700 hover:bg-red-100 inline-flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {actioningId === admin.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {pendingRemoveAdmin && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeRemovePrompt} />
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="relative z-10 w-full max-w-md bg-white border border-gray-100 rounded-[2rem] shadow-2xl p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Confirm Removal</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your login password to remove{' '}
                  <span className="font-semibold text-gray-700">
                    {pendingRemoveAdmin.displayName || pendingRemoveAdmin.email}
                  </span>.
                </p>
              </div>
              <button
                type="button"
                onClick={closeRemovePrompt}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleConfirmRemove}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 ml-1">Login Password</label>
                <input
                  type="password"
                  value={removePassword}
                  onChange={(e) => setRemovePassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-12 rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-lime-300"
                  placeholder="Enter your password"
                />
              </div>
              {removeError && (
                <p className="text-xs font-semibold text-red-600">{removeError}</p>
              )}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeRemovePrompt}
                  disabled={removeSubmitting}
                  className="flex-1 h-12 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={removeSubmitting}
                  className="flex-1 h-12 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-black transition-colors disabled:opacity-60"
                >
                  {removeSubmitting ? 'Removing…' : 'Confirm Remove'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};
