import React from 'react';
import { motion } from 'framer-motion';
import { type ActivityLog } from '../lib/metrics';

type TopLogsCardProps = {
  logs: ActivityLog[];
};

export const TopLogsCard: React.FC<TopLogsCardProps> = ({ logs }) => {
  const ranked = logs.map((log, index) => ({
    rank: index + 1,
    // Use task name or site as main title
    title: (log.site as string) || (log.volunteering_task as string) || 'Service Activity',
    // Use date as subtitle
    subtitle: log.date ? new Date(log.date as string).toLocaleDateString() : 'No Date',
    hours: parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0,
  }));

  // Pad with placeholders if fewer than 3 logs
  /* 
     User requested "top 3". If we have fewer, we can just show what we have 
     or show placeholders. The PromoCard shows "No activity" if 0. 
     I'll just render what we have to be safe.
  */

  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="relative h-64 rounded-[2.5rem] bg-white p-6 flex flex-col shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-semibold text-lg text-gray-900 tracking-tight">Top Volunteering Logs</h3>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5">
            Most Hours
          </p>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 flex flex-col justify-between py-1">
        {ranked.length === 0 ? (
          <div className="text-sm text-gray-500 font-medium flex items-center justify-center h-full">
            No logs yet.
          </div>
        ) : ranked.map((log, i) => (
          <div key={i} className="flex items-center justify-between group cursor-default">
            <div className="flex items-center gap-4 overflow-hidden">
              {/* Rank Badge */}
              <div className={`
                 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors shrink-0
                 ${log.rank === 1 ? 'bg-lime-300 text-gray-900' : 'bg-gray-100 text-gray-500'}
              `}>
                 #{log.rank}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-semibold text-gray-900 text-sm truncate group-hover:text-lime-600 transition-colors">
                  {log.title}
                </span>
                <span className="text-[10px] text-gray-400 font-medium truncate">
                  {log.subtitle}
                </span>
              </div>
            </div>
            
            <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100 shrink-0 ml-2">
                <span className="font-bold text-gray-900 text-sm">{log.hours.toFixed(1)}</span>
                <span className="text-[10px] text-gray-500 font-medium ml-1">hrs</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
