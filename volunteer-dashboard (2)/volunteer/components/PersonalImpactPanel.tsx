import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Clock, TrendingUp, Trophy } from 'lucide-react';
import { NextAchievementCard } from './NextAchievementCard';
import { DailyQuoteCard } from './DailyQuoteCard';
import { UploadDataCard } from './UploadDataCard';
import { DailyGoalCard } from './DailyGoalCard';

interface PersonalImpactPanelProps {
  metrics: {
    totalHours: number;
    weeklyHours: number;
    monthlyHours: number;
    streak: number;
    socialImpact: number;
    recentLogs: any[];
    todayHours: number;
  };
}

export const PersonalImpactPanel: React.FC<PersonalImpactPanelProps> = ({ metrics }) => {
  const goalHours = 20; // Default goal
  return (
    <div className="flex flex-col gap-6">
      <DailyGoalCard todayHours={metrics.todayHours || 0} />



      <NextAchievementCard totalHours={metrics.totalHours} />

      <DailyQuoteCard />
      
      <UploadDataCard />
    </div>
  );
};
