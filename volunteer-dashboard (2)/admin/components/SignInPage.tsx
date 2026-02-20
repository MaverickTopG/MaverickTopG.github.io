import React, { useState } from 'react';
import { browserSessionPersistence, setPersistence, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  Users,
} from 'lucide-react';

const SUBADMIN_SESSION_STORAGE_KEY = 'nexolink_active_sub_admin_session';

interface SignInPageProps {
  onSignIn: () => void;
  onBack: () => void;
}

export const SignInPage: React.FC<SignInPageProps> = ({ onSignIn, onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      window.sessionStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
      onSignIn();
    } catch (err: any) {
      console.error('Login failed', err);
      const code = String(err?.code || '');
      const couldBeSubAdmin = code.startsWith('auth/');

      if (couldBeSubAdmin) {
        try {
          const resp = await fetch('/api/subAdminLogin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), password }),
          });

          if (!resp.ok) {
            const payload = await resp.json().catch(() => ({}));
            const message = String(payload?.error || '').trim() || 'Invalid email or password.';
            setError(message);
            return;
          }

          const payload = await resp.json().catch(() => ({}));
          const customToken = String(payload?.customToken || '').trim();
          if (!customToken) {
            setError('Login failed. Please try again.');
            return;
          }

          const session = payload?.session || null;
          if (session?.groupId) {
            try {
              window.sessionStorage.setItem(SUBADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
            } catch (_storageError) {
              // Ignore storage failures.
            }
            try {
              window.dispatchEvent(new CustomEvent('nexolink:subadmin-session', { detail: session }));
            } catch (_error) {
              // Ignore.
            }
          } else {
            window.sessionStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
          }

          const auth = getFirebaseAuth();
          try {
            await setPersistence(auth, browserSessionPersistence);
            await signInWithCustomToken(auth, customToken);
            onSignIn();
            return;
          } catch (tokenError) {
            console.error('Custom token sign-in failed', tokenError);
            window.sessionStorage.removeItem(SUBADMIN_SESSION_STORAGE_KEY);
            setError('Login failed. Please try again.');
            return;
          }
        } catch (fallbackError) {
          console.error('Sub-admin login fallback failed', fallbackError);
        }
      }

      let message = 'Invalid email or password.';
      if (code === 'auth/user-not-found') message = 'No account found with this email.';
      if (code === 'auth/wrong-password') message = 'Incorrect password.';
      if (code === 'auth/too-many-requests') message = 'Too many failed attempts. Please try again later.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-screen bg-[#F3F4F6] flex items-center justify-center p-4 md:p-6 lg:p-8 overflow-hidden relative">
      
      {/* Background Decorative Elements */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-lime-300/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-gray-900/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[1400px] h-full max-h-[900px] bg-white rounded-[3rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row relative z-10"
      >
        
        {/* Left Side: Form (Light Mode) */}
        <div className="lg:w-[50%] h-full flex flex-col p-8 md:p-12 lg:p-16 relative">
            
            {/* Back Button */}
            <button 
                onClick={onBack}
                className="absolute top-8 left-8 p-3 rounded-full hover:bg-gray-50 text-gray-400 hover:text-gray-900 transition-colors z-20"
            >
                <ArrowLeft className="w-6 h-6" />
            </button>
            
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8 lg:mb-auto mt-12 lg:mt-0">
                 <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center shadow-lg shadow-gray-900/10 transition-transform hover:scale-105">
                    <Sparkles className="w-5 h-5 text-lime-300 fill-lime-300" />
                 </div>
                 <span className="text-gray-900 font-bold text-xl tracking-tight">Volunteer Dash</span>
            </div>

            {/* Form Container */}
            <div className="w-full max-w-md mx-auto my-auto">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight">Welcome back</h1>
                    <p className="text-gray-500 font-medium mb-8">Enter your details to access the dashboard.</p>

                    {error && (
                      <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                        {error}
                      </div>
                    )}

                    {/* Social Login */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <button className="flex items-center justify-center gap-3 h-14 rounded-2xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all font-bold text-gray-700 text-sm group">
                             <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 group-hover:scale-110 transition-transform" />
                             Google
                        </button>
                        <button className="flex items-center justify-center gap-3 h-14 rounded-2xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all font-bold text-gray-700 text-sm group">
                            <img src="https://www.svgrepo.com/show/511330/apple-173.svg" alt="Apple" className="w-5 h-5 group-hover:scale-110 transition-transform" />
                             Apple
                        </button>
                    </div>

                    <div className="relative flex items-center gap-4 mb-8">
                        <div className="h-px bg-gray-200 flex-1" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Or continue with</span>
                        <div className="h-px bg-gray-200 flex-1" />
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="flex flex-col gap-5">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-900 ml-1">Email Address</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-gray-900 transition-colors" />
                                <input 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@company.com"
                                    className="w-full h-14 pl-12 pr-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-lime-300 focus:bg-white outline-none font-medium text-gray-900 transition-all placeholder:text-gray-400"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-sm font-bold text-gray-900">Password</label>
                                <button type="button" className="text-xs font-bold text-lime-600 hover:text-lime-700 transition-colors">Forgot Password?</button>
                            </div>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-gray-900 transition-colors" />
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="w-full h-14 pl-12 pr-12 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-lime-300 focus:bg-white outline-none font-medium text-gray-900 transition-all placeholder:text-gray-400"
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={isLoading || !email || !password}
                            className="h-14 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-lg shadow-xl shadow-gray-900/20 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:hover:translate-y-0"
                        >
                            {isLoading ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    Sign In <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="text-center mt-8 text-gray-500 font-medium text-sm">
                        Don't have an account? <button className="text-lime-600 font-bold hover:underline">Sign up for free</button>
                    </p>
                </motion.div>
            </div>

            {/* Footer Text */}
            <div className="mt-auto text-center text-xs text-gray-400 font-medium hidden lg:block">
                © 2024 Volunteer Dash. All rights reserved.
            </div>
        </div>

        {/* Right Side: Visuals (Dark Mode) */}
        <div className="lg:w-[50%] h-full bg-[#0E0E10] relative hidden lg:flex flex-col justify-center items-center overflow-hidden">
            {/* Abstract Shapes */}
            <div className="absolute top-0 right-0 w-full h-full overflow-hidden pointer-events-none">
                <motion.div 
                    animate={{ 
                        y: [0, -40, 0],
                        rotate: [0, 10, 0],
                        scale: [1, 1.1, 1]
                    }}
                    transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-[-20%] right-[-10%] w-[700px] h-[700px] rounded-full border-[80px] border-gray-800/20 blur-2xl" 
                />
                <motion.div 
                    animate={{ 
                        y: [0, 40, 0],
                        rotate: [0, -10, 0],
                        scale: [1, 1.2, 1]
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-[-10%] left-[-20%] w-[600px] h-[600px] rounded-full bg-lime-300/5 blur-[80px]" 
                />
            </div>

            {/* Central Visual */}
            <div className="relative z-10 w-full max-w-sm transform scale-105">
                <div className="relative w-full">
                    
                    {/* Floating Activity Card */}
                    <motion.div 
                        initial={{ x: 50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.8, type: "spring" }}
                        className="absolute top-[-40px] right-[-30px] bg-gray-800/90 backdrop-blur-md p-4 rounded-2xl border border-gray-700 w-48 shadow-2xl transform rotate-6 z-0"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-full bg-lime-300/20 flex items-center justify-center">
                                <Activity className="w-4 h-4 text-lime-300" />
                            </div>
                            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Activity</span>
                        </div>
                        <div className="flex items-end justify-between h-12 gap-1">
                            {[40, 70, 45, 90, 60, 80].map((h, i) => (
                                <motion.div 
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    transition={{ delay: 0.5 + (i * 0.1), duration: 0.5 }}
                                    className="w-full bg-lime-300 rounded-t-sm opacity-80"
                                />
                            ))}
                        </div>
                    </motion.div>

                    {/* Main Stats Card */}
                    <motion.div 
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4, duration: 0.8, type: "spring" }}
                        className="bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 w-full shadow-2xl relative z-10 overflow-hidden"
                    >
                        {/* Shine Effect */}
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

                        <div className="flex justify-between items-start mb-10 relative">
                            <div>
                                <span className="text-lime-300 font-bold text-xs uppercase tracking-widest mb-2 block">Global Impact</span>
                                <span className="text-white font-bold text-5xl tracking-tighter">12,450</span>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10">
                                <Globe className="w-6 h-6 text-white" />
                            </div>
                        </div>

                        <div className="space-y-6 relative">
                            <div>
                                <div className="flex justify-between text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">
                                    <span>Goal Progress</span>
                                    <span className="text-white">75%</span>
                                </div>
                                <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: "75%" }}
                                        transition={{ delay: 1, duration: 1.5, ease: "circOut" }}
                                        className="h-full bg-gradient-to-r from-lime-300 to-lime-400" 
                                    />
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                                <div className="flex -space-x-3">
                                    {[1,2,3,4].map(i => (
                                        <div key={i} className="w-8 h-8 rounded-full border-2 border-[#1a1a1c] bg-gray-700 overflow-hidden">
                                            <img src={`https://i.pravatar.cc/150?u=${i + 20}`} alt="User" className="w-full h-full object-cover opacity-80" />
                                        </div>
                                    ))}
                                </div>
                                <span className="text-sm font-medium text-gray-400">+420 Volunteers joined</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Floating User Card */}
                    <motion.div 
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.8, type: "spring" }}
                        className="absolute bottom-[-30px] left-[-20px] bg-gray-900 p-4 rounded-2xl border border-gray-800 w-48 shadow-2xl transform -rotate-3 z-20"
                    >
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
                                <Users className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <div className="h-2.5 w-20 bg-gray-700 rounded-full mb-1.5" />
                                <div className="h-2 w-12 bg-gray-800 rounded-full" />
                            </div>
                        </div>
                    </motion.div>

                </div>
            </div>

        </div>

      </motion.div>
    </div>
  );
};
