import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface HeatmapProps {
  logs: any[];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const ContributionHeatmap: React.FC<HeatmapProps> = ({ logs }) => {
  const currentYear = new Date().getFullYear();
  
  const heatmapData = useMemo(() => {
    const data = new Map<string, number>();
    logs.forEach((log) => {
      const dateStr = log.date;
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const hours = parseFloat(log.hours_contributed || log.hours || 0);
      data.set(key, (data.get(key) || 0) + hours);
    });
    return data;
  }, [logs]);

  const weeks = useMemo(() => {
    const result = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364); // Last 52 weeks
    
    // Adjust to previous Sunday
    while (startDate.getDay() !== 0) {
      startDate.setDate(startDate.getDate() - 1);
    }

    let currentWeek = [];
    const cursor = new Date(startDate);
    
    for (let i = 0; i < 371; i++) { // ~53 weeks
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      const hours = heatmapData.get(key) || 0;
      
      currentWeek.push({
        date: new Date(cursor),
        hours,
        level: hours > 8 ? 4 : hours > 4 ? 3 : hours > 2 ? 2 : hours > 0 ? 1 : 0
      });

      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [heatmapData]);

  const getColor = (level: number) => {
    switch (level) {
      case 4: return 'bg-lime-500';
      case 3: return 'bg-lime-400';
      case 2: return 'bg-lime-300';
      case 1: return 'bg-lime-200';
      default: return 'bg-gray-100';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Personal Contribution Activity</h3>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">Less</span>
          {[0, 1, 2, 3, 4].map(l => (
            <div key={l} className={`w-3 h-3 rounded-sm ${getColor(l)}`} />
          ))}
          <span className="text-[10px] text-gray-400">More</span>
        </div>
      </div>
      
      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-2">
        <div className="flex flex-col gap-1 pr-2 pt-6">
          {['Mon', 'Wed', 'Fri'].map(day => (
            <span key={day} className="text-[9px] text-gray-400 h-3 flex items-center">{day}</span>
          ))}
        </div>
        
        <div className="flex gap-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => (
                <motion.div
                  key={di}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (wi * 7 + di) * 0.001 }}
                  className={`w-3 h-3 rounded-sm ${getColor(day.level)} cursor-pointer hover:ring-1 hover:ring-gray-300`}
                  title={`${day.date.toDateString()}: ${day.hours} hours`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
