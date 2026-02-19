
import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  Clock, 
  TrendingUp, 
  History, 
  Plus, 
  ChevronRight, 
  LogOut,
  Calendar,
  Building,
  CheckCircle2,
  DollarSign,
  Search,
  Filter
} from 'lucide-react';
import { getAuth, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  doc,
  getDocs, 
  orderBy, 
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';

interface VolunteerDashboardPageProps {
  onNavigate?: (page: any) => void;
}

const VolunteerDashboardPage: React.FC<VolunteerDashboardPageProps> = ({ onNavigate }) => {
  const auth = getAuth();
  const db = getFirestore();
  const [user, setUser] = useState<User | null>(() => auth.currentUser);

  const [logs, setLogs] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Form State
  const [site, setSite] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => {
      try { unsub(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!user) {
      if (onNavigate) onNavigate('volunteer-login');
      return;
    }

    // Subscribe to profile
    const profileUnsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      setProfile(doc.data());
    });

    // Subscribe to logs
    const logsCol = collection(db, 'volunteer_logs');
    const toSortMs = (row: any) => {
      const ts = row?.timestamp || row?.createdAt || row?.updatedAt;
      if (!ts) return 0;
      if (typeof ts?.toMillis === 'function') return ts.toMillis();
      if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
      return 0;
    };

    let logsUnsub: (() => void) | null = null;
    const subscribeLogs = (withOrderBy: boolean) => {
      const q = withOrderBy
        ? query(logsCol, where('user_id', '==', user.uid), orderBy('timestamp', 'desc'))
        : query(logsCol, where('user_id', '==', user.uid));

      return onSnapshot(
        q,
        (snapshot) => {
          const logsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          logsData.sort((a, b) => toSortMs(b) - toSortMs(a));
          setLogs(logsData);
          setIsLoading(false);
        },
        (err: any) => {
          console.warn('Volunteer logs listener failed', err);
          if (withOrderBy && err?.code === 'failed-precondition') {
            try { logsUnsub?.(); } catch {}
            logsUnsub = subscribeLogs(false);
          }
        }
      );
    };

    logsUnsub = subscribeLogs(true);

    return () => {
      profileUnsub();
      try { logsUnsub?.(); } catch {}
    };
  }, [user]);

  const stats = useMemo(() => {
    const totalHours = logs.reduce((acc, log) => acc + (Number(log.hours) || 0), 0);
    const impactValue = totalHours * 31.80; // Estimated value of volunteer time
    const topOrganization = logs.length > 0 ? 
      Object.entries(logs.reduce((acc: any, log) => {
        acc[log.organization_name || log.site] = (acc[log.organization_name || log.site] || 0) + 1;
        return acc;
      }, {})).sort((a: any, b: any) => b[1] - a[1])[0][0] : "None";

    return { totalHours, impactValue, topOrganization };
  }, [logs]);

  const chartData = useMemo(() => {
    // Last 7 days chart data
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayDate = d.toISOString().split('T')[0];
      
      const dayHours = logs
        .filter(log => {
          const logDate = log.timestamp?.toDate ? 
            log.timestamp.toDate().toISOString().split('T')[0] : 
            log.date; // fallback to string date
          return logDate === dayDate;
        })
        .reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
      
      data.push({ name: dayStr, hours: dayHours });
    }
    return data;
  }, [logs]);

  const handleManualLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'volunteer_logs'), {
        user_id: user.uid,
        user_name: user.displayName,
        user_email: user.email,
        site: site,
        hours: Number(hours),
        date: date,
        timestamp: serverTimestamp(),
        status: 'accepted', // Auto-accepted for personal logs usually, or pending organization verification
        is_manual: true
      });
      setSite("");
      setHours("");
      setShowLogForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    if (onNavigate) onNavigate('home');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-neon"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-charcoal flex flex-col pt-20">
      
      {/* Header Section */}
      <section className="bg-charcoal text-white pt-16 pb-32 px-6 md:px-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/3 h-full opacity-10 pointer-events-none">
              <div className="absolute top-[-20%] right-[-10%] w-[150%] h-[150%] bg-neon rounded-full blur-[120px]"></div>
          </div>

          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-8 relative z-10">
              <div>
                  <span className="font-mono text-neon text-xs tracking-[0.3em] uppercase mb-4 block">Volunteer Dashboard</span>
                  <h1 className="text-5xl md:text-7xl font-display font-black tracking-tighter uppercase italic leading-none">
                      Welcome, <br/> <span className="text-neon">{user?.displayName?.split(' ')[0] || 'Volunteer'}.</span>
                  </h1>
              </div>
              <div className="flex gap-4">
                  <button 
                    onClick={() => setShowLogForm(true)}
                    className="bg-neon text-charcoal px-8 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-neon/20 flex items-center gap-2"
                  >
                      <Plus className="w-5 h-5" /> Log Hours
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="p-4 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white transition-colors"
                  >
                      <LogOut className="w-6 h-6" />
                  </button>
              </div>
          </div>
      </section>

      {/* Stats Grid */}
      <section className="max-w-7xl mx-auto w-full px-6 -translate-y-16 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-20">
          {[
              { label: "Total Hours", value: stats.totalHours.toFixed(1), icon: <Clock />, color: "bg-white", text: "text-charcoal" },
              { label: "Impact Value", value: `$${stats.impactValue.toLocaleString()}`, icon: <DollarSign />, color: "bg-neon", text: "text-charcoal" },
              { label: "Top Org", value: stats.topOrganization, icon: <Building />, color: "bg-white", text: "text-charcoal" }
          ].map((stat, i) => (
              <motion.div 
                key={i}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
                className={`${stat.color} ${stat.text} p-8 rounded-[2.5rem] shadow-2xl flex flex-col justify-between min-h-[160px]`}
              >
                  <div className="flex justify-between items-start">
                      <span className="font-mono text-[10px] uppercase tracking-widest opacity-40">{stat.label}</span>
                      <div className="opacity-40">{stat.icon}</div>
                  </div>
                  <div className="text-4xl font-display font-black tracking-tighter uppercase">{stat.value}</div>
              </motion.div>
          ))}
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto w-full px-6 pb-24 grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Activity Chart */}
          <div className="bg-white rounded-[3rem] p-10 shadow-xl shadow-slate-200/50">
              <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-display font-black uppercase tracking-tight italic">Activity <span className="text-neon bg-charcoal px-4 py-1">Flow</span></h3>
                  <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-neon"></div>
                      <span className="text-[10px] font-mono uppercase tracking-widest">Efficiency</span>
                  </div>
              </div>
              <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                          <defs>
                              <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#9EFF4F" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#9EFF4F" stopOpacity={0}/>
                              </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                            dy={10}
                          />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{ 
                                borderRadius: '20px', 
                                border: 'none', 
                                boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
                                padding: '15px' 
                            }} 
                          />
                          <Area 
                            type="monotone" 
                            dataKey="hours" 
                            stroke="#9EFF4F" 
                            strokeWidth={4} 
                            fillOpacity={1} 
                            fill="url(#colorHours)" 
                          />
                      </AreaChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* History List */}
          <div className="bg-charcoal text-white rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
              <div className="absolute bottom-0 right-0 w-1/2 h-1/2 opacity-5 pointer-events-none">
                <History className="w-full h-full text-white" />
              </div>
              
              <div className="flex justify-between items-center mb-10 relative z-10">
                  <h3 className="text-2xl font-display font-black uppercase tracking-tight italic">LATEST <span className="text-neon">LOGS</span></h3>
                  <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                      <input 
                        type="text" 
                        placeholder="SEARCH..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-full pl-12 pr-6 py-2 text-xs font-bold focus:outline-none focus:border-neon transition-all"
                      />
                  </div>
              </div>

              <div className="space-y-4 relative z-10 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                  {logs.length === 0 ? (
                      <div className="py-20 text-center opacity-30 font-mono text-xs uppercase tracking-[.2em]">No records found</div>
                  ) : (
                      logs
                        .filter(log => (log.site || log.organization_name || "").toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((log, i) => (
                          <motion.div 
                            key={log.id}
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between hover:bg-white/10 transition-colors group cursor-pointer"
                          >
                              <div className="flex items-center gap-5">
                                  <div className="w-12 h-12 bg-neon/10 rounded-xl flex items-center justify-center text-neon group-hover:bg-neon group-hover:text-charcoal transition-all">
                                      <Calendar className="w-5 h-5" />
                                  </div>
                                  <div>
                                      <div className="text-sm font-black uppercase tracking-tight">{log.site || log.organization_name || "Volunteer Session"}</div>
                                      <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{log.date || "Multiple Dates"}</div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="text-xl font-display font-black text-neon">{log.hours}h</div>
                                  <div className="flex items-center gap-1 justify-end">
                                      {log.status === 'accepted' ? (
                                          <>
                                            <span className="text-[8px] font-mono text-white/30 uppercase">VERIFIED</span>
                                            <CheckCircle2 className="w-3 h-3 text-neon" />
                                          </>
                                      ) : (
                                          <span className="text-[8px] font-mono text-white/30 uppercase">PENDING</span>
                                      )}
                                  </div>
                              </div>
                          </motion.div>
                      ))
                  )}
              </div>
          </div>
      </main>

      {/* Manual Log Modal */}
      <AnimatePresence>
        {showLogForm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowLogForm(false)}
                  className="absolute inset-0 bg-charcoal/60 backdrop-blur-xl"
                />
                
                <motion.div 
                  initial={{ y: 50, scale: 0.9, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  exit={{ y: 50, scale: 0.9, opacity: 0 }}
                  className="bg-white rounded-[3rem] p-12 max-w-lg w-full relative z-10 shadow-[0_40px_100px_rgba(0,0,0,0.3)]"
                >
                    <h2 className="text-4xl font-display font-black text-charcoal uppercase tracking-tighter italic mb-8">LOG <span className="text-neon bg-charcoal px-4 py-1">SESSION</span></h2>
                    
                    <form onSubmit={handleManualLog} className="space-y-8">
                        <div className="relative">
                            <label className="text-[10px] font-mono text-charcoal/40 uppercase tracking-[.2em] mb-2 block">Organization / Site</label>
                            <input 
                              required
                              type="text" 
                              value={site}
                              onChange={(e) => setSite(e.target.value)}
                              placeholder="Where did you volunteer?"
                              className="w-full bg-slate-50 border-b-2 border-slate-200 py-3 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-8">
                            <div className="relative">
                                <label className="text-[10px] font-mono text-charcoal/40 uppercase tracking-[.2em] mb-2 block">Total Hours</label>
                                <input 
                                  required
                                  type="number" 
                                  step="0.5"
                                  value={hours}
                                  onChange={(e) => setHours(e.target.value)}
                                  placeholder="0.0"
                                  className="w-full bg-slate-50 border-b-2 border-slate-200 py-3 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                                />
                            </div>
                            <div className="relative">
                                <label className="text-[10px] font-mono text-charcoal/40 uppercase tracking-[.2em] mb-2 block">Date</label>
                                <input 
                                  required
                                  type="date" 
                                  value={date}
                                  onChange={(e) => setDate(e.target.value)}
                                  className="w-full bg-slate-50 border-b-2 border-slate-200 py-3 text-lg font-bold text-charcoal focus:outline-none focus:border-neon transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button 
                                type="button"
                                onClick={() => setShowLogForm(false)}
                                className="flex-1 px-8 py-5 rounded-full font-black text-sm uppercase tracking-widest border-2 border-slate-100 text-charcoal/40 hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 px-8 py-5 rounded-full font-black text-sm uppercase tracking-widest bg-charcoal text-white hover:bg-neon hover:text-charcoal transition-all shadow-xl"
                            >
                                {isSubmitting ? "SAVING..." : "CONFIRM"}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>

    </div>
  );
};

export default VolunteerDashboardPage;
