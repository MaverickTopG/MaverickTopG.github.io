import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  ArrowLeft,
  Sparkles,
  Trophy,
  Activity
} from 'lucide-react';
import { useVolunteerMetrics } from '../hooks/useVolunteerMetrics';
import { ImpactCalendar } from './ImpactCalendar';

interface EventsPageProps {
  onNavigate: (view: string) => void;
  orgContext: any;
  userProfile: any;
}

export const EventsPage: React.FC<EventsPageProps> = ({ onNavigate, orgContext, userProfile }) => {
  const { allLogs, loading, metrics } = useVolunteerMetrics();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-lime-300 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Loading your impact...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full py-8 px-4"
    >
      <div className="flex flex-col gap-8">
        {/* Main Calendar View */}
        <div className="grid grid-cols-1 gap-8">
          <ImpactCalendar 
            logs={allLogs} 
            orgContext={orgContext}
            userProfile={userProfile}
          />
        </div>
      </div>
    </motion.div>
  );
};

