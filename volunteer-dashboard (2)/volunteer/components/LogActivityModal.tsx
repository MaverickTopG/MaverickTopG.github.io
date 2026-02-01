import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Send, 
  Loader2,
  ChevronRight,
  Users,
  MapPin,
  BookOpen
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFirestoreDb, getFirebaseAuth } from '../lib/firebase';

interface LogActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgContext: { id: string; code: string; name: string };
  userProfile: any;
}

export const LogActivityModal: React.FC<LogActivityModalProps> = ({ 
  isOpen, 
  onClose, 
  orgContext,
  userProfile
}) => {
  const [step, setStep] = useState(1);
  const [site, setSite] = useState('');
  const [hours, setHours] = useState('');
  const [assignTo, setAssignTo] = useState<'personal' | 'org'>(orgContext?.id ? 'org' : 'personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Auto-capture temporal data (Local aware)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const currentDate = `${year}-${month}-${day}`;
  const currentTime = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const db = getFirestoreDb();
    const auth = getFirebaseAuth();
    const user = auth.currentUser;

    if (!user) {
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = {
        user_id: user.uid,
        email: user.email,
        firstName: userProfile?.firstName || '',
        lastName: userProfile?.lastName || '',
        site: site.trim(),
        hours_contributed: parseFloat(hours),
        date: currentDate,
        time: currentTime,
        organization_id: assignTo === 'org' ? (orgContext?.id || '') : '',
        organization_name: assignTo === 'org' ? (orgContext?.name || 'Personal') : 'Personal',
        organization_code: assignTo === 'org' ? (orgContext?.code || '') : '',
        approve: assignTo === 'org' ? 'pending' : 'verified', // Personal logs are auto-verified
        source: 'web_dashboard',
        created_at: serverTimestamp(),
        type: assignTo
      };

      await addDoc(collection(db, 'volunteer_logs'), payload);
      
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
        resetForm();
      }, 2000);
    } catch (error) {
      console.error('Failed to log activity', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSite('');
    setHours('');
    setAssignTo(orgContext?.id ? 'org' : 'personal');
  };

  const isStep1Valid = site.trim().length > 0 && parseFloat(hours) > 0 && parseFloat(hours) <= 24;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-2xl overflow-hidden"
          >
            {isSuccess ? (
              <div className="p-12 flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-lime-100 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10 text-lime-600" />
                </div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">Mission Logged!</h3>
                <p className="text-gray-500 font-medium">Your contribution has been recorded successfully.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="p-10 pb-0 flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Step {step} of 2</span>
                    </div>
                    <h3 className="text-4xl font-bold text-gray-900 tracking-tight">Log Mission</h3>
                  </div>
                  <button onClick={onClose} className="p-3 hover:bg-gray-100 rounded-2xl transition-all">
                    <X className="w-6 h-6 text-gray-400" />
                  </button>
                </div>

                <div className="p-10 space-y-8">
                  {step === 1 ? (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="space-y-4">
                        <div className="relative group">
                          <div className="absolute left-6 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-lime-500">
                            <BookOpen className="w-6 h-6 text-gray-400" />
                          </div>
                          <input
                            required
                            type="text"
                            value={site}
                            onChange={(e) => setSite(e.target.value)}
                            placeholder="Mission / Task Name"
                            className="w-full h-20 pl-16 pr-8 bg-gray-50 border-2 border-transparent rounded-[1.5rem] focus:border-gray-900 focus:bg-white outline-none transition-all text-lg font-bold placeholder:text-gray-300"
                          />
                        </div>

                          <div className="relative group">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-lime-500">
                              <Clock className="w-6 h-6 text-gray-400" />
                            </div>
                            <input
                              required
                              type="number"
                              step="0.5"
                              max="24"
                              value={hours}
                              onChange={(e) => setHours(e.target.value)}
                              placeholder="Hours (max 24)"
                              className="w-full h-20 pl-16 pr-8 bg-gray-50 border-2 border-transparent rounded-[1.5rem] focus:border-gray-900 focus:bg-white outline-none transition-all text-lg font-bold placeholder:text-gray-300"
                            />
                          </div>
                      </div>

                      <button
                        onClick={() => setStep(2)}
                        disabled={!isStep1Valid}
                        className="w-full h-16 bg-gray-900 hover:bg-black text-white rounded-[1.5rem] font-bold flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 mt-4"
                      >
                        <span className="text-lg">Next Step</span>
                        <ChevronRight className="w-6 h-6" />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="grid grid-cols-1 gap-4">
                        <button
                          onClick={() => setAssignTo('personal')}
                          className={`
                            p-8 rounded-[2rem] border-2 transition-all flex items-center gap-6 text-left
                            ${assignTo === 'personal' 
                              ? 'border-gray-900 bg-gray-900 text-white shadow-xl' 
                              : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                            }
                          `}
                        >
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${assignTo === 'personal' ? 'bg-white/10' : 'bg-white border border-gray-100 shadow-sm'}`}>
                            <Users className={`w-7 h-7 ${assignTo === 'personal' ? 'text-white' : 'text-gray-400'}`} />
                          </div>
                          <div>
                            <p className="text-xl font-black">Personal Log</p>
                            <p className={`text-sm font-medium ${assignTo === 'personal' ? 'text-white/60' : 'text-gray-400'}`}>Private record for your profile</p>
                          </div>
                        </button>

                        {orgContext?.id && (
                          <button
                            onClick={() => setAssignTo('org')}
                            className={`
                              p-8 rounded-[2rem] border-2 transition-all flex items-center gap-6 text-left
                              ${assignTo === 'org' 
                                ? 'border-gray-900 bg-gray-900 text-white shadow-xl' 
                                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                              }
                            `}
                          >
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${assignTo === 'org' ? 'bg-white/10' : 'bg-white border border-gray-100 shadow-sm'}`}>
                              <MapPin className={`w-7 h-7 ${assignTo === 'org' ? 'text-white' : 'text-gray-400'}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xl font-black truncate">{orgContext.name}</p>
                              <p className={`text-sm font-medium ${assignTo === 'org' ? 'text-white/60' : 'text-gray-400'}`}>Official verification by organization</p>
                            </div>
                          </button>
                        )}
                      </div>

                      <div className="flex gap-4 mt-4">
                        <button
                          onClick={() => setStep(1)}
                          className="flex-1 h-16 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[1.5rem] font-bold shadow-sm transition-all"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleSubmit}
                          disabled={isSubmitting}
                          className="flex-[2] h-16 bg-gray-900 hover:bg-black text-white rounded-[1.5rem] font-bold flex items-center justify-center gap-3 shadow-xl transition-all disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                          ) : (
                            <>
                              <Send className="w-5 h-5" />
                              <span className="text-lg">Log Mission</span>
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
