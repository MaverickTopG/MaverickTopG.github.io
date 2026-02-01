import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon
} from 'lucide-react';

interface Log {
  date: string;
  hours_contributed?: number;
  hours?: number;
}

interface ImpactCalendarProps {
  logs: Log[];
  orgContext: { id: string; code: string; name: string };
  userProfile: any;
}

export const ImpactCalendar: React.FC<ImpactCalendarProps> = ({ logs, orgContext, userProfile }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
    
    const days = [];
    
    // Padding for start of month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    
    // Month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  }, [currentDate]);

  const dailyImpact = useMemo(() => {
    const impactMap = new Map<string, number>();
    
    logs.forEach(log => {
      if (!log.date) return;
      // Handle the format MM/DD/YYYY or YYYY-MM-DD
      const date = new Date(log.date);
      if (isNaN(date.getTime())) return;
      
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const hours = Number(log.hours_contributed || log.hours || 0);
      impactMap.set(key, (impactMap.get(key) || 0) + hours);
    });
    
    return impactMap;
  }, [logs]);

  const getDayColor = (hours: number) => {
    if (hours === 0) return 'bg-white border-gray-100';
    if (hours <= 2) return 'bg-lime-100 text-lime-700 border-lime-200';
    if (hours <= 4) return 'bg-lime-300 text-lime-900 border-lime-400';
    if (hours <= 6) return 'bg-lime-500 text-white border-lime-600';
    return 'bg-lime-700 text-white border-lime-800';
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-lime-100 rounded-2xl flex items-center justify-center text-lime-600">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4">

          <div className="flex items-center gap-2">
            <button 
              onClick={prevMonth}
              className="p-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all border border-gray-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={nextMonth}
              className="p-3 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all border border-gray-100"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100">
        <div className="grid grid-cols-7 gap-4 mb-4">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
            <div key={idx} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] py-2">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-4">
          {monthData.map((day, idx) => {
            if (!day) return <div key={idx} className="aspect-square" />;
            
            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const hours = dailyImpact.get(key) || 0;
            const isToday = new Date().toDateString() === day.toDateString();
            
            return (
              <motion.div
                key={idx}
                whileHover={{ scale: 1.05, y: -2 }}
                className={`
                  aspect-square rounded-3xl border-2 flex flex-col items-center justify-center relative cursor-default
                  transition-all duration-300 ${getDayColor(hours)}
                  ${isToday && hours === 0 ? 'ring-2 ring-lime-300 ring-offset-2' : ''}
                `}
              >
                <span className={`text-xs font-black absolute top-3 left-4 opacity-50`}>
                  {day.getDate()}
                </span>
                
                {hours > 0 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex flex-col items-center"
                  >
                    <span className="text-xl font-black">{hours}</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-tight opacity-70">hrs</span>
                  </motion.div>
                )}
                
                {isToday && (
                  <div className="absolute bottom-3 w-1.5 h-1.5 bg-current rounded-full" />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
