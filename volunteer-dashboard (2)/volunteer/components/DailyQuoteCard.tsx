import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import { volunteeringQuotes } from '../lib/quotes';

export const DailyQuoteCard: React.FC = () => {
  const quote = useMemo(() => {
    // Basic daily rotation logic
    // Calculate days since a fixed epoch (e.g., Jan 1, 2024)
    const epoch = new Date('2024-01-01').getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceEpoch = Math.floor((today - epoch) / msPerDay);
    
    // Cycle through quotes based on the day count
    const index = daysSinceEpoch % volunteeringQuotes.length;
    return volunteeringQuotes[index];
  }, []);

  return (
    <motion.div 
      whileHover={{ scale: 1.01 }}
      className="w-full relative rounded-[2.5rem] bg-white border border-gray-100 p-8 shadow-sm flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <Quote className="w-5 h-5 text-gray-400 fill-gray-400" />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Daily Inspiration</span>
      </div>
      
      <p className="text-lg font-medium text-gray-900 leading-relaxed italic">
        "{quote}"
      </p>
    </motion.div>
  );
};
