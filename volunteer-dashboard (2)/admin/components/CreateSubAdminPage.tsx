import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeft, UserRoundPlus } from 'lucide-react';
import { getFirebaseFunctions } from '../lib/firebase';

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

export const CreateSubAdminPage: React.FC<CreateSubAdminPageProps> = ({ onBack, onCreated }) => {
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const functions = useMemo(() => getFirebaseFunctions(), []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const call = httpsCallable(functions, 'createSubAdminPortal');
      await call({
        title: title.trim(),
        email: email.trim(),
        password,
      });
      setNotice('Subadmin portal created successfully.');
      setTitle('');
      setEmail('');
      setPassword('');
      onCreated?.();
    } catch (createError: any) {
      setError(createError?.message || 'Unable to create subadmin portal.');
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
            <h2 className="text-2xl font-bold text-gray-900">Create Subadmin</h2>
            <p className="text-sm text-gray-500 mt-1">
              Create a subadmin portal with an isolated group namespace.
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
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="md:col-span-2 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
          placeholder="Subadmin title (e.g. Book Shelving)"
          required
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
          placeholder="Subadmin email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-900"
          placeholder="Subadmin password"
          minLength={6}
          required
        />
        <p className="md:col-span-2 text-xs text-gray-500">
          Same email is allowed. Password must be unique across all subadmins.
        </p>
        <button
          type="submit"
          disabled={loading}
          className="md:col-span-2 mt-1 px-4 py-3 rounded-xl bg-lime-300 text-gray-900 text-sm font-bold hover:bg-lime-400 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
        >
          <UserRoundPlus className="w-4 h-4" />
          {loading ? 'Creating…' : 'Create Subadmin Portal'}
        </button>
      </motion.form>
    </motion.div>
  );
};
