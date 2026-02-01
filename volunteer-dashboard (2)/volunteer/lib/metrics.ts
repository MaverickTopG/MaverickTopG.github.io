export type VolunteerRecord = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  totalHours?: number;
  lastActivity?: string | null;
};

export type ActivityLog = {
  id?: string;
  user_id?: string;
  userId?: string;
  volunteer_id?: string;
  volunteerId?: string;
  hours_contributed?: number | string;
  hours?: number | string;
  approve?: string;
  date?: unknown;
  [key: string]: unknown;
};

export type DashboardMetrics = {
  totalVolunteers: number;
  weeklyActive: number;
  totalHours: number;
  weeklyHours: number;
  monthlyHours: number;
  busiestDay: string;
  weeklyHoursByDay: number[];
  avgWeeklyHoursPerVolunteer: number;
  dailyGoalPercent: number;
};

export type ChartPoint = {
  name: string;
  scoreVolunteers: number;
  scoreHours: number;
  realVolunteers: number;
  realHours: number;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const resolveLogUserId = (log: ActivityLog) =>
  (log.user_id || log.userId || log.volunteer_id || log.volunteerId || '') as string;

const buildVolunteerLookup = (volunteers: VolunteerRecord[]) => {
  const idByEmail = new Map<string, string>();
  const idByName = new Map<string, string>();
  const allowed = new Set<string>();
  volunteers.forEach((volunteer) => {
    allowed.add(volunteer.id);
    const emailKey = (volunteer.email || '').trim().toLowerCase();
    if (emailKey) idByEmail.set(emailKey, volunteer.id);
    const nameKey = `${volunteer.firstName || ''} ${volunteer.lastName || ''}`.trim().toLowerCase();
    if (nameKey) idByName.set(nameKey, volunteer.id);
  });
  return { idByEmail, idByName, allowed };
};

const resolveLogVolunteerId = (log: ActivityLog, lookup: ReturnType<typeof buildVolunteerLookup>) => {
  const directId = resolveLogUserId(log);
  if (directId && lookup.allowed.has(directId)) return directId;
  const logRecord = log as Record<string, unknown>;
  const emailKey = String(logRecord.volunteer_email || logRecord.email || '').trim().toLowerCase();
  if (emailKey && lookup.idByEmail.has(emailKey)) return lookup.idByEmail.get(emailKey) as string;
  const nameKey = String(logRecord.volunteer_name || logRecord.name || logRecord.firstName || '').trim().toLowerCase();
  if (nameKey && lookup.idByName.has(nameKey)) return lookup.idByName.get(nameKey) as string;
  return directId || '';
};

export const buildLastNDaysSeries = (
  volunteers: VolunteerRecord[],
  logs: ActivityLog[],
  days = 10,
) => {
  const nonAdmin = volunteers.filter((v) => (v.role || 'volunteer') !== 'org-admin');
  const lookup = buildVolunteerLookup(nonAdmin);
  const today = normalizeDateValue(new Date());
  if (!today) return { hours: [], volunteers: [] };
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const hours = new Array(days).fill(0);
  const volunteerSets = new Array(days).fill(0).map(() => new Set<string>());

  logs.forEach((log) => {
    const userId = resolveLogVolunteerId(log, lookup);
    if (!userId || !lookup.allowed.has(userId)) return;
    const status = String(log.approve || 'pending').toLowerCase();
    if (status !== 'approved' && status !== 'accepted' && status !== 'verified') return;
    const date = normalizeDateValue(log.date);
    if (!date || date < start || date > today) return;
    const index = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (index < 0 || index >= days) return;
    const loggedHours = parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;
    hours[index] += loggedHours;
    volunteerSets[index].add(userId);
  });

  const volunteersCount = volunteerSets.map((set) => set.size);
  return { hours, volunteers: volunteersCount };
};

export const getCurrentWeekBoundaries = (referenceDate: Date = new Date()) => {
  const now = new Date(referenceDate);
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek;

  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diff);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return { startOfWeek, endOfWeek };
};

export const normalizeDateValue = (val: unknown): Date | null => {
  if (!val) return null;
  let d: Date;

  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    d = (val as { toDate: () => Date }).toDate();
  } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    // Handle YYYY-MM-DD as local time instead of UTC
    const [y, m, day] = val.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else if (typeof val === 'object' && val !== null) {
    const asTimestamp = val as { seconds?: number; nanoseconds?: number };
    if (asTimestamp.seconds != null && asTimestamp.nanoseconds != null) {
      const ms = asTimestamp.seconds * 1e3 + Math.floor(asTimestamp.nanoseconds / 1e6);
      d = new Date(ms);
    } else {
      d = new Date(val as any);
    }
  } else {
    d = new Date(val as string);
  }

  if (!Number.isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }

  return null;
};

export const computeVolunteerHours = (volunteers: VolunteerRecord[], logs: ActivityLog[]) => {
  const map = new Map<string, VolunteerRecord>();
  const emailMap = new Map<string, string>();
  const nameMap = new Map<string, string>();

  volunteers.forEach((volunteer) => {
    map.set(volunteer.id, {
      ...volunteer,
      totalHours: 0,
      lastActivity: volunteer.lastActivity ?? null,
    });
    const emailKey = (volunteer.email || '').trim().toLowerCase();
    if (emailKey) emailMap.set(emailKey, volunteer.id);
    const nameKey = `${volunteer.firstName || ''} ${volunteer.lastName || ''}`.trim().toLowerCase();
    if (nameKey) nameMap.set(nameKey, volunteer.id);
  });

  logs.forEach((log) => {
    const userId = resolveLogUserId(log);
    const logRecord = log as Record<string, unknown>;
    const rawEmail = (logRecord.volunteer_email || logRecord.email || '') as string;
    const emailKey = rawEmail.trim().toLowerCase();
    const rawName =
      (logRecord.volunteer_name as string)
      || (logRecord.name as string)
      || (logRecord.firstName as string)
      || '';
    const nameKey = rawName.trim().toLowerCase();
    const resolvedId =
      (userId && map.has(userId) ? userId : null)
      || (emailKey && emailMap.has(emailKey) ? (emailMap.get(emailKey) as string) : null)
      || (nameKey && nameMap.has(nameKey) ? (nameMap.get(nameKey) as string) : null)
      || userId
      || (emailKey ? `email:${emailKey}` : nameKey ? `name:${nameKey}` : '');
    if (!resolvedId) return;

    if (!map.has(resolvedId)) {
      const email = rawEmail.trim() || 'Unknown';
      const fallbackName = email.includes('@') ? email.split('@')[0] : email;
      map.set(resolvedId, {
        id: resolvedId,
        firstName:
          (logRecord.firstName as string)
          || (logRecord.volunteer_name as string)
          || fallbackName
          || 'Unknown',
        lastName: (logRecord.lastName as string) || (logRecord.last_name as string) || '',
        email,
        totalHours: 0,
        lastActivity: null,
        role: (logRecord.role as string) || 'volunteer',
      });
    }

    const volunteer = map.get(resolvedId);
    if (!volunteer) return;
    const hours = parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;
    const status = String(log.approve || 'pending').toLowerCase();
    if (status === 'approved' || status === 'accepted') {
      volunteer.totalHours = (volunteer.totalHours || 0) + hours;
    }

    const logDate = log.date ? new Date(log.date as string) : null;
    if (logDate && !Number.isNaN(logDate.getTime())) {
      if (!volunteer.lastActivity || new Date(volunteer.lastActivity) < logDate) {
        volunteer.lastActivity = logDate.toISOString();
      }
    }
  });

  return Array.from(map.values());
};

export const computeDashboardMetrics = (volunteers: VolunteerRecord[], logs: ActivityLog[]): DashboardMetrics => {
  const nonAdmin = volunteers.filter((v) => (v.role || 'volunteer') !== 'org-admin');
  const lookup = buildVolunteerLookup(nonAdmin);
  const { startOfWeek, endOfWeek } = getCurrentWeekBoundaries();

  const approvedLogs = logs.filter((log) => ['approved', 'accepted', 'verified'].includes(String(log.approve || 'pending').toLowerCase()));
  const weeklyHoursByDay = new Array(7).fill(0);
  const activeSet = new Set<string>();
  let weeklyHours = 0;
  let monthlyHours = 0;
  const totalHours = nonAdmin.reduce((sum, volunteer) => sum + (volunteer.totalHours || 0), 0);
  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();

  approvedLogs.forEach((log) => {
    const date = normalizeDateValue(log.date);
    const userId = resolveLogVolunteerId(log, lookup);
    if (!date || !userId || !lookup.allowed.has(userId)) return;
    if (date.getUTCFullYear() === currentYear && date.getUTCMonth() === currentMonth) {
      monthlyHours += parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;
    }
    if (date >= startOfWeek && date < endOfWeek) {
      const hours = parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;
      const day = date.getDay();
      weeklyHoursByDay[day] += hours;
      weeklyHours += hours;
      activeSet.add(userId);
    }
  });

  const max = Math.max(...weeklyHoursByDay);
  const busiestDay = max > 0 ? DAY_LABELS[weeklyHoursByDay.indexOf(max)] : '—';
  const totalVolunteers = nonAdmin.length;
  const weeklyActive = activeSet.size;
  const avgWeeklyHoursPerVolunteer = totalVolunteers > 0 ? weeklyHours / totalVolunteers : 0;

  const today = normalizeDateValue(new Date());
  const todayHours = today
    ? approvedLogs.reduce((sum, log) => {
        const d = normalizeDateValue(log.date);
        const userId = resolveLogVolunteerId(log, lookup);
        if (!d || d.getTime() !== today.getTime() || !userId || !lookup.allowed.has(userId)) return sum;
        return sum + (parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0);
      }, 0)
    : 0;
  const avgDailyHours = weeklyHours / 7;
  const dailyGoalPercent = avgDailyHours > 0 ? Math.min(100, Math.round((todayHours / avgDailyHours) * 100)) : 0;

  return {
    totalVolunteers,
    weeklyActive,
    totalHours,
    weeklyHours,
    monthlyHours,
    busiestDay,
    weeklyHoursByDay,
    avgWeeklyHoursPerVolunteer,
    dailyGoalPercent,
  };
};

const normalizeHours = (value: number, max: number) => {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 90) + 10));
};

const normalizeVolunteers = (value: number, max: number) => {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 90) + 10));
};

const buildSeries = (labels: string[], volunteersByBucket: number[], hoursByBucket: number[]): ChartPoint[] => {
  const maxVolunteers = Math.max(...volunteersByBucket, 0);
  const maxHours = Math.max(...hoursByBucket, 0);
  const globalMax = Math.max(maxVolunteers, maxHours, 1); // Use shared max for relative scaling

  return labels.map((label, index) => ({
    name: label,
    realVolunteers: volunteersByBucket[index] || 0,
    realHours: hoursByBucket[index] || 0,
    scoreVolunteers: normalizeVolunteers(volunteersByBucket[index] || 0, globalMax),
    scoreHours: normalizeHours(hoursByBucket[index] || 0, globalMax),
  }));
};

export const buildWeeklySeries = (
  volunteers: VolunteerRecord[],
  logs: ActivityLog[],
  weekOffset = 0,
): ChartPoint[] => {
  const nonAdmin = volunteers.filter((v) => (v.role || 'volunteer') !== 'org-admin');
  const lookup = buildVolunteerLookup(nonAdmin);
  const { startOfWeek, endOfWeek } = getCurrentWeekBoundaries();
  const weekStart = new Date(startOfWeek);
  weekStart.setUTCDate(weekStart.getUTCDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const hours = new Array(7).fill(0);
  const volunteerSets = new Array(7).fill(0).map(() => new Set<string>());

  logs.forEach((log) => {
    const userId = resolveLogVolunteerId(log, lookup);
    if (!userId || !lookup.allowed.has(userId)) return;
    const status = String(log.approve || 'pending').toLowerCase();
    if (status !== 'approved' && status !== 'accepted' && status !== 'verified') return;
    const date = normalizeDateValue(log.date);
    if (!date || date < weekStart || date >= weekEnd) return;
    const day = date.getDay();
    const loggedHours = parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;
    hours[day] += loggedHours;
    volunteerSets[day].add(userId);
  });

  const volunteersCount = volunteerSets.map((set) => set.size);
  return buildSeries(DAY_LABELS, volunteersCount, hours);
};

export const buildMonthlySeries = (volunteers: VolunteerRecord[], logs: ActivityLog[], year = new Date().getUTCFullYear()): ChartPoint[] => {
  const nonAdmin = volunteers.filter((v) => (v.role || 'volunteer') !== 'org-admin');
  const lookup = buildVolunteerLookup(nonAdmin);
  const hours = new Array(12).fill(0);
  const volunteerSets = new Array(12).fill(0).map(() => new Set<string>());

  logs.forEach((log) => {
    const userId = resolveLogVolunteerId(log, lookup);
    if (!userId || !lookup.allowed.has(userId)) return;
    const status = String(log.approve || 'pending').toLowerCase();
    if (status !== 'approved' && status !== 'accepted' && status !== 'verified') return;
    const date = normalizeDateValue(log.date);
    if (!date || date.getFullYear() !== year) return;
    const month = date.getMonth();
    const loggedHours = parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;
    hours[month] += loggedHours;
    volunteerSets[month].add(userId);
  });

  const volunteersCount = volunteerSets.map((set) => set.size);
  return buildSeries(MONTH_LABELS, volunteersCount, hours);
};

export const buildYearlySeries = (volunteers: VolunteerRecord[], logs: ActivityLog[], years = 5): ChartPoint[] => {
  const nonAdmin = volunteers.filter((v) => (v.role || 'volunteer') !== 'org-admin');
  const lookup = buildVolunteerLookup(nonAdmin);
  const currentYear = new Date().getFullYear();
  const yearLabels = Array.from({ length: years }, (_, i) => String(currentYear - (years - 1 - i)));
  const hours = new Array(years).fill(0);
  const volunteerSets = new Array(years).fill(0).map(() => new Set<string>());

  logs.forEach((log) => {
    const userId = resolveLogVolunteerId(log, lookup);
    if (!userId || !lookup.allowed.has(userId)) return;
    const status = String(log.approve || 'pending').toLowerCase();
    if (status !== 'approved' && status !== 'accepted' && status !== 'verified') return;
    const date = normalizeDateValue(log.date);
    if (!date) return;
    const year = date.getFullYear();
    const index = year - (currentYear - (years - 1));
    if (index < 0 || index >= years) return;
    const loggedHours = parseFloat(String(log.hours_contributed ?? log.hours ?? 0)) || 0;
    hours[index] += loggedHours;
    volunteerSets[index].add(userId);
  });

  const volunteersCount = volunteerSets.map((set) => set.size);
  return buildSeries(yearLabels, volunteersCount, hours);
};
