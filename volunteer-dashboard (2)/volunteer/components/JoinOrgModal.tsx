import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Building2, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';

interface JoinOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: any;
}

export const JoinOrgModal: React.FC<JoinOrgModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCode(['', '', '', '', '', '']);
      setError(null);
      setSuccess(null);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [isOpen]);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const newCode = [...code];
    newCode[index] = value.toUpperCase();
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pastedData = e.clipboardData.getData('text').slice(0, 6).toUpperCase();
    const newCode = [...code];
    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i];
    }
    setCode(newCode);
    inputRefs.current[Math.min(pastedData.length, 5)]?.focus();
  };

  const handleJoin = async () => {
    const fullCode = code.join('');
    if (fullCode.length < 6) {
      setError('Please enter the full 6-character code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = getFirestoreDb();
      const auth = getFirebaseAuth();
      const user = auth.currentUser;

      if (!user) throw new Error('You must be logged in.');

      // 1. Find Organization by Code
      // We check multiple collections since the codebase uses various names
      const collections = ['organizations', 'volunteer_organizations', 'orgs'];
      let foundOrg: any = null;

      for (const coll of collections) {
        const q = query(collection(db, coll), where('orgCode', '==', fullCode));
        const q2 = query(collection(db, coll), where('accessCode', '==', fullCode));
        const q3 = query(collection(db, coll), where('org_code', '==', fullCode));

        const snaps = await Promise.all([getDocs(q), getDocs(q2), getDocs(q3)]);
        const combined = snaps.flatMap(s => s.docs);

        if (combined.length > 0) {
          const doc = combined[0];
          foundOrg = { id: doc.id, ...doc.data() };
          break;
        }
      }

      if (!foundOrg) {
        setError('No organization found with this code. Please check and try again.');
        setLoading(false);
        return;
      }

      // 2. Check if already a member
      const qMembership = query(
        collection(db, 'user_organizations'),
        where('user_id', '==', user.uid),
        where('orgId', '==', foundOrg.id)
      );
      const membershipSnaps = await getDocs(qMembership);
      if (!membershipSnaps.empty) {
        setError('You have already joined or requested to join this organization.');
        setLoading(false);
        return;
      }

      // 3. Create Join Request
      await addDoc(collection(db, 'user_organizations'), {
        user_id: user.uid,
        orgId: foundOrg.id,
        orgCode: fullCode,
        orgName: foundOrg.name || foundOrg.orgName || foundOrg.organizationName || 'Organization',
        volunteerName: [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ') || user.displayName || 'Volunteer',
        volunteerEmail: user.email,
        status: 'pending',
        role: 'volunteer',
        joinedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      setSuccess(`Request sent to ${foundOrg.name || foundOrg.orgName || 'Organization'}!`);
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      console.error('Join failed:', err);
      setError(err.message || 'Failed to send join request.');
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
        {/* Header */}
        <div className="p-8 pb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Join Organization</h3>
            <p className="text-gray-500 mt-1 text-sm">Enter the 6-character access code provided by your organization.</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-8 space-y-8 pb-8">
          {/* OTP Input UI */}
          <div className="flex justify-between gap-2">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={el => inputRefs.current[index] = el}
                type="text"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(index, e.target.value)}
                onKeyDown={e => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                className="w-12 h-16 text-center text-2xl font-bold bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-lime-400 focus:bg-white focus:ring-4 focus:ring-lime-400/10 outline-none transition-all"
              />
            ))}
          </div>

          {/* Feedback */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-2xl bg-red-50 text-red-600 text-sm font-medium flex items-center gap-3"
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
              onClick={handleJoin}
              disabled={loading || !!success}
              className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold shadow-xl shadow-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Link2 className="w-5 h-5" />
                  Request to Join
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 text-gray-500 font-bold hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Decorative background */}
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-lime-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
      </motion.div>
    </div>
  );
};
