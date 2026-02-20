import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '../lib/firebase';

interface JoinOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: any;
}

type JoinTarget = {
  id: string;
  name: string;
  isSuperAdmin: boolean;
  alreadyJoined: boolean;
};

export const JoinOrgModal: React.FC<JoinOrgModalProps> = ({ isOpen, onClose, userProfile: _userProfile }) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<'code' | 'groups'>('code');
  const [orgName, setOrgName] = useState('Organization');
  const [targets, setTargets] = useState<JoinTarget[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCode(['', '', '', '', '', '']);
      setError(null);
      setSuccess(null);
      setStep('code');
      setTargets([]);
      setSelectedTargetIds([]);
      setOrgName('Organization');
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

  const fullCode = code.join('');

  const lookupTargets = async () => {
    if (fullCode.length < 6) {
      setError('Please enter the full 6-character code.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser) throw new Error('You must be logged in.');

      const call = httpsCallable(getFirebaseFunctions(), 'getOrganizationJoinTargets');
      const result = await call({ accessCode: fullCode });
      const data = (result.data || {}) as any;
      const allTargets: JoinTarget[] = Array.isArray(data.targets) ? data.targets : [];
      const availableTargets = allTargets.filter((target) => !target.alreadyJoined);
      const resolvedOrgName = String(data.orgName || 'Organization');
      const displayTargets = availableTargets.map((target) => ({
        ...target,
        name: target.isSuperAdmin ? resolvedOrgName : target.name,
      }));
      const hasSubAdminTargets = availableTargets.some((target) => !target.isSuperAdmin);

      setOrgName(resolvedOrgName);

      if (displayTargets.length === 0) {
        setError('You are already joined or pending in all available groups for this organization.');
        setLoading(false);
        return;
      }

      setTargets(displayTargets);
      setSelectedTargetIds(
        hasSubAdminTargets ? [] : displayTargets.map((target) => target.id)
      );
      setStep('groups');
    } catch (err: any) {
      console.error('Join target lookup failed:', err);
      setError(err.message || 'Failed to load join groups.');
    } finally {
      setLoading(false);
    }
  };

  const submitRequests = async () => {
    if (selectedTargetIds.length === 0) {
      setError('Select at least one group.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      if (!auth.currentUser) throw new Error('You must be logged in.');

      const call = httpsCallable(getFirebaseFunctions(), 'submitOrganizationJoinRequests');
      const result = await call({
        accessCode: fullCode,
        groupIds: selectedTargetIds,
      });
      const data = (result.data || {}) as any;
      const count = Number(data.createdCount || 0);
      setSuccess(
        count > 1
          ? `Sent ${count} join requests to ${orgName}.`
          : `Request sent to ${orgName}.`
      );
      setTimeout(() => onClose(), 1800);
    } catch (err: any) {
      console.error('Join submission failed:', err);
      setError(err.message || 'Failed to send join request.');
    } finally {
      setLoading(false);
    }
  };

  const toggleTarget = (targetId: string) => {
    setSelectedTargetIds((prev) =>
      prev.includes(targetId)
        ? prev.filter((id) => id !== targetId)
        : [...prev, targetId]
    );
  };

  const selectAllTargets = () => {
    setSelectedTargetIds(targets.map((target) => target.id));
  };

  const clearAllTargets = () => {
    setSelectedTargetIds([]);
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
            <h3 className="text-2xl font-bold text-gray-900">
              {step === 'code' ? 'Join Organization' : 'Select Group'}
            </h3>
            <p className="text-gray-500 mt-1 text-sm">
              {step === 'code'
                ? 'Enter the 6-character access code provided by your organization.'
                : `Choose one or more groups in ${orgName}.`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-8 space-y-6 pb-8">
          {step === 'code' ? (
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
          ) : (
            <div className="space-y-3">
              {targets.map((target) => {
                const checked = selectedTargetIds.includes(target.id);
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => toggleTarget(target.id)}
                    className={`w-full text-left px-4 py-3 rounded-2xl border transition-colors ${
                      checked
                        ? 'border-lime-300 bg-lime-50 text-gray-900'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{target.name}</span>
                      <span className={`text-xs font-bold uppercase tracking-wider ${checked ? 'text-lime-700' : 'text-gray-400'}`}>
                        {checked ? 'Selected' : 'Select'}
                      </span>
                    </div>
                  </button>
                );
              })}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={selectAllTargets}
                  className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700"
                >
                  Request All
                </button>
                <button
                  type="button"
                  onClick={clearAllTargets}
                  className="flex-1 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-600"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

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
            {step === 'code' ? (
              <button
                onClick={lookupTargets}
                disabled={loading || !!success}
                className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold shadow-xl shadow-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Link2 className="w-5 h-5" />
                    Continue
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={submitRequests}
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
                  onClick={() => setStep('code')}
                  className="w-full py-3 text-gray-500 font-bold hover:text-gray-900 transition-colors"
                >
                  Back
                </button>
              </>
            )}
            {step === 'code' && (
              <button
                onClick={onClose}
                className="w-full py-3 text-gray-500 font-bold hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-lime-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
      </motion.div>
    </div>
  );
};
