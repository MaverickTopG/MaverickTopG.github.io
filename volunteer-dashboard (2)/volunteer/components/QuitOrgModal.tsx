import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, ShieldCheck, AlertCircle, ChevronDown, CheckCircle2 } from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  EmailAuthProvider, 
  reauthenticateWithCredential 
} from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';

interface QuitOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgContext: { id: string; code: string; name: string };
}

interface OrgMembership {
  id: string;
  orgId: string;
  orgName: string;
  orgCode: string;
  source: 'user_organizations' | 'users';
}

export const QuitOrgModal: React.FC<QuitOrgModalProps> = ({ isOpen, onClose, orgContext }) => {
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [selectedSource, setSelectedSource] = useState<OrgMembership['source']>('user_organizations');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchMemberships();
      setPassword('');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const normalizeCode = (value: unknown) => {
    if (value == null) return '';
    const text = String(value).trim().toUpperCase();
    return text || '';
  };
  const isDeclinedJoinStatus = (status = '') => {
    const normalized = String(status || '').toLowerCase();
    return ['rejected', 'declined', 'denied', 'canceled', 'cancelled', 'revoked', 'removed'].some((token) =>
      normalized.includes(token)
    );
  };
  const isArchivedMembership = (data: Record<string, unknown>) => {
    const status = String(data.status || '').toLowerCase();
    return Boolean(
      data.removed_by_user
      || data.archived_by_user
      || data.removed_at
      || data.archived_at
      || ['archived', 'inactive', 'revoked', 'deleted', 'removed'].some((token) => status.includes(token))
    );
  };
  const isPersonalRecord = (data: Record<string, unknown>, id: string, code: string, name: string) => {
    const rawId = String(id || '').toLowerCase();
    const rawCode = String(code || '').toLowerCase();
    const rawName = String(name || '').toLowerCase();
    return Boolean(
      data?.is_personal
      || rawId.startsWith('personal-')
      || rawCode.startsWith('personal-')
      || rawName === 'personal'
    );
  };

  const fetchMemberships = async () => {
    setFetching(true);
    try {
      const db = getFirestoreDb();
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) return;

      const [membershipSnap, userSnap] = await Promise.all([
        getDocs(query(collection(db, 'user_organizations'), where('user_id', '==', user.uid))),
        getDocs(query(collection(db, 'users'), where('user_id', '==', user.uid))),
      ]);
      const list: OrgMembership[] = [];
      const upsertMembership = (docSnap: any, source: OrgMembership['source']) => {
        const data = docSnap.data() || {};
        // Basic whitelist for active orgs
        const status = String(data.status || '').toLowerCase();
        const whitelist = ['active', 'accepted', 'approved', 'connected', 'granted', 'confirmed', ''];
        if (!whitelist.some(v => status.includes(v))) return;
        if (isDeclinedJoinStatus(status) || isArchivedMembership(data)) return;
        const orgId = String(data.orgId || data.org_id || data.organizationId || data.linked_org_id || docSnap.id || '');
        const orgCode = normalizeCode(data.access_code || data.orgCode || data.org_access_code || data.organizationCode);
        const orgName = String(data.orgName || data.organizationName || data.name || data.schoolName || data.school_name || orgCode || 'Organization');
        if (isPersonalRecord(data, orgId, orgCode, orgName)) return;
        list.push({
          id: docSnap.id,
          orgId,
          orgName,
          orgCode,
          source,
        });
      };

      membershipSnap.docs.forEach((docSnap) => upsertMembership(docSnap, 'user_organizations'));
      userSnap.docs.forEach((docSnap) => {
        if (docSnap.id === user.uid) return;
        upsertMembership(docSnap, 'users');
      });

      const deduped = list.filter((item, index, self) =>
        index === self.findIndex((t) => (t.orgCode && t.orgCode === item.orgCode) || (t.orgId && t.orgId === item.orgId))
      );
      setMemberships(deduped);
      // Pre-select current context if possible
      const current = deduped.find(m => m.orgId === orgContext.id || (orgContext.code && m.orgCode === orgContext.code));
      if (current) {
        setSelectedMembershipId(current.id);
        setSelectedSource(current.source);
      } else if (deduped.length > 0) {
        setSelectedMembershipId(deduped[0].id);
        setSelectedSource(deduped[0].source);
      }
      
    } catch (err) {
      console.error('Failed to fetch memberships', err);
    } finally {
      setFetching(false);
    }
  };

  const handleQuit = async () => {
    if (!selectedMembershipId) {
      setError('Please select an organization to quit.');
      return;
    }
    if (!password) {
      setError('Password is required to confirm deletion.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const db = getFirestoreDb();
      const user = auth.currentUser;
      const selectedMembership = memberships.find(
        (membership) =>
          membership.id === selectedMembershipId && membership.source === selectedSource,
      );

      if (!user || !user.email) throw new Error('Auth state invalid.');
      if (!selectedMembership) throw new Error('Selected membership is no longer available.');

      // 1. Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      // 2. Archive membership records instead of deleting them.
      const [membershipSnap, userSnap] = await Promise.all([
        getDocs(query(collection(db, 'user_organizations'), where('user_id', '==', user.uid))),
        getDocs(query(collection(db, 'users'), where('user_id', '==', user.uid))),
      ]);
      const docsToArchive: Array<{
        ref: ReturnType<typeof doc>;
      }> = [];

      const matchesSelectedMembership = (
        row: Record<string, unknown>,
        source: OrgMembership['source'],
        docId: string,
      ) => {
        const docOrgCode = normalizeCode(
          row.access_code || row.orgCode || row.org_access_code || row.organizationCode,
        );
        const docOrgId = String(
          row.orgId || row.org_id || row.organizationId || row.linked_org_id || docId || '',
        );
        const sameSourceDoc =
          source === selectedMembership.source && docId === selectedMembership.id;
        const sameCode =
          selectedMembership.orgCode &&
          docOrgCode &&
          selectedMembership.orgCode === docOrgCode;
        const sameOrgId =
          selectedMembership.orgId &&
          docOrgId &&
          selectedMembership.orgId === docOrgId;
        return sameSourceDoc || sameCode || sameOrgId;
      };

      const collectArchiveTargets = (
        source: OrgMembership['source'],
        snapshot: Awaited<ReturnType<typeof getDocs>>,
      ) => {
        snapshot.forEach((docSnap) => {
          const row = (docSnap.data() || {}) as Record<string, unknown>;
          const docCode = normalizeCode(
            row.access_code || row.orgCode || row.org_access_code || row.organizationCode,
          );
          const docOrgId = String(
            row.orgId || row.org_id || row.organizationId || row.linked_org_id || docSnap.id || '',
          );
          const docName = String(
            row.orgName ||
              row.organizationName ||
              row.name ||
              row.schoolName ||
              row.school_name ||
              docCode ||
              'Organization',
          );
          if (isPersonalRecord(row, docOrgId, docCode, docName)) return;
          if (isArchivedMembership(row)) return;
          if (!matchesSelectedMembership(row, source, docSnap.id)) return;
          docsToArchive.push({
            ref: doc(db, source, docSnap.id),
          });
        });
      };

      collectArchiveTargets('user_organizations', membershipSnap);
      collectArchiveTargets('users', userSnap);

      if (!docsToArchive.length) {
        throw new Error('No active membership documents found to archive.');
      }

      await Promise.all(
        docsToArchive.map(({ ref }) =>
          updateDoc(ref, {
            status: 'archived',
            removed_by_user: true,
            removed_at: serverTimestamp(),
            archived_by_user: true,
            archived_at: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ),
      );

      setSuccess('Organization archived. It will no longer appear in your portal.');
      setTimeout(() => {
        onClose();
        // Optionally trigger a page reload or context update
        window.location.reload(); 
      }, 2000);
    } catch (err: any) {
      console.error('Quit failed:', err);
      if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else {
        setError(err.message || 'Failed to leave organization.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="bg-white rounded-[2.5rem] w-full max-w-md relative shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-8 pb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Quit Organization</h3>
            <p className="text-gray-500 mt-1 text-sm">This archives your membership so the organization, events, and messages are hidden from your portal.</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-8 space-y-6 pb-8">
          {/* Org Selector */}
          <div>
             <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Select Organization</label>
             <div className="relative group">
               <select
                 value={selectedMembershipId}
                 onChange={e => {
                   const nextId = e.target.value;
                   setSelectedMembershipId(nextId);
                   const match = memberships.find((m) => m.id === nextId);
                   if (match) setSelectedSource(match.source);
                 }}
                 disabled={fetching || loading}
                 className="w-full h-14 pl-4 pr-10 bg-gray-50 border-2 border-gray-100 rounded-2xl text-gray-900 font-bold focus:border-red-400 focus:bg-white outline-none transition-all appearance-none cursor-pointer disabled:opacity-50"
               >
                 {fetching ? (
                   <option>Loading your organizations...</option>
                 ) : memberships.length === 0 ? (
                   <option>No organizations found</option>
                 ) : (
                   memberships.map(m => (
                     <option key={`${m.source}:${m.id}`} value={m.id}>{m.orgName}</option>
                   ))
                 )}
               </select>
               <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none group-focus-within:text-red-400" />
             </div>
          </div>

          {/* Password Confirmation */}
          <div>
             <label className="block text-xs font-bold text-red-500 uppercase tracking-widest mb-2 ml-1">Confirm with Password</label>
             <div className="relative">
               <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
               <input
                 type="password"
                 placeholder="Your login password"
                 value={password}
                 onChange={e => setPassword(e.target.value)}
                 disabled={loading}
                 className="w-full h-14 pl-12 pr-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-gray-900 font-bold focus:border-red-400 focus:bg-white outline-none transition-all"
               />
             </div>
          </div>

          {/* Feedback */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-2xl bg-red-50 text-red-600 text-sm font-medium flex items-center gap-3 border border-red-100"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-2xl bg-emerald-50 text-emerald-600 text-sm font-medium flex items-center gap-3"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                {success}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleQuit}
              disabled={loading || !!success || memberships.length === 0}
              className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold shadow-xl shadow-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Trash2 className="w-5 h-5" />
                  Archive Membership
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="w-full py-3 text-gray-500 font-bold hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
