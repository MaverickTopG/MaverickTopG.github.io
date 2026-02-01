import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, X } from 'lucide-react';

interface DailyGoalCardProps {
  todayHours: number;
}

export const DailyGoalCard: React.FC<DailyGoalCardProps> = ({ todayHours }) => {
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [dailyGoalHours, setDailyGoalHours] = useState(1);
  const [goalInput, setGoalInput] = useState('1');

  useEffect(() => {
    const stored = window.localStorage.getItem('nexolinkDailyGoalHours');
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setDailyGoalHours(parsed);
        setGoalInput(String(parsed));
      }
    }
  }, []);

  const goalPercent = Math.min(100, Math.round((todayHours / dailyGoalHours) * 100));

  // Format date like "JAN 31ST"
  const dateStr = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase();
  // Add suffix
  const getOrdinalSuffix = (day: number) => {
    if (day > 3 && day < 21) return 'TH';
    switch (day % 10) {
      case 1:  return "ST";
      case 2:  return "ND";
      case 3:  return "RD";
      default: return "TH";
    }
  };
  const dayNum = new Date().getDate();
  const formattedDate = `${dateStr}${getOrdinalSuffix(dayNum)}`;

  return (
    <>
      <motion.div 
        whileHover={{ scale: 1.01 }}
        className="w-full relative rounded-[2.5rem] bg-gray-900 shadow-lg flex items-center justify-between p-8 min-h-[140px]"
      >
        <div className="flex flex-col">
          <span className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">
            Daily Goal • {formattedDate}
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-white">{todayHours.toFixed(1)}</span>
            <span className="text-gray-500 text-sm font-medium">/ {dailyGoalHours} hrs</span>
          </div>
        </div>
        
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
              {/* Track */}
              <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#1F2937"
                  strokeWidth="10"
                  strokeLinecap="round"
              />
              {/* Progress Indicator */}
              <motion.circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#D2F677"
                  strokeWidth="10"
                  strokeLinecap="round"
                  initial={{ strokeDasharray: 251.2, strokeDashoffset: 251.2 }}
                  animate={{ strokeDashoffset: 251.2 * (1 - Math.min(100, Math.max(0, goalPercent)) / 100) }}
                  transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
              />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-white">{Math.max(0, goalPercent)}%</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowGoalModal(true)}
          className="absolute top-4 right-6 text-white hover:opacity-80 transition-opacity"
          aria-label="Configure daily goal"
        >
          <ArrowUpRight className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Goal Modal */}
      <AnimatePresence>
        {showGoalModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowGoalModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg relative shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Daily Goal</h3>
                  <p className="text-gray-500 mt-1">Set a target for volunteering today.</p>
                </div>
                <button
                  onClick={() => setShowGoalModal(false)}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-gray-50 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Target Hours</p>
                  <p className="text-sm text-gray-500 mt-1">Default is 1 hour.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={goalInput}
                    onChange={(event) => setGoalInput(event.target.value)}
                    className="w-24 text-center text-lg font-bold text-gray-900 rounded-xl border border-gray-200 bg-white py-2 focus:outline-none focus:ring-2 focus:ring-lime-300"
                  />
                  <span className="text-sm font-semibold text-gray-500">hrs</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900"
                  onClick={() => {
                    setGoalInput(String(dailyGoalHours || 1));
                    setShowGoalModal(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-black"
                  onClick={() => {
                    const next = Math.max(0.5, Number(goalInput) || 1);
                    setDailyGoalHours(next);
                    setGoalInput(String(next));
                    window.localStorage.setItem('nexolinkDailyGoalHours', String(next));
                    setShowGoalModal(false);
                  }}
                >
                  Save Goal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
