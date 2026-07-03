import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Briefcase, 
  X, 
  CheckCircle2, 
  Clock,
  Fingerprint,
  ChevronRight,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { 
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  deleteDoc, 
  doc, 
  limit,
  Timestamp 
} from 'firebase/firestore';
import { Toast } from './Toast';

interface KioskModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgContext: { id: string; code: string; name: string };
}

export const KioskModal: React.FC<KioskModalProps> = ({ isOpen, onClose, orgContext }) => {
  const [mode, setMode] = useState<'signin' | 'signout'>('signin');
  const [email, setEmail] = useState('');
  const [task, setTask] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifiedMessage, setVerifiedMessage] = useState('');
  
  // Security State
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });

  // Clear state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setEmail('');
      setTask('');
      setError('');
    }
  }, [isOpen]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || (mode === 'signin' && !task)) return;

    setIsSubmitting(true);
    setError('');
    const db = getFirestoreDb();
    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. Verify Affiliation
      const usersRef = collection(db, 'users');
      let q = query(
        usersRef, 
        where('email', '==', cleanEmail),
        where('organization_id', '==', orgContext.id)
      );
      let userSnap = await getDocs(q);

      if (userSnap.empty) {
        q = query(
          usersRef,
          where('email', '==', cleanEmail),
          where('organization_code', '==', orgContext.code)
        );
        userSnap = await getDocs(q);
        if (userSnap.empty) {
          setError('Email not affiliated with this organization');
          setIsSubmitting(false);
          return;
        }
      }

      const userData = userSnap.docs[0].data();
      const userId = userSnap.docs[0].id;

      if (mode === 'signin') {
        const sessionsRef = collection(db, 'kiosk_sessions');
        const scopedGroupId: string | null = null;
        const scopedGroupName = 'Super Admin';
        const sessQ = query(
          sessionsRef,
          where('email', '==', cleanEmail),
          where('org_id', '==', orgContext.id)
        );
        const sessSnap = await getDocs(sessQ);
        if (!sessSnap.empty) {
          setError('Already signed in');
          setIsSubmitting(false);
          return;
        }

        await addDoc(sessionsRef, {
          user_id: userId,
          email: cleanEmail,
          first_name: userData.firstName || '',
          last_name: userData.lastName || '',
          org_id: orgContext.id,
          org_code: orgContext.code,
          org_name: orgContext.name,
          task: task.trim(),
          target_group_id: scopedGroupId,
          targetGroupId: scopedGroupId,
          target_group_name: scopedGroupName,
          targetGroupName: scopedGroupName,
          sub_admin_group_id: scopedGroupId,
          subAdminGroupId: scopedGroupId,
          sub_admin_group_name: scopedGroupName,
          subAdminGroupName: scopedGroupName,
          sign_in_time: serverTimestamp(),
          created_at: serverTimestamp()
        });

        setVerifiedMessage('Check-in confirmed');
        showToast(`Welcome, ${userData.firstName}!`);
      } else {
        const sessionsRef = collection(db, 'kiosk_sessions');
        const sessQ = query(
          sessionsRef,
          where('email', '==', cleanEmail),
          where('org_id', '==', orgContext.id),
          limit(1)
        );
        const sessSnap = await getDocs(sessQ);

        if (sessSnap.empty) {
          setError('No active session found');
          setIsSubmitting(false);
          return;
        }

        const sessionDoc = sessSnap.docs[0];
        const sessionData = sessionDoc.data();
        const signInTime = sessionData.sign_in_time as Timestamp;
        const signOutTime = Date.now();
        
        const durationMs = signOutTime - signInTime.toMillis();
        const rawHours = durationMs / 3600000;
        const roundedHours = Math.round(rawHours * 100) / 100;

        const logsRef = collection(db, 'volunteer_logs');
        const logDate = new Date();
        
        await addDoc(logsRef, {
          user_id: userId,
          email: cleanEmail,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          site: sessionData.task || 'Kiosk Service',
          hours_contributed: roundedHours,
          date: `${logDate.getMonth() + 1}/${logDate.getDate()}/${logDate.getFullYear()}`,
          time: logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          organization_id: orgContext.id,
          organization_name: orgContext.name,
          target_group_id: sessionData.target_group_id || sessionData.targetGroupId || sessionData.sub_admin_group_id || sessionData.subAdminGroupId || null,
          targetGroupId: sessionData.target_group_id || sessionData.targetGroupId || sessionData.sub_admin_group_id || sessionData.subAdminGroupId || null,
          target_group_name: sessionData.target_group_name || sessionData.targetGroupName || sessionData.sub_admin_group_name || sessionData.subAdminGroupName || 'Super Admin',
          targetGroupName: sessionData.target_group_name || sessionData.targetGroupName || sessionData.sub_admin_group_name || sessionData.subAdminGroupName || 'Super Admin',
          sub_admin_group_id: sessionData.target_group_id || sessionData.targetGroupId || sessionData.sub_admin_group_id || sessionData.subAdminGroupId || null,
          subAdminGroupId: sessionData.target_group_id || sessionData.targetGroupId || sessionData.sub_admin_group_id || sessionData.subAdminGroupId || null,
          sub_admin_group_name: sessionData.target_group_name || sessionData.targetGroupName || sessionData.sub_admin_group_name || sessionData.subAdminGroupName || 'Super Admin',
          subAdminGroupName: sessionData.target_group_name || sessionData.targetGroupName || sessionData.sub_admin_group_name || sessionData.subAdminGroupName || 'Super Admin',
          approve: 'accepted',
          source: 'kiosk',
          created_at: serverTimestamp(),
          sign_in_time: signInTime,
          sign_out_time: serverTimestamp()
        });

        await deleteDoc(doc(db, 'kiosk_sessions', sessionDoc.id));

        setVerifiedMessage(`${roundedHours} hours recorded`);
        showToast(`Goodbye! Recorded ${roundedHours} hrs.`);
      }

      setIsSubmitting(false);
      setIsSuccess(true);
      
      // Clear inputs immediately for the next person
      setEmail('');
      setTask('');

      setTimeout(() => {
        setIsSuccess(false);
        setVerifiedMessage('');
      }, 3500);

    } catch (err) {
      console.error('Kiosk operation failed', err);
      setError('System error. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleExitRequest = () => {
    setShowPasswordPrompt(true);
    setPassword('');
    setError('');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsVerifyingPassword(true);
    setError('');

    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error('No user logged in');

      const credential = EmailAuthProvider.credential(user.email!, password);
      await reauthenticateWithCredential(user, credential);
      
      onClose();
      setShowPasswordPrompt(false);
      setPassword('');
    } catch (err: any) {
      console.error('Exit verification failed', err);
      setError('Incorrect admin password');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-[#F0F2F5] flex flex-col items-center justify-center p-6 overflow-hidden font-sans selection:bg-lime-200"
        >
          {/* Immersive background depth */}
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
            <motion.div 
              animate={{ 
                scale: [1, 1.15, 1],
                rotate: [0, 5, 0],
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-[20%] -right-[10%] w-[900px] h-[900px] bg-lime-200/30 rounded-full blur-[120px]" 
            />
            <motion.div 
              animate={{ 
                scale: [1.1, 1, 1.1],
                rotate: [0, -5, 0],
              }}
              transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-[20%] -left-[10%] w-[800px] h-[800px] bg-white rounded-full blur-[100px] opacity-60" 
            />
          </div>

          {/* Terminal Actions Bar */}
          <div className="absolute top-12 left-12 right-12 flex justify-between items-center z-30">
            <div className="flex items-center gap-6">
               <div className="w-20 h-20 bg-gray-900 rounded-[1.75rem] flex items-center justify-center shadow-2xl shadow-gray-900/30 overflow-hidden">
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
               </div>
               <h2 className="text-6xl font-[1000] text-gray-900 tracking-tighter italic uppercase leading-none">KIOSK</h2>
            </div>
            
            <button 
              onClick={handleExitRequest}
              className="w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center text-gray-400 hover:text-gray-900 transition-all hover:scale-110 active:scale-95 group border border-white"
            >
              <X className="w-7 h-7 group-hover:rotate-90 transition-transform" />
            </button>
          </div>

          {/* Verification Success View */}
          <AnimatePresence>
            {isSuccess && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-3xl"
              >
                <motion.div 
                  initial={{ scale: 0.8, y: 30 }}
                  animate={{ scale: 1, y: 0 }}
                  className="text-center flex flex-col items-center px-6"
                >
                  <div className="w-32 h-32 bg-lime-300 rounded-[3rem] flex items-center justify-center mb-10 shadow-[0_20px_50px_rgba(163,230,53,0.4)] relative">
                     <motion.div 
                        animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-lime-400 rounded-[3rem]"
                     />
                     <CheckCircle2 className="w-16 h-16 text-gray-900 relative z-10" strokeWidth={2.5} />
                  </div>
                  <h3 className="text-7xl font-[1000] text-gray-900 mb-4 tracking-tighter uppercase italic leading-none">
                    Verified
                  </h3>
                  <p className="text-2xl font-bold text-gray-500 uppercase tracking-tight">
                    {verifiedMessage}
                  </p>
                  <p className="mt-2 text-lg font-medium text-gray-400">
                    {email}
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl flex flex-col gap-12 relative z-20"
          >
            {/* Mode Selector */}
            <div className="bg-gray-200/50 p-2 rounded-[3.5rem] flex items-center h-[96px] relative shadow-inner backdrop-blur-xl border border-white/50">
              <button 
                type="button"
                onClick={() => setMode('signin')}
                className={`flex-1 h-full rounded-[3rem] text-sm font-[1000] uppercase tracking-[0.3em] transition-all relative z-10 
                  ${mode === 'signin' ? 'text-gray-900 bg-white shadow-2xl' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Check In
              </button>
              <button 
                type="button"
                onClick={() => setMode('signout')}
                className={`flex-1 h-full rounded-[3rem] text-sm font-[1000] uppercase tracking-[0.3em] transition-all relative z-10
                  ${mode === 'signout' ? 'text-gray-900 bg-white shadow-2xl' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Check Out
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-10">
              
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-red-50 border border-red-100 p-6 rounded-3xl flex items-center justify-center text-red-600 font-bold text-xl uppercase tracking-widest gap-4"
                  >
                    <X className="w-6 h-6" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Volunteer Email */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-8">
                    <label className="text-[11px] font-black text-gray-900 uppercase tracking-[0.4em]">Volunteer Identity</label>
                    <Fingerprint className="w-4 h-4 text-gray-300" />
                </div>
                <div className="relative group">
                  <div className="absolute left-10 top-1/2 -translate-y-1/2">
                    <User className="w-7 h-7 text-gray-400 group-focus-within:text-lime-500 transition-colors" />
                  </div>
                  <input 
                    type="email" 
                    value={email}
                    required
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="volunteer@nexo.com"
                    className="w-full h-[100px] pl-24 pr-10 bg-white border-2 border-transparent rounded-[3rem] text-gray-900 font-[900] placeholder:text-gray-200 outline-none focus:ring-[12px] focus:ring-lime-300/10 focus:border-lime-300 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.08)] transition-all text-3xl"
                  />
                </div>
              </div>

              {/* Volunteering Task (Signin Only) */}
              <AnimatePresence mode="wait">
                {mode === 'signin' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0, marginTop: -30 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: -30 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-8">
                        <label className="text-[11px] font-black text-gray-900 uppercase tracking-[0.4em]">Mission / Task</label>
                        <Briefcase className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="relative group">
                      <div className="absolute left-10 top-1/2 -translate-y-1/2">
                        <Briefcase className="w-7 h-7 text-gray-400 group-focus-within:text-lime-500 transition-colors" />
                      </div>
                      <input 
                        type="text" 
                        value={task}
                        required={mode === 'signin'}
                        onChange={(e) => setTask(e.target.value)}
                        placeholder="Enter active task"
                        className="w-full h-[100px] pl-24 pr-10 bg-white border-2 border-transparent rounded-[3rem] text-gray-900 font-[900] placeholder:text-gray-200 outline-none focus:ring-[12px] focus:ring-lime-300/10 focus:border-lime-300 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.08)] transition-all text-3xl"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Massive Interactive Action Button */}
              <button 
                type="submit"
                disabled={isSubmitting || !email || (mode === 'signin' && !task)}
                className="w-full h-[110px] bg-gray-900 hover:bg-black text-white rounded-[3.5rem] font-[1000] text-3xl uppercase tracking-[0.2em] italic flex items-center justify-center gap-8 shadow-2xl shadow-gray-900/40 active:scale-[0.97] transition-all disabled:opacity-40 disabled:grayscale group relative overflow-hidden"
              >
                {isSubmitting ? (
                  <motion.div 
                    animate={{ rotate: 360 }} 
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Clock className="w-12 h-12 text-lime-300" />
                  </motion.div>
                ) : (
                  <>
                    <span className="relative z-10 group-hover:text-lime-300 transition-colors">
                        {mode === 'signin' ? 'Check in' : 'Check out'}
                    </span>
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-lime-300 group-hover:text-gray-900 transition-all group-hover:rotate-45">
                        <ChevronRight className="w-10 h-10" strokeWidth={4} />
                    </div>
                  </>
                )}
              </button>
            </form>
          </motion.div>

          {/* Password Prompt Overlay */}
          <AnimatePresence>
            {showPasswordPrompt && (
              <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowPasswordPrompt(false)}
                  className="absolute inset-0 bg-black/60 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative w-full max-w-md bg-white rounded-[3rem] p-12 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex flex-col items-center text-center space-y-8">
                    <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center text-lime-300 shadow-xl shadow-gray-900/20">
                      <Lock className="w-12 h-12" />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black text-gray-900 tracking-tight uppercase italic">Admin Portal</h3>
                      <p className="text-gray-500 font-medium mt-2">Authorization required to exit kiosk</p>
                    </div>
                    <form onSubmit={handlePasswordSubmit} className="w-full space-y-6">
                      <div className="relative group">
                        <input
                          autoFocus
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Admin Password"
                          className="w-full h-20 px-8 bg-gray-50 border-2 border-gray-100 rounded-2xl text-xl font-bold outline-none focus:ring-8 focus:ring-gray-900/5 focus:border-gray-900 focus:bg-white transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 transition-colors p-2"
                        >
                          {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                        </button>
                      </div>
                      
                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-red-500 text-sm font-black uppercase tracking-widest"
                        >
                          {error}
                        </motion.p>
                      )}
                      
                      <div className="flex flex-col gap-3">
                        <button
                          type="submit"
                          disabled={isVerifyingPassword || !password}
                          className="w-full h-20 bg-gray-900 text-white rounded-2xl font-black text-lg uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-[0.98] disabled:opacity-50"
                        >
                          {isVerifyingPassword ? 'Verifying...' : 'Unlock Dashboard'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPasswordPrompt(false)}
                          className="w-full py-4 text-gray-400 text-sm font-black uppercase tracking-[0.2em] hover:text-gray-900 transition-colors"
                        >
                          Back to Kiosk
                        </button>
                      </div>
                    </form>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          
          <Toast 
            message={toast.message} 
            type={toast.type} 
            isVisible={toast.visible} 
            onClose={() => setToast(prev => ({ ...prev, visible: false }))} 
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
