import React, { useEffect, useState } from 'react';
import { 
  BarChart2, 
  ClipboardList, 
  Users, 
  CreditCard,
  HelpCircle,
  MessageSquare,
  Calendar,
  LogOut,
  Sparkles,
  UserRound
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirestoreDb, getFirebaseFunctions } from '../lib/firebase';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  planTier?: string;
  portalName?: string;
  portalSubtitle?: string;
  isSubAdminPortal?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, planTier, portalName, portalSubtitle, isSubAdminPortal }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [orgName, setOrgName] = useState('Organization');

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOrgName('Organization');
        return;
      }
      const snapshot = await getDoc(doc(db, 'users', user.uid));
      const data = snapshot.data() || {};
      const name =
        data.organizationName
        || data.orgName
        || data.organization_name
        || data.organization
        || 'Organization';
      setOrgName(String((portalName && portalName.trim()) || name));
    });
    return () => unsubscribe();
  }, [portalName]);

  useEffect(() => {
    if (portalName && portalName.trim()) {
      setOrgName(portalName.trim());
    }
  }, [portalName]);

  const normalizedTier = (planTier || '').toLowerCase();
  const canUseAi = normalizedTier === 'nebula' || normalizedTier === 'cosmos';
  const canUseMessaging = normalizedTier === 'nebula' || normalizedTier === 'cosmos';
  const canUseEvents = normalizedTier === 'orbit' || normalizedTier === 'nebula' || normalizedTier === 'cosmos';

  const navItems = [
    { id: 'impact', label: 'Impact Overview', icon: BarChart2 },
    { id: 'requests', label: 'Volunteer Request', icon: ClipboardList },
    { id: 'volunteers', label: 'Volunteers', icon: Users },
    { id: 'messaging', label: 'Messages', icon: MessageSquare },
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'nebulae', label: 'Nebulae AI', icon: Sparkles },
  ].filter((item) => {
    if (item.id === 'nebulae') return canUseAi;
    if (item.id === 'messaging') return canUseMessaging;
    if (item.id === 'events') return canUseEvents;
    return true;
  });

  const helperItems = [
    { id: 'support', icon: HelpCircle, label: 'Support' }
  ];

  return (
    <>
      {/* Placeholder to reserve space in the flex layout (w-20 = 80px) */}
      <div className="w-20 h-full relative z-50 shrink-0">
        {/* Actual Sidebar Content that expands on top of everything */}
        <motion.aside
          initial={false}
          animate={{ width: isHovered ? 280 : 80 }}
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          className="fixed top-0 left-0 h-full bg-sidebar flex flex-col py-8 rounded-r-3xl shadow-2xl overflow-hidden"
          style={{ zIndex: 100 }}
        >
          {/* Logo Section */}
          <div className="flex items-center px-4 mb-10 h-12 w-full">
             <div className="w-12 h-12 bg-charcoal rounded-2xl flex items-center justify-center border border-gray-700/50 shadow-lg transition-all duration-300 overflow-hidden shrink-0">
                <img 
                  src="/logo.png" 
                  alt="Logo" 
                  className="w-full h-full object-contain hover:scale-110 transition-transform" 
                />
             </div>
             <AnimatePresence>
               {isHovered && (
                 <motion.div 
                   initial={{ opacity: 0, x: -10 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -10 }}
                   transition={{ delay: 0.1, duration: 0.2 }}
                   className="ml-4 leading-tight whitespace-normal break-words max-w-[180px]"
                 >
                   <p className="text-white font-semibold text-lg">{orgName}</p>
                   {isSubAdminPortal && (
                     <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                       {portalSubtitle || 'Subadmin Portal'}
                     </p>
                   )}
                 </motion.div>
               )}
             </AnimatePresence>
          </div>

          {/* Main Nav */}
          <nav className="flex-1 flex flex-col gap-4 w-full px-2">
            {navItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`
                    relative flex items-center h-14 rounded-2xl transition-all duration-300 group
                    ${isActive 
                      ? 'bg-gray-700/50 text-white' 
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                    }
                    ${isHovered ? 'px-4' : 'pl-5'} 
                  `}
                >
                  <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                      <item.icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  
                  <AnimatePresence>
                    {isHovered && (
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className="ml-4 font-medium whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </nav>

          {/* Bottom Actions */}
          <div className="flex flex-col gap-2 w-full px-2 mt-auto border-t border-gray-800/50 pt-4 pb-2">
            
            {/* Helper Links */}
            {helperItems.map((item) => (
               <button 
                  key={item.id} 
                  onClick={() => onNavigate(item.id)}
                  className={`
                      flex items-center h-10 text-gray-500 hover:text-white transition-colors group rounded-xl hover:bg-gray-800/30
                      ${currentView === item.id ? 'text-white bg-gray-800/50' : ''}
                      ${isHovered ? 'px-4' : 'pl-4'}
                  `}
              >
                   <div className="w-8 h-8 flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5" />
                   </div>
                   <AnimatePresence>
                    {isHovered && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="ml-4 text-sm font-medium whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
               </button>
            ))}

            {!isSubAdminPortal && (
              <button 
                  onClick={() => onNavigate('billing')}
                  className={`
                      flex items-center h-10 text-gray-500 hover:text-white transition-colors group rounded-xl hover:bg-gray-800/30 mt-2
                      ${currentView === 'billing' ? 'text-white bg-gray-800/50' : ''}
                      ${isHovered ? 'px-4' : 'pl-4'}
                  `}
              >
                  <div className="w-8 h-8 flex items-center justify-center shrink-0">
                      <CreditCard className="w-5 h-5" />
                  </div>
                  <AnimatePresence>
                      {isHovered && (
                          <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="ml-4 text-sm font-medium whitespace-nowrap"
                          >
                          Billing
                          </motion.span>
                      )}
                  </AnimatePresence>
              </button>
            )}

            {!isSubAdminPortal && (
              <button
                onClick={() => onNavigate('account')}
                className={`
                    flex items-center h-10 text-gray-500 hover:text-white transition-colors group rounded-xl hover:bg-gray-800/30
                    ${(currentView === 'account' || currentView === 'create-subadmin') ? 'text-white bg-gray-800/50' : ''}
                    ${isHovered ? 'px-4' : 'pl-4'}
                `}
              >
                <div className="w-8 h-8 flex items-center justify-center shrink-0">
                  <UserRound className="w-5 h-5" />
                </div>
                <AnimatePresence>
                  {isHovered && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="ml-4 text-sm font-medium whitespace-nowrap"
                    >
                      Account
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )}

            <button
              onClick={async () => {
                try {
                  try {
                    const call = httpsCallable(getFirebaseFunctions(), 'clearSubAdminSession');
                    await call();
                  } catch (_error) {
                    // Best-effort only. Sign-out should still proceed.
                  }
                  localStorage.removeItem('nexolink_active_sub_admin_session');
                  await getFirebaseAuth().signOut();
                } finally {
                  window.location.href = '/';
                }
              }}
              className={`
                  flex items-center h-10 text-gray-500 hover:text-white transition-colors group rounded-xl hover:bg-gray-800/30 mt-1
                  ${isHovered ? 'px-4' : 'pl-4'}
              `}
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <AnimatePresence>
                {isHovered && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="ml-4 text-sm font-medium whitespace-nowrap"
                  >
                    Logout
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            
          </div>
        </motion.aside>
      </div>
    </>
  );
};
