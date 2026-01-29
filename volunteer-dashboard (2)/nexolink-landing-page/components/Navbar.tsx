
import React, { useEffect, useState } from 'react';
import { 
  Home, 
  LayoutGrid, 
  CreditCard, 
  FileText, 
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NavbarProps {
  onNavigate: (page: 'home' | 'app' | 'pricing' | 'blog' | 'login') => void;
  currentPage: string;
}

// Fixed the syntax error in component declaration and added proper typing for NavbarProps
const Navbar: React.FC<NavbarProps> = ({ onNavigate, currentPage }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'app', label: 'App', icon: LayoutGrid },
    { id: 'pricing', label: 'Pricing', icon: CreditCard },
    { id: 'blog', label: 'Blog', icon: FileText },
  ];

  const bottomItems = [
      { id: 'login', label: 'Login', icon: LogIn },
  ];

  // Sidebar is now consistently opaque black
  const getSidebarBackground = () => '#050505';
  const getBorderColor = () => 'rgba(255, 255, 255, 0.05)';

  return (
    <>
      <div className="hidden md:block w-20 h-full relative z-50 shrink-0">
        <motion.aside
          initial={false}
          animate={{ 
            width: isHovered ? 260 : 80,
            backgroundColor: getSidebarBackground(),
            borderColor: getBorderColor()
          }}
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          data-sidebar
          className="fixed top-0 left-0 h-full flex flex-col py-8 shadow-2xl overflow-visible border-r transition-colors duration-500"
          style={{
            zIndex: 1000,
          }}
        >
          <div className="flex items-center px-4 mb-10 h-12 w-full relative z-10 text-white">
             <button 
                onClick={() => onNavigate('home')}
                className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 shrink-0 bg-gray-800/50 group transition-colors"
             >
               <img src="/logo.png" alt="NexoLink logo" className="w-full h-full object-cover" />
             </button>
             <AnimatePresence>
               {isHovered && (
                 <motion.span 
                   initial={{ opacity: 0, x: -10 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -10 }}
                   transition={{ delay: 0.1, duration: 0.2 }}
                   className="ml-4 font-bold text-lg whitespace-nowrap tracking-tight"
                 >
                   NexoLink
                 </motion.span>
               )}
             </AnimatePresence>
          </div>

          {/* Main Nav */}
          <nav className="flex-1 flex flex-col gap-2 w-full px-2 relative z-10 text-white">
            {navItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id as any)}
                  className={`
                    relative flex items-center h-12 rounded-2xl transition-all duration-300 group
                    ${isActive 
                      ? 'bg-white/10 text-white shadow-inner' 
                      : 'text-gray-500 hover:text-white hover:bg-white/5'
                    }
                    ${isHovered ? 'px-4' : 'pl-4'} 
                    justify-start
                  `}
                >
                  <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                      <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  
                  <AnimatePresence>
                    {isHovered && (
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                        className="ml-3 font-medium text-sm whitespace-nowrap"
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
          <div className="flex flex-col gap-2 w-full px-2 mt-auto border-t border-white/5 pt-4 relative z-10 text-white">
             {bottomItems.map((item) => {
                 const isActive = currentPage === item.id;
                 return (
                    <button 
                        key={item.id}
                        onClick={() => onNavigate(item.id as any)}
                        className={`
                            flex items-center h-12 transition-colors group rounded-xl mt-2
                            ${isActive ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}
                            ${isHovered ? 'px-4' : 'pl-4'}
                            justify-start
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
                                className="ml-3 text-sm font-medium whitespace-nowrap"
                                >
                                {item.label}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                 )
             })}
          </div>
        </motion.aside>
      </div>
      
      {/* Mobile Nav Fallback */}
      <nav className="md:hidden fixed top-0 left-0 w-full h-16 bg-[#050505] text-white border-b border-white/10 z-[1000] flex items-center justify-between px-6">
        <div className="font-bold tracking-tight text-xl flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
               <img src="/logo.png" alt="NexoLink logo" className="w-full h-full object-cover" />
            </div>
            NexoLink
        </div>
        <button onClick={() => onNavigate('home')} className="p-2">
             <Home className="w-6 h-6" />
        </button>
      </nav>
    </>
  );
};

export default Navbar;
