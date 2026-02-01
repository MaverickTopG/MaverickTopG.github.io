import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { 
  type ActivityLog, 
  type DashboardMetrics, 
  type ChartPoint,
  normalizeDateValue,
  getCurrentWeekBoundaries,
  buildWeeklySeries,
  buildMonthlySeries,
  buildYearlySeries
} from '../lib/metrics';

export type VolunteerMetrics = {
  totalHours: number;
  weeklyHours: number;
  monthlyHours: number;
  streak: number;
  socialImpact: number;
  dailyGoalPercent: number;
  recentLogs: ActivityLog[];
  weeklyHoursByDay: number[];
  weeklyLogsByDay: number[];
  totalLogs: number;
  topLogs: ActivityLog[];
  todayHours: number;
};

type VolunteerMetricsState = {
  loading: boolean;
  error: string | null;
  metrics: VolunteerMetrics;
  recentLogs: ActivityLog[];
  weeklySeries: ChartPoint[];
  monthlySeries: ChartPoint[];
  yearlySeries: ChartPoint[];
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
  allLogs: ActivityLog[];
  userProfile: any | null;
};

const DONATION_RATE = 28.27;

const initialMetrics: VolunteerMetrics = {
  totalHours: 0,
  weeklyHours: 0,
  monthlyHours: 0,
  streak: 0,
  socialImpact: 0,
  dailyGoalPercent: 0,
  recentLogs: [],
  weeklyHoursByDay: new Array(7).fill(0),
  totalLogs: 0,
  weeklyLogsByDay: new Array(7).fill(0),
  topLogs: [],
  todayHours: 0,
};

export const useVolunteerMetrics = (): VolunteerMetricsState => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userUid, setUserUid] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserUid('');
        setUserEmail('');
        setUserProfile(null);
        setLoading(false);
        return;
      }
      setUserUid(user.uid);
      setUserEmail((user.email || '').toLowerCase());
      
      const userRef = collection(db, 'users');
      const q = query(userRef, where('__name__', '==', user.uid));
      const unsubProfile = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          setUserProfile(snapshot.docs[0].data());
        }
      });

      return () => unsubProfile();
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userUid && !userEmail) {
      setLogs([]);
      return;
    }

    const db = getFirestoreDb();
    const logsRef = collection(db, 'volunteer_logs');
    
    // Pull logs by user_id and email variants, then merge/dedupe.
    const qByUserId = userUid ? query(logsRef, where('user_id', '==', userUid)) : null;
    const qByEmail = userEmail ? query(logsRef, where('email', '==', userEmail)) : null;
    const qByVolunteerEmail = userEmail ? query(logsRef, where('volunteer_email', '==', userEmail)) : null;

    const mergeLogs = (chunks: ActivityLog[][]) => {
      const map = new Map<string, ActivityLog>();
      chunks.flat().forEach((log) => {
        const key = String(log.id || `${log.user_id || log.userId || log.volunteer_id || ''}|${log.date || ''}|${log.hours || log.hours_contributed || ''}|${log.site || ''}`);
        if (!map.has(key)) map.set(key, log);
      });
      const data = Array.from(map.values());
      data.sort((a, b) => {
        const dateA = normalizeDateValue(a.date)?.getTime() || 0;
        const dateB = normalizeDateValue(b.date)?.getTime() || 0;
        return dateB - dateA;
      });
      setLogs(data);
      setLoading(false);
    };

    let unsubUserId = () => {};
    let unsubEmail = () => {};
    let unsubVolunteerEmail = () => {};
    const chunks: ActivityLog[][] = [[], [], []];

    if (qByUserId) {
      unsubUserId = onSnapshot(qByUserId, (snapshot) => {
        chunks[0] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        mergeLogs(chunks);
      }, (err) => {
        console.error('Logs fetch failed', err);
        setError('Unable to load logs.');
        setLoading(false);
      });
    }

    if (qByEmail) {
      unsubEmail = onSnapshot(qByEmail, (snapshot) => {
        chunks[1] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        mergeLogs(chunks);
      }, (err) => {
        console.error('Logs fetch failed', err);
        setError('Unable to load logs.');
        setLoading(false);
      });
    }

    if (qByVolunteerEmail) {
      unsubVolunteerEmail = onSnapshot(qByVolunteerEmail, (snapshot) => {
        chunks[2] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        mergeLogs(chunks);
      }, (err) => {
        console.error('Logs fetch failed', err);
        setError('Unable to load logs.');
        setLoading(false);
      });
    }

    return () => {
      unsubUserId();
      unsubEmail();
      unsubVolunteerEmail();
    };
  }, [userUid, userEmail]);

  const computed = useMemo(() => {
    const approvedLogs = logs.filter((log) => 
      ['approved', 'accepted', 'pending', 'verified'].includes(String(log.approve || 'approved').toLowerCase())
    );

    const { startOfWeek, endOfWeek } = getCurrentWeekBoundaries();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalHours = 0;
    let weeklyHours = 0;
    let monthlyHours = 0;
    let todayHours = 0;
    const weeklyHoursByDay = new Array(7).fill(0);
    const weeklyLogsByDay = new Array(7).fill(0);
    const totalLogs = logs.length;
    
    logs.forEach((log) => {
      const hours = parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;
      totalHours += hours;
    });

    approvedLogs.forEach((log) => {
      const hours = parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;

      const date = normalizeDateValue(log.date);
      if (!date) return;

      if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) {
        monthlyHours += hours;
      }

      // Weekly Calculation: Use a rolling 7-day window for the graph
      const msPerDay = 24 * 60 * 60 * 1000;
      const todayTime = new Date().setHours(0,0,0,0);
      const logTime = normalizeDateValue(log.date)?.setHours(0,0,0,0) || 0;
      
      const diffDays = Math.floor((todayTime - logTime) / msPerDay);
      
      if (diffDays === 0) {
        todayHours += hours;
      }

      if (diffDays >= 0 && diffDays < 7) {
        // Map 0 -> today (index 6), 1 -> yesterday (index 5), etc.
        // The StatsCard expects index 6 to be the rightmost (latest).
        weeklyHoursByDay[6 - diffDays] += hours;
        weeklyLogsByDay[6 - diffDays] += 1;
      }

      if (date >= startOfWeek && date < endOfWeek) {
        weeklyHours += hours;
      }
    });

    const streak = 0; 
    
    // Calculate Top Logs (Top 3 by hours)
    const topLogs = [...approvedLogs].sort((a, b) => {
       const hoursA = parseFloat(String(a.hours_contributed ?? a.hours ?? 0)) || 0;
       const hoursB = parseFloat(String(b.hours_contributed ?? b.hours ?? 0)) || 0;
       return hoursB - hoursA;
    }).slice(0, 3);

    const socialImpact = totalHours * DONATION_RATE;

    const metrics: VolunteerMetrics = {
      totalHours,
      weeklyHours,
      monthlyHours,
      streak,
      socialImpact,
      dailyGoalPercent: 0, // Placeholder
      recentLogs: approvedLogs.slice(0, 10),
      weeklyHoursByDay,
      totalLogs,
      weeklyLogsByDay,
      topLogs,
      todayHours,
    };

    // We can reuse the buildSeries logic from metrics.ts if we trick it to think this is an "organization" with 1 volunteer
    const mockVolunteerRecord = { id: userUid, role: 'volunteer' };
    const mockVolunteers = [mockVolunteerRecord];

    const weeklySeries = buildWeeklySeries(mockVolunteers, approvedLogs, weekOffset);
    const monthlySeries = buildMonthlySeries(mockVolunteers, approvedLogs);
    const yearlySeries = buildYearlySeries(mockVolunteers, approvedLogs);

    return {
      metrics,
      recentLogs: approvedLogs.slice(0, 5),
      weeklySeries,
      monthlySeries,
      yearlySeries,
    };
  }, [logs, userUid, weekOffset]);

  return {
    loading,
    error,
    metrics: computed.metrics,
    recentLogs: computed.recentLogs,
    weeklySeries: computed.weeklySeries,
    monthlySeries: computed.monthlySeries,
    yearlySeries: computed.yearlySeries,
    weekOffset,
    setWeekOffset,
    allLogs: logs,
    userProfile,
  };
};
