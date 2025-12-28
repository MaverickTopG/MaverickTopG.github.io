// /src/screens/VolunteerDashboard.js
import React, { useState, useEffect, useMemo, useContext, useRef, useCallback, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, Modal, TextInput,
  ActivityIndicator, FlatList, Alert, ScrollView, StatusBar,
  Animated, Easing, Platform,
} from 'react-native';
import {
  TrashSimple,
  Plus,
  QrCode,
  SignOut,
  CaretLeft,
  CaretRight,
  SlidersHorizontal,
  CalendarDots,
  Info,
  DownloadSimple,
  X,
  Building,
  ShieldCheck,
  ClockCounterClockwise,
} from 'phosphor-react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

/* --- Excel Export --- */
import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';
import { AuthContext } from '../../auth/AuthContext';
import { db, functions } from '../../auth/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  deleteDoc,
  onSnapshot,
  setDoc,
  limit,
  orderBy,
  serverTimestamp,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../toaststyle';
import Reanimated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing as ReanimatedEasing,
  cancelAnimation,
} from 'react-native-reanimated';

/* --- Camera (QR Scanner) --- */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { withHaptics } from '../../utils/haptics';

/* ─── Layout helpers ───────────────────────────────────────────── */
const { width, height } = Dimensions.get('window');
const wp = (p) => (width * p) / 100;
const hp = (p) => (height * p) / 100;
const CHART_HEIGHT = hp(22);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COLUMN_WIDTH = 5;
const COLORS = ['#CBC3E3', '#FFB6C1', '#BBF1F1', '#FFFFED'];
const SENTENCES = [
  'Every hour counts.',
  'Small acts, big impact.',
  'Volunteer. Inspire.',
  'Serve your community.',
  'Kindness is contagious.',
  'Give time, gain purpose.',
  'Show up. Give back.',
  'Hands that help.',
  'Make a difference.',
  'Impact starts with you.',
  'Lead with heart.',
  'Community first.',
  'Moments that matter.',
  'Together we thrive.',
  'Help where you can.',
  'Service in action.',
  'Lift others up.',
  'Your time matters.',
  'Build a better day.',
  'Neighbors helping neighbors.',
  'Share your skills.',
  'Compassion in motion.',
  'Every step forward.',
  'Be the change today.',
];
const SCHEDULE_ACCENTS = ['#4C3BCF', '#D946A0', '#1890A8', '#F59E0B'];
const ORG_CARD_COLORS = ['#4C3BCF', '#D946A0', '#1890A8', '#F59E0B', '#EC4899', '#8B5CF6'];
// Source: AmeriCorps, "Volunteering in America" (2023) — U.S. volunteers average 52 hours annually.
const AVERAGE_YEARLY_VOLUNTEER_HOURS = 52;
const AVERAGE_MONTHLY_VOLUNTEER_HOURS = AVERAGE_YEARLY_VOLUNTEER_HOURS / 12;
const AVERAGE_WEEKLY_VOLUNTEER_HOURS = AVERAGE_YEARLY_VOLUNTEER_HOURS / 52;
const DONATION_RATE = 28.27; // Independent Sector, 2024
const SCANNER_FRAME_SIZE = Math.min(wp(76), hp(48));
const HERO_HEADER_SIDE_WIDTH = wp(9) * 2 + wp(2);
// Default open index (50% based on current snapPoints array)
const SHEET_DEFAULT_INDEX = 0;
const SHEET_MEDIUM_INDEX = 0;
const SHEET_FULL_INDEX = 0;
const SHEET_AUTO_CLOSE_THRESHOLD = 0;

const RainColumn = memo(({ x, screenHeight, columnIndex, active }) => {
  const translateY = useSharedValue(-500);
  const sentenceIndex = columnIndex % SENTENCES.length;
  const sentence = SENTENCES[sentenceIndex];
  const columnColor = useMemo(
    () => COLORS[sentenceIndex % COLORS.length],
    [sentenceIndex]
  );

  const columnText = useMemo(() => {
    let fullText = '';
    for (let i = 0; i < 80; i += 1) {
      fullText += sentence[i % sentence.length] || ' ';
      fullText += '\n';
    }
    return fullText;
  }, [sentence]);

  const duration = useMemo(() => (4000 + Math.random() * 4000) * 1.5, []);
  const delay = useMemo(() => Math.random() * 5000, []);

  useEffect(() => {
    if (!active) {
      cancelAnimation(translateY);
      translateY.value = -500;
      return;
    }
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(screenHeight + 200, {
          duration,
          easing: ReanimatedEasing.linear,
        }),
        -1,
        false
      )
    );
    return () => cancelAnimation(translateY);
  }, [active, delay, duration, screenHeight, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Reanimated.View style={[styles.rainColumn, { left: x }, animatedStyle]}>
      <Text allowFontScaling={false} style={[styles.rainText, { color: columnColor }]}>
        {columnText}
      </Text>
    </Reanimated.View>
  );
});
const BAR_ANIM_DURATION = 420;
const BAR_ANIM_STAGGER = 25;
const HERO_ANIM_DURATION = 420;
const CHART_FADE_DURATION = 360;
const HEATMAP_CELL_DURATION = 280;
const PRIMARY_EASING = Easing.bezier(0.22, 0.61, 0.36, 1);
const PERSONAL_OPTION = '__PERSONAL__';
const LOGS_COLLECTION = 'volunteer_logs';
const MANUAL_LOOKUP_DEBOUNCE_MS = 150;
const MIN_ACCESS_CODE_LEN = 3;

function parseSnapPointPercent(point) {
  if (typeof point === 'string') {
    const numeric = Number.parseFloat(point.replace('%', ''));
    return Number.isNaN(numeric) ? null : numeric;
  }
  if (typeof point === 'number') {
    if (!Number.isFinite(point)) return null;
    return point <= 1 ? point * 100 : point;
  }
  return null;
}

function shouldAutoCloseSheet(snapPoints, index, threshold = SHEET_AUTO_CLOSE_THRESHOLD) {
  if (!Array.isArray(snapPoints)) return false;
  if (index == null || index < 0 || index >= snapPoints.length) return false;
  const percent = parseSnapPointPercent(snapPoints[index]);
  return percent != null && percent <= threshold;
}

function withAlpha(hex = '#000000', alpha = 1) {
  const clean = hex.replace('#', '');
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0');
  const intVal = Number.parseInt(normalized, 16);
  if (Number.isNaN(intVal)) return `rgba(0, 0, 0, ${Math.min(Math.max(alpha, 0), 1)})`;
  const r = (intVal >> 16) & 255;
  const g = (intVal >> 8) & 255;
  const b = intVal & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(Math.max(alpha, 0), 1)})`;
}

function formatHours(value = 0) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return rounded.replace(/\.0$/, '');
}

function formatCurrency(value = 0) {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ─── Date helpers ─────────────────────────────────────────────── */
function isoWeekdayIndex(date) {
  const d = new Date(date);
  let day = d.getDay();
  if (day === 0) day = 7;
  return day;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
function startOfWeek(date) {
  const d = startOfDay(date);
  const weekday = isoWeekdayIndex(d);
  d.setDate(d.getDate() - (weekday - 1));
  return d;
}
function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return endOfDay(d);
}
function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}
function getWeekDates(offset = 0) {
  const start = startOfWeek(new Date());
  start.setDate(start.getDate() - offset * 7);
  const week = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    week.push(d);
  }
  return week;
}
function formatMonthDay(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatMonthYear(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function formatRangeLabel(start, end) {
  const a = new Date(start);
  const b = new Date(end);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const sameYear = a.getFullYear() === b.getFullYear();
  const startLabel = a.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  const endLabel = b.toLocaleDateString('en-US', sameMonth
    ? { day: 'numeric' }
    : {
        month: 'short',
        day: 'numeric',
        year: sameYear ? undefined : 'numeric',
      });
  return `${startLabel} - ${endLabel}`;
}
function getMonthStructure(offset = 0) {
  const now = new Date();
  const firstDay = startOfMonth(new Date(now.getFullYear(), now.getMonth() - offset, 1));
  const rawLast = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  const lastDay = endOfDay(rawLast);
  const totalDays = rawLast.getDate();
  const monthLabel = formatMonthYear(firstDay);
  const shortMonth = firstDay.toLocaleDateString('en-US', { month: 'short' });
  const weeks = [];
  let cursor = startOfWeek(firstDay);
  while (cursor <= lastDay) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const end = endOfDay(weekEnd);
    weeks.push({
      start: weekStart,
      end,
      display: formatRangeLabel(weekStart, end),
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return {
    firstDay,
    lastDay,
    totalDays,
    monthLabel,
    shortMonth,
    weeks,
  };
}
function formatMMDDYYYY(date) {
  const d = new Date(date);
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const yyyy = d.getFullYear();
  return `${m}/${dd}/${yyyy}`;
}
function formatTimeHHMMAMPM() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = hours.toString().padStart(2, '0');
  return `${hoursStr}:${minutes} ${ampm}`;
}
/** Fallback parse for "M/D/YYYY" + "HH:MM AM/PM" -> ms */
function parseMDYTime(dateStr, timeStr) {
  if (!dateStr) return 0;
  const [m, d, y] = dateStr.split('/').map((n) => parseInt(n, 10));
  let h = 0, min = 0;
  if (timeStr) {
    const [hhmm, ampmRaw] = timeStr.split(' ');
    const [hh, mm] = (hhmm || '').split(':').map((n) => parseInt(n, 10));
    const ampm = (ampmRaw || '').toUpperCase();
    h = (hh || 0) % 12;
    if (ampm === 'PM') h += 12;
    min = mm || 0;
  }
  return new Date(y || 1970, (m || 1) - 1, d || 1, h, min, 0, 0).getTime();
}

function buildHeatmapForOffset(offset = 0, logs = [], filterLog = () => true) {
  const structure = getMonthStructure(offset);
  if (!structure) {
    return {
      weeks: [],
      monthLabel: '',
      shortMonth: '',
      totalMonthHours: 0,
      hasActivity: false,
      isoYear: new Date().getFullYear(),
      monthIndex: new Date().getMonth(),
    };
  }
  const { firstDay, lastDay, monthLabel, shortMonth } = structure;
  const calendarStart = startOfWeek(firstDay);
  const calendarEnd = endOfWeek(lastDay);
  const cursor = new Date(calendarStart);
  const cells = [];
  while (cursor <= calendarEnd) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const totals = {};
  logs.forEach((entry) => {
    if (!filterLog(entry)) return;
    const timestamp = parseMDYTime(entry.date, entry.time);
    if (!timestamp) return;
    const dayDate = startOfDay(new Date(timestamp));
    if (dayDate < firstDay || dayDate > lastDay) return;
    const key = formatDateKey(dayDate);
    totals[key] = (totals[key] || 0) + (Number(entry.hours) || 0);
  });

  const todayStart = startOfDay(new Date());
  const todayKey = formatDateKey(todayStart);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    const slice = cells.slice(i, i + 7).map((dateObj) => {
      const key = formatDateKey(dateObj);
      const inMonth = dateObj.getMonth() === firstDay.getMonth();
      const hours = inMonth ? (totals[key] || 0) : 0;
      const isPast = dateObj < todayStart;
      const isToday = key === todayKey;
      const appearance = resolveHeatmapAppearance(hours, { inMonth, isPast, isToday });
      return {
        key,
        label: dateObj.getDate(),
        inMonth,
        hours,
        isToday,
        backgroundColor: appearance.backgroundColor,
        textColor: appearance.textColor,
        borderColor: appearance.borderColor,
      };
    });
    weeks.push(slice);
  }

  const totalMonthHours = Object.values(totals).reduce((sum, val) => sum + val, 0);
  const hasActivity = Object.values(totals).some((val) => val > 0);
  return {
    weeks,
    monthLabel,
    shortMonth,
    totalMonthHours: Number(totalMonthHours.toFixed(1)),
    hasActivity,
    isoYear: firstDay.getFullYear(),
    monthIndex: firstDay.getMonth(),
  };
}

const QR_REQUIRED_FIELDS = ['v', 'orgAccessCode', 'adminId', 'nonce', 'issuedAt', 'exp', 'sig'];
const QR_SUPPORTED_VERSIONS = new Set([1]);
const QR_CLOCK_SKEW_SEC = 90;
const QR_EXP_GRACE_SEC = 5;
const QR_MAX_TTL_SEC = 100 * 365 * 24 * 60 * 60; // accept QR codes up to ~100 years
const SCAN_RESET_DELAY_MS = 1400;

const canonicalize = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
};

const normalizedCode = (value) => {
  if (value == null) return null;
  const text = String(value).trim().toUpperCase();
  return text || null;
};

const dedupeOrganizations = (orgs = []) => {
  const seenCodes = new Set();
  const seenIds = new Set();
  return orgs.filter((org) => {
    const code = normalizedCode(
      org?.access_code
      || org?.organizationCode
      || org?.org_access_code
      || org?.orgCode,
    );
    if (code) {
      if (seenCodes.has(code)) return false;
      seenCodes.add(code);
    }
    if (org?.id) {
      if (seenIds.has(org.id)) return false;
      seenIds.add(org.id);
    }
    return true;
  });
};

const isPersonalOrgRecord = (org = {}) => {
  const id = String(org?.id || '').toLowerCase();
  const code = String(org?.access_code || org?.organizationCode || org?.org_access_code || '').toLowerCase();
  const name = String(org?.name || '').toLowerCase();
  return org?.is_personal || id.startsWith('personal-') || code.startsWith('personal-') || name === 'personal';
};

const SCHOOL_PLAN_KEY = 'school';
const SCHOOL_PRODUCT_ID = 'prod_TUYT6k3Xq3JUOJ';

const normalizePlanKey = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
};

const collectProductIds = (source = {}) => {
  const ids = new Set();
  const candidates = [
    source.product_ids,
    source.productIds,
    source.products,
    source.subscription_product_ids,
    source.subscriptionProductIds,
    source.subscription_products,
    source.subscriptionProducts,
    source.items,
  ];
  candidates.forEach((candidate) => {
    if (!candidate) return;
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => {
        if (!item) return;
        if (typeof item === 'string') {
          ids.add(item);
        } else if (typeof item === 'object') {
          if (item.product) ids.add(item.product);
          if (item.product_id) ids.add(item.product_id);
          if (item.price?.product) ids.add(item.price.product);
        }
      });
    } else if (typeof candidate === 'string') {
      ids.add(candidate);
    }
  });
  if (source.metadata?.product_id) ids.add(source.metadata.product_id);
  if (source.metadata?.productId) ids.add(source.metadata.productId);
  return Array.from(ids).map((id) => String(id));
};

const isSchoolOrgRecord = (org = {}) => {
  const planKey = normalizePlanKey(
    org.planKey
    || org.plan_key
    || org.plan
    || org.planType
    || org.plan_type
    || org.subscription_plan_key
    || org.subscriptionPlanKey
    || org.metadata?.plan_key,
  );
  if (planKey === SCHOOL_PLAN_KEY) return true;

  const categoryKey = normalizePlanKey(
    org.category
    || org.type
    || org.org_type
    || org.organization_type,
  );
  if (categoryKey === SCHOOL_PLAN_KEY) return true;

  const sharePolicy = normalizePlanKey(
    org.default_share_policy
    || org.defaultSharePolicy
    || org.metadata?.default_share_policy,
  );
  if (sharePolicy === 'required') return true;

  const productIds = collectProductIds(org);
  return productIds.some((id) => String(id) === SCHOOL_PRODUCT_ID);
};

const toCanonicalJson = (payload) => JSON.stringify(canonicalize(payload));

const sha256Hex = (input = '') =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

const makeInitialScanFeedback = () => ({
  tone: 'neutral',
  title: 'Ready to scan',
  note: 'Align the QR within the frame to check in.',
  meta: [],
});

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'NL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveHeatmapAppearance(hours = 0, { inMonth = true, isPast = false, isToday = false } = {}) {
  if (!inMonth) {
    return {
      backgroundColor: 'rgba(248,250,252,0.75)',
      textColor: 'rgba(148,163,184,0.55)',
      borderColor: 'rgba(148,163,184,0.18)',
    };
  }
  const borderColor = isToday ? 'white' : 'transparent';
  if (hours <= 0) {
    return {
      backgroundColor: '#FFFFFF',
      textColor: isPast ? '#94A3B8' : '#94A3B8',
      borderColor,
    };
  }
  const normalized = Math.min(hours / 4.5, 1); // 0 -> 1 scale (approx 4.5h caps color)
  const alpha = 0.22 + normalized * 0.68; // keep visible even at small hours
  const backgroundColor = withAlpha('#000000', alpha);
  const textColor = normalized > 0.4 ? '#F8FAFC' : '#000000';
  return { backgroundColor, textColor, borderColor };
}

/** keep previous value */
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => { ref.current = value; });
  return ref.current;
}

/* ================= Component ================= */
export default function VolunteerDashboard() {
  const { user, userProfile, signOut } = useContext(AuthContext);
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  // ─── State ─────────────────────────────────────────────────────
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);   // first load / real-time wiring only
  const [isSaving, setIsSaving] = useState(false);         // saving a log should NOT blank charts

  const [organizations, setOrganizations] = useState([]);
  const personalOrgId = useMemo(() => (user?.uid ? `personal-${user.uid}` : null), [user?.uid]);
  const columns = useMemo(() => {
    const count = Math.ceil(width / COLUMN_WIDTH);
    return Array.from({ length: count });
  }, []);
  const personalOrg = useMemo(() => {
    if (!user?.uid || !personalOrgId) return null;
    return {
      id: personalOrgId,
      name: 'Personal',
      access_code: personalOrgId,
      organizationCode: personalOrgId,
      org_access_code: personalOrgId,
      linked_org_id: personalOrgId,
      organization_id: personalOrgId,
      default_auto_share: false,
      org_join_request_id: null,
      user_id: user.uid,
      status: 'active',
      is_personal: true,
    };
  }, [personalOrgId, user?.uid]);

  useEffect(() => {
    if (!personalOrgId || !user?.uid || !personalOrg) return;
    const upsertPersonalOrg = async () => {
      try {
        await setDoc(
          doc(db, 'users', personalOrgId),
          {
            user_id: user.uid,
            access_code: personalOrgId,
            organizationCode: personalOrgId,
            org_access_code: personalOrgId,
            linked_org_id: personalOrgId,
            organization_id: personalOrgId,
            name: 'Personal',
            status: 'active',
            is_personal: true,
            default_auto_share: false,
            default_share_status: null,
            default_share_policy: null,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        console.warn('Failed to upsert personal org', err);
      }
    };
    upsertPersonalOrg();
  }, [personalOrgId, personalOrg, user?.uid]);
  const defaultOrgCodes = useMemo(
    () =>
      organizations
        .filter((org) => org?.default_auto_share)
        .map((org) => normalizedCode(org.access_code))
        .filter(Boolean),
    [organizations],
  );

  const [modalStep, setModalStep] = useState(1);
  const [newSite, setNewSite] = useState('');
  const [newHours, setNewHours] = useState('');
  const [selectedOrganizations, setSelectedOrganizations] = useState([PERSONAL_OPTION]);

  const [tempDailyGoal, setTempDailyGoal] = useState('');
  const [dailyGoal, setDailyGoal] = useState(2);

  // ONLY access code when adding an org
  const [orgToDelete, setOrgToDelete] = useState(null);

  const [totalHours, setTotalHours] = useState(0);

  const sheetSnapPoints = useMemo(() => ['100%'], []);
  const deleteSheetSnapPoints = useMemo(() => ['100%'], []);
  const infoSheetSnapPoints = sheetSnapPoints;
  const addSheetRef = useRef(null);
  const goalSheetRef = useRef(null);
  const addOrgSheetRef = useRef(null);
  const historySheetRef = useRef(null);
  const yearScheduleSheetRef = useRef(null);
  const organizationInfoSheetRef = useRef(null);
  const deleteOrgSheetRef = useRef(null);
  const defaultShareSheetRef = useRef(null);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [defaultShareTargetOrg, setDefaultShareTargetOrg] = useState(null);
  const [defaultShareNotes, setDefaultShareNotes] = useState('');
  const [isSubmittingDefaultShareRequest, setIsSubmittingDefaultShareRequest] = useState(false);

  const handleHistorySheetChange = useCallback((index) => {
    if (shouldAutoCloseSheet(sheetSnapPoints, index)) {
      historySheetRef.current?.close?.();
    }
  }, [sheetSnapPoints]);

  const handleYearScheduleSheetChange = useCallback((index) => {
    if (shouldAutoCloseSheet(sheetSnapPoints, index)) {
      yearScheduleSheetRef.current?.close?.();
    }
  }, [sheetSnapPoints]);

  const handleAddSheetChange = useCallback((index) => {
    if (shouldAutoCloseSheet(sheetSnapPoints, index)) {
      addSheetRef.current?.close?.();
    }
  }, [sheetSnapPoints]);

  const handleOrgInfoSheetChange = useCallback((index) => {
    if (shouldAutoCloseSheet(infoSheetSnapPoints, index)) {
      organizationInfoSheetRef.current?.close?.();
    }
  }, [infoSheetSnapPoints]);

  const handleAddOrgSheetChange = useCallback((index) => {
    if (shouldAutoCloseSheet(sheetSnapPoints, index)) {
      addOrgSheetRef.current?.close?.();
    }
  }, [sheetSnapPoints]);

  const handleGoalSheetChange = useCallback((index) => {
    if (shouldAutoCloseSheet(sheetSnapPoints, index)) {
      goalSheetRef.current?.close?.();
    }
  }, [sheetSnapPoints]);

  const handleDeleteOrgSheetChange = useCallback((index) => {
    if (shouldAutoCloseSheet(deleteSheetSnapPoints, index)) {
      deleteOrgSheetRef.current?.close?.();
    }
  }, [deleteSheetSnapPoints]);

  const handleDefaultShareSheetChange = useCallback((index) => {
    if (shouldAutoCloseSheet(sheetSnapPoints, index)) {
      defaultShareSheetRef.current?.close?.();
    }
  }, [sheetSnapPoints]);

  // New state to flag when a refresh of dependent data is needed.
  const [dataSignature, setDataSignature] = useState(0);

  const [weekOffset, setWeekOffset] = useState(0);
  const [heatmapMonthOffset, setHeatmapMonthOffset] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [periodSummary, setPeriodSummary] = useState({
    label: '',
    title: '',
    subtitle: '',
    percent: 0,
    totalHours: 0,
    goalHours: 0,
    sessionCount: 0,
    segmentGoal: 1,
    activeOffset: 0,
    isWeekly: true,
    canGoForward: false,
    topSegmentLabel: '',
  });
  const [highlightIndex, setHighlightIndex] = useState(0);

  // animation values for charts + hero
  const MAX_BARS = 7;
  const barHeights = useRef(Array.from({ length: MAX_BARS }, () => new Animated.Value(0))).current;
  const heroAnim = useRef(new Animated.Value(1)).current;

  const activePeriod = 'Weekly';
  const activeOffset = weekOffset;
  const periodKey = `${activePeriod}-${activeOffset}`;
  const previousPeriodKey = usePrevious(periodKey);

  const [isSubmittingOrgRequest, setIsSubmittingOrgRequest] = useState(false);
  const [userOrgRequestRefs, setUserOrgRequestRefs] = useState({ codeSet: new Set(), idSet: new Set() });
  const [manualAccessCode, setManualAccessCode] = useState('');
  const manualCodeInputRef = useRef(null);
  const [manualResolveState, setManualResolveState] = useState('idle');
  const [manualResolveName, setManualResolveName] = useState(null);

  // cache: access_code -> { id, name, access_code }
  const orgCacheRef = useRef({});
  const defaultShareLockRef = useRef(new Set());
  const orgStatusNotifiedRef = useRef(new Map());
  const shareLogWithDefaultOrg = useCallback(
    async (log, code) => {
      const normalized = normalizedCode(code);
      if (!log?.id || !normalized) return;
      const shareKey = `${log.id}__${normalized}`;
      if (defaultShareLockRef.current.has(shareKey)) return;
      defaultShareLockRef.current.add(shareKey);
      try {
        const volunteerEmail = log.email || userProfile?.email || user?.email || null;
        const volunteerName =
          `${log.firstName || userProfile?.firstName || ''} ${log.lastName || userProfile?.lastName || ''}`
            .trim() || user?.displayName || volunteerEmail || 'Volunteer';
        const payload = {
          log_id: log.id,
          user_id: user?.uid || log.user_id || null,
          organization_code: normalized,
          hours: Number(log.hours) || 0,
          site: log.site || '',
          date: log.date || null,
          time: log.time || null,
          shared_from_default: true,
          volunteer_name: volunteerName,
          volunteer_email: volunteerEmail,
          created_at: serverTimestamp(),
        };
        await addDoc(collection(db, 'organization_shared_logs'), payload);
        await updateDoc(doc(db, LOGS_COLLECTION, log.id), {
          shared_default_codes: arrayUnion(normalized),
          last_default_share_at: serverTimestamp(),
        });
      } catch (err) {
        console.error('default share propagation error', err);
      } finally {
        defaultShareLockRef.current.delete(shareKey);
      }
    },
    [user?.uid, user?.email, user?.displayName, userProfile?.email, userProfile?.firstName, userProfile?.lastName],
  );
  // background blob anims
  const isMounted = useRef(true);
  useEffect(() => () => {
    isMounted.current = false;
    if (scanCooldownRef.current) clearTimeout(scanCooldownRef.current);
    if (addModalTimerRef.current) clearTimeout(addModalTimerRef.current);
    if (zoomFrameRef.current != null) {
      cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
    }
    if (manualResolveTimeoutRef.current) {
      clearTimeout(manualResolveTimeoutRef.current);
      manualResolveTimeoutRef.current = null;
    }
  }, []);

  /* ─── QR Scan state ──────────────────────────────────────────── */
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanFeedback, setScanFeedback] = useState(makeInitialScanFeedback());
  const isProcessingScanRef = useRef(false);
  const scanCooldownRef = useRef(null);
  const addModalTimerRef = useRef(null);
  const [qrPrefill, setQrPrefill] = useState(null); // stores verified QR context while user completes log
  const [scannerZoom, setScannerZoom] = useState(0);
  const scannerZoomRef = useRef(0);
  const pinchBaseZoomRef = useRef(0);
  const pendingZoomRef = useRef(0);
  const zoomFrameRef = useRef(null);
  const manualResolveTimeoutRef = useRef(null);
  const manualResolveSeqRef = useRef(0);
  const joinRequestStatusRef = useRef(new Map());
  const joinRequestsInitializedRef = useRef(false);

  const resetScanFeedback = useCallback(() => {
    setScanFeedback(makeInitialScanFeedback());
  }, []);

  const flushScheduledZoom = useCallback(() => {
    zoomFrameRef.current = null;
    setScannerZoom(pendingZoomRef.current);
  }, []);

  const scheduleZoomUpdate = useCallback(() => {
    if (zoomFrameRef.current != null) return;
    zoomFrameRef.current = requestAnimationFrame(flushScheduledZoom);
  }, [flushScheduledZoom]);

  const applyScannerZoom = useCallback((value, immediate = false) => {
    const clamped = Math.min(1, Math.max(0, value));
    const previous = scannerZoomRef.current;
    if (!immediate && Math.abs(clamped - previous) < 0.001) {
      return;
    }
    scannerZoomRef.current = clamped;
    pendingZoomRef.current = clamped;
    if (immediate) {
      if (zoomFrameRef.current != null) {
        cancelAnimationFrame(zoomFrameRef.current);
        zoomFrameRef.current = null;
      }
      setScannerZoom(clamped);
    } else {
      scheduleZoomUpdate();
    }
  }, [scheduleZoomUpdate]);

  const scannerPinchGesture = useMemo(() => Gesture.Pinch()
    .onStart(() => {
      pinchBaseZoomRef.current = scannerZoomRef.current;
    })
    .onUpdate((event) => {
      const proposedZoom = pinchBaseZoomRef.current + (event.scale - 1) * 0.35;
      runOnJS(applyScannerZoom)(proposedZoom, false);
    })
    .onEnd(() => {
      pinchBaseZoomRef.current = scannerZoomRef.current;
    })
    .onFinalize(() => {
      pinchBaseZoomRef.current = scannerZoomRef.current;
    }), [applyScannerZoom]);

  const releaseScanLock = useCallback(() => {
    if (scanCooldownRef.current) {
      clearTimeout(scanCooldownRef.current);
    }
    scanCooldownRef.current = setTimeout(() => {
      isProcessingScanRef.current = false;
      scanCooldownRef.current = null;
    }, SCAN_RESET_DELAY_MS);
  }, []);

  const closeScanner = useCallback(() => {
    setScanModalVisible(false);
    applyScannerZoom(0, true);
    resetScanFeedback();
    if (scanCooldownRef.current) {
      clearTimeout(scanCooldownRef.current);
      scanCooldownRef.current = null;
    }
    isProcessingScanRef.current = false;
  }, [applyScannerZoom, resetScanFeedback]);

  const openScanner = async () => {
    try {
      if (!cameraPermission || !cameraPermission.granted) {
        const { granted } = await requestCameraPermission();
        if (!granted) {
          return Alert.alert('Permission needed', 'Camera access is required to scan QR codes.');
        }
      }
      resetScanFeedback();
      if (scanCooldownRef.current) {
        clearTimeout(scanCooldownRef.current);
        scanCooldownRef.current = null;
      }
      isProcessingScanRef.current = false;
      applyScannerZoom(0, true);
      setScanModalVisible(true);
    } catch (e) {
      Alert.alert('Error', 'Could not open scanner.');
    }
  };

  const resetAddSheetState = useCallback(() => {
    if (addModalTimerRef.current) {
      clearTimeout(addModalTimerRef.current);
      addModalTimerRef.current = null;
    }
    setModalStep(1);
    setQrPrefill(null);
    setSelectedOrganizations([PERSONAL_OPTION]);
    setNewSite('');
    setNewHours('');
  }, []);

  const openAddModal = useCallback(() => {
    resetAddSheetState();
    setTimeout(() => {
      addSheetRef.current?.snapToIndex?.(SHEET_DEFAULT_INDEX);
    }, 0);
  }, [resetAddSheetState]);

  const openAddModalFromQr = useCallback((prefill) => {
    if (!prefill || !prefill.payload || !prefill.payload.orgAccessCode) {
      console.warn('Skipping QR prefill: payload missing essential fields.');
      return;
    }
    resetAddSheetState();
    setQrPrefill(prefill);
    setSelectedOrganizations([String(prefill.payload.orgAccessCode || '').toUpperCase()]);
    setModalStep(1);
    setNewSite('');
    setNewHours('');
    setTimeout(() => {
      addSheetRef.current?.snapToIndex?.(SHEET_DEFAULT_INDEX);
    }, 0);
  }, [resetAddSheetState]);

  const closeAddModal = useCallback(() => {
    resetAddSheetState();
    addSheetRef.current?.close?.();
  }, [resetAddSheetState]);

  const handleForgetQrPrefill = useCallback(() => {
    if (!qrPrefill) return;
    Alert.alert(
      'Forget this check-in?',
      'This will remove the scanned organization from your draft. You will need to rescan the QR code if you want to submit the check-in later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            setQrPrefill(null);
    setSelectedOrganizations([PERSONAL_OPTION]);
            setModalStep(1);
            Toast.show({
              type: 'info',
              text1: 'Check-in cleared',
              text2: 'Rescan the QR code when you are ready to submit again.',
            });
          },
        },
      ],
    );
  }, [qrPrefill]);

  const resetAddOrgSheetState = useCallback(() => {
    setIsSubmittingOrgRequest(false);
    setManualAccessCode('');
    setManualResolveState('idle');
    setManualResolveName(null);
    if (manualResolveTimeoutRef.current) {
      clearTimeout(manualResolveTimeoutRef.current);
      manualResolveTimeoutRef.current = null;
    }
  }, []);

  const toggleOrganizationSelection = useCallback((code) => {
    const normalized = String(code || '').toUpperCase();
    if (!normalized) return;
    setSelectedOrganizations((prev) => {
      if (normalized === PERSONAL_OPTION) {
        return [PERSONAL_OPTION];
      }
      const withoutPersonal = prev.filter((value) => value !== PERSONAL_OPTION);
      if (prev.includes(normalized)) {
        return withoutPersonal.filter((value) => value !== normalized);
      }
      return [...withoutPersonal, normalized];
    });
  }, []);

  const clearOrganizationSelection = useCallback(() => {
    setSelectedOrganizations([PERSONAL_OPTION]);
  }, []);

  const shareDefaultsForFreshLog = useCallback(
    async (logId, payload) => {
      if (!defaultOrgCodes.length) return;
      const logEntry = {
        id: logId,
        site: payload.site,
        hours: Number(payload.hours_contributed) || 0,
        date: payload.date,
        time: payload.time,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        organization_id: payload.organization_id || null,
        approve: payload.approve || null,
      };
      for (const code of defaultOrgCodes) {
        await shareLogWithDefaultOrg(logEntry, code);
      }
    },
    [defaultOrgCodes, shareLogWithDefaultOrg],
  );
  const openAddOrgSheet = useCallback(() => {
    resetAddOrgSheetState();
    setTimeout(() => {
      addOrgSheetRef.current?.snapToIndex?.(SHEET_DEFAULT_INDEX);
    }, 0);
  }, [resetAddOrgSheetState]);

  const closeAddOrgSheet = useCallback(() => {
    addOrgSheetRef.current?.close?.();
    resetAddOrgSheetState();
  }, [resetAddOrgSheetState]);

  const openDeleteOrgSheet = useCallback((org) => {
    setOrgToDelete(org);
    setTimeout(() => {
      deleteOrgSheetRef.current?.snapToIndex?.(SHEET_DEFAULT_INDEX);
    }, 0);
  }, []);

  const closeDeleteOrgSheet = useCallback(() => {
    deleteOrgSheetRef.current?.close?.();
  }, []);

  const openDefaultShareSheet = useCallback((org) => {
    setDefaultShareTargetOrg(org);
    setDefaultShareNotes('');
    setTimeout(() => {
      defaultShareSheetRef.current?.snapToIndex?.(SHEET_MEDIUM_INDEX);
    }, 0);
  }, []);

  const closeDefaultShareSheet = useCallback(() => {
    defaultShareSheetRef.current?.close?.();
  }, []);

  const submitDefaultShareRequest = useCallback(async () => {
    if (isSubmittingDefaultShareRequest) return;
    if (!defaultShareTargetOrg?.id) return;
    const isSchool = isSchoolOrgRecord(defaultShareTargetOrg);
    if (isSchool) {
      Toast.show({
        type: 'info',
        text1: 'Request not needed',
        text2: 'This organization already receives your hours.',
      });
      closeDefaultShareSheet();
      return;
    }
    Toast.show({
      type: 'info',
      text1: 'Request unavailable',
      text2: 'Sharing requests are disabled for this organization.',
    });
    closeDefaultShareSheet();
    return;
    try {
      setIsSubmittingDefaultShareRequest(true);
      const org = defaultShareTargetOrg;
      let resolvedOrg = null;
      try {
        if (org.access_code) {
          resolvedOrg = await resolveOrgByCode(org.access_code);
        }
      } catch (err) {
        console.warn('resolveOrgByCode default share warning', err);
      }
      const adminCandidates = Array.isArray(resolvedOrg?.admin_uids) ? resolvedOrg.admin_uids : [];
      const recipientSet = new Set(adminCandidates.filter(Boolean).map((uid) => String(uid)));
      if (resolvedOrg?.owner_uid) recipientSet.add(String(resolvedOrg.owner_uid));

      const requestPayload = {
        user_id: user?.uid || null,
        user_email: userProfile?.email || user?.email || null,
        user_name: `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim()
          || user?.displayName
          || (userProfile?.email || user?.email || 'Volunteer'),
        org_id: resolvedOrg?.id || org.linked_org_id || org.id,
        org_name: org.name || resolvedOrg?.name || org.access_code,
        org_access_code: org.access_code || resolvedOrg?.access_code || null,
        status: 'pending',
        admin_recipient_ids: Array.from(recipientSet),
        message: defaultShareNotes.trim() || null,
        created_at: serverTimestamp(),
      };

      await addDoc(collection(db, 'default_share_requests'), requestPayload);
      await updateDoc(doc(db, 'users', org.id), {
        default_share_status: 'pending',
        default_share_requested_at: serverTimestamp(),
        default_share_rejection_reason: null,
        default_share_request_message: defaultShareNotes.trim() || null,
        default_auto_share: false,
      });

      Toast.show({
        type: 'info',
        text1: 'Approval requested',
        text2: `${org.name || 'Organization'} received your request.`,
      });
      closeDefaultShareSheet();
    } catch (err) {
      console.error('default share request error', err);
      Alert.alert('Request failed', err?.message || 'Could not send your request. Please try again.');
    } finally {
      setIsSubmittingDefaultShareRequest(false);
    }
  }, [
    closeDefaultShareSheet,
    defaultShareNotes,
    defaultShareTargetOrg,
    isSubmittingDefaultShareRequest,
    user?.displayName,
    user?.email,
    user?.uid,
    userProfile?.email,
    userProfile?.firstName,
    userProfile?.lastName,
    resolveOrgByCode,
  ]);

  const resetDeleteOrgSheetState = useCallback(() => {
    setOrgToDelete(null);
  }, []);

  const resetDefaultShareSheetState = useCallback(() => {
    setDefaultShareTargetOrg(null);
    setDefaultShareNotes('');
    setIsSubmittingDefaultShareRequest(false);
  }, []);

  const resetGoalSheetState = useCallback(() => {
    setTempDailyGoal('');
  }, []);

  const openGoalSheet = useCallback(() => {
    setTempDailyGoal(String(dailyGoal));
    setTimeout(() => {
      goalSheetRef.current?.snapToIndex?.(SHEET_MEDIUM_INDEX);
    }, 0);
  }, [dailyGoal]);

  const closeGoalSheet = useCallback(() => {
    goalSheetRef.current?.close?.();
    resetGoalSheetState();
  }, [resetGoalSheetState]);

  const openHistorySheet = useCallback(() => {
    setHistorySheetOpen(true);
    setTimeout(() => {
      historySheetRef.current?.snapToIndex?.(SHEET_FULL_INDEX);
    }, 0);
  }, []);

  const closeHistorySheet = useCallback(() => {
    setHistorySheetOpen(false);
    historySheetRef.current?.close?.();
  }, []);

  const openYearScheduleSheet = useCallback(() => {
    setTimeout(() => {
      yearScheduleSheetRef.current?.snapToIndex?.(SHEET_FULL_INDEX);
    }, 0);
  }, []);

  const closeYearScheduleSheet = useCallback(() => {
    yearScheduleSheetRef.current?.close?.();
  }, []);

  useEffect(() => {
    if (!scanModalVisible) return undefined;
    // ensure we reset any lingering scan feedback when reopened
    resetScanFeedback();
    return undefined;
  }, [scanModalVisible, resetScanFeedback]);

  /* ─── Firestore helpers ─────────────────────────────────────── */
  async function resolveOrgByCode(code) {
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) return null;
    const cached = orgCacheRef.current[cleanCode];
    const cachedHasRecipients = cached && Array.isArray(cached.admin_uids) && cached.admin_uids.length > 0;
    if (cached && cachedHasRecipients && cached.id) return cached;
    try {
      const userCollection = collection(db, 'users');
      const [byAccess, byOrgCode] = await Promise.all([
        getDocs(query(userCollection, where('access_code', '==', cleanCode), limit(1))),
        getDocs(query(userCollection, where('organizationCode', '==', cleanCode), limit(1))),
      ]);
      const snap = !byAccess.empty ? byAccess : byOrgCode;
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data() || {};

        const adminCandidates = Array.isArray(data.admin_uids)
          ? data.admin_uids
          : Array.isArray(data.admins)
            ? data.admins
            : Array.isArray(data.adminIds)
              ? data.adminIds
              : data.admin_uid
                ? [data.admin_uid]
                : data.org_admin_uid
                  ? [data.org_admin_uid]
                  : data.admin_user_ids
                    ? data.admin_user_ids
                    : [];
        const normalizedAdmins = adminCandidates.filter(Boolean).map((uid) => String(uid));
        const ownerCandidate = data.owner_uid
          || data.ownerUid
          || data.created_by
          || data.createdBy
          || data.org_owner_uid
          || data.orgOwnerUid
          || null;

        const rawCity = data.city ?? data.location_city ?? data.org_city ?? data.home_city ?? null;
        const rawState = data.state ?? data.location_state ?? data.org_state ?? data.home_state ?? null;
        const rawCountry = data.country ?? data.location_country ?? data.org_country ?? data.home_country ?? null;
        const rawRegion = data.region ?? data.area ?? null;
        let estimatedArea = null;
        const areaParts = [rawCity, rawState].filter(Boolean);
        if (areaParts.length) {
          estimatedArea = areaParts.join(', ');
        } else if (rawRegion) {
          estimatedArea = rawRegion;
        } else if (rawCountry) {
          estimatedArea = rawCountry;
        }

        const planKey = normalizePlanKey(
          data.planKey
          || data.plan_key
          || data.plan
          || data.planType
          || data.plan_type
          || data.subscription_plan_key
          || data.metadata?.plan_key,
        );
        const defaultSharePolicy = normalizePlanKey(
          data.default_share_policy
          || data.defaultSharePolicy
          || data.metadata?.default_share_policy,
        );
        const productIds = collectProductIds(data);

        const result = {
          id: data.linked_org_id || data.organizationCode || docSnap.id,
          linked_org_id: data.linked_org_id || null,
          name: data.name || data.org_name || null,
          access_code: cleanCode,
          admin_uids: normalizedAdmins,
          owner_uid: ownerCandidate ? String(ownerCandidate) : data.user_id ? String(data.user_id) : null,
          category: data.category ?? data.focus ?? data.type ?? null,
          planKey,
          default_share_policy: defaultSharePolicy || null,
          product_ids: productIds,
          city: rawCity ? String(rawCity) : null,
          state: rawState ? String(rawState) : null,
          country: rawCountry ? String(rawCountry) : null,
          region: rawRegion ? String(rawRegion) : null,
          estimatedArea: estimatedArea ? String(estimatedArea) : null,
        };
        orgCacheRef.current[cleanCode] = {
          ...(orgCacheRef.current[cleanCode] || {}),
          ...result,
        };
        return orgCacheRef.current[cleanCode];
      }
    } catch {
      // ignore and fall back to organizations lookup
    }

    try {
      const orgSnap = await getDocs(query(collection(db, 'organizations'), where('access_code', '==', cleanCode)));
      if (orgSnap.empty) return cached || null;
      const docSnap = orgSnap.docs[0];
      const data = { id: docSnap.id, ...docSnap.data() };

      const adminCandidates = Array.isArray(data.admin_uids)
        ? data.admin_uids
        : Array.isArray(data.admins)
          ? data.admins
          : Array.isArray(data.adminIds)
            ? data.adminIds
            : data.admin_uid
              ? [data.admin_uid]
              : data.org_admin_uid
                ? [data.org_admin_uid]
                : [];
      const normalizedAdmins = adminCandidates.filter(Boolean).map((uid) => String(uid));
      const ownerCandidate = data.owner_uid
        || data.ownerUid
        || data.created_by
        || data.createdBy
        || data.org_owner_uid
        || data.orgOwnerUid
        || null;

      const rawCity = data.city ?? data.location_city ?? data.org_city ?? data.home_city ?? null;
      const rawState = data.state ?? data.location_state ?? data.org_state ?? data.home_state ?? null;
      const rawCountry = data.country ?? data.location_country ?? data.org_country ?? data.home_country ?? null;
      const rawRegion = data.region ?? data.area ?? null;
      let estimatedArea = null;
      const areaParts = [rawCity, rawState].filter(Boolean);
      if (areaParts.length) {
        estimatedArea = areaParts.join(', ');
      } else if (rawRegion) {
        estimatedArea = rawRegion;
      } else if (rawCountry) {
        estimatedArea = rawCountry;
      }

      const planKey = normalizePlanKey(
        data.planKey
        || data.plan_key
        || data.plan
        || data.planType
        || data.plan_type
        || data.subscription_plan_key
        || data.metadata?.plan_key,
      );
      const defaultSharePolicy = normalizePlanKey(
        data.default_share_policy
        || data.defaultSharePolicy
        || data.metadata?.default_share_policy,
      );
      const productIds = collectProductIds(data);

      const result = {
        id: data.id,
        linked_org_id: data.id || null,
        name: data.name || data.org_name || null,
        access_code: cleanCode,
        admin_uids: normalizedAdmins,
        owner_uid: ownerCandidate ? String(ownerCandidate) : null,
        category: data.category ?? data.focus ?? data.type ?? null,
        planKey,
        default_share_policy: defaultSharePolicy || null,
        product_ids: productIds,
        city: rawCity ? String(rawCity) : null,
        state: rawState ? String(rawState) : null,
        country: rawCountry ? String(rawCountry) : null,
        region: rawRegion ? String(rawRegion) : null,
        estimatedArea: estimatedArea ? String(estimatedArea) : null,
      };
      orgCacheRef.current[cleanCode] = {
        ...(orgCacheRef.current[cleanCode] || {}),
        ...result,
      };
      return orgCacheRef.current[cleanCode];
    } catch {
      return cached || null;
    }
  }

  async function primeOrgCache(userOrgs = [], fetchedLogs = []) {
    const map = { ...orgCacheRef.current };
    userOrgs.forEach((o) => {
      if (o.access_code) {
        const code = String(o.access_code).toUpperCase();
        map[code] = {
          ...(map[code] || {}),
          id: o.linked_org_id || map[code]?.id || null,
          linked_org_id: o.linked_org_id || map[code]?.linked_org_id || null,
          name: o.name || map[code]?.name || null,
          planKey: o.planKey || o.plan_key || map[code]?.planKey || null,
          default_share_policy: o.default_share_policy || o.defaultSharePolicy || map[code]?.default_share_policy || null,
          category: o.category ?? map[code]?.category ?? null,
          access_code: code,
        };
      }
    });
    const ids = [...new Set(fetchedLogs.map(l => l.linked_org_id).filter(Boolean))];
    if (ids.length) {
      try {
        const orgsSnap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', ids.slice(0, 10))));
        orgsSnap.forEach(s => {
          const d = s.data() || {};
          const code = String(d.access_code || '').toUpperCase();
          if (!code) return;
          const adminCandidates = Array.isArray(d.admin_uids)
            ? d.admin_uids
            : Array.isArray(d.admins)
              ? d.admins
              : Array.isArray(d.adminIds)
                ? d.adminIds
                : d.admin_uid
                  ? [d.admin_uid]
                  : d.org_admin_uid
                    ? [d.org_admin_uid]
                    : [];
          const normalizedAdmins = adminCandidates.filter(Boolean).map((uid) => String(uid));
          const ownerCandidate = d.owner_uid
            || d.ownerUid
            || d.created_by
            || d.createdBy
            || d.org_owner_uid
            || d.orgOwnerUid
            || null;
          const rawCity = d.city ?? d.location_city ?? d.org_city ?? d.home_city ?? null;
          const rawState = d.state ?? d.location_state ?? d.org_state ?? d.home_state ?? null;
          const rawCountry = d.country ?? d.location_country ?? d.org_country ?? d.home_country ?? null;
          const rawRegion = d.region ?? d.area ?? null;
          let estimatedArea = null;
          const areaParts = [rawCity, rawState].filter(Boolean);
          if (areaParts.length) {
            estimatedArea = areaParts.join(', ');
          } else if (rawRegion) {
            estimatedArea = rawRegion;
          } else if (rawCountry) {
            estimatedArea = rawCountry;
          }

          map[code] = {
            ...(map[code] || {}),
            id: s.id,
            linked_org_id: s.id,
            name: d.name || d.org_name || map[code]?.name || null,
            access_code: code,
            admin_uids: normalizedAdmins,
            owner_uid: ownerCandidate ? String(ownerCandidate) : map[code]?.owner_uid || null,
            planKey: normalizePlanKey(
              d.planKey
              || d.plan_key
              || d.plan
              || d.planType
              || d.plan_type
              || d.subscription_plan_key
              || d.metadata?.plan_key
              || map[code]?.planKey
              || map[code]?.plan_key,
            ),
            default_share_policy: normalizePlanKey(
              d.default_share_policy
              || d.defaultSharePolicy
              || d.metadata?.default_share_policy
              || map[code]?.default_share_policy
              || map[code]?.defaultSharePolicy,
            ),
            product_ids: collectProductIds(d),
            category: d.category ?? d.focus ?? d.type ?? map[code]?.category ?? null,
            city: rawCity ? String(rawCity) : map[code]?.city || null,
            state: rawState ? String(rawState) : map[code]?.state || null,
            country: rawCountry ? String(rawCountry) : map[code]?.country || null,
            region: rawRegion ? String(rawRegion) : map[code]?.region || null,
            estimatedArea: estimatedArea ? String(estimatedArea) : map[code]?.estimatedArea || null,
          };
        });
      } catch {}
    }
    orgCacheRef.current = map;
  }

  const buildOrganizationState = useCallback((docSnap) => {
    const data = docSnap.data() || {};
    const code = normalizedCode(
      data.access_code
      || data.organizationCode
      || data.org_access_code
      || data.orgCode,
    );
    const cached = code ? orgCacheRef.current[code] : null;
    const planKey = normalizePlanKey(
      data.planKey
      || data.plan_key
      || data.plan
      || data.planType
      || data.plan_type
      || data.subscription_plan_key
      || cached?.planKey
      || cached?.plan_key
      || cached?.plan,
    );
    const defaultSharePolicy = normalizePlanKey(
      data.default_share_policy
      || data.defaultSharePolicy
      || cached?.default_share_policy
      || cached?.defaultSharePolicy,
    );
    const joinRequestId = data.org_join_request_id
      || data.join_request_id
      || data.joinRequestId
      || null;
    const category = data.category ?? data.focus ?? data.type ?? data.org_type ?? cached?.category ?? cached?.type ?? null;
    const productIds = [
      ...collectProductIds(data),
      ...collectProductIds(cached || {}),
    ];
    const isSchool = isSchoolOrgRecord({
      planKey,
      plan_key: planKey,
      category,
      default_share_policy: defaultSharePolicy,
      product_ids: productIds,
    });

    return {
      id: docSnap.id,
      name: data.name || cached?.name || null,
      access_code: code || data.access_code || null,
      linked_org_id: data.linked_org_id || cached?.linked_org_id || null,
      // School orgs mandate sharing; others stay manual.
      default_auto_share: isSchool,
      default_share_status: isSchool ? 'approved' : data.default_share_status || null,
      default_share_rejection_reason: data.default_share_rejection_reason || null,
      default_share_requested_at: data.default_share_requested_at || null,
      planKey,
      default_share_policy: isSchool ? 'required' : defaultSharePolicy || null,
      category: category || null,
      isSchool,
      org_join_request_id: joinRequestId,
    };
  }, []);

  const assertQrPayload = (payload) => {
    QR_REQUIRED_FIELDS.forEach((field) => {
      const value = payload[field];
      if (value === undefined || value === null || value === '') {
        throw new Error(`QR code is missing "${field}".`);
      }
    });

    if (!QR_SUPPORTED_VERSIONS.has(Number(payload.v))) {
      throw new Error('This QR version is not supported. Please update the app.');
    }

    if (typeof payload.orgAccessCode !== 'string' || payload.orgAccessCode.trim().length < 3) {
      throw new Error('Organization access code is invalid.');
    }
    if (typeof payload.adminId !== 'string' || payload.adminId.trim().length < 3) {
      throw new Error('Admin identifier is invalid.');
    }
    if (typeof payload.nonce !== 'string' || payload.nonce.trim().length < 8) {
      throw new Error('QR nonce is invalid.');
    }

    const issuedAt = Number(payload.issuedAt);
    const exp = Number(payload.exp);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(exp)) {
      throw new Error('QR timestamps are invalid.');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (exp <= nowSec - QR_EXP_GRACE_SEC) {
      throw new Error('QR expired — ask for a fresh code.');
    }
    if (issuedAt >= nowSec + QR_CLOCK_SKEW_SEC) {
      throw new Error('QR start time is ahead of your device clock.');
    }
    const ttl = exp - issuedAt;
    if (ttl <= 0 || ttl > QR_MAX_TTL_SEC) {
      throw new Error('QR validity window is not accepted.');
    }

    if (typeof payload.sig !== 'string' || payload.sig.trim().length < 32) {
      throw new Error('QR signature is invalid.');
    }
  };

  const normalizeQrPayload = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Unsupported QR payload.');
    }
    const normalized = {
      ...raw,
      v: Number(raw.v),
      orgAccessCode: String(raw.orgAccessCode || '').trim().toUpperCase(),
      adminId: String(raw.adminId || '').trim(),
      nonce: String(raw.nonce || '').trim(),
      issuedAt: Number(raw.issuedAt),
      exp: Number(raw.exp),
      sig: String(raw.sig || '').trim(),
    };
    assertQrPayload(normalized);
    return normalized;
  };

  const handleBarcodeScanned = async ({ data }) => {
    if (!data || isProcessingScanRef.current) return;
    isProcessingScanRef.current = true;
    setScanFeedback({
      tone: 'busy',
      title: 'Verifying QR…',
      note: 'Hold steady while we verify the admin signature.',
      meta: [],
    });

    try {
      const parsed = JSON.parse(data);
      const normalized = normalizeQrPayload(parsed);

      const { sig, ...unsignedPayload } = normalized;
      const normalizedPayload = {
        v: Number(unsignedPayload.v),
        orgAccessCode: String(unsignedPayload.orgAccessCode || '').trim().toUpperCase(),
        adminId: String(unsignedPayload.adminId || '').trim(),
        nonce: String(unsignedPayload.nonce || '').trim(),
        issuedAt: Number(unsignedPayload.issuedAt),
        exp: Number(unsignedPayload.exp),
      };
      const payloadHash = await sha256Hex(toCanonicalJson(normalizedPayload));

      const callable = httpsCallable(functions, 'verifyAdminQr');
      const verification = await callable({
        payload: normalizedPayload,
        sig,
        payloadHash,
      });
      const verifyData = verification?.data || {};
      if (!verifyData.ok) {
        throw new Error(verifyData.message || 'Signature could not be verified.');
      }
      if (verifyData.adminValid === false) {
        throw new Error('This admin is not authorized for QR check-ins.');
      }
      const userId = user?.uid;
      if (!userId) {
        throw new Error('You must be signed in to check in.');
      }

      const orgDocId = verifyData.orgDocId || verifyData.linkedOrgId || null;
      const linkedOrgId = verifyData.linkedOrgId || verifyData.orgDocId || null;
      let orgName = verifyData.orgName || null;

      if (!orgName) {
        const resolved = await resolveOrgByCode(unsignedPayload.orgAccessCode);
        orgName = resolved?.name || null;
      } else {
        orgName = String(orgName);
      }

      const idemRoot = await sha256Hex(`${userId}|${orgDocId || unsignedPayload.orgAccessCode}|${unsignedPayload.nonce}`);

      const rootUsageSnap = await getDocs(query(
        collection(db, LOGS_COLLECTION),
        where('user_id', '==', userId),
        where('scan_idempotency_root', '==', idemRoot),
        limit(25),
      ));
      let reuseCount = rootUsageSnap.size;

      if (reuseCount === 0) {
        const legacySnap = await getDocs(query(
          collection(db, LOGS_COLLECTION),
          where('user_id', '==', userId),
          where('scan_idempotency', '==', idemRoot),
          limit(25),
        ));
        reuseCount = legacySnap.size;
      }

      const MAX_IDEMPOTENCY_RETRIES = 5;
      let idemKey = idemRoot;
      let retry = 0;
      let uniquePrepared = false;
      while (retry <= MAX_IDEMPOTENCY_RETRIES) {
        const dupSnap = await getDocs(query(
          collection(db, LOGS_COLLECTION),
          where('user_id', '==', userId),
          where('scan_idempotency', '==', idemKey),
          limit(1),
        ));
        if (dupSnap.empty) {
          uniquePrepared = true;
          break;
        }
        retry += 1;
        idemKey = await sha256Hex(`${idemRoot}|${Date.now()}|${retry}`);
      }

      if (!uniquePrepared) {
        throw new Error('We could not prepare a fresh check-in. Please try again.');
      }

      const checkInContext = {
        payload: unsignedPayload,
        sig,
        payloadHash,
        orgDocId,
        orgName,
        linkedOrgId,
        idemKey,
        idemRoot,
        reuseCount,
      };

      const feedbackMeta = [
        {
          icon: 'business-outline',
          text: orgName || unsignedPayload.orgAccessCode,
        },
      ];
      if (reuseCount > 0) {
        feedbackMeta.push({
          icon: 'refresh-outline',
          text: `You have checked in with this code ${reuseCount} time${reuseCount > 1 ? 's' : ''} before.`,
        });
      }

      setScanFeedback({
        tone: 'success',
        title: orgName || unsignedPayload.orgAccessCode,
        note: 'Opening the log entry to capture your details.',
        meta: feedbackMeta,
      });

      Toast.show({
        type: 'success',
        text1: 'QR verified',
        text2: 'Add your hours to finish the check-in.',
      });

      closeScanner();
      if (addModalTimerRef.current) {
        clearTimeout(addModalTimerRef.current);
      }
      addModalTimerRef.current = setTimeout(() => {
        if (!isMounted.current) return;
        openAddModalFromQr(checkInContext);
        addModalTimerRef.current = null;
      }, 180);
    } catch (error) {
      console.error('QR verification failed:', error);
      const firebaseCode = error?.code;
      let message = error?.message || 'We could not verify that QR.';
      if (firebaseCode === 'functions/unavailable') {
        message = 'Verification service is unavailable. Check your connection and try again.';
      } else if (firebaseCode === 'functions/not-found') {
        message = 'QR verification service is not configured yet. Ask your admin to deploy it.';
      } else if (firebaseCode === 'functions/unauthenticated') {
        message = 'You need to sign in again to scan QR codes.';
      } else if (typeof message === 'string') {
        if (/unexpected token/i.test(message)) {
          message = 'This QR is not recognized by NexoLink.';
        } else if (/network/i.test(message)) {
          message = 'Unable to reach the server. Please check your internet connection.';
        }
      }
      setScanFeedback({
        tone: 'error',
        title: 'Scan failed',
        note: message,
        meta: [],
      });
      Toast.show({
        type: 'error',
        text1: 'Scan failed',
        text2: message,
      });
    } finally {
      releaseScanLock();
    }
  };

  /* ─── Fetch on focus (NO orderBy → no index needed) ─────────── */
  useEffect(() => {
    if (!user) {
      navigation.navigate('Inital');
      return;
    }

    let unsubscribeLogs = () => {};
    (async () => {
      const initialOrgs = await fetchOrganizations();
      if (!isMounted.current) return;

      // Avoid composite index: only equality filter, sort locally.
      const qLogs = query(collection(db, LOGS_COLLECTION), where('user_id', '==', user.uid));
      unsubscribeLogs = onSnapshot(
        qLogs,
        async (snap) => {
      const arr = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        arr.push({
          id: docSnap.id,
          site: data.site,
          hours: Number(data.hours_contributed ?? data.hours) || 0,
          hours_contributed: data.hours_contributed ?? data.hours ?? null,
          date: data.date,
          time: data.time,
          user_id: data.user_id || user.uid,
          organization_id: data.organization_id || null,
          organization_name: data.organization_name || null,
          linked_org_id: data.linked_org_id || null,
          created_at: data.created_at ?? null,
          approve: data.approve || null,
          email: data.email || null,
          firstName: data.firstName || null,
          lastName: data.lastName || null,
          shared_default_codes: Array.isArray(data.shared_default_codes) ? data.shared_default_codes : [],
          is_personal: !!data.is_personal || (personalOrgId && data.organization_id === personalOrgId),
        });
      });

          // Resolve org names lazily
          const pendingCodes = new Set();
          const pendingIds = new Set();
          arr.forEach((e) => {
            if (!e.organization_name && e.organization_id) {
              const c = String(e.organization_id).toUpperCase();
              if (!orgCacheRef.current[c]) pendingCodes.add(c);
            }
            if (!e.organization_name && e.linked_org_id) pendingIds.add(e.linked_org_id);
          });
          if (pendingCodes.size) await Promise.all(Array.from(pendingCodes).map(resolveOrgByCode));
          if (pendingIds.size) {
            try {
              const os = await getDocs(query(collection(db, 'users'), where('__name__', 'in', Array.from(pendingIds).slice(0, 10))));
              os.forEach(s => {
                const d = s.data();
                const code = (d.access_code || '').toUpperCase();
                if (code) orgCacheRef.current[code] = { id: s.id, name: d.name || null, access_code: code };
              });
            } catch {}
          }

          // Hydrate names from cache
          const finalArr = arr.map((e) => {
            const code = e.organization_id ? String(e.organization_id).toUpperCase() : null;
            if (!e.organization_name && code && orgCacheRef.current[code]) {
              const c = orgCacheRef.current[code];
              return { ...e, organization_name: c.name || e.organization_name, linked_org_id: e.linked_org_id || c.id || null };
            }
            return e;
          });

          if (!isMounted.current) return;
          setLogs(finalArr);
          primeOrgCache(initialOrgs, finalArr).catch(() => {});
          setLoadingLogs(false);
        },
        (err) => {
          console.error('Error fetching logs:', err);
          if (isMounted.current) {
            Alert.alert('Error', 'Failed to load logs: ' + (err?.message || err));
            setLoadingLogs(false);
          }
        }
      );
    })();

    const qOrgs = query(collection(db, 'users'), where('user_id', '==', user.uid));
    const unsubscribeOrgs = onSnapshot(qOrgs, (snap) => {
      const orgs = [];
      snap.forEach((docSnap) => {
        orgs.push(buildOrganizationState(docSnap));
      });
      const dedupedOrgs = dedupeOrganizations(orgs).filter((org) => !isPersonalOrgRecord(org));
      if (isMounted.current) {
        setOrganizations(dedupedOrgs);
        primeOrgCache(dedupedOrgs, logs).catch(() => {});
      }
    }, (err) => {
      console.error('Error fetching organizations:', err);
      Alert.alert('Error', 'Failed to load organizations in real-time: ' + (err?.message || err));
    });

    return () => { unsubscribeLogs(); unsubscribeOrgs(); };
  }, [user, navigation]);

  async function fetchOrganizations() {
    try {
      const q = query(collection(db, 'users'), where('user_id', '==', user.uid));
      const snap = await getDocs(q);
      const orgs = [];
      snap.forEach((docSnap) => {
        orgs.push(buildOrganizationState(docSnap));
      });
      const dedupedOrgs = dedupeOrganizations(orgs).filter((org) => !isPersonalOrgRecord(org));
      if (!isMounted.current) return [];
      setOrganizations(dedupedOrgs);
      primeOrgCache(dedupedOrgs, logs).catch(() => {});
      return dedupedOrgs;
    } catch (err) {
      Alert.alert('Error', 'Failed to load organizations: ' + (err?.message || err));
      return [];
    }
  }

  /* ─── Add org (request flow) ─────────────────────────────────── */
  const isAcceptedJoinStatus = (status = '') => {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'accepted'
      || normalized === 'approved'
      || normalized === 'active'
      || normalized === 'connected'
      || normalized === 'granted'
      || normalized === 'confirmed'
      || normalized.startsWith('accept')
      || normalized.startsWith('approved');
  };

  const isDeclinedJoinStatus = (status = '') => {
    const normalized = String(status || '').toLowerCase();
    return ['rejected', 'declined', 'denied', 'canceled', 'cancelled'].some((token) => normalized.includes(token));
  };

  const loadUserOrgRequests = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const snap = await getDocs(query(
        collection(db, 'organization_join_requests'),
        where('user_id', '==', user.uid),
      ));
      if (!isMounted.current) return;
      const codeSet = new Set();
      const idSet = new Set();
      const accepted = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const status = String(data.status || 'pending').toLowerCase();
        const removedByUser = !!data.removed_by_user;
        const normalizedAccessCode = data.org_access_code
          ? String(data.org_access_code).toUpperCase()
          : data.access_code
            ? String(data.access_code).toUpperCase()
            : null;
        const normalizedOrgId = data.org_id
          || data.organization_id
          || data.linked_org_id
          || null;

        const isDeclined = isDeclinedJoinStatus(status);
        if (isDeclined || removedByUser) {
          return;
        }

        const isAccepted = isAcceptedJoinStatus(status);
        if (isAccepted) {
          accepted.push({
            docId: docSnap.id,
            data,
            code: normalizedAccessCode,
            linkedOrgId: normalizedOrgId ? String(normalizedOrgId) : null,
          });
          return;
        }

        if (normalizedAccessCode) codeSet.add(normalizedAccessCode);
        if (normalizedOrgId) idSet.add(String(normalizedOrgId));
      });
      setUserOrgRequestRefs({ codeSet, idSet });

      if (!isMounted.current) return;
      if (!accepted.length) return;

      const volunteerEmail = userProfile?.email || user.email || '';
      const volunteerFirstName = userProfile?.firstName || user.displayName?.split(' ')[0] || '';
      const volunteerLastName = userProfile?.lastName || user.displayName?.split(' ')[1] || '';
      const volunteerName = `${volunteerFirstName} ${volunteerLastName}`.trim()
        || user.displayName
        || (volunteerEmail ? volunteerEmail.split('@')[0] : '')
        || 'Volunteer';

      const existingSnap = await getDocs(
        query(collection(db, 'users'), where('user_id', '==', user.uid)),
      );
      const existingCodes = new Set();
      const existingLinkedIds = new Set();
      existingSnap.forEach((docSnap) => {
        const info = docSnap.data() || {};
        if (info.access_code) existingCodes.add(String(info.access_code).toUpperCase());
        if (info.organizationCode) existingCodes.add(String(info.organizationCode).toUpperCase());
        if (info.linked_org_id) existingLinkedIds.add(String(info.linked_org_id));
        existingLinkedIds.add(docSnap.id);
      });

      for (const req of accepted) {
        const { code, linkedOrgId, data } = req;
        const upperCode = code ? String(code).toUpperCase() : null;
        const normalizedLinkedId = linkedOrgId ? String(linkedOrgId) : null;

        if (upperCode && existingCodes.has(upperCode)) continue;
        if (normalizedLinkedId && existingLinkedIds.has(normalizedLinkedId)) continue;

        try {
          const resolved = upperCode ? await resolveOrgByCode(upperCode) : null;
          const finalCode = resolved?.access_code || upperCode || null;
          const finalCodeUpper = finalCode ? String(finalCode).toUpperCase() : null;
          const finalLinkedId = resolved?.linked_org_id
            || resolved?.id
            || normalizedLinkedId
            || null;
          if (!finalCode && !finalLinkedId) {
            continue;
          }
          const finalName = resolved?.name
            || data.org_name
            || data.orgName
            || data.organization_name
            || data.organizationName
            || finalCode
            || null;
          const finalPlanKey = normalizePlanKey(
            resolved?.planKey
            || resolved?.plan_key
            || resolved?.plan
            || data.plan_key
            || data.planKey,
          );
          const finalDefaultSharePolicy = normalizePlanKey(
            resolved?.default_share_policy
            || resolved?.defaultSharePolicy
            || data.default_share_policy
            || data.defaultSharePolicy,
          );
          const isSchoolOrg = isSchoolOrgRecord({
            planKey: finalPlanKey,
            plan_key: finalPlanKey,
            category: resolved?.category,
            default_share_policy: finalDefaultSharePolicy,
            product_ids: collectProductIds(resolved || {}),
          });

          const payload = {
            user_id: user.uid,
            role: 'volunteer',
            email: volunteerEmail,
            user_email: volunteerEmail,
            volunteer_email: volunteerEmail,
            firstName: volunteerFirstName,
            lastName: volunteerLastName,
            user_name: volunteerName,
            volunteer_name: volunteerName,
            name: finalName,
            access_code: finalCodeUpper,
            organizationCode: finalCodeUpper,
            organization_code: finalCodeUpper,
            org_code: finalCodeUpper,
            org_access_code: finalCodeUpper,
            linked_org_id: finalLinkedId,
            organization_id: finalLinkedId,
            org_id: finalLinkedId,
            org_name: finalName,
            org_join_request_id: req.docId,
            joined_via_request: true,
            joined_at: serverTimestamp(),
            createdAt: serverTimestamp(),
            status: 'active',
            planKey: finalPlanKey || null,
            plan_key: finalPlanKey || null,
            default_share_policy: finalDefaultSharePolicy || (isSchoolOrg ? 'required' : null),
            default_auto_share: isSchoolOrg,
            default_share_status: isSchoolOrg ? 'approved' : null,
          };

          await addDoc(collection(db, 'users'), payload);
          if (finalCode) existingCodes.add(String(finalCode).toUpperCase());
          if (finalLinkedId) existingLinkedIds.add(String(finalLinkedId));
        } catch (linkErr) {
          console.error('auto-link organization error', linkErr);
        }
      }
    } catch (err) {
      console.error('loadUserOrgRequests error', err);
    }
  }, [
    user?.uid,
    user?.email,
    user?.displayName,
    userProfile?.email,
    userProfile?.firstName,
    userProfile?.lastName,
  ]);

  useEffect(() => {
    if (!user?.uid) return;
    loadUserOrgRequests();
  }, [user?.uid, loadUserOrgRequests]);

  // Watch join requests in real-time so approvals/rejections toast instantly and orgs refresh
  useEffect(() => {
    if (!user?.uid) return undefined;

    const q = query(collection(db, 'organization_join_requests'), where('user_id', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const nextCodeSet = new Set();
        const nextIdSet = new Set();

        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const status = String(data.status || 'pending').toLowerCase();
          if (isDeclinedJoinStatus(status)) return;
          const normalizedAccessCode = data.org_access_code
            ? String(data.org_access_code).toUpperCase()
            : data.access_code
              ? String(data.access_code).toUpperCase()
              : null;
          const normalizedOrgId = data.org_id
            || data.organization_id
            || data.linked_org_id
            || null;
          if (normalizedAccessCode) nextCodeSet.add(normalizedAccessCode);
          if (normalizedOrgId) nextIdSet.add(String(normalizedOrgId));
        });
        setUserOrgRequestRefs({ codeSet: nextCodeSet, idSet: nextIdSet });

        if (!joinRequestsInitializedRef.current) {
          snap.docs.forEach((doc) => {
            const status = String(doc.data()?.status || 'pending').toLowerCase();
            joinRequestStatusRef.current.set(doc.id, status);
          });
          joinRequestsInitializedRef.current = true;
          return;
        }

        snap.docChanges().forEach((change) => {
          const data = change.doc.data() || {};
          const status = String(data.status || 'pending').toLowerCase();
          const prevStatus = joinRequestStatusRef.current.get(change.doc.id);
          joinRequestStatusRef.current.set(change.doc.id, status);

          if (prevStatus === status) return;

          const orgLabel = data.org_name
            || data.organization_name
            || data.org_access_code
            || data.access_code
            || 'Organization';

          if (isAcceptedJoinStatus(status)) {
            Toast.show({
              type: 'success',
              text1: 'You are in!',
              text2: `${orgLabel} approved your request.`,
            });
            loadUserOrgRequests(); // auto-link and refresh orgs
          } else if (isDeclinedJoinStatus(status)) {
            Toast.show({
              type: 'error',
              text1: 'Not accepted',
              text2: `${orgLabel} declined your request.`,
            });
          }
        });
      },
      (err) => {
        console.error('join requests realtime error', err);
      },
    );

    return () => unsubscribe();
  }, [user?.uid, loadUserOrgRequests]);

  const handleManualAccessCodeChange = (text) => {
    const code = String(text || '')
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 6);
    setManualAccessCode(code);
    setManualResolveName(null);
    if (manualResolveTimeoutRef.current) {
      clearTimeout(manualResolveTimeoutRef.current);
      manualResolveTimeoutRef.current = null;
    }
    if (!code || code.length < MIN_ACCESS_CODE_LEN) {
      setManualResolveState('idle');
      return;
    }
    setManualResolveState('searching');
    const seq = manualResolveSeqRef.current + 1;
    manualResolveSeqRef.current = seq;
    manualResolveTimeoutRef.current = setTimeout(async () => {
      const org = await resolveOrgByCode(code);
      if (!isMounted.current) return;
      if (manualResolveSeqRef.current !== seq) return;
      if (org) {
        setManualResolveState('found');
        setManualResolveName(org.name || code);
      } else {
        setManualResolveState('not_found');
      }
    }, MANUAL_LOOKUP_DEBOUNCE_MS);
  };

  const handleManualAccessSubmit = async () => {
    const code = manualAccessCode.trim().toUpperCase();
    if (!code) {
      return Toast.show({ type: 'error', text1: 'Missing code', text2: 'Enter an organization access code.' });
    }

    setIsSubmittingOrgRequest(true);
    setManualResolveState('searching');
    try {
      const central = await resolveOrgByCode(code);
      if (!central) {
        setManualResolveState('not_found');
        setManualResolveName(null);
        return Toast.show({ type: 'error', text1: 'Organization not found', text2: 'No organization matches that code.' });
      }

      const alreadyLinked = organizations.some(
        (existing) => existing.access_code === code || existing.linked_org_id === central.id,
      );
      if (alreadyLinked) {
        setManualResolveState('found');
        setManualResolveName(central.name || code);
        setIsSubmittingOrgRequest(false);
        return Toast.show({ type: 'info', text1: 'Already connected', text2: 'This organization is already linked to your account.' });
      }

      if (userOrgRequestRefs.codeSet.has(code) || userOrgRequestRefs.idSet.has(central.id)) {
        setManualResolveState('found');
        setManualResolveName(central.name || code);
        setIsSubmittingOrgRequest(false);
        return Toast.show({ type: 'info', text1: 'Request already sent', text2: 'You have a pending request with this organization.' });
      }

      const adminUids = Array.isArray(central.admin_uids) ? central.admin_uids : [];
      const recipientSet = new Set(adminUids.filter(Boolean).map((uid) => String(uid)));
      if (central.owner_uid) recipientSet.add(String(central.owner_uid));

      const volunteerEmail = userProfile?.email || user.email || '';
      const volunteerFirstName = userProfile?.firstName || user.displayName?.split(' ')[0] || '';
      const volunteerLastName = userProfile?.lastName || user.displayName?.split(' ')[1] || '';
      const sharedUserName = `${volunteerFirstName} ${volunteerLastName}`.trim()
        || user.displayName
        || (volunteerEmail ? volunteerEmail.split('@')[0] : '')
        || 'Volunteer';

      await addDoc(collection(db, 'organization_join_requests'), {
        user_id: user.uid,
        user_email: volunteerEmail,
        user_name: sharedUserName,
        firstName: volunteerFirstName,
        lastName: volunteerLastName,
        volunteer_email: volunteerEmail,
        volunteer_name: sharedUserName,
        org_id: central.id,
        org_name: central.name || code,
        org_access_code: code,
        organization_code: code,
        org_owner_uid: central.owner_uid || null,
        org_admin_uids: adminUids,
        org_recipient_user_ids: Array.from(recipientSet),
        status: 'pending',
        created_at: serverTimestamp(),
      });

      setManualResolveState('found');
      setManualResolveName(central.name || code);

      await loadUserOrgRequests();
      Toast.show({
        type: 'success',
        text1: 'Request sent',
        text2: `${central.name || code} will review your request shortly.`,
      });
      closeAddOrgSheet();
    } catch (err) {
      setManualResolveState('error');
      Alert.alert('Error', 'Could not add organization: ' + (err?.message || err));
    } finally {
      if (isMounted.current) {
        setIsSubmittingOrgRequest(false);
      }
    }
  };

  const manualActionDisabled = !manualAccessCode.trim()
    || isSubmittingOrgRequest
    || manualResolveState === 'searching';
  const manualActionLabel = 'Send Request';

  const openOrganizationInfoSheet = useCallback(() => {
    setTimeout(() => {
      organizationInfoSheetRef.current?.snapToIndex?.(SHEET_DEFAULT_INDEX);
    }, 0);
  }, []);

  const closeOrganizationInfoSheet = useCallback(() => {
    organizationInfoSheetRef.current?.close?.();
  }, []);

  const handleOrganizationInfoPress = useCallback(() => {
    openOrganizationInfoSheet();
  }, [openOrganizationInfoSheet]);

  const handleDeleteOrganization = async () => {
    if (!orgToDelete?.id) {
      return Toast.show({ type: 'error', text1: 'Missing organization', text2: 'Select an organization to delete.' });
    }
    const accessCode = normalizedCode(orgToDelete?.access_code || orgToDelete?.organizationCode || orgToDelete?.org_access_code);
    const linkedOrgId = orgToDelete?.linked_org_id || orgToDelete?.organization_id || orgToDelete?.org_id || null;
    try {
      // remove any membership documents for this org (some users may have duplicates)
      const userOrgSnap = await getDocs(query(collection(db, 'users'), where('user_id', '==', user.uid)));
      const membershipDeletes = [];
      userOrgSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const docCode = normalizedCode(data.access_code || data.organizationCode || data.org_access_code);
        const docLinkedId = data.linked_org_id || data.org_id || data.organization_id || null;
        const matchesCode = accessCode && docCode && docCode === accessCode;
        const matchesLinked = linkedOrgId && docLinkedId && String(docLinkedId) === String(linkedOrgId);
        if (matchesCode || matchesLinked || docSnap.id === orgToDelete.id) {
          membershipDeletes.push(deleteDoc(docSnap.ref));
        }
      });
      if (membershipDeletes.length) {
        await Promise.allSettled(membershipDeletes);
      } else {
        // fallback: at least attempt to delete the targeted doc id
        await deleteDoc(doc(db, 'users', orgToDelete.id));
      }

      // mark any related join requests so they do not auto-relink on refresh
      try {
        const joinSnap = await getDocs(query(
          collection(db, 'organization_join_requests'),
          where('user_id', '==', user.uid),
        ));
        const joinUpdates = [];
        joinSnap.forEach((reqDoc) => {
          const data = reqDoc.data() || {};
          const reqCode = normalizedCode(data.org_access_code || data.access_code);
          const reqLinked = data.org_id || data.organization_id || data.linked_org_id || null;
          const matchesCode = accessCode && reqCode && reqCode === accessCode;
          const matchesLinked = linkedOrgId && reqLinked && String(reqLinked) === String(linkedOrgId);
          if (matchesCode || matchesLinked) {
            joinUpdates.push(updateDoc(reqDoc.ref, {
              status: 'revoked',
              removed_by_user: true,
              removed_at: serverTimestamp(),
            }));
          }
        });
        if (joinUpdates.length) {
          await Promise.allSettled(joinUpdates);
        }
      } catch (subErr) {
        console.warn('Failed to mark related join requests removed', subErr);
      }

      setOrganizations((prev) => dedupeOrganizations(prev.filter((org) => org.id !== orgToDelete.id)));
      setSelectedOrganizations((prev) => {
        const removedCode = normalizedCode(orgToDelete?.access_code);
        if (!removedCode) return prev;
        return prev.filter((code) => normalizedCode(code) !== removedCode);
      });
      closeDeleteOrgSheet();
      await fetchOrganizations();
      Toast.show({ type: 'success', text1: 'Deleted', text2: 'Organization removed.' });
    } catch (err) {
      Alert.alert('Error', 'Could not delete organization: ' + (err?.message || err));
    }
  };

  /* ─── Add session flow ───────────────────────────────────────── */
  const handleNext = () => {
    if (!newSite.trim() || !newHours.trim())
      return Toast.show({ type: 'error', text1: 'Missing Fields', text2: 'Enter both task and hours.' });
    const hrs = parseFloat(newHours);
    if (isNaN(hrs) || hrs <= 0)
      return Toast.show({ type: 'error', text1: 'Invalid Hours', text2: 'Enter a positive number.' });
    if (hrs > 24)
      return Toast.show({ type: 'error', text1: 'Invalid Hours', text2: 'You cannot log more than 24 hours in a single day.' });
    if (!qrPrefill && !selectedOrganizations.length)
      return Toast.show({ type: 'error', text1: 'Select organization', text2: 'Choose at least one organization before continuing.' });

    setModalStep(2);
  };

  const handleSaveSession = async () => {
    const hrs = parseFloat(newHours);
    const now = new Date();
    const currentQrPrefill = qrPrefill;
    const volunteerEmail = userProfile?.email || user.email || '';
    const volunteerFirstName = userProfile?.firstName || user.displayName?.split(' ')[0] || '';
    const volunteerLastName = userProfile?.lastName || user.displayName?.split(' ')[1] || '';
    const volunteerName = `${volunteerFirstName} ${volunteerLastName}`.trim()
      || user.displayName
      || (volunteerEmail ? volunteerEmail.split('@')[0] : '')
      || 'Volunteer';

    const normalizedSelections = Array.from(new Set(
      (selectedOrganizations || [])
        .map((code) => String(code || '').trim().toUpperCase())
        .filter(Boolean),
    ));
    const manualOrgCodes = normalizedSelections.filter((code) => code !== PERSONAL_OPTION);
    const isPersonalSelected = normalizedSelections.includes(PERSONAL_OPTION);

    const sessionBase = {
      user_id: user.uid,
      volunteer_id: user.uid,
      email: volunteerEmail,
      user_email: volunteerEmail,
      volunteer_email: volunteerEmail,
      firstName: volunteerFirstName,
      lastName: volunteerLastName,
      volunteer_name: volunteerName,
      user_name: volunteerName,
      role: 'volunteer',
      site: newSite.trim(),
      hours_contributed: hrs,
      date: formatMMDDYYYY(now),
      time: formatTimeHHMMAMPM(),
      shared_default_codes: [],
      source: 'manual',
      created_at: serverTimestamp(),
    };

    setIsSaving(true);
    try {
      if (currentQrPrefill) {
        const qrOrgCode = String(currentQrPrefill.payload.orgAccessCode || '').trim().toUpperCase();
        const dupSnap = await getDocs(query(
          collection(db, LOGS_COLLECTION),
          where('user_id', '==', user.uid),
          where('scan_idempotency', '==', currentQrPrefill.idemKey),
          limit(1),
        ));
        if (!dupSnap.empty) {
          Toast.show({
            type: 'info',
            text1: 'Already recorded',
            text2: 'This QR check-in is already on your log.',
          });
          closeAddModal();
          return;
        }

        const qrSession = {
          ...sessionBase,
          organization_id: qrOrgCode,
          organization_code: qrOrgCode,
          org_code: qrOrgCode,
          org_access_code: qrOrgCode,
          organization_name: currentQrPrefill.orgName || null,
          linked_org_id: currentQrPrefill.linkedOrgId || null,
          approve: currentQrPrefill.orgName
            ? `Awaiting ${currentQrPrefill.orgName}'s approval`
            : 'Awaiting approval',
          source: 'qr',
          tag: 'checkedIn',
          scan_idempotency: currentQrPrefill.idemKey,
          scan_idempotency_root: currentQrPrefill.idemRoot || currentQrPrefill.idemKey,
          scan_reuse_count: currentQrPrefill.reuseCount || 0,
          scan_nonce: currentQrPrefill.payload.nonce,
          scan_payload_hash: currentQrPrefill.payloadHash,
          scan_payload_version: currentQrPrefill.payload.v,
          created_at: serverTimestamp(),
        };

        await addDoc(collection(db, LOGS_COLLECTION), qrSession);
        Toast.show({
          type: 'success',
          text1: 'Check-in submitted',
          text2: `Sent to ${currentQrPrefill.orgName || qrOrgCode} for approval.`,
        });
        closeAddModal();
        return;
      }

      if (!manualOrgCodes.length) {
        if (!isPersonalSelected) {
          Toast.show({
            type: 'error',
            text1: 'Missing organization',
            text2: 'Select an organization to submit your hours.',
          });
          return;
        }
        const personalSession = {
          ...sessionBase,
          organization_id: personalOrgId,
          organization_code: personalOrgId,
          org_code: personalOrgId,
          org_access_code: personalOrgId,
          linked_org_id: personalOrgId,
          organization_name: 'Personal',
          is_personal: true,
          approve: 'Self Logged',
          source: 'personal',
        };
        const docRef = await addDoc(collection(db, LOGS_COLLECTION), personalSession);
        if (defaultOrgCodes.length) {
          await shareDefaultsForFreshLog(docRef.id, personalSession);
        }
        Toast.show({
          type: 'success',
          text1: 'Session logged',
          text2: `${hrs}h saved`,
        });
        closeAddModal();
        return;
      }

      const sentOrgNames = [];
      for (const code of manualOrgCodes) {
        const orgSession = {
          ...sessionBase,
          organization_id: code,
          organization_code: code,
          org_code: code,
          org_access_code: code,
        };
        let orgName = code;
        try {
          const central = await resolveOrgByCode(code);
          if (central) {
            orgSession.organization_name = central.name || null;
            orgSession.linked_org_id = central.id || null;
            orgName = central.name || code;
          }
        } catch (error) {
          console.warn('resolveOrgByCode failed', error);
        }
        orgSession.organization_name = orgName;
        orgSession.approve = `Awaiting ${orgName}'s approval`;
        await addDoc(collection(db, LOGS_COLLECTION), orgSession);
        sentOrgNames.push(orgName);
      }

      Toast.show({
        type: 'info',
        text1: sentOrgNames.length > 1 ? 'Requests sent' : 'Request sent',
        text2:
          sentOrgNames.length > 1
            ? `Pending approval from ${sentOrgNames.join(', ')}.`
            : `Pending approval from ${sentOrgNames[0]}.`,
      });

      closeAddModal();
    } catch (err) {
      Alert.alert('Error', 'Could not save session: ' + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  /* ─── Derived aggregates (robust + consistent) ───────────────── */
  const prevLogs = usePrevious(logs);
  const prevOrganizations = usePrevious(organizations);
  const isApprovedOrPersonal = useCallback((log) => {
    if (log?.is_personal) return true;
    if (!log?.organization_id) return false;
    if (personalOrgId && log.organization_id === personalOrgId) return true;
    const status = String(log.approve || '').toLowerCase();
    if (status === 'accepted' || status === 'approved' || status.startsWith('approved')) return true;
    return false;
  }, [personalOrgId]);
  const isDeclinedLog = useCallback((log) => {
    const status = String(log?.approve || '').toLowerCase();
    if (log?.is_personal) return false;
    if (personalOrgId && log?.organization_id === personalOrgId) return false;
    if (!status) return false;
    return ['declined', 'rejected', 'denied', 'canceled', 'cancelled'].some((token) =>
      status.includes(token),
    );
  }, [personalOrgId]);
  const syncDefaultOrgShares = useCallback(
    async (orgCode) => {
      const normalized = normalizedCode(orgCode);
      if (!normalized) return;
      const eligibleLogs = logs.filter((log) => {
        if (!isApprovedOrPersonal(log)) return false;
        if (isDeclinedLog(log)) return false;
        const alreadyShared = new Set(
          Array.isArray(log.shared_default_codes)
            ? log.shared_default_codes.map((code) => normalizedCode(code)).filter(Boolean)
            : [],
        );
        if (alreadyShared.has(normalized)) return false;
        const logOrgCode = normalizedCode(log.organization_id);
        if (logOrgCode && logOrgCode === normalized) return false;
        return true;
      });
      for (const log of eligibleLogs) {
        await shareLogWithDefaultOrg(log, normalized);
      }
    },
    [logs, isApprovedOrPersonal, isDeclinedLog, shareLogWithDefaultOrg],
  );
  const handleToggleDefaultOrg = useCallback(
    async (org, nextValue) => {
      if (!org?.id) return;
      const isSchool = isSchoolOrgRecord(org);
      if (!isSchool) {
        try {
          if (org.default_auto_share) {
            await updateDoc(doc(db, 'users', org.id), {
              default_auto_share: false,
              default_share_status: 'revoked',
              default_share_requested_at: null,
              default_share_request_message: null,
              default_share_rejection_reason: null,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.warn('default share disable for non-school org failed', err);
        }
        Toast.show({
          type: 'info',
          text1: 'Sharing locked to manual',
          text2: 'Non-school organizations stay manual.',
        });
        return;
      }

      if (!nextValue && org.default_auto_share) {
        Toast.show({
          type: 'info',
          text1: 'School sharing stays on',
          text2: `${org.name || 'This organization'} requires sharing.`,
        });
        return;
      }

      try {
        if (!org.default_auto_share) {
          await updateDoc(doc(db, 'users', org.id), {
            default_auto_share: true,
            default_share_status: 'approved',
            default_share_policy: 'required',
            updatedAt: serverTimestamp(),
          });
          await syncDefaultOrgShares(org.access_code);
          Toast.show({
            type: 'success',
            text1: 'School sharing enabled',
            text2: `${org.name || 'Organization'} will now receive your logs by default.`,
          });
        } else {
          Toast.show({
            type: 'info',
            text1: 'Sharing already on',
            text2: 'School organizations receive your logs by default.',
          });
        }
      } catch (err) {
        console.error('toggle default org error', err);
        Toast.show({
          type: 'error',
          text1: 'Unable to update',
          text2: err?.message || 'Please try again.',
        });
      }
    },
    [syncDefaultOrgShares],
  );

  useEffect(() => {
    const offset = weekOffset;

    let segments = [];
    let label = '';
    let title = '';
    let subtitle = '';
    let totalDays = 7;
    let segmentGoal = Math.max(dailyGoal, 1);

    const weekDates = getWeekDates(offset);
    totalDays = weekDates.length;
    segmentGoal = Math.max(dailyGoal, 1);
    segments = weekDates.map((date, idx) => ({
      label: DAYS[idx],
      displayLabel: `${DAYS[idx]} ${date.getDate()}`,
      subLabel: date.getDate().toString().padStart(2, '0'),
      start: startOfDay(date),
      end: endOfDay(date),
    }));
    label = formatRangeLabel(weekDates[0], weekDates[weekDates.length - 1]);
    title = `Week of ${formatMonthDay(weekDates[0])}`;
    subtitle = offset === 0 ? '' : `${offset} ${offset === 1 ? 'week' : 'weeks'} ago`;

    const bounds = segments.map((seg) => ({
      ...seg,
      startMs: seg.start.getTime(),
      endMs: seg.end.getTime(),
    }));
    const totals = bounds.map(() => 0);
    let periodStartMs = bounds[0]?.startMs ?? 0;
    let periodEndMs = bounds[bounds.length - 1]?.endMs ?? 0;

    let periodTotal = 0;
    let sessionCount = 0;

    logs.forEach((entry) => {
      const timestamp = parseMDYTime(entry.date, entry.time);
      if (!timestamp) return;
      if (timestamp < periodStartMs || timestamp > periodEndMs) return;
      if (!isApprovedOrPersonal(entry)) return;

      const hrs = Number(entry.hours_contributed ?? entry.hours) || 0;
      periodTotal += hrs;
      sessionCount += 1;

      const idx = bounds.findIndex((seg) => timestamp >= seg.startMs && timestamp <= seg.endMs);
      if (idx !== -1) totals[idx] += hrs;
    });

    const highlightIdx = totals.length ? totals.indexOf(Math.max(...totals)) : 0;
    const chartPoints = bounds.map((seg, idx) => {
      const value = totals[idx];
      const segmentMs = Math.max(seg.endMs - seg.startMs, 0);
      const segmentDays = Math.floor(segmentMs / MS_PER_DAY) + 1;
      const goalHours = dailyGoal > 0 ? dailyGoal * segmentDays : dailyGoal;
      return {
        label: seg.label,
        displayLabel: seg.displayLabel,
        subLabel: seg.subLabel,
        value,
        goal: goalHours,
      };
    });

    const maxTotal = totals.length ? Math.max(...totals) : 0;
    const maxSegmentGoal = chartPoints.reduce((acc, point) => Math.max(acc, point.goal || 0), 0);
    const chartCeilingValue = Math.max(maxTotal, maxSegmentGoal, 1);

    const periodGoal = Math.max(dailyGoal, 0) * Math.max(totalDays, 1);
    const percent = periodGoal > 0 ? Math.round(Math.min((periodTotal / periodGoal) * 100, 999)) : 0;

    chartPoints.forEach((point, idx) => {
      const val = point.value;
      const goalHours = point.goal || 0;
      const effectiveGoal = goalHours > 0 ? goalHours : chartCeilingValue;
      let ratio = effectiveGoal > 0 ? val / effectiveGoal : 0;
      if (goalHours > 0 && val >= goalHours) {
        ratio = 1; // hard-cap to full when daily goal met or exceeded
      } else {
        ratio = Math.min(ratio, 1);
      }
      const target = val > 0 ? Math.max(ratio * CHART_HEIGHT, hp(1.5)) : 0;
      barHeights[idx].stopAnimation();
      Animated.timing(barHeights[idx], {
        toValue: target,
        duration: BAR_ANIM_DURATION,
        delay: idx * BAR_ANIM_STAGGER,
        easing: PRIMARY_EASING,
        useNativeDriver: false,
      }).start();
    });
    for (let i = chartPoints.length; i < MAX_BARS; i += 1) {
      barHeights[i].stopAnimation();
      Animated.timing(barHeights[i], {
        toValue: 0,
        duration: BAR_ANIM_DURATION,
        delay: i * BAR_ANIM_STAGGER,
        easing: PRIMARY_EASING,
        useNativeDriver: false,
      }).start();
    }

    setChartData(chartPoints);
    setHighlightIndex(highlightIdx);
    setPeriodSummary({
      label,
      title,
      subtitle,
      percent,
      totalHours: Number(periodTotal.toFixed(1)),
      goalHours: periodGoal,
      sessionCount,
      segmentGoal,
      chartCeiling: chartCeilingValue,
      activeOffset: offset,
      isWeekly: true,
      canGoForward: offset > 0,
      topSegmentLabel: chartPoints[highlightIdx]?.displayLabel || chartPoints[highlightIdx]?.label || '',
    });

    const grandTotal = logs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
    setTotalHours(Number(grandTotal.toFixed(1)));
  }, [logs, weekOffset, dailyGoal, barHeights, MAX_BARS, isApprovedOrPersonal, dataSignature]);

  useEffect(() => {
    if (!previousPeriodKey || previousPeriodKey === periodKey) return;
    heroAnim.stopAnimation(() => {
      heroAnim.setValue(0);
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: HERO_ANIM_DURATION,
        easing: PRIMARY_EASING,
        useNativeDriver: true,
      }).start();
    });
  }, [heroAnim, periodKey, previousPeriodKey]);

  // notify on edits/deletes
  useEffect(() => {
    if (!prevLogs) return;
    const current = new Map(logs.map(l => [l.id, l]));
    const prev = new Map(prevLogs.map(l => [l.id, l]));
    prev.forEach((p, id) => {
      const n = current.get(id);
      if (!n) {
        if (p.organization_name) {
          Alert.alert('Log Update', `"${p.organization_name}" deleted your "${p.site}" log on "${p.date}".`);
        }
        setDataSignature(s => s + 1); // Trigger recalculation on delete
      } else if (p.approve !== n.approve) {
        if (n.approve === 'denied') {
          Alert.alert('Log Denied', `Your log for "${n.site}" on ${n.date} was denied by ${n.organization_name || 'the organization'}.`);
        } else if (n.approve === 'accepted') {
          Toast.show({ type: 'success', text1: 'Log Approved!', text2: `Your log for "${n.site}" is now approved.` }); 
          setDataSignature(s => s + 1); // Trigger recalculation on approval
        }
      } else if (p.hours !== n.hours) {
        if (n.approve === 'accepted' || (typeof n.approve === 'string' && n.approve.toLowerCase().startsWith('approved by'))) {
          setDataSignature(s => s + 1);
        }
        if (p.hours !== n.hours) {
          Toast.show({ type: 'info', text1: 'Log updated', text2: `${p.hours}h → ${n.hours}h` });
        }
      }
    });
  }, [logs, prevLogs]);

  useEffect(() => {
    if (!organizations.length) return;

    // Seed notifications on initial load to avoid duplicate toasts.
    if (!prevOrganizations || prevOrganizations.length === 0) {
      organizations.forEach((org) => {
        if (org.id && org.default_share_status) {
          orgStatusNotifiedRef.current.set(org.id, org.default_share_status);
        }
      });
      return;
    }

    const prevMap = new Map(prevOrganizations.map((org) => [org.id, org]));

    organizations.forEach((org) => {
      const previousStatus = prevMap.get(org.id)?.default_share_status || null;
      const currentStatus = org.default_share_status || null;
      const notifiedStatus = orgStatusNotifiedRef.current.get(org.id) || null;

      if (previousStatus === currentStatus) {
        if (currentStatus && notifiedStatus == null) {
          orgStatusNotifiedRef.current.set(org.id, currentStatus);
        }
        return;
      }

      if (currentStatus === 'rejected' && notifiedStatus !== 'rejected') {
        Toast.show({
          type: 'error',
          text1: 'Request rejected',
          text2: `${org.name || 'Organization'} declined your sharing request.`,
        });
        orgStatusNotifiedRef.current.set(org.id, 'rejected');
      } else if (currentStatus === 'approved' && notifiedStatus !== 'approved') {
        Toast.show({
          type: 'success',
          text1: 'Request approved',
          text2: `${org.name || 'Organization'} approved your sharing request.`,
        });
        orgStatusNotifiedRef.current.set(org.id, 'approved');
      } else if (currentStatus) {
        orgStatusNotifiedRef.current.set(org.id, currentStatus);
      }
    });
  }, [organizations, prevOrganizations]);

  /* ─── Export to Excel ────────────────────────────────────────── */
  const handleExport = async () => {
    if (logs.length === 0) {
      Toast.show({ type: 'info', text1: 'No Data', text2: 'There are no logs to export.' });
      return;
    }
    Toast.show({ type: 'info', text1: 'Generating Report...', text2: 'Please wait a moment.' });
    try {
      const dataForSheet = logs.map(log => ({
        Task: log.site,
        Hours: Number(log.hours) || 0,
        Date: log.date,
        Time: log.time,
        Organization: log.organization_name
          || (personalOrgId && log.organization_id === personalOrgId ? 'Personal' : null)
          || (log.organization_id ? `Code: ${String(log.organization_id).toUpperCase()}` : 'Unassigned'),
        'Approval Status': log.is_personal ? 'Self Logged' : (log.approve || 'Pending'),
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataForSheet);
      ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Volunteer Hours');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const reportFile = new File(Paths.cache, 'volunteer_report.xlsx');
      try {
        reportFile.create({ overwrite: true });
      } catch (createErr) {
        console.warn('Report file create warning:', createErr?.message || createErr);
      }
      reportFile.write(wbout, { encoding: 'base64' });
      await Sharing.shareAsync(reportFile.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Share Your Volunteer Report',
      });
    } catch (error) {
      console.error('Export failed:', error);
      Toast.show({ type: 'error', text1: 'Export Failed', text2: 'Could not generate the report.' });
    }
  };

  /* ─── Sorting (client side) ──────────────────────────────────── */
  const sortedLogs = useMemo(() => {
    const key = (e) => {
      if (e?.created_at) {
        if (typeof e.created_at === 'number') return e.created_at;
        if (typeof e.created_at?.toMillis === 'function') return e.created_at.toMillis();
        if (typeof e.created_at?.toDate === 'function') return e.created_at.toDate().getTime();
        if (typeof e.created_at === 'string' || e.created_at instanceof Date) {
          const t = new Date(e.created_at).getTime();
          if (!Number.isNaN(t)) return t;
        }
      }
      if (e?.date instanceof Date) return e.date.getTime();
      if (typeof e?.date === 'number') return e.date;
      if (typeof e?.date === 'string') {
        const iso = Date.parse(e.date);
        if (!Number.isNaN(iso)) return iso;
      }
      return parseMDYTime(e?.date, e?.time);
    };
    return logs.slice().sort((a, b) => key(b) - key(a));
  }, [logs]);
  const displayedLogs = useMemo(
    () => sortedLogs.slice(0, 3),
    [sortedLogs]
  );

  const highlightPoint = chartData[highlightIndex] || null;
  const highlightLabel = periodSummary.topSegmentLabel || highlightPoint?.displayLabel || highlightPoint?.label || 'No standout yet';
  const chartCeiling = useMemo(
    () => Math.max(periodSummary.chartCeiling || 1, ...chartData.map((point) => Number(point.value) || 0), 1),
    [periodSummary.chartCeiling, chartData],
  );
  const highlightValue = Math.max(Number(highlightPoint?.value || 0), 0);
  const heroTranslate = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const heroScale = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });

  const comparisonStats = useMemo(() => {
    const goal = Math.max(periodSummary.goalHours || (dailyGoal * 7), 1);
    const userHours = Math.max(Number(periodSummary.totalHours || 0), 0);
    const baseline = AVERAGE_WEEKLY_VOLUNTEER_HOURS;
    const averageHours = Math.min(goal, baseline);
    const userPercent = Math.min(Math.round((userHours / goal) * 100), 150);
    const averagePercent = Math.min(Math.round((averageHours / goal) * 100), 150);
    const delta = userHours - averageHours;
    return {
      goal,
      userHours: Number(userHours.toFixed(1)),
      averageHours: Number(averageHours.toFixed(1)),
      userPercent,
      averagePercent,
      delta: Number(delta.toFixed(1)),
    };
  }, [periodSummary, dailyGoal]);
  const comparisonWidthUser = Math.min(comparisonStats.userPercent, 100);
  const comparisonWidthAverage = Math.min(comparisonStats.averagePercent, 100);
  const chartTransition = useRef(new Animated.Value(1)).current;
  const normalizedDailyGoal = Number(dailyGoal || 0);
  const formattedDailyGoal = normalizedDailyGoal % 1 === 0
    ? normalizedDailyGoal.toFixed(0)
    : normalizedDailyGoal.toFixed(1);
  const comparisonDeltaText = comparisonStats.delta >= 0
    ? `You're ahead by ${comparisonStats.delta}h this week.`
    : `You're ${Math.abs(comparisonStats.delta)}h behind the average—schedule a session to catch up.`;
  const organizationCards = useMemo(() => organizations.map((org) => ({ ...org })), [organizations]);
  const BASE_WEEKLY_WIDTH = 0.72;
  const BASE_MONTHLY_WIDTH = 0.62;
  const WEEKLY_BAR_WIDTH = Math.min(1, BASE_WEEKLY_WIDTH * 1.35);
  const MONTHLY_BAR_WIDTH = Math.min(1, BASE_MONTHLY_WIDTH * 1.2);
  const lifetimeDonation = useMemo(() => Number(totalHours || 0) * DONATION_RATE, [totalHours]);
  const handleBarPress = useCallback((index) => {
    setHighlightIndex(index);
  }, []);
  useEffect(() => {
    if (!defaultOrgCodes.length || !logs.length) return;
    logs.forEach((log) => {
      if (!isApprovedOrPersonal(log)) return;
      if (isDeclinedLog(log)) return;
      const alreadySharedSet = new Set(
        Array.isArray(log.shared_default_codes)
          ? log.shared_default_codes.map((code) => normalizedCode(code)).filter(Boolean)
          : [],
      );
      const logOrgCode = normalizedCode(log.organization_id);
      defaultOrgCodes.forEach((code) => {
        if (!code || alreadySharedSet.has(code)) return;
        if (logOrgCode && logOrgCode === code) return;
        shareLogWithDefaultOrg(log, code);
      });
    });
  }, [defaultOrgCodes, logs, isApprovedOrPersonal, isDeclinedLog, shareLogWithDefaultOrg]);

  const heatmapCalendar = useMemo(
    () => buildHeatmapForOffset(heatmapMonthOffset, logs, isApprovedOrPersonal),
    [heatmapMonthOffset, logs, isApprovedOrPersonal],
  );

  const yearScheduleData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, offset) => {
      const monthData = buildHeatmapForOffset(offset, logs, isApprovedOrPersonal);
      const key = `${monthData.isoYear}-${String(monthData.monthIndex + 1).padStart(2, '0')}`;
      return {
        key,
        label: monthData.monthLabel || '—',
        totalHours: monthData.totalMonthHours || 0,
        weeks: monthData.weeks || [],
        hasActivity: monthData.hasActivity,
        isoYear: monthData.isoYear,
      };
    });
    const hasActivity = months.some((month) => month.hasActivity);
    const currentYear = months[0]?.isoYear || new Date().getFullYear();
    return { year: currentYear, months, hasActivity };
  }, [logs, isApprovedOrPersonal]);

  const heroHoursLabel = `${formatHours(periodSummary.totalHours || 0)}h`;
  const heroSessionsLabel = `${Math.round(periodSummary.sessionCount || 0)}`;
  const highlightHoursLabel = `${formatHours(highlightValue)}h`;
  const comparisonUserHoursLabel = `${formatHours(comparisonStats.userHours || 0)}h`;
  const comparisonAverageHoursLabel = `${formatHours(comparisonStats.averageHours || 0)}h`;
  const comparisonUserPercentLabel = `${Math.round(comparisonStats.userPercent || 0)}%`;
  const comparisonAveragePercentLabel = `${Math.round(comparisonStats.averagePercent || 0)}%`;
  const donationAmountLabel = formatCurrency(lifetimeDonation || 0);
  const donationHoursLabel = `${formatHours(totalHours || 0)} hours logged`;

  useEffect(() => {
    chartTransition.stopAnimation(() => {
      chartTransition.setValue(0.82);
      Animated.timing(chartTransition, {
        toValue: 1,
        duration: CHART_FADE_DURATION,
        easing: PRIMARY_EASING,
        useNativeDriver: true,
      }).start();
    });
  }, [weekOffset, chartData.length, chartTransition]);

  useEffect(() => {
    if (highlightIndex >= chartData.length) {
      setHighlightIndex(0);
    }
  }, [chartData.length, highlightIndex]);

  const handlePreviousPeriod = useCallback(() => {
    setWeekOffset((offset) => offset + 1);
    setHighlightIndex(0);
  }, []);

  const handleNextPeriod = useCallback(() => {
    setWeekOffset((offset) => Math.max(0, offset - 1));
    setHighlightIndex(0);
  }, []);

  const heatmapCanGoForward = heatmapMonthOffset > 0;
  const handleHeatmapPrevious = useCallback(() => {
    setHeatmapMonthOffset((offset) => offset + 1);
  }, []);
  const handleHeatmapNext = useCallback(() => {
    setHeatmapMonthOffset((offset) => Math.max(0, offset - 1));
  }, []);

  /* ─── Renderers ──────────────────────────────────────────────── */
  const HeatmapDayCell = ({ day }) => {
    const scale = useRef(new Animated.Value(0.92)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(day.isToday ? 0.6 : 0)).current;
    const pulseLoopRef = useRef(null);

    useEffect(() => {
      scale.setValue(0.92);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: HEATMAP_CELL_DURATION,
          easing: PRIMARY_EASING,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: HEATMAP_CELL_DURATION + 80,
          easing: PRIMARY_EASING,
          useNativeDriver: true,
        }),
      ]).start();
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
        pulseLoopRef.current = null;
      }
      if (day.isToday) {
        pulse.setValue(0.65);
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, {
              toValue: 0.25,
              duration: 800,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(pulse, {
              toValue: 0.7,
              duration: 800,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        );
        pulseLoopRef.current = loop;
        loop.start();
      } else {
        pulse.setValue(0);
      }
      return () => {
        if (pulseLoopRef.current) {
          pulseLoopRef.current.stop();
          pulseLoopRef.current = null;
        }
      };
    }, [day.key, day.hours, day.backgroundColor, day.isToday, opacity, pulse, scale]);

    const animatedStyle = { transform: [{ scale }], opacity };
    return (
      <Animated.View
        style={[
          styles.heatmapCell,
          { backgroundColor: day.backgroundColor, borderColor: day.borderColor || 'transparent' },
          !day.inMonth && styles.heatmapCellMuted,
          day.isToday && styles.heatmapCellToday,
          animatedStyle,
        ]}
        accessible
        accessibilityLabel={`${day.inMonth ? `Day ${day.label}` : 'Outside current month'}. ${day.hours ? `${formatHours(day.hours)} hours logged` : 'No hours logged'}`}
      >
        {day.isToday ? (
          <Animated.View style={[styles.heatmapTodayPulse, { opacity: pulse }]} pointerEvents="none" />
        ) : null}
        <Text style={[styles.heatmapCellLabel, { color: day.textColor }]}>
          {day.inMonth ? day.label : ''}
        </Text>
        {day.inMonth && day.hours > 0 ? (
          <Text style={[styles.heatmapCellHours, { color: day.textColor }]}>{formatHours(day.hours)}</Text>
        ) : null}
      </Animated.View>
    );
  };

  const renderLogItem = ({ item, index }) => {
    const accent = SCHEDULE_ACCENTS[index % SCHEDULE_ACCENTS.length];
    const code = item.organization_id ? String(item.organization_id).toUpperCase() : null;
    let orgName = item.organization_name || null;
    if (!orgName && code && orgCacheRef.current[code]) orgName = orgCacheRef.current[code].name || null;

    const hours = Number(item.hours_contributed ?? item.hours) || 0;
    const isPersonalLog = !!item.is_personal || (personalOrgId && code === String(personalOrgId).toUpperCase());
    const orgLabel = isPersonalLog ? '' : (orgName || (code ? `Code: ${code}` : 'Unassigned'));
    let approvalStatus = 'Pending';
    if (isPersonalLog) {
      approvalStatus = 'Self Logged';
    } else if (item.approve) {
      const status = String(item.approve).toLowerCase();
      if (status === 'accepted' || status.startsWith('approved')) approvalStatus = 'Approved';
      else if (status.includes('denied')) approvalStatus = 'Denied';
      else approvalStatus = item.approve;
    }

    const softAccent = withAlpha('#FFFFFF', 0.18);
    const borderAccent = withAlpha(accent, 0.28);
    const strongAccent = withAlpha(accent, 0.9);

    return (
      <View style={[styles.logCard, { backgroundColor: softAccent, borderColor: borderAccent }]}
        accessibilityLabel={`Volunteer task ${item.site}, logged ${hours} hours`}
      >
        <View style={styles.logHeaderRow}>
          <View style={styles.logTitleGroup}>
            <Text style={styles.logTitle} numberOfLines={1}>{item.site}</Text>
          </View>
          <View style={[styles.logHoursChip, { backgroundColor: withAlpha(accent, 0.2) }]}>
            <Text style={[styles.logHoursText, { color: strongAccent }]}>{`${formatHours(hours)}h`}</Text>
          </View>
        </View>

        <View style={styles.logMetaRow}>
          <Text style={styles.logMeta}>{item.date}</Text>
          <View style={styles.logMetaDot} />
          <Text style={styles.logMeta}>{item.time}</Text>
          {!isPersonalLog && orgLabel ? (
            <>
              <View style={styles.logMetaDot} />
              <Text style={[styles.logOrg, { color: strongAccent }]} numberOfLines={1}>
                {orgLabel}
              </Text>
            </>
          ) : null}
          <View style={styles.logMetaDot} />
          <Text
            style={[
              styles.logMeta,
              approvalStatus === 'Approved' || approvalStatus === 'Self Logged'
                ? { color: strongAccent }
                : { color: '#6B7280' },
            ]}
            numberOfLines={1}
          >
            {approvalStatus}
          </Text>
        </View>
      </View>
    );
  };

  const renderOrganizationItem = ({ item, index }) => {
    const accent = SCHEDULE_ACCENTS[index % SCHEDULE_ACCENTS.length];
    const handleDeletePress = () => {
      openDeleteOrgSheet(item);
    };
    return (
      <View
        style={[styles.orgGridCard, { borderColor: withAlpha(accent, 0.35), backgroundColor: '#FFFFFF' }]}
      >
        <View style={[styles.orgGridAvatar, { backgroundColor: withAlpha(accent, 0.16) }]}>
          <Text style={[styles.orgGridInitials, { color: accent }]}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.orgGridDetail}>
          <Text style={styles.orgGridName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.orgGridCode}>{item.access_code}</Text>
        </View>
        <TouchableOpacity
          onPress={withHaptics(handleDeletePress, 'heavy')}
          style={[styles.orgDeleteButton, { backgroundColor: withAlpha(accent, 0.18) }]}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
        >
          <TrashSimple size={wp(5)} color={accent} />
        </TouchableOpacity>
      </View>
    );
  };

  /* ─── UI ─────────────────────────────────────────────────────── */
  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {columns.map((_, i) => (
          <RainColumn
            key={`volunteer-rain-${i}`}
            x={i * COLUMN_WIDTH}
            screenHeight={height}
            columnIndex={i}
            active={isFocused}
          />
        ))}
      </View>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
          <View style={styles.heroHeaderSide}>
            <TouchableOpacity
              onPress={withHaptics(openAddModal, 'medium')}
              style={styles.heroIconButton}
              activeOpacity={0.85}
            >
              <Plus size={wp(4.8)} color="#000000" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={withHaptics(handleExport, 'medium')}
              style={[styles.heroIconButton, { marginLeft: wp(1.6) }]}
              activeOpacity={0.85}
            >
              <DownloadSimple size={wp(4.8)} color="#000000" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroHeaderActions}>
            {/* New Scan Button (left of Sign Out) */}
            <TouchableOpacity onPress={withHaptics(openScanner, 'medium')} style={styles.heroIconButton} activeOpacity={0.85}>
              <QrCode size={wp(4.6)} color="#000000" />
            </TouchableOpacity>

            <TouchableOpacity onPress={withHaptics(signOut, 'heavy')} style={styles.heroIconButton} activeOpacity={0.85}>
              <SignOut size={wp(4.6)} color="#000000" />
            </TouchableOpacity>
          </View>

          <View pointerEvents="none" style={styles.heroHeaderTitleOverlay}>
            <Text style={styles.heroHeaderTitle} numberOfLines={1}>Volunteer Log</Text>
          </View>
        </View>

          <Animated.View
            style={[
              styles.heroSummary,
              {
                opacity: heroAnim,
                transform: [
                  { translateY: heroTranslate },
                  { scale: heroScale },
                ],
              },
            ]}
          >
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle} numberOfLines={1}>{periodSummary.title || 'Volunteer Impact'}</Text>
            </View>

            {/* Weekly only — toggle removed */}

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{heroHoursLabel}</Text>
                <Text style={styles.heroStatLabel}>logged</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{heroSessionsLabel}</Text>
                <Text style={styles.heroStatLabel}>sessions</Text>
              </View>
            </View>

            <View style={styles.periodNavRow}>
              <TouchableOpacity
                style={styles.periodNavButton}
                onPress={withHaptics(handlePreviousPeriod, 'light')}
                activeOpacity={0.85}
              >
              <CaretLeft size={wp(4.8)} color="#000000" />
              </TouchableOpacity>
              <Text style={styles.periodNavLabel}>
                {periodSummary.label || (periodSummary.activeOffset === 0 ? 'Current period' : '')}
              </Text>
              <TouchableOpacity
                style={[styles.periodNavButton, !periodSummary.canGoForward && styles.periodNavButtonDisabled]}
                onPress={withHaptics(handleNextPeriod, 'light')}
                activeOpacity={periodSummary.canGoForward ? 0.85 : 1}
                disabled={!periodSummary.canGoForward}
              >
                <CaretRight
                  size={wp(4.8)}
                  color={periodSummary.canGoForward ? '#000000' : 'rgba(17,24,39,0.35)'}
                />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>

          <View className="progressSection" style={styles.progressSection}>
          <View style={[styles.progressHeaderRow, styles.progressHeaderWeekly]}>
            <View style={styles.progressHeaderTextWrap}>
              <Text style={styles.progressTitle}>{activePeriod} progress</Text>
            </View>
            <TouchableOpacity
              onPress={withHaptics(openGoalSheet, 'medium')}
              style={[styles.goalPillIconOnly, styles.progressGoalPill]}
              activeOpacity={0.85}
            >
              <SlidersHorizontal size={wp(4.6)} color="#000000" />
            </TouchableOpacity>
          </View>

          <View style={styles.progressChartContainer}>
            <Animated.View style={[styles.progressBarsRow, styles.progressBarsRowWeekly, { opacity: chartTransition }]}>
              {chartData.map((point, idx) => {
                const isActive = idx === highlightIndex;
                const value = Number(point.value) || 0;
                const barRatio = chartCeiling > 0 ? Math.min(value / chartCeiling, 1) : 0;
                const widthMultiplier = activePeriod === 'Weekly' ? WEEKLY_BAR_WIDTH : MONTHLY_BAR_WIDTH;
                const barWidthPercent = Math.min(100, widthMultiplier * 100);
                const isZero = value <= 0;
                const shellColor = isZero ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.32)';
                const fillColor = isZero ? '#000000' : (isActive ? '#000000' : 'rgba(17,23,42,0.65)');
                return (
                  <TouchableOpacity
                    key={`${point.label}-${idx}`}
                    style={[styles.progressBarWrapper, { marginHorizontal: activePeriod === 'Weekly' ? wp(1) : wp(1) }]}
                    activeOpacity={0.85}
                    onPress={withHaptics(() => handleBarPress(idx), 'light')}
                  >
                    <Text
                      style={[styles.progressBarTopValue, isZero && styles.progressBarTopValueZero]}
                      numberOfLines={1}
                    >
                      {formatHours(value)}
                    </Text>
                    <View style={styles.progressBarSpacer} />
                    <View style={[styles.progressBarShell, { width: `${barWidthPercent}%`, backgroundColor: shellColor }]}> 
                      <Animated.View
                        style={[
                          styles.progressBarFill,
                          {
                            height: barHeights[idx],
                            backgroundColor: fillColor,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressBarLabel, isActive && styles.progressBarLabelActive]}>{point.label}</Text>
                    {point.subLabel ? (
                      <Text style={styles.progressBarSubLabel} numberOfLines={1}>{point.subLabel}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          </View>
        </View>

        <View style={styles.heatmapCard}>
          <View style={styles.heatmapHeaderRow}>
            <Text style={styles.heatmapTitle}>Schedule</Text>
            <TouchableOpacity
              onPress={withHaptics(openYearScheduleSheet, 'medium')}
              style={styles.heatmapExpandButton}
              activeOpacity={0.85}
              accessibilityLabel="Open yearly schedule"
              accessibilityRole="button"
            >
              <CalendarDots size={wp(5.6)} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <View style={styles.heatmapControlRow}>
            <TouchableOpacity
              onPress={withHaptics(handleHeatmapPrevious, 'light')}
              style={styles.heatmapArrowButton}
              activeOpacity={0.85}
            >
              <CaretLeft size={wp(4.6)} color="#000000" />
            </TouchableOpacity>
            <View style={styles.heatmapMonthChip}>
              <Text style={styles.heatmapMonthLabel}>{heatmapCalendar.monthLabel || '—'}</Text>
              <Text style={styles.heatmapMonthHours}>
                {heatmapCalendar.totalMonthHours ? `${formatHours(heatmapCalendar.totalMonthHours)}h logged` : 'No hours yet'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={withHaptics(handleHeatmapNext, 'light')}
              style={[styles.heatmapArrowButton, !heatmapCanGoForward && styles.heatmapArrowButtonDisabled]}
              activeOpacity={0.85}
              disabled={!heatmapCanGoForward}
            >
              <CaretRight
                size={wp(4.6)}
                color={heatmapCanGoForward ? '#000000' : 'rgba(17,24,39,0.3)'}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.heatmapWeekdayRow}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
              <Text key={`weekday-${label}`} style={styles.heatmapWeekdayLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.heatmapGrid}>
            {heatmapCalendar.weeks.map((week, weekIdx) => (
              <View key={`heatmap-week-${weekIdx}`} style={styles.heatmapWeekRow}>
                {week.map((day) => (
                  <HeatmapDayCell key={day.key} day={day} />
                ))}
              </View>
            ))}
          </View>

          {!heatmapCalendar.hasActivity ? (
            <Text style={styles.heatmapEmptyText}>No sessions tracked for this month yet.</Text>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderWide}>
            <Text style={styles.sectionTitle}>Volunteer Schedule</Text>
            <TouchableOpacity
              style={styles.scheduleHistoryButton}
              onPress={withHaptics(() => {
                if (historySheetOpen) {
                  closeHistorySheet();
                } else {
                  openHistorySheet();
                }
              }, 'medium')}
              activeOpacity={0.85}
            >
              <ClockCounterClockwise size={wp(4.8)} color="#0F172A" />
            </TouchableOpacity>
          </View>

          {loadingLogs ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#111111" />
              <Text style={styles.loadingText}>Fetching your volunteer logs…</Text>
            </View>
          ) : displayedLogs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <CalendarDots size={wp(10)} color="rgba(0,0,0,0.18)" />
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptySubtitle}>Tap the plus button below to add your first session.</Text>
            </View>
          ) : (
            <FlatList
              data={displayedLogs}
              keyExtractor={(item) => item.id}
              renderItem={renderLogItem}
              scrollEnabled={false}
            />
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Organizations</Text>
                <TouchableOpacity
                  onPress={withHaptics(handleOrganizationInfoPress, 'light')}
                  style={styles.sectionInfoButton}
                  activeOpacity={0.8}
                >
                  <Info size={wp(4.8)} color="#000000" />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={styles.addOrgButton} onPress={withHaptics(openAddOrgSheet, 'medium')} activeOpacity={0.85}>
              <Plus size={wp(4.8)} color="#000000" />
            </TouchableOpacity>
          </View>
          {organizations.length === 0 ? (
            <View style={styles.emptyOrgContainer}>
              <Text style={styles.emptyOrgTitle}>No organizations yet</Text>
              <Text style={styles.emptyOrgSubtitle}>Tap the plus icon to link your first partner.</Text>
            </View>
          ) : (
            <FlatList
              data={organizationCards}
              keyExtractor={(item) => item.id}
              renderItem={renderOrganizationItem}
              scrollEnabled={false}
              contentContainerStyle={styles.orgList}
            />
          )}

        </View>

        <View style={{ height: hp(8) }} />
      </ScrollView>

      {/* Volunteer History Sheet */}
      <BottomSheet
        ref={historySheetRef}
        index={-1}
        snapPoints={sheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={0}
        bottomInset={0}
        onChange={handleHistorySheetChange}
        onClose={() => setHistorySheetOpen(false)}
        style={styles.bottomSheet}
        backgroundComponent={({ style }) => (
          <View style={[style, styles.bottomSheetBackground]} />
        )}
        handleStyle={styles.bottomSheetHandle}
        handleIndicatorStyle={[styles.bottomSheetHandleIndicator, { backgroundColor: 'rgba(15,23,42,0.2)' }]}
      >
        <View style={styles.bottomSheetHeader}>
          <Text style={styles.bottomSheetTitle}>Volunteer History</Text>
          <TouchableOpacity onPress={withHaptics(closeHistorySheet, 'light')} style={styles.modalClose}>
            <X size={wp(6)} color="#666" />
          </TouchableOpacity>
        </View>
        <BottomSheetFlatList
          data={sortedLogs}
          keyExtractor={(item) => item.id}
          renderItem={renderLogItem}
          contentContainerStyle={sortedLogs.length ? styles.historyListContent : styles.historyEmptyContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <CalendarDots size={wp(10)} color="rgba(0,0,0,0.18)" />
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptySubtitle}>Tap the plus button below to add your first session.</Text>
            </View>
          }
        />
      </BottomSheet>

      {/* Yearly Schedule Sheet */}
      <BottomSheet
        ref={yearScheduleSheetRef}
        index={-1}
        snapPoints={sheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={0}
        bottomInset={0}
        onChange={handleYearScheduleSheetChange}
        style={styles.bottomSheet}
        backgroundComponent={({ style }) => (
          <View style={[style, styles.bottomSheetBackground]} />
        )}
        handleStyle={styles.bottomSheetHandle}
        handleIndicatorStyle={[styles.bottomSheetHandleIndicator, { backgroundColor: 'rgba(15,23,42,0.2)' }]}
      >
        <BottomSheetScrollView contentContainerStyle={styles.yearScheduleContent}>
          <View style={styles.bottomSheetHeader}>
          <Text style={styles.bottomSheetTitle}>Yearly Schedule</Text>
          <TouchableOpacity onPress={withHaptics(closeYearScheduleSheet, 'light')} style={styles.modalClose}>
            <X size={wp(6)} color="#666" />
          </TouchableOpacity>
          </View>

          {yearScheduleData.months.map((month, idx) => (
            <View
              key={month.key}
              style={[
                styles.yearScheduleSection,
                idx === 0 && styles.yearScheduleSectionFirst,
              ]}
            >
              <View style={styles.yearScheduleSectionHeader}>
                <Text style={styles.yearScheduleSectionTitle}>{month.label}</Text>
                <Text style={styles.yearScheduleSectionHours}>
                  {month.totalHours ? `${formatHours(month.totalHours)}h logged` : '0h logged'}
                </Text>
              </View>
              <View style={styles.yearScheduleWeekdayRow}>
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
                  <Text key={`weekday-${label}`} style={styles.yearScheduleWeekdayLabel}>{label}</Text>
                ))}
              </View>
              <View style={styles.yearScheduleGrid}>
                {month.weeks.map((week, weekIdx) => (
                  <View key={`${month.key}-week-${weekIdx}`} style={styles.yearScheduleWeekRow}>
                    {week.map((day) => (
                      <View
                        key={day.key}
                        style={[
                          styles.yearScheduleCell,
                          { backgroundColor: day.backgroundColor, borderColor: day.borderColor || 'transparent' },
                          !day.inMonth && styles.yearScheduleCellMuted,
                          day.isToday && styles.yearScheduleCellToday,
                        ]}
                      >
                        <Text style={[styles.yearScheduleCellLabel, { color: day.textColor }]}>
                          {day.inMonth ? day.label : ''}
                        </Text>
                        {day.inMonth && day.hours > 0 ? (
                          <Text style={[styles.yearScheduleCellHours, { color: day.textColor }]}>
                            {formatHours(day.hours)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
              {!month.hasActivity ? (
                <Text style={styles.yearScheduleEmpty}>No sessions tracked for this month yet.</Text>
              ) : null}
            </View>
          ))}

          {!yearScheduleData.hasActivity ? (
            <Text style={styles.yearScheduleHint}>Add sessions to see them organized by month.</Text>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Add Session Sheet */}
      <BottomSheet
        ref={addSheetRef}
        index={-1}
        snapPoints={sheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={0}
        bottomInset={0}
        onChange={handleAddSheetChange}
        onClose={resetAddSheetState}
        style={styles.bottomSheet}
        backgroundComponent={({ style }) => (
          <View style={[style, styles.bottomSheetBackground]} />
        )}
        handleStyle={styles.bottomSheetHandle}
        handleIndicatorStyle={[styles.bottomSheetHandleIndicator, { backgroundColor: 'rgba(15,23,42,0.2)' }]}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.bottomSheetContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{modalStep === 1 ? 'Add Volunteer Session' : 'Submit to Organization'}</Text>
            <TouchableOpacity onPress={withHaptics(closeAddModal, 'light')} style={styles.modalClose}>
              <X size={wp(6)} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {modalStep === 1 ? (
              <>
                <Text style={styles.modalDescription}>Capture what you worked on and how long you contributed.</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Volunteer Task</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Enter Volunteer Task"
                    placeholderTextColor="#999"
                    value={newSite}
                    onChangeText={setNewSite}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Hours Volunteered</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 2"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    value={newHours}
                    onChangeText={setNewHours}
                  />
                </View>
              </>
            ) : qrPrefill ? (
              <View style={styles.qrOrgSummary}>
                <View style={styles.qrOrgHeader}>
                  <View style={styles.qrOrgIcon}>
                  <QrCode size={wp(5.4)} color="#4338CA" />
                  </View>
                  <View style={styles.qrOrgHeaderText}>
                    <Text style={styles.qrOrgSummaryTitle}>Secure QR Check-In</Text>
                    <Text style={styles.qrOrgSummarySubtitle}>
                      This session routes privately to {qrPrefill.orgName || qrPrefill.payload.orgAccessCode}. All admin validation runs on our servers.
                    </Text>
                  </View>
                </View>
                <View style={styles.qrOrgBadge}>
                  <Building size={wp(3.9)} color="#000000" />
                  <Text style={styles.qrOrgBadgeText}>
                    {qrPrefill.orgName || qrPrefill.payload.orgAccessCode}
                  </Text>
                </View>
                <View style={styles.qrOrgSummaryNote}>
                  <ShieldCheck size={wp(4)} color="#2563EB" />
                  <Text style={styles.qrOrgSummaryNoteText}>
                    Sensitive access codes stay hidden. We encrypt them and process the approval flow in the background for you.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.qrForgetButton}
                  onPress={withHaptics(handleForgetQrPrefill, 'medium')}
                  activeOpacity={0.88}
                >
                  <TrashSimple size={wp(3.8)} color="#DC2626" />
                  <Text style={styles.qrForgetButtonText}>Forget this check-in</Text>
                </TouchableOpacity>
                <Text style={styles.qrForgetHint}>
                  You will need to rescan the QR code if you want to submit it later.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.organizationLabelRow}>
                  <Text style={styles.inputLabel}>Organization</Text>
                  <TouchableOpacity
                    onPress={withHaptics(handleOrganizationInfoPress, 'light')}
                    activeOpacity={0.75}
                    style={styles.organizationInfoButton}
                  >
                    <Info size={wp(4.6)} color="#000000" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.organizationHelperText}>
                  Enter the access code your organization admin shared to send a join request.
                </Text>
                <View style={styles.organizationSelectionContainer}>
                  {organizations.length === 0 ? (
                    <View style={styles.emptyOrgContainer}>
                      <Text style={styles.emptyOrgTitle}>No organizations yet</Text>
                      <Text style={styles.emptyOrgSubtitle}>Tap the plus icon to link your first partner.</Text>
                    </View>
                  ) : (
                    <>
                      {organizations.map((org, idx) => {
                        const accent = SCHEDULE_ACCENTS[idx % SCHEDULE_ACCENTS.length];
                        const accessCode = String(org.access_code || '').toUpperCase();
                        const isSelected = selectedOrganizations.includes(accessCode);
                        return (
                          <TouchableOpacity
                            key={org.id}
                            style={[
                              styles.orgVerticalButton,
                            {
                              borderColor: withAlpha(accent, isSelected ? 0.6 : 0.28),
                              backgroundColor: isSelected ? accent : withAlpha(accent, 0.12),
                            },
                          ]}
                            onPress={withHaptics(() => toggleOrganizationSelection(accessCode), 'medium')}
                            activeOpacity={0.88}
                          >
                            <View style={styles.orgVerticalContent}>
                              <View style={[styles.orgVerticalDot, { backgroundColor: isSelected ? '#FFFFFF' : accent }]} />
                              <Text
                                style={[
                                  styles.orgVerticalText,
                                  isSelected ? styles.orgVerticalTextSelected : styles.orgVerticalTextMuted,
                                ]}
                              >
                                {org.name}
                              </Text>
                              {org.default_auto_share ? (
                                <View
                                  style={[
                                    styles.orgDefaultPill,
                                    isSelected ? styles.orgDefaultPillSelected : null,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.orgDefaultPillText,
                                      isSelected ? styles.orgDefaultPillTextSelected : null,
                                    ]}
                                  >
                                    Default
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.orgVerticalButton,
                      styles.orgVerticalButtonNeutral,
                      selectedOrganizations.includes(PERSONAL_OPTION) && styles.orgVerticalButtonNeutralActive,
                    ]}
                    onPress={withHaptics(clearOrganizationSelection, 'light')}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.orgVerticalDot, { backgroundColor: 'rgba(15,23,42,0.25)' }]} />
                    <Text
                      style={[
                        styles.orgVerticalText,
                        selectedOrganizations.includes(PERSONAL_OPTION)
                          ? styles.orgVerticalTextActive
                          : styles.orgVerticalTextMuted,
                      ]}
                    >
                      Personal Use Only
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={styles.modalActions}>
            {modalStep === 1 ? (
              <>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={withHaptics(closeAddModal, 'light')}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalNextButton}
                  onPress={withHaptics(handleNext, 'medium')}
                >
                  <Text style={styles.modalNextText}>Next</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={withHaptics(() => {
                    setModalStep(1);
                    if (qrPrefill && qrPrefill.payload?.orgAccessCode) {
                      setSelectedOrganizations([String(qrPrefill.payload.orgAccessCode || '').toUpperCase()]);
                    } else {
                      setSelectedOrganizations([PERSONAL_OPTION]);
                    }
                  }, 'light')}
                >
                  <Text style={styles.modalCancelText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveButton}
                  onPress={withHaptics(handleSaveSession, 'heavy')}
                  disabled={isSaving}
                >
                  {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.modalSaveText}>Save Session</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
      </BottomSheetScrollView>
    </BottomSheet>

      <BottomSheet
        ref={organizationInfoSheetRef}
        index={-1}
        snapPoints={infoSheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={0}
        bottomInset={0}
        onChange={handleOrgInfoSheetChange}
        onClose={closeOrganizationInfoSheet}
        style={styles.bottomSheet}
        backgroundComponent={({ style }) => (
          <View style={[style, styles.bottomSheetBackground]} />
        )}
        handleStyle={styles.bottomSheetHandle}
        handleIndicatorStyle={[styles.bottomSheetHandleIndicator, { backgroundColor: 'rgba(15,23,42,0.2)' }]}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.infoSheetBody}
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <View style={styles.infoSheetHeader}>
            <Text style={styles.infoSheetTitle}>How organization linking works</Text>
            <TouchableOpacity
              onPress={withHaptics(closeOrganizationInfoSheet, 'light')}
              style={styles.infoSheetCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close organization info"
            >
              <X size={wp(5.8)} color="#475569" />
            </TouchableOpacity>
          </View>
          <Text style={styles.infoSheetParagraph}>
            Organizations are groups (schools, clubs, nonprofits) that review and approve your volunteer hours. When you connect with one, your sessions can be sent directly to their admin dashboard.
          </Text>
          <Text style={styles.infoSheetParagraph}>
            Example: Your school's Peer Tutoring Club gives you an access code. Enter that code, confirm it matches the club name, then send a join request. The admins will be notified automatically.
          </Text>
          <Text style={styles.infoSheetParagraph}>
            After an admin approves you, any sessions you submit to that organization will appear in their approval queue—no extra emails or spreadsheets required.
          </Text>
          <Text style={styles.infoSheetParagraph}>
            Some school organizations require all of your hours to be visible once you join. Other organizations stay manual and will only see hours you choose to submit to them.
          </Text>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Add Organization Sheet */}
      <BottomSheet
        ref={addOrgSheetRef}
        index={-1}
        snapPoints={sheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={0}
        bottomInset={0}
        onChange={handleAddOrgSheetChange}
        onClose={resetAddOrgSheetState}
        style={styles.bottomSheet}
        backgroundComponent={({ style }) => (
          <View style={[style, styles.bottomSheetBackground]} />
        )}
        handleStyle={styles.bottomSheetHandle}
        handleIndicatorStyle={[styles.bottomSheetHandleIndicator, { backgroundColor: 'rgba(15,23,42,0.2)' }]}
      >
      <BottomSheetScrollView contentContainerStyle={styles.bottomSheetContent} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Organization</Text>
          <View style={styles.modalHeaderActions}>
            <TouchableOpacity onPress={withHaptics(closeAddOrgSheet, 'light')} style={styles.modalClose}>
                <X size={wp(6)} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.modalDescription}>
              Enter the organization access code provided by an admin to send your join request. We'll verify it automatically.
            </Text>
            <View style={styles.manualAccessContainer}>
              <TouchableOpacity
                style={styles.otpContainer}
                activeOpacity={0.9}
                onPress={withHaptics(() => manualCodeInputRef.current?.focus?.(), 'light')}
              >
                {Array.from({ length: 6 }).map((_, idx) => {
                  const char = manualAccessCode[idx] || '';
                  const isActive = manualAccessCode.length === idx;
                  return (
                    <View
                      key={`otp-${idx}`}
                      style={[
                        styles.otpCell,
                        char && styles.otpCellFilled,
                        isActive && styles.otpCellActive,
                      ]}
                    >
                      <Text style={styles.otpCellText}>{char || ''}</Text>
                    </View>
                  );
                })}
                <TextInput
                  ref={manualCodeInputRef}
                  style={styles.otpHiddenInput}
                  value={manualAccessCode}
                  onChangeText={handleManualAccessCodeChange}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'visible-password'}
                  maxLength={6}
                />
              </TouchableOpacity>
              {manualResolveState === 'searching' && (
                <Text style={styles.manualResolveStatus}>Looking up organization…</Text>
              )}
              {manualResolveState === 'found' && manualResolveName && (
                <Text style={[styles.manualResolveStatus, styles.manualResolveStatusSuccess]}>
                  Found: {manualResolveName}
                </Text>
              )}
              {manualResolveState === 'not_found' && (
                <Text style={[styles.manualResolveStatus, styles.manualResolveStatusError]}>
                  No organization matches that code.
                </Text>
              )}
              {manualResolveState === 'error' && (
                <Text style={[styles.manualResolveStatus, styles.manualResolveStatusError]}>
                  We couldn't verify that code. Try again.
                </Text>
              )}
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={withHaptics(closeAddOrgSheet, 'light')}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveButton, manualActionDisabled && { opacity: 0.6 }]}
              onPress={withHaptics(handleManualAccessSubmit, 'medium')}
              disabled={manualActionDisabled}
            >
              {isSubmittingOrgRequest ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalSaveText}>{manualActionLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Default Share Request Sheet */}
      <BottomSheet
        ref={defaultShareSheetRef}
        index={-1}
        snapPoints={sheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={0}
        bottomInset={0}
        onChange={handleDefaultShareSheetChange}
        onClose={resetDefaultShareSheetState}
        style={styles.bottomSheet}
        backgroundComponent={({ style }) => (
          <View style={[style, styles.bottomSheetBackground]} />
        )}
        handleStyle={styles.bottomSheetHandle}
        handleIndicatorStyle={[styles.bottomSheetHandleIndicator, { backgroundColor: 'rgba(15,23,42,0.2)' }]}
      >
        <BottomSheetScrollView contentContainerStyle={styles.bottomSheetContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Organization Request</Text>
            <TouchableOpacity onPress={withHaptics(closeDefaultShareSheet, 'light')} style={styles.modalClose}>
              <X size={wp(6)} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.modalDescription}>
              Sharing requests are currently disabled in this app. If you need help, contact your organization admin directly.
            </Text>
            <View style={styles.defaultShareSummaryCard}>
              <Text style={styles.defaultShareSummaryName}>
                {defaultShareTargetOrg?.name || 'Organization'}
              </Text>
              <Text style={styles.defaultShareSummaryCode}>
                {defaultShareTargetOrg?.access_code || '—'}
              </Text>
            </View>

            <Text style={styles.inputLabel}>Message to admin (optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.defaultShareInput]}
              placeholder="Add a short note for the admin"
              placeholderTextColor="#999"
              value={defaultShareNotes}
              onChangeText={setDefaultShareNotes}
              multiline
            />
            <Text style={styles.defaultShareHint}>
              We will notify you if the admin responds to your note.
            </Text>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={withHaptics(closeDefaultShareSheet, 'light')}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveButton, isSubmittingDefaultShareRequest && { opacity: 0.6 }]}
              onPress={withHaptics(submitDefaultShareRequest, 'medium')}
              disabled={isSubmittingDefaultShareRequest || !defaultShareTargetOrg?.id}
            >
              {isSubmittingDefaultShareRequest ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalSaveText}>Send Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Daily Goal Sheet */}
      <BottomSheet
        ref={goalSheetRef}
        index={-1}
        snapPoints={sheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={0}
        bottomInset={0}
        onChange={handleGoalSheetChange}
        onClose={resetGoalSheetState}
        style={styles.bottomSheet}
        backgroundComponent={({ style }) => (
          <View style={[style, styles.bottomSheetBackground]} />
        )}
        handleStyle={styles.bottomSheetHandle}
        handleIndicatorStyle={[styles.bottomSheetHandleIndicator, { backgroundColor: 'rgba(15,23,42,0.2)' }]}
      >
        <BottomSheetScrollView contentContainerStyle={styles.bottomSheetContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Adjust Daily Goal</Text>
            <TouchableOpacity onPress={withHaptics(closeGoalSheet, 'light')} style={styles.modalClose}>
              <X size={wp(6)} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.inputLabel}>Set a new daily goal</Text>
            <TextInput
              style={[styles.modalInput, styles.goalInput]}
              placeholder="e.g. 2.5"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={tempDailyGoal}
              onChangeText={setTempDailyGoal}
            />
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={withHaptics(closeGoalSheet, 'light')}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={withHaptics(() => {
                const num = parseFloat(tempDailyGoal);
                if (isNaN(num) || num <= 0) {
                  Toast.show({ type: 'error', text1: 'Invalid Goal', text2: 'Enter a positive number.' });
                  return;
                }
                setDailyGoal(num);
                closeGoalSheet();
              }, 'medium')}
            >
              <Text style={styles.modalSaveText}>Save Goal</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Delete Organization Sheet */}
      <BottomSheet
        ref={deleteOrgSheetRef}
        index={-1}
        snapPoints={deleteSheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        enableHandlePanningGesture={false}
        enableContentPanningGesture={false}
        topInset={0}
        bottomInset={0}
        onChange={handleDeleteOrgSheetChange}
        onClose={resetDeleteOrgSheetState}
        style={styles.bottomSheet}
        backgroundComponent={({ style }) => (
          <View style={[style, styles.bottomSheetBackground]} />
        )}
        handleStyle={styles.bottomSheetHandle}
        handleIndicatorStyle={[styles.bottomSheetHandleIndicator, { backgroundColor: 'rgba(15,23,42,0.2)' }]}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.bottomSheetContent, styles.deleteSheetContent]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Delete Organization</Text>
            <TouchableOpacity onPress={withHaptics(closeDeleteOrgSheet, 'light')} style={styles.modalClose}>
              <X size={wp(6)} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.deleteWarningText}>
              Are you sure you want to delete &quot;{orgToDelete?.name || 'this organization'}&quot;? This action cannot be undone.
            </Text>
            <Text style={styles.deleteWarningText}>
              You can always request to join again later. Tap Delete to continue.
            </Text>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={withHaptics(closeDeleteOrgSheet, 'light')}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalDeleteButton}
              onPress={withHaptics(handleDeleteOrganization, 'heavy')}
            >
              <Text style={styles.modalDeleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* QR Scanner Modal */}
      <Modal
        visible={scanModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeScanner}
      >
        <View style={styles.scannerBackdrop}>
          {cameraPermission?.granted ? (
            <>
              <GestureDetector gesture={scannerPinchGesture}>
                <CameraView
                  style={styles.scannerCameraFull}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleBarcodeScanned}
                  zoom={scannerZoom}
                />
              </GestureDetector>
              <View pointerEvents="none" style={styles.scannerDim} />
              <View pointerEvents="none" style={styles.scannerFocusWrap}>
                <View style={styles.scannerFocusBox}>
                  <View style={[styles.scannerCorner, styles.scannerCornerTL]} />
                  <View style={[styles.scannerCorner, styles.scannerCornerTR]} />
                  <View style={[styles.scannerCorner, styles.scannerCornerBL]} />
                  <View style={[styles.scannerCorner, styles.scannerCornerBR]} />
                </View>
              </View>
              <View style={styles.scannerBottomBar}>
                <View style={styles.scannerCaptionCard}>
                  <View style={[
                    styles.scannerStatusPill,
                    styles[`scannerStatusPill__${scanFeedback.tone || 'neutral'}`],
                  ]}
                  >
                    <Text style={styles.scannerStatusPillText}>
                      {scanFeedback.tone === 'success' ? 'Verified' : scanFeedback.tone === 'error' ? 'Error' : scanFeedback.tone === 'info' ? 'Heads-up' : 'Scanning'}
                    </Text>
                  </View>
                  <Text style={styles.scannerCaptionTitle}>{scanFeedback.title}</Text>
                  <View style={styles.scannerCaptionRow}>
                    {scanFeedback.tone === 'busy' && <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 8 }} />}
                    <Text style={styles.scannerCaptionNote}>{scanFeedback.note}</Text>
                  </View>
                  {!!(scanFeedback.meta && scanFeedback.meta.length) && (
                    <View style={styles.scannerMetaRow}>
                      {scanFeedback.meta.map((item, idx) => (
                        <View key={`${item.text}-${idx}`} style={styles.scannerMetaChip}>
                          <Info size={wp(3.4)} color="#000000" />
                          <Text style={styles.scannerMetaChipText}>
                            {item.text}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.scannerCloseBar}
                  onPress={withHaptics(closeScanner, 'light')}
                  activeOpacity={0.88}
                >
                  <Text style={styles.scannerCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.scannerPermissionFallback}>
              <ActivityIndicator color="#6366F1" size="small" />
              <Text style={styles.scannerPermissionText}>Requesting camera permission…</Text>
              <TouchableOpacity
                style={[styles.scannerCloseBar, { marginTop: hp(3) }]}
                onPress={withHaptics(closeScanner, 'light')}
                activeOpacity={0.88}
              >
                <Text style={styles.scannerCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Toast */}
      <Toast config={toastConfig} position="top" visibilityTime={4000} />
    </View>
  );
}

/* ─── Styles ───────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  rainColumn: {
    position: 'absolute',
    top: -800,
    alignItems: 'center',
  },
  rainText: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
    opacity: 0.65,
  },
  scrollContent: {
    paddingHorizontal: wp(5),
    paddingTop: hp(6),
    paddingBottom: hp(5),
  },
  bottomSheet: { zIndex: 60 },
  bottomSheetBackground: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: wp(9),
    borderTopRightRadius: wp(9),
  },
  bottomSheetHandle: { paddingVertical: hp(1.4) },
  bottomSheetHandleIndicator: {
    width: wp(12),
    height: hp(0.8),
    borderRadius: hp(0.4),
    backgroundColor: 'rgba(15,23,42,0.12)',
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(5),
    paddingTop: hp(2),
    paddingBottom: hp(1),
  },
  bottomSheetTitle: { fontSize: wp(4), fontWeight: '700', color: '#0F172A' },
  bottomSheetContent: {
    paddingHorizontal: wp(6),
    paddingBottom: hp(4),
    paddingTop: hp(1),
  },
  deleteSheetContent: {
    paddingBottom: hp(6),
  },
  historyListContent: { paddingHorizontal: wp(6), paddingBottom: hp(4) },
  historyEmptyContent: { paddingHorizontal: wp(6), paddingBottom: hp(6) },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: wp(9),
    paddingHorizontal: wp(5),
    paddingTop: (StatusBar.currentHeight || 0) + hp(1.6),
    paddingBottom: hp(4.6),
    marginTop: hp(2),
    marginBottom: hp(1.8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 7,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: wp(3),
    position: 'relative',
  },
  heroIconButton: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHeaderSide: {
    width: HERO_HEADER_SIDE_WIDTH,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  heroHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    width: HERO_HEADER_SIDE_WIDTH,
    justifyContent: 'flex-end',
  },
  heroHeaderTitleOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  heroHeaderTitle: {
    flex: 1,
    fontSize: wp(4.8),
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  heroSummary: {
    marginTop: hp(1.8),
    gap: hp(1.6),
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: wp(3),
  },
  heroTitle: {
    flex: 1,
    fontSize: wp(5),
    fontWeight: '700',
    color: '#0F172A',
  },
  heroPeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: wp(2.4),
  },
  heroSubtitle: {
    fontSize: wp(3.2),
    color: '#64748B',
    fontWeight: '500',
    flex: 1,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: wp(6),
    paddingVertical: hp(1.2),
    paddingHorizontal: wp(3.4),
    gap: wp(3),
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: wp(4.6),
    fontWeight: '700',
    color: '#0F172A',
  },
  heroStatLabel: {
    marginTop: hp(0.3),
    fontSize: wp(2.7),
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroDivider: {
    width: 1,
    height: '65%',
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  periodNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(4),
  },
  periodNavButton: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(5),
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodNavButtonDisabled: {
    opacity: 0.4,
  },
  periodNavLabel: {
    fontSize: wp(3.2),
    fontWeight: '600',
    color: '#475569',
  },
  progressSection: {
    marginTop: hp(1.2),
    backgroundColor: '#FFFFFF',
    borderRadius: wp(10),
    paddingHorizontal: wp(5),
    paddingTop: hp(0.6),
    paddingBottom: hp(3.2),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: wp(4.6),
    fontWeight: '700',
    color: '#000000',
  },
  sectionSubtitle: {
    marginTop: 0,
    fontSize: wp(3),
    color: '#9CA3AF',
    fontWeight: '500',
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: hp(1),
  },
  progressHeaderTextWrap: {
    flex: 1,
    marginRight: wp(3),
  },
  progressHeaderWeekly: {
    marginBottom: hp(0),
  },
  progressTitle: { fontSize: wp(4.8), fontWeight: '700', color: '#0F172A' },
  progressMeta: { marginTop: hp(0.4), fontSize: wp(3.1), color: 'rgba(15,23,42,0.55)', fontWeight: '500' },
  progressMetaHighlight: {
    marginTop: hp(0.4),
    fontSize: wp(2.9),
    color: '#000000',
    fontWeight: '600',
  },
  heroGoalPillRow: {
    marginTop: hp(2.4),
    alignItems: 'center',
  },
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1.4),
    backgroundColor: 'rgba(128,100,244,0.12)',
    borderRadius: wp(5.5),
    paddingHorizontal: wp(4.2),
    paddingVertical: hp(1),
  },
  goalPillText: { fontSize: wp(3.2), fontWeight: '600', color: '#000000' },
  progressGoalPill: {
    alignSelf: 'flex-start',
    marginTop: hp(0.4),
  },
  goalPillIconOnly: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  progressChartContainer: {
    marginTop: hp(0),
    paddingHorizontal: wp(3.2),
    paddingTop: hp(2),
    paddingBottom: hp(3),
    borderRadius: wp(8),
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(15,23,42,0.12)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
    overflow: 'visible',
  },
  progressBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: wp(3),
    height: CHART_HEIGHT,
  },
  progressBarsRowWeekly: {
    marginTop: hp(0),
  },
  progressBarWrapper: {
    flex: 1,
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: hp(0.6),
    position: 'relative',
  },
  progressBarSpacer: {
    flex: 1,
  },
  progressBarTopValue: {
    fontSize: wp(2.8),
    fontWeight: '600',
    color: '#000000',
    marginBottom: hp(0.275),
  },
  progressBarTopValueZero: {
    color: '#111111',
    opacity: 0.8,
  },
  progressBarShell: {
    width: '82%',
    height: '100%',
    borderRadius: wp(8),
    backgroundColor: 'rgba(17,23,42,0.08)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFill: {
    width: '100%',
    borderRadius: wp(8),
  },
  progressBarLabel: { fontSize: wp(3), color: 'rgba(15,23,42,0.55)', fontWeight: '600' },
  progressBarLabelActive: { color: '#0F172A', },
  progressBarSubLabel: { fontSize: wp(2.6), color: 'rgba(15,23,42,0.35)' },
  heatmapCard: {
    marginTop: hp(3.4),
    backgroundColor: '#FFFFFF',
    borderRadius: wp(10),
    paddingHorizontal: wp(5),
    paddingTop: hp(2.6),
    paddingBottom: hp(2.2),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 5,
  },
  heatmapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heatmapTitle: {
    fontSize: wp(4.8),
    fontWeight: '700',
    color: '#0F172A',
  },
  heatmapExpandButton: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatmapControlRow: {
    marginTop: hp(2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(3),
  },
  heatmapArrowButton: {
    width: wp(9.4),
    height: wp(9.4),
    borderRadius: wp(4.7),
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatmapArrowButtonDisabled: {
    opacity: 0.45,
  },
  heatmapMonthChip: {
    minWidth: wp(28),
    backgroundColor: '#000000',
    borderRadius: wp(6),
    paddingHorizontal: wp(3.8),
    paddingVertical: hp(1),
    alignItems: 'center',
  },
  heatmapMonthLabel: {
    fontSize: wp(3.8),
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  heatmapMonthHours: {
    marginTop: hp(0.3),
    fontSize: wp(2.7),
    color: 'rgba(248,250,252,0.7)',
    textAlign: 'center',
  },
  heatmapWeekdayRow: {
    marginTop: hp(1.6),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(0.5),
  },
  heatmapWeekdayLabel: {
    fontSize: wp(2.6),
    fontWeight: '700',
    color: 'rgba(99,102,241,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heatmapGrid: {
    marginTop: hp(1.4),
    gap: hp(1.2),
  },
  heatmapWeekRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: wp(1.6),
  },
  heatmapCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: wp(4),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.4,
    borderColor: 'transparent',
    paddingVertical: hp(0.4),
  },
  heatmapCellMuted: {
    backgroundColor: 'rgba(226,232,240,0.25)',
  },
  heatmapCellToday: {
    borderWidth: 2,
  },
  heatmapTodayPulse: {
    position: 'absolute',
    top: -hp(0.25),
    right: -hp(0.25),
    bottom: -hp(0.25),
    left: -hp(0.25),
    borderRadius: wp(4.6),
    borderWidth: 2.6,
    borderColor: '#8064F4',
    backgroundColor: 'transparent',
  },
  heatmapCellLabel: {
    fontSize: wp(3.2),
    fontWeight: '700',
  },
  heatmapCellHours: {
    marginTop: hp(0.2),
    fontSize: wp(2.6),
    fontWeight: '600',
    opacity: 0.85,
  },
  heatmapEmptyText: {
    marginTop: hp(1.6),
    fontSize: wp(3),
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  yearScheduleContent: {
    paddingHorizontal: wp(5),
    paddingBottom: hp(5.5),
  },
  yearScheduleSection: {
    marginTop: hp(2.4),
  },
  yearScheduleSectionFirst: {
    marginTop: hp(1.2),
  },
  yearScheduleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: hp(1.2),
  },
  yearScheduleSectionTitle: {
    fontSize: wp(4.2),
    fontWeight: '700',
    color: '#0F172A',
  },
  yearScheduleSectionHours: {
    fontSize: wp(3),
    fontWeight: '600',
    color: '#475569',
  },
  yearScheduleWeekdayRow: {
    marginTop: hp(0.6),
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: wp(1),
  },
  yearScheduleWeekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: wp(2.6),
    fontWeight: '600',
    color: 'rgba(99,102,241,0.7)',
    letterSpacing: 0.8,
  },
  yearScheduleGrid: {
    marginTop: hp(1.4),
    gap: hp(1.2),
  },
  yearScheduleWeekRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: wp(1.4),
  },
  yearScheduleCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: wp(4),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.4,
    borderColor: 'transparent',
    paddingVertical: hp(0.4),
  },
  yearScheduleCellMuted: {
    backgroundColor: 'rgba(226,232,240,0.25)',
    borderColor: 'rgba(148,163,184,0.2)',
  },
  yearScheduleCellToday: {
    borderWidth: 2,
  },
  yearScheduleCellLabel: {
    fontSize: wp(3.1),
    fontWeight: '700',
  },
  yearScheduleCellHours: {
    marginTop: hp(0.2),
    fontSize: wp(2.5),
    fontWeight: '600',
    opacity: 0.85,
  },
  yearScheduleEmpty: {
    marginTop: hp(1.2),
    fontSize: wp(2.9),
    color: '#94A3B8',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  yearScheduleHint: {
    marginTop: hp(3),
    fontSize: wp(3),
    color: '#94A3B8',
    textAlign: 'center',
  },
  sectionCard: {
    marginTop: hp(3.5),
    backgroundColor: '#FFFFFF',
    borderRadius: wp(10),
    padding: wp(5),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 5,
  },
  sectionHeaderWide: {
    marginBottom: hp(2.6),
    gap: hp(0.8),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1.4),
  },
  sectionInfoButton: {
    padding: wp(1),
  },
  scheduleHistoryButton: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(5),
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addOrgButton: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(5),
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(4),
  },
  loadingText: {
    marginTop: hp(1),
    fontSize: wp(3.6),
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: hp(5),
  },
  emptyTitle: {
    marginTop: hp(1.5),
    fontSize: wp(4.6),
    fontWeight: '700',
    color: '#000000',
  },
  emptySubtitle: {
    marginTop: hp(0.8),
    fontSize: wp(3.6),
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: wp(6),
  },
  scheduleToggle: {
    paddingHorizontal: wp(3.4),
    paddingVertical: hp(0.6),
    borderRadius: wp(4.5),
    backgroundColor: '#EEF2FF',
  },
  logCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: wp(7),
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(4),
    marginBottom: hp(1.8),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: 'rgba(0,0,0,0.18)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
    marginBottom: hp(1.2),
  },
  logTitleGroup: {
    flex: 1,
    gap: hp(0.2),
  },
  logTitle: {
    flex: 1,
    fontSize: wp(4.3),
    fontWeight: '700',
    color: '#0F172A',
  },
  logOrgTag: {
    fontSize: wp(3),
    fontWeight: '600',
    color: 'rgba(15,23,42,0.65)',
  },
  logStatusDot: {
    width: wp(2.2),
    height: wp(2.2),
    borderRadius: wp(1.1),
  },
  logStatusPill: {
    borderWidth: 0,
    borderRadius: wp(3.4),
    paddingHorizontal: wp(2.6),
    paddingVertical: hp(0.3),
    marginLeft: wp(1.2),
  },
  logStatusText: { fontSize: wp(3), fontWeight: '600' },
  logTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: hp(1),
  },
  logHoursChip: {
    borderRadius: wp(3.4),
    paddingHorizontal: wp(2.4),
    paddingVertical: hp(0.3),
  },
  logHoursText: { fontSize: wp(3.4), fontWeight: '700', color: '#0F172A' },
  logProgressLabel: {
    fontSize: wp(3),
    color: 'rgba(15,23,42,0.55)',
    fontWeight: '600',
  },
  logMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: wp(1.6),
    marginTop: hp(1.2),
  },
  logMeta: { fontSize: wp(3.1), color: 'rgba(15,23,42,0.6)' },
  logMetaDot: {
    width: wp(1.5),
    height: wp(1.5),
    borderRadius: wp(0.75),
    backgroundColor: 'rgba(15,23,42,0.18)',
  },
  logOrg: { fontSize: wp(3), flexShrink: 1 },
  logBarTrack: {
    marginTop: hp(0.4),
    height: hp(0.9),
    borderRadius: hp(0.45),
    backgroundColor: 'rgba(15,23,42,0.07)',
    overflow: 'hidden',
  },
  logBarFill: {
    height: '100%',
    borderRadius: hp(0.45),
  },
  orgList: {
    paddingTop: wp(1.2),
    paddingBottom: hp(2),
  },
  orgGridCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.5),
    borderRadius: wp(6),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: 'rgba(15,23,42,0.08)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: hp(1.6),
  },
  orgGridAvatar: {
    width: wp(10.5),
    height: wp(10.5),
    borderRadius: wp(5.25),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: wp(3),
  },
  orgGridDetail: {
    flex: 1,
    marginRight: wp(1.5),
  },
  orgGridInitials: { fontSize: wp(4), fontWeight: '700' },
  orgGridName: { fontSize: wp(3.6), fontWeight: '700', color: '#0F172A' },
  orgGridCode: { fontSize: wp(3), color: 'rgba(15,23,42,0.55)', marginTop: hp(0.2) },
  orgDefaultToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: hp(0.8),
    paddingVertical: hp(0.4),
  },
  orgDefaultToggleLabel: {
    fontSize: wp(3),
    fontWeight: '600',
    color: 'rgba(15,23,42,0.7)',
  },
  orgDefaultSwitch: {
    transform: [{ scale: 0.65 }],
  },
  orgDefaultStatusText: {
    marginTop: hp(0.5),
    fontSize: wp(2.8),
    fontWeight: '600',
    color: 'rgba(15,23,42,0.55)',
  },
  orgDefaultStatusPending: {
    color: '#B45309',
  },
  orgDefaultStatusRejected: {
    color: '#DC2626',
  },
  orgDefaultStatusApproved: {
    color: '#166534',
  },
  orgDeleteButton: {
    padding: wp(1.6),
    borderRadius: wp(2.4),
    backgroundColor: 'rgba(15,23,42,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyOrgContainer: {
    alignItems: 'center',
    paddingVertical: hp(4),
  },
  emptyOrgTitle: {
    fontSize: wp(4.4),
    fontWeight: '700',
    color: '#000000',
  },
  emptyOrgSubtitle: {
    marginTop: hp(0.8),
    fontSize: wp(3.4),
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: wp(4),
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: hp(3),
    paddingVertical: hp(1.6),
    borderRadius: wp(7),
    backgroundColor: '#F4F5F7',
  },
  downloadText: {
    marginLeft: wp(2.5),
    fontSize: wp(3.8),
    fontWeight: '600',
    color: '#1F2933',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(5),
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: wp(8),
    width: '100%',
    maxWidth: wp(110),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: wp(6),
    paddingVertical: wp(5),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17, 24, 39, 0.08)',
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
  },
  modalTitle: {
    fontSize: wp(5.2),
    fontWeight: '700',
    color: '#000000',
  },
  modalIconButton: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    backgroundColor: 'rgba(76, 59, 207, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    backgroundColor: 'rgba(17, 24, 39, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    paddingHorizontal: wp(6),
    paddingVertical: wp(5),
    gap: hp(2),
  },
  inputGroup: {
    marginBottom: wp(5),
  },
  inputLabel: {
    fontSize: wp(3.8),
    fontWeight: '600',
    color: '#1F2933',
    marginBottom: wp(2),
  },
  modalDescription: {
    fontSize: wp(3.2),
    color: '#4B5563',
    lineHeight: wp(4.4),
  },
  modalInput: {
    height: hp(6.2),
    borderRadius: wp(5),
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    paddingHorizontal: wp(4.2),
    fontSize: wp(3.9),
    color: '#000000',
    backgroundColor: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: wp(6),
    paddingVertical: wp(5),
    borderTopWidth: 1,
    borderTopColor: 'rgba(17, 24, 39, 0.05)',
    gap: wp(3),
  },
  scannerBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerCameraFull: {
    ...StyleSheet.absoluteFillObject,
  },
  scannerDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  scannerFocusWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFocusBox: {
    width: SCANNER_FRAME_SIZE,
    height: SCANNER_FRAME_SIZE,
    borderRadius: wp(8),
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    width: wp(9),
    height: wp(9),
    borderColor: '#FFFFFF',
    borderWidth: 3,
    opacity: 0.95,
  },
  scannerCornerTL: {
    top: -1.5,
    left: -1.5,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: wp(4),
  },
  scannerCornerTR: {
    top: -1.5,
    right: -1.5,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: wp(4),
  },
  scannerCornerBL: {
    bottom: -1.5,
    left: -1.5,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: wp(4),
  },
  scannerCornerBR: {
    bottom: -1.5,
    right: -1.5,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: wp(4),
  },
  scannerBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: (Platform.OS === 'ios' ? hp(4) : hp(3)),
    paddingHorizontal: wp(6),
    gap: hp(1.6),
    alignItems: 'stretch',
  },
  scannerCaptionCard: {
    backgroundColor: 'rgba(8, 11, 26, 0.82)',
    borderRadius: wp(4),
    paddingHorizontal: wp(4),
    paddingVertical: wp(3.2),
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.14)',
    alignSelf: 'stretch',
  },
  scannerCloseBar: {
    backgroundColor: 'rgba(241, 245, 249, 0.9)',
    borderRadius: wp(4.5),
    paddingVertical: hp(1.2),
    alignItems: 'center',
  },
  scannerCloseText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: wp(3.6),
    letterSpacing: 0.2,
  },
  scannerStatusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: wp(3),
    paddingVertical: hp(0.5),
    borderRadius: 999,
    marginBottom: hp(0.8),
  },
  scannerStatusPill__neutral: {
    backgroundColor: 'rgba(99, 102, 241, 0.22)',
  },
  scannerStatusPill__busy: {
    backgroundColor: 'rgba(99, 102, 241, 0.28)',
  },
  scannerStatusPill__success: {
    backgroundColor: 'rgba(34, 197, 94, 0.26)',
  },
  scannerStatusPill__error: {
    backgroundColor: 'rgba(239, 68, 68, 0.28)',
  },
  scannerStatusPill__info: {
    backgroundColor: 'rgba(14, 165, 233, 0.24)',
  },
  scannerStatusPillText: {
    color: '#E0E7FF',
    fontWeight: '600',
    fontSize: wp(3.1),
    letterSpacing: 0.3,
  },
  scannerCaptionTitle: {
    color: '#F8FAFC',
    fontSize: wp(4.2),
    fontWeight: '700',
  },
  scannerCaptionRow: {
    marginTop: hp(0.4),
    flexDirection: 'row',
    alignItems: 'center',
  },
  scannerCaptionNote: {
    flex: 1,
    color: 'rgba(226, 232, 240, 0.88)',
    fontSize: wp(3.1),
    lineHeight: 18,
  },
  scannerMetaRow: {
    marginTop: hp(1.4),
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  scannerMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(3),
    paddingVertical: hp(0.6),
    borderRadius: 999,
    backgroundColor: 'rgba(76, 59, 207, 0.22)',
    marginRight: wp(1.8),
    marginTop: hp(0.6),
  },
  scannerMetaChipText: {
    marginLeft: wp(1),
    color: '#E0E7FF',
    fontSize: wp(3),
    fontWeight: '500',
  },
  scannerPermissionFallback: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(8),
  },
  scannerPermissionText: {
    marginTop: hp(1.2),
    color: '#CBD5F5',
    textAlign: 'center',
    fontSize: wp(3.4),
  },
  qrOrgSummary: {
    backgroundColor: 'rgba(76, 59, 207, 0.08)',
    borderRadius: wp(6),
    paddingHorizontal: wp(4.2),
    paddingVertical: hp(2.4),
    borderWidth: 1,
    borderColor: 'rgba(76, 59, 207, 0.18)',
    gap: hp(1.6),
  },
  qrOrgHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: wp(3.2),
  },
  qrOrgIcon: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(3.2),
    backgroundColor: 'rgba(67, 56, 202, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrOrgHeaderText: {
    flex: 1,
    gap: hp(0.6),
  },
  qrOrgSummaryTitle: {
    fontSize: wp(4),
    fontWeight: '700',
    color: '#1E1B4B',
  },
  qrOrgSummarySubtitle: {
    fontSize: wp(3.1),
    color: '#4B5563',
    lineHeight: wp(4.4),
  },
  qrOrgBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1.6),
    paddingHorizontal: wp(3.4),
    paddingVertical: hp(0.9),
    borderRadius: wp(4.8),
    backgroundColor: '#EEF2FF',
  },
  qrOrgBadgeText: {
    fontSize: wp(3.2),
    fontWeight: '600',
    color: '#312E81',
  },
  qrOrgSummaryNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: wp(2.4),
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: wp(4.6),
    paddingHorizontal: wp(3.2),
    paddingVertical: hp(1.2),
  },
  qrOrgSummaryNoteText: {
    flex: 1,
    fontSize: wp(3),
    color: '#1E3A8A',
    lineHeight: wp(4),
  },
  qrForgetButton: {
    marginTop: hp(0.4),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(3.2),
    paddingVertical: hp(0.9),
    borderRadius: wp(4.6),
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    gap: wp(1.6),
  },
  qrForgetButtonText: {
    fontSize: wp(3.1),
    fontWeight: '600',
    color: '#DC2626',
  },
  qrForgetHint: {
    marginTop: hp(0.6),
    textAlign: 'center',
    fontSize: wp(2.8),
    color: 'rgba(30, 27, 75, 0.55)',
  },
  organizationLabelRow: {
    marginTop: hp(1.2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  organizationInfoButton: {
    paddingHorizontal: wp(1),
    paddingVertical: hp(0.4),
  },
  organizationHelperText: {
    marginTop: hp(0.4),
    fontSize: wp(3),
    color: 'rgba(15, 23, 42, 0.65)',
  },
  manualAccessContainer: {
    paddingVertical: hp(0.6),
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  manualAccessInput: {
    height: hp(6.2),
    borderRadius: wp(5),
    borderWidth: 1.5,
    borderColor: 'rgba(76, 59, 207, 0.4)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: wp(4),
    fontSize: wp(3.8),
    letterSpacing: 1,
    color: '#000000',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: wp(2.4),
    marginTop: hp(1),
  },
  otpCell: {
    flex: 1,
    height: hp(6.2),
    borderRadius: wp(3.2),
    borderWidth: 1.5,
    borderColor: 'rgba(76, 59, 207, 0.35)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellActive: {
    borderColor: 'rgba(76, 59, 207, 0.9)',
  },
  otpCellFilled: {
    backgroundColor: 'rgba(76, 59, 207, 0.08)',
  },
  otpCellText: {
    fontSize: wp(4.2),
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: 1.1,
  },
  otpHiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  manualResolveStatus: {
    fontSize: wp(3),
    color: 'rgba(30, 64, 175, 0.85)',
  },
  manualResolveStatusSuccess: {
    color: '#15803D',
  },
  manualResolveStatusError: {
    color: '#DC2626',
  },
  defaultShareSummaryCard: {
    marginTop: hp(1.4),
    marginBottom: hp(2),
    paddingVertical: hp(1.4),
    paddingHorizontal: wp(4),
    borderRadius: wp(4.8),
    backgroundColor: 'rgba(76, 59, 207, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,59,207,0.18)',
  },
  defaultShareSummaryName: {
    fontSize: wp(3.6),
    fontWeight: '700',
    color: '#1F2937',
  },
  defaultShareSummaryCode: {
    marginTop: hp(0.4),
    fontSize: wp(3.1),
    fontWeight: '600',
    color: 'rgba(30,41,59,0.8)',
  },
  defaultShareInput: {
    minHeight: hp(10),
    textAlignVertical: 'top',
  },
  defaultShareHint: {
    marginTop: hp(1),
    fontSize: wp(2.8),
    color: 'rgba(30,41,59,0.65)',
  },
  infoSheetBody: {
    paddingHorizontal: wp(6),
    paddingVertical: hp(3),
    gap: hp(1.6),
  },
  infoSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: wp(3),
  },
  infoSheetTitle: {
    fontSize: wp(4.4),
    fontWeight: '700',
    color: '#000000',
  },
  infoSheetCloseButton: {
    width: wp(8.8),
    height: wp(8.8),
    borderRadius: wp(4.4),
    backgroundColor: 'rgba(15,23,42,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoSheetParagraph: {
    fontSize: wp(3.2),
    color: 'rgba(15, 23, 42, 0.75)',
    lineHeight: wp(4.4),
  },
  modalCancelButton: {
    flex: 1,
    height: hp(6.5),
    borderRadius: wp(4),
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: wp(4),
    fontWeight: '600',
    color: '#4B5563',
  },
  modalNextButton: {
    flex: 1,
    height: hp(6.5),
    borderRadius: wp(4),
    backgroundColor: '#111111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalNextText: {
    fontSize: wp(4),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSaveButton: {
    flex: 1,
    height: hp(6.5),
    borderRadius: wp(4),
    backgroundColor: '#111111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: wp(4),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalDeleteButton: {
    flex: 1,
    height: hp(6.5),
    borderRadius: wp(4),
    backgroundColor: '#F87171',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDeleteText: {
    fontSize: wp(4),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  deleteWarningText: {
    fontSize: wp(3.6),
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: wp(5),
  },
  organizationSelectionContainer: {
    marginTop: wp(2),
  },
  orgVerticalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2.4),
    paddingVertical: hp(1.6),
    paddingHorizontal: wp(4),
    borderRadius: wp(5),
    borderWidth: 1,
    marginBottom: hp(1.2),
  },
  orgVerticalContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
    flex: 1,
  },
  orgVerticalButtonNeutral: {
    borderColor: 'rgba(17, 24, 39, 0.12)',
    backgroundColor: 'rgba(148,163,184,0.12)',
  },
  orgVerticalButtonNeutralActive: {
    borderColor: 'rgba(17,24,39,0.45)',
    backgroundColor: 'rgba(17,24,39,0.85)',
  },
  orgVerticalText: {
    fontSize: wp(3.6),
    color: '#1F2933',
    fontWeight: '600',
  },
  orgVerticalTextSelected: {
    color: '#FFFFFF',
  },
  orgVerticalTextMuted: {
    color: 'rgba(15,23,42,0.78)',
  },
  orgVerticalTextActive: {
    color: '#FFFFFF',
  },
  orgVerticalDot: {
    width: wp(2.6),
    height: wp(2.6),
    borderRadius: wp(1.3),
  },
  orgDefaultPill: {
    marginLeft: wp(1),
    paddingHorizontal: wp(3),
    paddingVertical: wp(0.6),
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.1)',
  },
  orgDefaultPillSelected: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  orgDefaultPillText: {
    fontSize: wp(2.6),
    fontWeight: '700',
    color: 'rgba(15,23,42,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  orgDefaultPillTextSelected: {
    color: '#FFFFFF',
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(6),
  },
  dropdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: wp(8),
    width: '100%',
    maxWidth: wp(90),
    padding: wp(6),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: wp(4),
  },
  dropdownTitle: {
    fontSize: wp(5),
    fontWeight: '700',
    color: '#000000',
  },
  dropdownClose: {
    width: wp(9),
    height: wp(9),
    borderRadius: wp(4.5),
    backgroundColor: 'rgba(17, 24, 39, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalInput: {
    borderColor: 'rgba(17,24,39,0.12)',
    backgroundColor: '#FFFFFF',
  },
});
