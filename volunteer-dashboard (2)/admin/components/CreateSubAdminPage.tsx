import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowLeft, UserRoundPlus } from 'lucide-react';
import { getFirebaseAuth, getFirestoreDb, getFirebaseFunctions } from '../lib/firebase';
import { subscribeToOrgAdminContext } from '../lib/orgContext';

interface CreateSubAdminPageProps {
  onBack: () => void;
  onCreated?: () => void;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 80 } },
};

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'eventLead', label: 'Event Lead' },
  { value: 'viewer', label: 'Viewer' },
];

export const CreateSubAdminPage: React.FC<CreateSubAdminPageProps> = ({ onBack, onCreated }) => {
  const [orgId, setOrgId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('coordinator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const call = httpsCallable(functions, 'addOrgAdmin');
      await call({
        orgId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        role,
      });
      setNotice('Admin added successfully.');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRole('coordinator');
      onCreated?.();
    } catch (createError: any) {
      setError(createError?.message || 'Unable to add admin.');
    } finally {
      setLoading(false);
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
            <h2 className="text-2xl font-bold text-gray-900">Add Admin</h2>
            <p className="text-sm text-gray-500 mt-1">
              Invite another admin to help manage this organization.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </motion.div>

      <motion.form
        variants={item}
        onSubmit={handleSubmit}
        className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8 grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <input
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
          placeholder="First name"
          required
        />
        <input
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
          placeholder="Last name"
          required
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
          placeholder="Admin email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
          placeholder="Temporary password"
          minLength={6}
          required
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="md:col-span-2 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900 bg-white"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <p className="md:col-span-2 text-xs text-gray-500">
          The new admin signs in at /login with this email and password.
        </p>
        <button
          type="submit"
          disabled={loading || !orgId}
          className="md:col-span-2 mt-1 px-4 py-3 rounded-xl bg-lime-300 text-gray-900 text-sm font-bold hover:bg-lime-400 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
        >
          <UserRoundPlus className="w-4 h-4" />
          {loading ? 'Adding…' : 'Add Admin'}
        </button>
      </motion.form>
    </motion.div>
  );
};
