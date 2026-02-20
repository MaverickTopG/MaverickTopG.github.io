// @ts-nocheck
import React, { useMemo, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Modal,
  ImageBackground,
  Platform,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Image,
  Linking,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Button as SwiftUIButton, ContextMenu, Host } from "@expo/ui/swift-ui";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolate,
  FadeInRight,
  FadeOutLeft,
  FadeInLeft,
  FadeOutRight,
  FadeInDown,
} from "react-native-reanimated";
import {
  ArrowRight,
  ChatCircleDots,
  Funnel,
  Buildings,
  Users,
  Sparkle,
  Strategy,
  Globe,
  CaretLeft,
  Plus,
  PaperPlaneRight,
  Image as ImageIcon,
  File as FileIcon,
  CheckCheck,
} from "phosphor-react-native";

// --- Firebase Imports ---
import { getApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  limit,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

let ExpoNotifications = null;
try {
  ExpoNotifications = require("expo-notifications");
} catch (e) {
  ExpoNotifications = null;
}

let notificationsHandlerConfigured = false;
if (ExpoNotifications && !notificationsHandlerConfigured) {
  ExpoNotifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  notificationsHandlerConfigured = true;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const wp = (p) => (SCREEN_W * p) / 100;
const hp = (p) => (SCREEN_H * p) / 100;

const COLORS = {
  primary: "#D2F677",
  secondary: "#111827",
  white: "#FFFFFF",
  gray: "#6B7280",
  lightGray: "#F3F4F6",
  accent: "rgba(210, 246, 119, 0.1)",
};

// --- Firebase Helpers ---
const getFirebaseApp = () => {
  if (getApps().length > 0) return getApp();
  throw new Error("Firebase app not initialized");
};
const getFirebaseAuth = () => getAuth(getFirebaseApp());
const getFirestoreDb = () => getFirestore(getFirebaseApp());
const getFirebaseStorage = () => getStorage(getFirebaseApp());

// --- Utilities ---
const uriToBlob = (uri) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new TypeError("Failed to read local file URI."));
    xhr.onload = () => resolve(xhr.response);
    xhr.responseType = "blob";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });

const normalizeOrgCode = (value) =>
  value ? String(value).trim().toUpperCase() : null;

const SUPER_ADMIN_GROUP_KEY = "super-admin";

const normalizeGroupScopeId = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.toLowerCase() === SUPER_ADMIN_GROUP_KEY) return null;
  return text;
};

const extractGroupScopeIdFromRecord = (record = {}) =>
  normalizeGroupScopeId(
    record.target_group_id ||
      record.targetGroupId ||
      record.sub_admin_group_id ||
      record.subAdminGroupId ||
      record.group_scope_id ||
      record.groupScopeId ||
      record.group_id ||
      record.groupId ||
      null,
  );

const resolveGroupScopeNameFromRecord = (record = {}, scopeId = null) => {
  if (!scopeId) return "Super Admin";
  return (
    record.target_group_name ||
    record.targetGroupName ||
    record.sub_admin_group_name ||
    record.subAdminGroupName ||
    record.group_scope_name ||
    record.groupScopeName ||
    record.group_name ||
    record.groupName ||
    "Subadmin Group"
  );
};

const toScopeKey = (scopeId) => scopeId || SUPER_ADMIN_GROUP_KEY;

const sanitizeScopeToken = (scopeId) =>
  toScopeKey(scopeId)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);

const buildLegacyGroupThreadId = (orgCode) => {
  const normalizedCode = normalizeOrgCode(orgCode);
  if (!normalizedCode) return "";
  return `org-${normalizedCode}-all`;
};

const buildLegacyDirectThreadId = (orgCode, participantId = "") => {
  const normalizedCode = normalizeOrgCode(orgCode);
  const normalizedParticipantId = String(participantId || "").trim();
  if (!normalizedCode || !normalizedParticipantId) return "";
  return `org-${normalizedCode}-user-${normalizedParticipantId}`;
};

const buildScopedGroupThreadId = (orgCode, scopeId = null) => {
  const normalizedCode = normalizeOrgCode(orgCode);
  if (!normalizedCode) return "";
  return `org-${normalizedCode}-scope-${sanitizeScopeToken(scopeId)}-all`;
};

const buildScopedDirectThreadId = (
  orgCode,
  scopeId = null,
  participantId = "",
) => {
  const normalizedCode = normalizeOrgCode(orgCode);
  const normalizedParticipantId = String(participantId || "").trim();
  if (!normalizedCode || !normalizedParticipantId) return "";
  return `org-${normalizedCode}-scope-${sanitizeScopeToken(scopeId)}-user-${normalizedParticipantId}`;
};

const buildDirectThreadCandidates = (
  orgCode,
  scopeId = null,
  participantId = "",
) => {
  const normalizedCode = normalizeOrgCode(orgCode);
  const normalizedParticipantId = String(participantId || "").trim();
  if (!normalizedCode || !normalizedParticipantId) return [];
  const ids = new Set();
  ids.add(
    buildScopedDirectThreadId(
      normalizedCode,
      scopeId || null,
      normalizedParticipantId,
    ),
  );
  ids.add(
    buildScopedDirectThreadId(normalizedCode, null, normalizedParticipantId),
  );
  // Legacy direct-thread formats used by earlier builds.
  ids.add(buildLegacyDirectThreadId(normalizedCode, normalizedParticipantId));
  ids.add(`org-${normalizedCode}-${normalizedParticipantId}`);
  ids.add(`${normalizedCode}-${normalizedParticipantId}`);
  return Array.from(ids).filter(Boolean);
};

const buildGroupThreadCandidates = (orgCode, scopeId = null) => {
  const normalizedCode = normalizeOrgCode(orgCode);
  if (!normalizedCode) return [];
  const ids = new Set();
  ids.add(buildScopedGroupThreadId(normalizedCode, scopeId || null));
  ids.add(buildScopedGroupThreadId(normalizedCode, null));
  // Legacy group-thread format used by earlier builds.
  ids.add(buildLegacyGroupThreadId(normalizedCode));
  ids.add(`org-${normalizedCode}`);
  return Array.from(ids).filter(Boolean);
};

const messageMatchesThread = (message = {}, thread = null) => {
  const threadId = String(message.threadId || "").trim();
  if (!threadId || !thread) return false;
  if (thread.threadIds && Array.isArray(thread.threadIds)) {
    return thread.threadIds.includes(threadId);
  }
  return threadId === String(thread.threadId || thread.id || "").trim();
};

const scopedSelectionMatchesRecord = (record = {}, selectedScopeId = null) => {
  const recordScopeId = extractGroupScopeIdFromRecord(record);
  if (selectedScopeId) {
    // Scoped memberships can still see legacy org-wide entries with no explicit scope.
    return !recordScopeId || recordScopeId === selectedScopeId;
  }
  return !recordScopeId;
};

const formatTimeLabel = (timestamp) => {
  const seconds = timestamp?.seconds ? Number(timestamp.seconds) : null;
  if (!seconds) return "";
  const now = Date.now();
  const diff = Math.max(0, now - seconds * 1000);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Now";
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  return `${days}d`;
};

const initialsFromName = (name) => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
};

const normalizeNameValue = (value) => String(value || "").trim();

const resolvePersonNameFromRecord = (record = {}) => {
  const first = normalizeNameValue(record.firstName || record.first_name);
  const last = normalizeNameValue(record.lastName || record.last_name);
  const firstLast = `${first} ${last}`.trim();
  if (firstLast) return firstLast;

  const displayLike =
    normalizeNameValue(record.displayName) ||
    normalizeNameValue(record.user_name) ||
    normalizeNameValue(record.userName) ||
    normalizeNameValue(record.fullName);
  if (displayLike) return displayLike;

  const genericName = normalizeNameValue(record.name);
  if (!genericName) return "";

  const orgLikeNames = [
    record.organizationName,
    record.organization_name,
    record.orgName,
    record.org_name,
    record.orgDisplayName,
  ]
    .map((value) => normalizeNameValue(value).toLowerCase())
    .filter(Boolean);

  if (!orgLikeNames.includes(genericName.toLowerCase())) return genericName;
  return "";
};

const ADMIN_ROLE_TOKENS = [
  "admin",
  "org-admin",
  "organization",
  "owner",
  "super admin",
  "super-admin",
  "subadmin",
  "sub-admin",
];

const isAdminLikeRole = (role = "") => {
  const normalized = String(role || "").trim().toLowerCase();
  if (!normalized) return false;
  return ADMIN_ROLE_TOKENS.some((token) => normalized.includes(token));
};

const resolveStrictPersonNameFromRecord = (record = {}) => {
  const first = normalizeNameValue(record.firstName || record.first_name);
  const last = normalizeNameValue(record.lastName || record.last_name);
  const firstLast = `${first} ${last}`.trim();
  if (firstLast) return firstLast;
  return (
    normalizeNameValue(record.displayName) ||
    normalizeNameValue(record.user_name) ||
    normalizeNameValue(record.userName) ||
    normalizeNameValue(record.fullName) ||
    ""
  );
};

const resolveChatParticipantName = (
  record = {},
  role = "",
  fallbackName = "Volunteer",
) => {
  if (isAdminLikeRole(role)) {
    return resolveStrictPersonNameFromRecord(record) || fallbackName;
  }
  return resolvePersonNameFromRecord(record) || fallbackName;
};

const DEFAULT_THREAD_PREVIEWS = [
  "Ready to spark real change today?",
  "Big impact starts with one message.",
  "Let's rally the team and do this.",
  "Your next win is one chat away.",
  "Momentum is building. Jump in.",
  "A great idea is waiting in here.",
  "Let's turn plans into action.",
  "Collaboration mode: fully activated.",
  "The mission is live. Let's go.",
  "Something meaningful starts now.",
  "Your community is counting on you.",
  "Energy high. Purpose higher.",
  "Time to make today unforgettable.",
  "Good people. Great outcomes.",
  "Let's move this effort forward.",
  "A powerful conversation starts here.",
  "Impact crew assembled and ready.",
  "We're one step from progress.",
  "Let's build something awesome together.",
  "Fresh ideas, real-world results.",
  "Lead with heart and action.",
  "Your next breakthrough starts here.",
  "Let's make every hour count.",
  "This is where momentum happens.",
  "Purpose-driven teamwork starts now.",
  "Let's create impact at scale.",
  "Progress is calling. Answer it.",
  "Let's make this effort shine.",
  "Your mission channel is ready.",
  "Together, we can move mountains.",
];

const hashString = (value = "") => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const getDefaultThreadPreview = (thread = {}, idx = 0) => {
  const seed = `${thread.id || ""}-${thread.threadId || ""}-${thread.name || ""}-${idx}`;
  const hash = hashString(seed);
  return DEFAULT_THREAD_PREVIEWS[hash % DEFAULT_THREAD_PREVIEWS.length];
};

const isAcceptedMembershipStatus = (status = "") => {
  const normalized = String(status || "").toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "accepted" ||
    normalized === "approved" ||
    normalized === "active" ||
    normalized === "connected" ||
    normalized === "granted" ||
    normalized === "confirmed" ||
    normalized.startsWith("accept") ||
    normalized.startsWith("approved")
  );
};

const MESSAGE_ALLOWED_PLAN_TOKENS = ["nebula", "cosmos"];
const MESSAGE_ORBIT_PLAN_TOKENS = ["orbit"];

const normalizePlanKey = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
};

const extractPlanKeyFromRecord = (record = {}) =>
  normalizePlanKey(
    record.planKey ||
      record.plan_key ||
      record.plan ||
      record.planType ||
      record.plan_type ||
      record.subscription_plan_key ||
      record.subscriptionPlanKey ||
      record.metadata?.plan_key ||
      null,
  );

const hasPlanAccessToken = (planKey, tokens = []) => {
  const normalizedPlanKey = normalizePlanKey(planKey);
  if (!normalizedPlanKey) return false;
  return tokens.some((token) => {
    const normalizedToken = normalizePlanKey(token);
    if (!normalizedToken) return false;
    return (
      normalizedPlanKey === normalizedToken ||
      normalizedPlanKey.includes(normalizedToken)
    );
  });
};

const isMessagesPlanEligibleMembership = (record = {}) =>
  hasPlanAccessToken(
    extractPlanKeyFromRecord(record),
    MESSAGE_ALLOWED_PLAN_TOKENS,
  );

const isOrbitPlanMembership = (record = {}) =>
  hasPlanAccessToken(
    extractPlanKeyFromRecord(record),
    MESSAGE_ORBIT_PLAN_TOKENS,
  );

const normalizeRecordId = (value) => {
  const text = String(value || "").trim();
  return text || null;
};

const normalizeEmailValue = (value) => {
  const text = String(value || "").trim().toLowerCase();
  return text || null;
};

const extractOrgCodeFromRecord = (record = {}) =>
  normalizeOrgCode(
    record.access_code ||
      record.orgCode ||
      record.org_code ||
      record.organizationCode ||
      record.org_access_code ||
      null,
  );

const extractOrgIdFromRecord = (record = {}) =>
  normalizeRecordId(
    record.linked_org_id ||
      record.orgId ||
      record.org_id ||
      record.organization_id ||
      record.organizationId ||
      record.id ||
      null,
  );

const extractOrgNameFromRecord = (record = {}) =>
  record.name ||
  record.orgName ||
  record.organizationName ||
  record.org_name ||
  null;

const extractPotentialAdminUserIds = (record = {}) => {
  const candidates = [
    record.owner_uid,
    record.ownerUid,
    record.owner_id,
    record.ownerId,
    record.admin_uid,
    record.adminUid,
    record.admin_id,
    record.adminId,
    record.created_by,
    record.createdBy,
    record.user_id,
    record.userId,
  ];
  return Array.from(
    new Set(candidates.map((value) => normalizeRecordId(value)).filter(Boolean)),
  );
};

const extractPotentialAdminEmails = (record = {}) => {
  const candidates = [
    record.owner_email,
    record.ownerEmail,
    record.admin_email,
    record.adminEmail,
    record.created_by_email,
    record.createdByEmail,
    record.email,
  ];
  return Array.from(
    new Set(candidates.map((value) => normalizeEmailValue(value)).filter(Boolean)),
  );
};

const withEffectivePlanKey = (membershipRecord = {}, orgRecord = null) => {
  const effectivePlanKey =
    extractPlanKeyFromRecord(orgRecord || {}) ||
    extractPlanKeyFromRecord(membershipRecord);
  if (!effectivePlanKey) return membershipRecord;
  return {
    ...membershipRecord,
    planKey: effectivePlanKey,
    plan_key: effectivePlanKey,
    plan: effectivePlanKey,
    planType: effectivePlanKey,
    plan_type: effectivePlanKey,
    subscription_plan_key: effectivePlanKey,
    subscriptionPlanKey: effectivePlanKey,
    metadata: {
      ...(orgRecord?.metadata || {}),
      ...(membershipRecord.metadata || {}),
      plan_key: effectivePlanKey,
    },
  };
};

const toDocRecord = (snap) => ({ id: snap.id, ...(snap.data() || {}) });

const pickBestPlanRecord = (records = []) => {
  const available = records.filter(Boolean);
  if (!available.length) return null;
  return (
    available.find((record) => extractPlanKeyFromRecord(record)) || available[0]
  );
};

const createMembershipOrgResolver = (db) => {
  const cacheByCode = new Map();
  const cacheById = new Map();

  const remember = (record) => {
    if (!record) return null;
    const normalizedCode = extractOrgCodeFromRecord(record);
    const normalizedId = extractOrgIdFromRecord(record);
    if (normalizedCode) cacheByCode.set(normalizedCode, record);
    if (normalizedId) cacheById.set(normalizedId, record);
    return record;
  };

  return async (membershipRecord = {}) => {
    const membershipCode = extractOrgCodeFromRecord(membershipRecord);
    const membershipId = extractOrgIdFromRecord(membershipRecord);

    const cachedMatches = [];
    if (membershipId && cacheById.has(membershipId)) {
      cachedMatches.push(cacheById.get(membershipId));
    }
    if (membershipCode && cacheByCode.has(membershipCode)) {
      cachedMatches.push(cacheByCode.get(membershipCode));
    }
    const cachedBest = pickBestPlanRecord(cachedMatches);
    if (cachedBest && extractPlanKeyFromRecord(cachedBest)) return cachedBest;

    let linkedRecord = cachedBest || null;
    if (membershipId) {
      try {
        const [linkedUserSnap, linkedOrgSnap] = await Promise.all([
          getDoc(doc(db, "users", membershipId)),
          getDoc(doc(db, "organizations", membershipId)),
        ]);
        const linkedCandidates = [];
        if (linkedUserSnap.exists())
          linkedCandidates.push(toDocRecord(linkedUserSnap));
        if (linkedOrgSnap.exists())
          linkedCandidates.push(toDocRecord(linkedOrgSnap));
        const bestLinkedRecord = pickBestPlanRecord(linkedCandidates);
        if (bestLinkedRecord) {
          linkedRecord = remember(bestLinkedRecord);
          if (extractPlanKeyFromRecord(linkedRecord)) return linkedRecord;
        }
      } catch {
        // Ignore and continue fallback lookup by access code.
      }
    }

    if (membershipCode) {
      try {
        const [usersByAccess, usersByOrgCode, orgByAccessCode] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "users"),
                where("access_code", "==", membershipCode),
                limit(1),
              ),
            ),
            getDocs(
              query(
                collection(db, "users"),
                where("organizationCode", "==", membershipCode),
                limit(1),
              ),
            ),
            getDocs(
              query(
                collection(db, "organizations"),
                where("access_code", "==", membershipCode),
                limit(1),
              ),
            ),
          ]);
        const codeCandidates = [];
        if (!usersByAccess.empty)
          codeCandidates.push(toDocRecord(usersByAccess.docs[0]));
        if (!usersByOrgCode.empty)
          codeCandidates.push(toDocRecord(usersByOrgCode.docs[0]));
        if (!orgByAccessCode.empty)
          codeCandidates.push(toDocRecord(orgByAccessCode.docs[0]));
        const bestCodeRecord = pickBestPlanRecord(codeCandidates);
        if (bestCodeRecord) return remember(bestCodeRecord);
      } catch {
        // Ignore and fall back to linked/cached records.
      }
    }

    return linkedRecord;
  };
};

// --- Safe Haptics ---
let Haptics;
try {
  Haptics = require("expo-haptics");
} catch (e) {
  Haptics = null;
}

const triggerHaptic = (type = "light") => {
  if (!Haptics) return;
  const methods = {
    light: Haptics.ImpactFeedbackStyle?.Light,
    medium: Haptics.ImpactFeedbackStyle?.Medium,
    heavy: Haptics.ImpactFeedbackStyle?.Heavy,
    success: Haptics.NotificationFeedbackType?.Success,
  };
  if (type === "success") {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    Haptics.impactAsync(methods[type] || methods.light);
  }
};

const withHaptics =
  (fn, type = "light") =>
  (...args) => {
    triggerHaptic(type);
    return fn?.(...args);
  };

// --- Components ---

function FadeUpView({ children, delay = 0 }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 800, easing: Easing.out(Easing.poly(4)) }),
    );
    translateY.value = withDelay(
      delay,
      withSpring(0, { damping: 20, stiffness: 60 }),
    );
  }, [delay, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

export default function UnifiedMessagingScreen({ route } = {}) {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeThread, setActiveThread] = useState(null);

  const targetUserId = route?.params?.targetUserId;
  const targetOrgCode = normalizeOrgCode(route?.params?.targetOrgCode);
  const targetOrgId = String(route?.params?.targetOrgId || "").trim() || null;
  const targetGroupId = normalizeGroupScopeId(
    route?.params?.targetGroupId ||
      route?.params?.target_group_id ||
      route?.params?.subAdminGroupId ||
      route?.params?.sub_admin_group_id ||
      route?.params?.groupId ||
      route?.params?.group_id ||
      null,
  );
  const targetOpenNonce = String(route?.params?.targetOpenNonce || "");
  const handledTargetRef = useRef("");
  const hasSeededMessageSnapshotRef = useRef(false);
  const notifiedMessageIdsRef = useRef(new Set());
  const notificationsEnabledRef = useRef(false);

  // App State
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [senderName, setSenderName] = useState("Volunteer");
  const [userOrgs, setUserOrgs] = useState([]);
  const [hasOrbitPlanMembership, setHasOrbitPlanMembership] = useState(false);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [rawMessages, setRawMessages] = useState([]);
  const [volunteers, setVolunteers] = useState([]);

  // Chat Interior State
  const [activeMessages, setActiveMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const flatListRef = useRef(null);
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Background Animations
  const blob1Pos = useSharedValue(0);
  const blob2Pos = useSharedValue(0);

  useEffect(() => {
    blob1Pos.value = withRepeat(
      withSequence(
        withTiming(12, { duration: 10000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 10000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    blob2Pos.value = withRepeat(
      withSequence(
        withTiming(-18, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 12000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [blob1Pos, blob2Pos]);

  // Auth & Org Logic
  useEffect(() => {
    let authUnsub = null;
    try {
      const auth = getFirebaseAuth();
      authUnsub = onAuthStateChanged(auth, async (user) => {
        setCurrentUser(user);
        if (!user) {
          setSenderName("Volunteer");
          setUserOrgs([]);
          setHasOrbitPlanMembership(false);
          setCurrentOrg(null);
          setShowOrgPicker(false);
          setShowAttachMenu(false);
          setRawMessages([]);
          setVolunteers([]);
          setActiveThread(null);
          setActiveMessages([]);
          setInputText("");
          setSendingAttachment(false);
          hasSeededMessageSnapshotRef.current = false;
          notifiedMessageIdsRef.current = new Set();
          return setLoading(false);
        }
        setLoading(true);
        try {
          const db = getFirestoreDb();
          const resolveMembershipOrgRecord = createMembershipOrgResolver(db);
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setSenderName(
              resolvePersonNameFromRecord(data) ||
                user.displayName ||
                "Volunteer",
            );
          }
          const [orgMembershipSnaps, userMembershipSnaps] = await Promise.all([
            getDocs(
              query(
                collection(db, "user_organizations"),
                where("user_id", "==", user.uid),
              ),
            ),
            getDocs(
              query(collection(db, "users"), where("user_id", "==", user.uid)),
            ),
          ]);
          const loadedOrgs = [];
          let orbitMembershipDetected = false;
          const processDoc = async (d) => {
            const data = d.data() || {};
            const membershipStatus =
              data.status ||
              data.join_status ||
              data.request_status ||
              data.membership_status ||
              data.approval_status;
            if (!isAcceptedMembershipStatus(membershipStatus)) return;
            const isArchived =
              String(data.status || "").toLowerCase() === "archived" ||
              String(data.status || "").toLowerCase() === "inactive" ||
              String(data.status || "").toLowerCase() === "revoked" ||
              !!data.archived_at ||
              !!data.archived_by_user;
            if (isArchived) return;
            const resolvedOrgRecord = await resolveMembershipOrgRecord(data);
            const planRecord = withEffectivePlanKey(data, resolvedOrgRecord);
            if (isOrbitPlanMembership(planRecord))
              orbitMembershipDetected = true;
            if (!isMessagesPlanEligibleMembership(planRecord)) return;
            const code =
              extractOrgCodeFromRecord(data) ||
              extractOrgCodeFromRecord(resolvedOrgRecord || {});
            const linkedId =
              extractOrgIdFromRecord(data) ||
              extractOrgIdFromRecord(resolvedOrgRecord || {}) ||
              "";
            const scopeId = extractGroupScopeIdFromRecord(data);
            const scopeName = resolveGroupScopeNameFromRecord(data, scopeId);
            const scopeKey = toScopeKey(scopeId);
            const orgName =
              extractOrgNameFromRecord(data) ||
              extractOrgNameFromRecord(resolvedOrgRecord || {}) ||
              code ||
              "Organization";
            const scopedName = scopeId ? `${orgName} (${scopeName})` : orgName;
            const orgIdentity = linkedId || code || String(d.id || "");
            const id = `${scopeKey}::${orgIdentity}`;
            if (
              (code || linkedId) &&
              !data.is_personal &&
              !String(orgIdentity).toLowerCase().includes("personal")
            )
              loadedOrgs.push({
                id,
                membershipKey: id,
                orgId: linkedId || null,
                code,
                name: orgName,
                displayName: scopedName,
                scopeId,
                scopeName,
                scopeKey,
              });
          };
          await Promise.all([
            ...orgMembershipSnaps.docs.map(processDoc),
            ...userMembershipSnaps.docs.map(processDoc),
          ]);
          setHasOrbitPlanMembership(orbitMembershipDetected);
          const uniqueOrgs = loadedOrgs.filter(
            (v, i, a) =>
              a.findIndex(
                (t) =>
                  t.membershipKey &&
                  v.membershipKey &&
                  t.membershipKey === v.membershipKey,
              ) === i,
          );
          setUserOrgs(uniqueOrgs);
          setCurrentOrg((prev) => {
            if (!prev) return uniqueOrgs[0] || null;
            const matched =
              uniqueOrgs.find(
                (org) =>
                  org.membershipKey && org.membershipKey === prev.membershipKey,
              ) ||
              uniqueOrgs.find(
                (org) =>
                  (org.orgId && prev.orgId && org.orgId === prev.orgId) ||
                  (org.code && prev.code && org.code === prev.code),
              );
            return matched || uniqueOrgs[0] || null;
          });
        } catch (e) {
          console.error(e);
          setHasOrbitPlanMembership(false);
        } finally {
          setLoading(false);
        }
      });
    } catch (e) {
      setLoading(false);
    }
    return () => authUnsub?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const setupNotifications = async () => {
      if (!ExpoNotifications) return;
      try {
        if (Platform.OS === "android") {
          await ExpoNotifications.setNotificationChannelAsync("messages", {
            name: "Messages",
            importance: ExpoNotifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: COLORS.primary,
            sound: "default",
          });
        }
        const current = await ExpoNotifications.getPermissionsAsync();
        let granted = current.granted || current.ios?.status === 3;
        if (!granted) {
          const requested = await ExpoNotifications.requestPermissionsAsync();
          granted = requested.granted || requested.ios?.status === 3;
        }
        if (!cancelled) {
          notificationsEnabledRef.current = !!granted;
        }
      } catch (err) {
        if (!cancelled) notificationsEnabledRef.current = false;
      }
    };
    setupNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendUnreadNotification = async (message) => {
    if (!ExpoNotifications || !notificationsEnabledRef.current || !message)
      return;
    try {
      if (activeThread && messageMatchesThread(message, activeThread)) return;

      const threadId = String(message.threadId || "");
      const groupThreadIds = buildGroupThreadCandidates(
        currentOrg?.code,
        currentOrg?.scopeId || null,
      );
      let title = "New message";
      if (threadId && groupThreadIds.includes(threadId)) {
        title = currentOrg?.name
          ? `${currentOrg.displayName || currentOrg.name} • All Volunteers`
          : "All Volunteers";
      } else {
        const matchedVolunteer =
          volunteers.find(
            (v) =>
              buildDirectThreadCandidates(
                currentOrg?.code,
                currentOrg?.scopeId || null,
                v.id,
              ).includes(threadId),
          ) || volunteers.find((v) => v.id === message.senderId);
        title = matchedVolunteer?.name || message.senderName || "New message";
      }

      const body =
        String(message.text || "").trim() ||
        (message.attachmentType === "image"
          ? "Sent an image"
          : message.attachmentType === "pdf"
            ? "Sent a PDF"
            : message.attachmentType
              ? "Sent an attachment"
              : "Sent a new message");

      await ExpoNotifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: "default",
          data: {
            threadId: message.threadId || null,
            senderId: message.senderId || null,
            orgCode: currentOrg?.code || null,
            orgId: currentOrg?.orgId || null,
            targetGroupId: currentOrg?.scopeId || null,
            subAdminGroupId: currentOrg?.scopeId || null,
          },
        },
        trigger: null,
      });
    } catch (e) {
      // no-op
    }
  };

  // Volunteers Sync
  useEffect(() => {
    if (!currentOrg) return;
    const db = getFirestoreDb();
    const volunteerMap = new Map();
    const profileCache = new Map();
    const unsubList = [];
    const commitVolunteers = () => {
      setVolunteers(
        Array.from(volunteerMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
    };
    const upsertParticipant = (participantId, payload = {}) => {
      if (!participantId || participantId === currentUser?.uid) return;
      const existing = volunteerMap.get(participantId) || {};
      volunteerMap.set(participantId, {
        id: participantId,
        name:
          payload.name ||
          existing.name ||
          `${payload.firstName || ""} ${payload.lastName || ""}`.trim() ||
          "Volunteer",
        role: payload.role || existing.role || "Volunteer",
      });
    };
    const subscribe = (col, field, val) => {
      const q = query(collection(db, col), where(field, "==", val));
      const unsub = onSnapshot(q, (snap) => {
        snap.forEach((d) => {
          const data = d.data() || {};
          const participantId = String(
            data.user_id || data.userId || d.id || "",
          ).trim();
          if (!participantId) return;
          if (participantId === currentUser?.uid) return;
          if (
            !scopedSelectionMatchesRecord(data, currentOrg?.scopeId || null)
          ) {
            return;
          }
          const resolvedRole = String(data.role || "Volunteer");
          if (data.user_id !== currentUser?.uid && d.id !== currentUser?.uid) {
            upsertParticipant(participantId, {
              name: resolveChatParticipantName(data, resolvedRole, "Volunteer"),
              role: resolvedRole,
              firstName: data.firstName,
              lastName: data.lastName,
            });
          }
        });
        commitVolunteers();
      });
      unsubList.push(unsub);
    };
    const subscribeMemberships = (field, value) => {
      const q = query(
        collection(db, "user_organizations"),
        where(field, "==", value),
      );
      const unsub = onSnapshot(q, async (snap) => {
        const tasks = [];
        snap.forEach((d) => {
          const data = d.data() || {};
          const membershipStatus =
            data.status ||
            data.join_status ||
            data.request_status ||
            data.membership_status ||
            data.approval_status;
          if (!isAcceptedMembershipStatus(membershipStatus)) return;
          const isArchived =
            String(data.status || "").toLowerCase() === "archived" ||
            String(data.status || "").toLowerCase() === "inactive" ||
            String(data.status || "").toLowerCase() === "revoked" ||
            !!data.archived_at ||
            !!data.archived_by_user;
          if (isArchived) return;
          if (
            !scopedSelectionMatchesRecord(data, currentOrg?.scopeId || null)
          ) {
            return;
          }
          const participantId = String(
            data.user_id ||
              data.userId ||
              data.member_uid ||
              data.memberId ||
              "",
          ).trim();
          if (!participantId || participantId === currentUser?.uid) return;

          tasks.push(
            (async () => {
              let profile = profileCache.get(participantId);
              if (profile === undefined) {
                try {
                  const profileSnap = await getDoc(
                    doc(db, "users", participantId),
                  );
                  profile = profileSnap.exists()
                    ? profileSnap.data() || {}
                    : null;
                } catch {
                  profile = null;
                }
                profileCache.set(participantId, profile);
              }
              const resolvedRole = String(
                profile?.role ||
                  data.role ||
                  data.membership_role ||
                  data.member_role ||
                  "Volunteer",
              );
              upsertParticipant(participantId, {
                name: resolveChatParticipantName(
                  profile || data,
                  resolvedRole,
                  resolveChatParticipantName(data, resolvedRole, "Volunteer"),
                ),
                role: resolvedRole,
                firstName: profile?.firstName || data.firstName,
                lastName: profile?.lastName || data.lastName,
              });
            })(),
          );
        });
        if (tasks.length) await Promise.all(tasks);
        commitVolunteers();
      });
      unsubList.push(unsub);
    };

    const hydrateAdminParticipants = async () => {
      const adminIds = new Set();
      const adminEmails = new Set();

      const absorbOrgRecord = (data = {}) => {
        extractPotentialAdminUserIds(data).forEach((id) => adminIds.add(id));
        extractPotentialAdminEmails(data).forEach((email) =>
          adminEmails.add(email),
        );
      };

      const loadOrgDocById = async (collectionName, id) => {
        if (!id) return;
        try {
          const snap = await getDoc(doc(db, collectionName, id));
          if (snap.exists()) absorbOrgRecord(snap.data() || {});
        } catch {
          // ignore lookup failure
        }
      };

      if (currentOrg?.orgId) {
        await Promise.all([
          loadOrgDocById("organizations", currentOrg.orgId),
          loadOrgDocById("orgs", currentOrg.orgId),
          loadOrgDocById("volunteer_organizations", currentOrg.orgId),
        ]);
      }

      if (currentOrg?.code) {
        const orgCodeQueries = await Promise.all([
          getDocs(
            query(
              collection(db, "organizations"),
              where("access_code", "==", currentOrg.code),
              limit(1),
            ),
          ),
          getDocs(
            query(
              collection(db, "orgs"),
              where("access_code", "==", currentOrg.code),
              limit(1),
            ),
          ),
          getDocs(
            query(
              collection(db, "volunteer_organizations"),
              where("access_code", "==", currentOrg.code),
              limit(1),
            ),
          ),
        ]).catch(() => []);

        orgCodeQueries.forEach((snap) => {
          if (!snap || snap.empty) return;
          absorbOrgRecord(snap.docs[0]?.data() || {});
        });
      }

      const adminRecords = [];
      for (const adminId of adminIds) {
        try {
          const adminSnap = await getDoc(doc(db, "users", adminId));
          if (adminSnap.exists()) {
            adminRecords.push({ id: adminId, ...(adminSnap.data() || {}) });
          }
        } catch {
          // ignore profile lookup failure
        }
      }

      for (const adminEmail of adminEmails) {
        try {
          const snap = await getDocs(
            query(collection(db, "users"), where("email", "==", adminEmail), limit(1)),
          );
          if (!snap.empty) {
            const row = snap.docs[0];
            adminRecords.push({ id: row.id, ...(row.data() || {}) });
          }
        } catch {
          // ignore profile lookup failure
        }
      }

      adminRecords.forEach((record) => {
        const adminId = normalizeRecordId(
          record.id || record.user_id || record.userId || null,
        );
        if (!adminId || adminId === currentUser?.uid) return;
        upsertParticipant(adminId, {
          name: resolveChatParticipantName(record, "admin", "Admin"),
          role: "Admin",
          firstName: record.firstName,
          lastName: record.lastName,
        });
      });
      commitVolunteers();
    };

    if (currentOrg.code) subscribe("users", "access_code", currentOrg.code);
    if (currentOrg.code) subscribe("users", "organizationCode", currentOrg.code);
    if (currentOrg.code) subscribe("users", "org_code", currentOrg.code);
    if (currentOrg.code) subscribe("users", "orgAccessCode", currentOrg.code);
    if (currentOrg.orgId) {
      subscribe("users", "orgId", currentOrg.orgId);
      subscribe("users", "org_id", currentOrg.orgId);
      subscribe("users", "linked_org_id", currentOrg.orgId);
      subscribe("users", "organization_id", currentOrg.orgId);
    }
    if (currentOrg.code) subscribeMemberships("access_code", currentOrg.code);
    if (currentOrg.orgId) {
      subscribeMemberships("linked_org_id", currentOrg.orgId);
      subscribeMemberships("org_id", currentOrg.orgId);
      subscribeMemberships("organization_id", currentOrg.orgId);
    }
    void hydrateAdminParticipants();
    return () => unsubList.forEach((u) => u());
  }, [currentOrg, currentUser]);

  // Global Messages Subscription (for Thread Previews)
  useEffect(() => {
    if (!currentOrg) return;
    hasSeededMessageSnapshotRef.current = false;
    notifiedMessageIdsRef.current = new Set();
    const db = getFirestoreDb();
    const q = currentOrg.code
      ? query(
          collection(db, "messages"),
          where("orgCode", "==", currentOrg.code),
        )
      : query(
          collection(db, "messages"),
          where("orgId", "==", currentOrg.orgId),
        );
    return onSnapshot(q, (snap) => {
      const pendingUnread = [];
      if (!hasSeededMessageSnapshotRef.current) {
        snap.forEach((d) => notifiedMessageIdsRef.current.add(d.id));
        hasSeededMessageSnapshotRef.current = true;
      } else {
        snap.docChanges().forEach((change) => {
          if (change.type !== "added") return;
          const msg = { id: change.doc.id, ...change.doc.data() };
          if (notifiedMessageIdsRef.current.has(msg.id)) return;
          notifiedMessageIdsRef.current.add(msg.id);
          if (!scopedSelectionMatchesRecord(msg, currentOrg?.scopeId || null)) {
            return;
          }
          if (msg.senderId === currentUser?.uid) return;
          const isUnread = !activeThread || !messageMatchesThread(msg, activeThread);
          if (!isUnread) return;
          pendingUnread.push(msg);
        });
      }
      const msgs = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        if (!scopedSelectionMatchesRecord(data, currentOrg?.scopeId || null))
          return;
        msgs.push({ id: d.id, ...data });
      });
      setRawMessages(
        msgs.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        ),
      );
      if (pendingUnread.length) {
        pendingUnread.forEach((msg) => {
          void sendUnreadNotification(msg);
        });
      }
    });
  }, [currentOrg, currentUser?.uid, activeThread, volunteers]);

  // Component Specific Messages Sync (for Chat Interior)
  useEffect(() => {
    if (!activeThread) return;
    const msgs = rawMessages
      .filter((msg) => messageMatchesThread(msg, activeThread))
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    setActiveMessages(msgs);
  }, [activeThread, rawMessages]);

  const conversations = useMemo(() => {
    const list = [];
    if (currentOrg?.code) {
      const gIds = buildGroupThreadCandidates(
        currentOrg.code,
        currentOrg.scopeId || null,
      );
      const gMsgs = rawMessages.filter((m) =>
        gIds.includes(String(m.threadId || "").trim()),
      );
      const preferredGroupId =
        String(gMsgs[0]?.threadId || "").trim() || gIds[0] || "";
      list.push({
        id: preferredGroupId || gIds[0] || "all-volunteers",
        threadId: preferredGroupId || gIds[0] || "all-volunteers",
        threadIds: gIds,
        name: "All Volunteers",
        type: "group",
        role: "Broadcast Channel",
        initials: "AV",
        lastMessage: gMsgs[0]?.text || "Official announcements",
        time: formatTimeLabel(gMsgs[0]?.createdAt),
      });
    }
    volunteers.forEach((v) => {
      const tIds = buildDirectThreadCandidates(
        currentOrg?.code,
        currentOrg?.scopeId || null,
        v.id,
      );
      const vMsgs = rawMessages.filter((m) =>
        tIds.includes(String(m.threadId || "").trim()),
      );
      const preferredDirectId =
        String(vMsgs[0]?.threadId || "").trim() || tIds[0] || "";
      list.push({
        id: v.id,
        threadId: preferredDirectId || tIds[0] || v.id,
        threadIds: tIds,
        name: v.name,
        type: "direct",
        role: v.role,
        initials: initialsFromName(v.name),
        lastMessage: vMsgs[0]?.text || "",
        time: formatTimeLabel(vMsgs[0]?.createdAt),
      });
    });
    return list;
  }, [rawMessages, volunteers, currentOrg]);

  useEffect(() => {
    if (!targetUserId || !userOrgs.length) return;
    if (!targetOrgCode && !targetOrgId) return;

    const matchedOrg = userOrgs.find(
      (org) =>
        ((targetOrgId && org.orgId === targetOrgId) ||
          (targetOrgCode && org.code === targetOrgCode)) &&
        (!targetGroupId || org.scopeId === targetGroupId),
    );

    if (!matchedOrg) return;
    if (
      currentOrg &&
      ((targetOrgId && currentOrg.orgId === targetOrgId) ||
        (targetOrgCode && currentOrg.code === targetOrgCode)) &&
      (!targetGroupId || currentOrg.scopeId === targetGroupId)
    ) {
      return;
    }

    setCurrentOrg(matchedOrg);
    setActiveThread(null);
    setActiveMessages([]);
  }, [
    targetUserId,
    targetOrgCode,
    targetOrgId,
    targetGroupId,
    userOrgs,
    currentOrg,
  ]);

  // Deep Link Handling
  useEffect(() => {
    if (targetUserId && conversations.length > 0 && !activeThread) {
      const deepLinkKey = `${targetOpenNonce || "legacy"}:${targetOrgCode || ""}:${targetOrgId || ""}:${targetGroupId || ""}:${targetUserId}`;
      if (handledTargetRef.current === deepLinkKey) return;

      const target = conversations.find((c) => c.id === targetUserId);
      if (target) {
        handledTargetRef.current = deepLinkKey;
        setActiveThread(target);
      } else {
        // If not found in current list (maybe because volunteers list isn't fully loaded or they aren't in it)
        // We might want to try to find them in volunteers map specifically
        // For now, let's just create a temporary thread object if we can find the user in volunteers
        const volunteer = volunteers.find((v) => v.id === targetUserId);
        if (volunteer) {
          const tIds = buildDirectThreadCandidates(
            currentOrg?.code,
            currentOrg?.scopeId || null,
            volunteer.id,
          );
          handledTargetRef.current = deepLinkKey;
          setActiveThread({
            id: volunteer.id,
            threadId: tIds[0] || volunteer.id,
            threadIds: tIds,
            name: volunteer.name,
            type: "direct",
            role: volunteer.role,
            initials: initialsFromName(volunteer.name),
            lastMessage: "",
            time: "New",
          });
        }
      }
    }
  }, [
    targetUserId,
    targetOpenNonce,
    targetOrgCode,
    targetOrgId,
    targetGroupId,
    conversations,
    volunteers,
    currentOrg,
    activeThread,
  ]);

  const sendMessagePayload = async ({ text = "", attachment = null } = {}) => {
    if (!activeThread || !currentUser) return;
    const fallbackText = attachment
      ? attachment.kind === "image"
        ? `Shared an image${attachment.name ? `: ${attachment.name}` : "."}`
        : attachment.kind === "pdf"
          ? `Shared a PDF${attachment.name ? `: ${attachment.name}` : "."}`
          : `Shared a file${attachment.name ? `: ${attachment.name}` : "."}`
      : "";
    const resolvedText = String(text || fallbackText).trim();
    if (!resolvedText) return;
    try {
      const db = getFirestoreDb();
      let uploadedAttachment = null;

      if (attachment?.uri) {
        const orgScopeRaw =
          currentOrg?.membershipKey ||
          currentOrg?.orgId ||
          currentOrg?.code ||
          "global";
        const orgScope = String(orgScopeRaw)
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 120);
        const cleanName = String(
          attachment.name || `${attachment.kind || "file"}-${Date.now()}`,
        )
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .slice(-120);
        const storagePath = `messages/org-${orgScope}/${Date.now()}_${cleanName}`;
        const blob = await uriToBlob(attachment.uri);
        const storage = getFirebaseStorage();
        const storageRef = ref(storage, storagePath);
        const metadata = attachment?.mimeType
          ? { contentType: attachment.mimeType }
          : undefined;
        const snapshot = await uploadBytes(storageRef, blob, metadata);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        if (blob && typeof blob.close === "function") blob.close();

        uploadedAttachment = {
          url: downloadUrl,
          type: attachment?.mimeType || "application/octet-stream",
          name: attachment?.name || cleanName,
        };
      }

      await addDoc(collection(db, "messages"), {
        threadId: activeThread.threadId || activeThread.id,
        orgCode: currentOrg?.code,
        orgId: currentOrg?.orgId || null,
        senderId: currentUser.uid,
        senderName,
        text: resolvedText,
        attachment: uploadedAttachment,
        attachmentType: attachment?.kind || null,
        attachmentName: uploadedAttachment?.name || attachment?.name || null,
        attachmentUri: uploadedAttachment?.url || null,
        attachmentMimeType:
          uploadedAttachment?.type || attachment?.mimeType || null,
        attachmentSize: attachment?.size || null,
        target_group_id: currentOrg?.scopeId || null,
        targetGroupId: currentOrg?.scopeId || null,
        target_group_name: currentOrg?.scopeName || "Super Admin",
        targetGroupName: currentOrg?.scopeName || "Super Admin",
        sub_admin_group_id: currentOrg?.scopeId || null,
        subAdminGroupId: currentOrg?.scopeId || null,
        sub_admin_group_name: currentOrg?.scopeName || "Super Admin",
        subAdminGroupName: currentOrg?.scopeName || "Super Admin",
        group_scope_id: currentOrg?.scopeId || null,
        group_scope_name: currentOrg?.scopeName || "Super Admin",
        createdAt: serverTimestamp(),
        type: activeThread.type,
      });
    } catch (e) {
      console.error(e);
      Alert.alert("Send failed", "We couldn't send that message. Try again.");
    }
  };

  const handleSend = async () => {
    const txt = inputText.trim();
    if (!txt) return;
    triggerHaptic("medium");
    setInputText("");
    await sendMessagePayload({ text: txt });
  };

  const handlePickImage = async () => {
    try {
      setShowAttachMenu(false);
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Allow photo library access to send images.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setSendingAttachment(true);
      await sendMessagePayload({
        attachment: {
          kind: "image",
          name: asset.fileName || `image-${Date.now()}.jpg`,
          uri: asset.uri,
          mimeType: asset.mimeType || "image/jpeg",
          size: asset.fileSize || null,
        },
      });
      triggerHaptic("success");
    } catch (e) {
      console.error(e);
      Alert.alert("Image failed", "Could not attach image. Please try again.");
    } finally {
      setSendingAttachment(false);
    }
  };

  const handlePickFile = async () => {
    try {
      setShowAttachMenu(false);
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "*/*",
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setSendingAttachment(true);
      await sendMessagePayload({
        attachment: {
          kind: "file",
          name: file.name || `file-${Date.now()}`,
          uri: file.uri,
          mimeType: file.mimeType || "application/octet-stream",
          size: file.size || null,
        },
      });
      triggerHaptic("success");
    } catch (e) {
      console.error(e);
      Alert.alert("File failed", "Could not attach file. Please try again.");
    } finally {
      setSendingAttachment(false);
    }
  };

  const handlePickPdf = async () => {
    try {
      setShowAttachMenu(false);
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "application/pdf",
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      setSendingAttachment(true);
      await sendMessagePayload({
        attachment: {
          kind: "pdf",
          name: file.name || `document-${Date.now()}.pdf`,
          uri: file.uri,
          mimeType: file.mimeType || "application/pdf",
          size: file.size || null,
        },
      });
      triggerHaptic("success");
    } catch (e) {
      console.error(e);
      Alert.alert("PDF failed", "Could not attach PDF. Please try again.");
    } finally {
      setSendingAttachment(false);
    }
  };

  const openThread = (thread) => {
    if (!thread) return;
    setActiveMessages([]);
    setActiveThread(thread);
  };

  const handleFastLogPress = () => {
    router.push({
      pathname: "/logs",
      params: { fastLogNonce: String(Date.now()) },
    });
  };

  const bgStyle1 = useAnimatedStyle(() => ({
    transform: [
      { translateX: blob1Pos.value },
      {
        translateY:
          blob1Pos.value +
          interpolate(scrollY.value, [0, 1000], [0, -180], Extrapolate.CLAMP),
      },
    ],
  }));
  const bgStyle2 = useAnimatedStyle(() => ({
    transform: [
      { translateX: blob2Pos.value },
      {
        translateY:
          -blob2Pos.value +
          interpolate(scrollY.value, [0, 1000], [0, -220], Extrapolate.CLAMP),
      },
    ],
  }));

  const showSignedOutState = !loading && !currentUser;
  const showNoEligibleOrgState =
    !loading && !!currentUser && userOrgs.length === 0;

  if (showSignedOutState) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="dark-content"
          translucent
          backgroundColor="transparent"
        />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.loginBlob, styles.loginBlobTop]} />
          <View style={[styles.loginBlob, styles.loginBlobBottom]} />
        </View>
        <View style={styles.loginStateContent}>
          <View style={styles.loginStateIconCircle}>
            <ChatCircleDots size={34} color={COLORS.secondary} weight="bold" />
          </View>
          <Text style={styles.loginStateTitle}>Login Required</Text>
          <Text style={styles.loginStateBody}>
            Login to use these features.
          </Text>
        </View>
        {currentUser ? (
          <TouchableOpacity
            style={[
              styles.fastLogButton,
              {
                right: wp(6),
                bottom: Math.max(insets.bottom + 16, 28) + hp(4),
              },
            ]}
            activeOpacity={0.9}
            onPress={handleFastLogPress}
          >
            <Plus size={24} color={COLORS.secondary} weight="bold" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        translucent
        backgroundColor="transparent"
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.blob1, bgStyle1]} />
        <Animated.View style={[styles.blob2, bgStyle2]} />
        <ImageBackground
          source={{
            uri: "https://www.transparenttextures.com/patterns/asfalt-dark.png",
          }}
          style={StyleSheet.absoluteFill}
          imageStyle={{ opacity: 0.04 }}
        />
      </View>

      {!activeThread ? (
        // --- THREAD LIST VIEW ---
        <Animated.View exiting={FadeOutLeft} style={{ flex: 1 }}>
          <Animated.ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroSection}>
              <FadeUpView delay={100}>
                <View>
                  <View style={styles.heroTopRow}>
                    <Text style={styles.heroTitle}>Message</Text>
                    {Platform.OS === "ios" ? (
                      <Host style={styles.filterMenuHost}>
                        <ContextMenu activationMethod="singlePress">
                          <ContextMenu.Items>
                            {userOrgs.map((org) => (
                              <SwiftUIButton
                                key={`org-${org.membershipKey || org.id || org.code || org.name}`}
                                systemImage={
                                  currentOrg?.id === org.id
                                    ? "checkmark.circle.fill"
                                    : "building.2"
                                }
                                onPress={() =>
                                  withHaptics(
                                    () => setCurrentOrg(org),
                                    "success",
                                  )()
                                }
                              >
                                {org.displayName ||
                                  org.name ||
                                  org.code ||
                                  "Organization"}
                              </SwiftUIButton>
                            ))}
                          </ContextMenu.Items>
                          <ContextMenu.Trigger>
                            <View style={styles.filterGlassContainer}>
                              <BlurView
                                intensity={80}
                                tint="light"
                                style={styles.filterGlassBlur}
                              >
                                <Funnel
                                  size={22}
                                  color={COLORS.secondary}
                                  weight="bold"
                                />
                              </BlurView>
                            </View>
                          </ContextMenu.Trigger>
                        </ContextMenu>
                      </Host>
                    ) : (
                      <TouchableOpacity
                        onPress={withHaptics(
                          () => setShowOrgPicker(true),
                          "medium",
                        )}
                        style={styles.filterBtn}
                      >
                        <Funnel
                          size={22}
                          color={COLORS.secondary}
                          weight="bold"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.heroSubtitle}>Discovery.</Text>
                </View>
              </FadeUpView>
            </View>

            <View style={styles.bentoGrid}>
              {loading ? (
                <ActivityIndicator
                  color={COLORS.secondary}
                  style={{ marginTop: 40 }}
                />
              ) : showNoEligibleOrgState ? (
                <View style={styles.emptyState}>
                  <Sparkle size={40} color={COLORS.gray} />
                  <Text style={styles.emptyStateTitle}>
                    {hasOrbitPlanMembership
                      ? "Messaging Not Included"
                      : "Messaging Locked By Plan"}
                  </Text>
                  <Text style={styles.emptyStateBody}>
                    {hasOrbitPlanMembership
                      ? "Your organization is on the Orbit plan, which does not include Messages access."
                      : "Messages are available for organizations on Nebula or Cosmos plans."}
                  </Text>
                </View>
              ) : conversations.length === 0 ? (
                <View style={styles.emptyState}>
                  <ChatCircleDots size={40} color={COLORS.gray} />
                  <Text style={styles.emptyStateTitle}>No Messages Yet</Text>
                  <Text style={styles.emptyStateBody}>
                    Conversations for this organization will appear here.
                  </Text>
                </View>
              ) : (
                conversations.map((item, i) => (
                  <FadeUpView key={item.id} delay={200 + i * 80}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={withHaptics(() => openThread(item), "medium")}
                      style={
                        item.type === "group"
                          ? styles.featuredCard
                          : styles.threadCard
                      }
                    >
                      {item.type === "group" && (
                        <View style={styles.cardGlow} />
                      )}
                      <View style={styles.cardHeader}>
                        <View
                          style={[
                            styles.avatarBox,
                            item.type === "group" && {
                              backgroundColor: COLORS.secondary,
                            },
                          ]}
                        >
                          {item.type === "group" ? (
                            <Users
                              size={wp(7)}
                              color={COLORS.primary}
                              weight="fill"
                            />
                          ) : (
                            <Text style={styles.avatarText}>
                              {item.initials}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.threadName,
                              item.type === "group" && { fontSize: wp(6) },
                            ]}
                          >
                            {item.name}
                          </Text>
                        </View>
                        <Text style={styles.threadTime}>{item.time}</Text>
                      </View>
                      <Text
                        style={[
                          styles.threadPreview,
                          item.type === "group" && {
                            color: "rgba(0,0,0,0.6)",
                            marginTop: 12,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item.lastMessage || getDefaultThreadPreview(item, i)}
                      </Text>
                      {item.type === "group" && (
                        <View style={styles.actionPill}>
                          <Text style={styles.actionPillText}>
                            Open Channel
                          </Text>
                          <ArrowRight
                            size={14}
                            color={COLORS.white}
                            weight="bold"
                          />
                        </View>
                      )}
                    </TouchableOpacity>
                  </FadeUpView>
                ))
              )}
            </View>
          </Animated.ScrollView>
        </Animated.View>
      ) : (
        // --- CHAT INTERIOR VIEW ---
        <Animated.View
          entering={FadeInRight}
          exiting={FadeOutRight}
          style={{ flex: 1 }}
        >
          <View style={styles.chatHeader}>
            <TouchableOpacity
              onPress={withHaptics(() => {
                setActiveThread(null);
                setActiveMessages([]);
              }, "light")}
              style={styles.backButton}
            >
              <CaretLeft size={24} color={COLORS.secondary} weight="bold" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerName}>{activeThread.name}</Text>
            </View>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <FlatList
              ref={flatListRef}
              data={activeMessages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: true })
              }
              renderItem={({ item }) => {
                const isUs = item.senderId === currentUser?.uid;
                const messageAttachment = item.attachment || null;
                const attachmentUri =
                  messageAttachment?.url || item.attachmentUri || null;
                const attachmentMimeType =
                  messageAttachment?.type || item.attachmentMimeType || "";
                const attachmentName =
                  messageAttachment?.name || item.attachmentName || "";
                const attachmentIsImage =
                  attachmentMimeType.startsWith("image/") ||
                  item.attachmentType === "image";
                return (
                  <View
                    style={[
                      styles.msgRow,
                      isUs
                        ? { justifyContent: "flex-end" }
                        : { justifyContent: "flex-start" },
                    ]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        isUs ? styles.bubbleUser : styles.bubbleOther,
                      ]}
                    >
                      {!isUs && activeThread.type === "group" && (
                        <Text style={styles.senderNameTag}>
                          {item.senderName}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.msgText,
                          isUs
                            ? { color: COLORS.white }
                            : { color: COLORS.secondary },
                        ]}
                      >
                        {item.text}
                      </Text>
                      {!!attachmentUri && attachmentIsImage && (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => Linking.openURL(attachmentUri)}
                          style={styles.imageAttachmentWrap}
                        >
                          <Image
                            source={{ uri: attachmentUri }}
                            style={styles.imageAttachment}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      )}
                      {!!attachmentUri && !attachmentIsImage && (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => Linking.openURL(attachmentUri)}
                          style={styles.fileAttachment}
                        >
                          <FileIcon
                            size={18}
                            color={isUs ? COLORS.primary : COLORS.secondary}
                            weight="bold"
                          />
                          <Text
                            style={[
                              styles.fileAttachmentText,
                              isUs && { color: COLORS.white },
                            ]}
                            numberOfLines={1}
                          >
                            {attachmentName ||
                              (attachmentMimeType.includes("pdf") ||
                              item.attachmentType === "pdf"
                                ? "Open PDF"
                                : "Open file")}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          marginTop: 4,
                        }}
                      >
                        <Text
                          style={[
                            styles.msgTime,
                            isUs
                              ? { color: "rgba(255,255,255,0.5)" }
                              : { color: "rgba(0,0,0,0.4)" },
                          ]}
                        >
                          {formatTimeLabel(item.createdAt)}
                        </Text>
                        {isUs && (
                          <CheckCheck
                            size={12}
                            color={COLORS.primary}
                            weight="bold"
                            style={{ marginLeft: 4 }}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                );
              }}
            />
            <View style={styles.composer}>
              <View style={styles.composerInner}>
                <TouchableOpacity
                  style={[
                    styles.composerBtn,
                    sendingAttachment && { opacity: 0.5 },
                  ]}
                  onPress={withHaptics(() => setShowAttachMenu(true), "light")}
                  disabled={sendingAttachment}
                >
                  <Plus size={20} color={COLORS.gray} weight="bold" />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder="Type a message..."
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!inputText.trim() || sendingAttachment}
                  style={[
                    styles.sendBtn,
                    (!inputText.trim() || sendingAttachment) && {
                      opacity: 0.5,
                    },
                  ]}
                >
                  <PaperPlaneRight
                    size={22}
                    color={COLORS.secondary}
                    weight="fill"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}

      {/* Org Selection Modal */}
      <Modal
        visible={showOrgPicker && !showSignedOutState}
        transparent
        animationType="fade"
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOrgPicker(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalHeading}>Select Context</Text>
            <ScrollView style={{ maxHeight: hp(40) }}>
              {userOrgs.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  onPress={withHaptics(() => {
                    setCurrentOrg(o);
                    setShowOrgPicker(false);
                  }, "success")}
                  style={[
                    styles.orgItem,
                    currentOrg?.id === o.id && {
                      backgroundColor: COLORS.accent,
                    },
                  ]}
                >
                  <Buildings
                    size={20}
                    color={
                      currentOrg?.id === o.id ? COLORS.secondary : COLORS.gray
                    }
                  />
                  <Text
                    style={[
                      styles.orgNameText,
                      currentOrg?.id === o.id && {
                        color: COLORS.secondary,
                        fontWeight: "900",
                      },
                    ]}
                  >
                    {o.displayName || o.name}
                  </Text>
                  {currentOrg?.id === o.id && <View style={styles.itemDot} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showAttachMenu && !showSignedOutState}
        transparent
        animationType="fade"
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
        >
          <View style={styles.attachSheet}>
            <Text style={styles.attachTitle}>Attach to message</Text>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={withHaptics(handlePickImage, "medium")}
              activeOpacity={0.85}
            >
              <View style={styles.attachIconWrap}>
                <ImageIcon size={20} color={COLORS.secondary} weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.attachLabel}>Photo</Text>
                <Text style={styles.attachSubLabel}>
                  Pick from your library
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={withHaptics(handlePickPdf, "medium")}
              activeOpacity={0.85}
            >
              <View style={styles.attachIconWrap}>
                <FileIcon size={20} color={COLORS.secondary} weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.attachLabel}>PDF</Text>
                <Text style={styles.attachSubLabel}>Attach a PDF document</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={withHaptics(handlePickFile, "medium")}
              activeOpacity={0.85}
            >
              <View style={styles.attachIconWrap}>
                <FileIcon size={20} color={COLORS.secondary} weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.attachLabel}>File</Text>
                <Text style={styles.attachSubLabel}>Choose any document</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachCancel}
              onPress={() => setShowAttachMenu(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.attachCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {currentUser && !activeThread ? (
        <TouchableOpacity
          style={[
            styles.fastLogButton,
            { right: wp(6), bottom: Math.max(insets.bottom + 16, 28) + hp(4) },
          ]}
          activeOpacity={0.9}
          onPress={handleFastLogPress}
        >
          <Plus size={24} color={COLORS.secondary} weight="bold" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  loginStateContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  loginStateIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(210, 246, 119, 0.16)",
    marginBottom: 16,
  },
  loginStateTitle: {
    fontSize: 56,
    fontWeight: "900",
    color: COLORS.secondary,
    textAlign: "center",
    letterSpacing: -1.4,
  },
  loginStateBody: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.gray,
    textAlign: "center",
  },
  loginBlob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(210, 246, 119, 0.14)",
  },
  loginBlobTop: {
    width: wp(96),
    height: wp(96),
    top: -wp(46),
    right: -wp(26),
  },
  loginBlobBottom: {
    width: wp(78),
    height: wp(78),
    bottom: -wp(34),
    left: -wp(32),
  },
  fastLogButton: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    zIndex: 120,
  },
  scrollContent: {
    paddingHorizontal: wp(6),
    paddingTop: hp(8),
    paddingBottom: hp(10),
  },
  blob1: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    opacity: 0.16,
    width: wp(110),
    height: wp(110),
    top: -wp(50),
    right: -wp(40),
  },
  blob2: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    opacity: 0.16,
    width: wp(80),
    height: wp(80),
    bottom: -wp(30),
    left: -wp(40),
  },
  heroSection: { marginBottom: hp(4) },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTitle: {
    fontSize: wp(12),
    fontWeight: "900",
    color: COLORS.secondary,
    letterSpacing: -1.5,
    lineHeight: wp(12),
  },
  heroSubtitle: {
    fontSize: wp(12),
    fontWeight: "900",
    color: COLORS.gray,
    opacity: 0.6,
    letterSpacing: -1.5,
    lineHeight: wp(12),
  },
  filterBtn: {
    width: 54,
    height: 54,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  filterMenuHost: {
    width: 54,
    height: 54,
    zIndex: 30,
  },
  filterGlassContainer: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 0,
    backgroundColor: COLORS.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  filterGlassBlur: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bentoGrid: { gap: 16 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 42,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyStateTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.secondary,
    textAlign: "center",
  },
  emptyStateBody: {
    fontSize: 13,
    color: COLORS.gray,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
  },
  featuredCard: {
    backgroundColor: COLORS.primary,
    padding: 32,
    borderRadius: 48,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 8,
  },
  cardGlow: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 160,
    height: 160,
    backgroundColor: COLORS.white,
    opacity: 0.3,
    borderRadius: 999,
  },
  threadCard: {
    backgroundColor: "#F8F9FA",
    padding: 22,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatarBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(210, 246, 119, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "900", color: COLORS.secondary, fontSize: 16 },
  threadName: { fontSize: 17, fontWeight: "800", color: COLORS.secondary },
  threadTime: { fontSize: 12, color: COLORS.gray, fontWeight: "700" },
  threadPreview: {
    fontSize: 14,
    color: COLORS.gray,
    fontWeight: "500",
    marginTop: 4,
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 100,
    alignSelf: "flex-start",
    marginTop: 24,
  },
  actionPillText: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  chatHeader: {
    paddingTop: hp(7),
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0,
  },
  backButton: {
    width: 54,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    zIndex: 120,
  },
  headerTextWrap: { flex: 1, marginLeft: 16, justifyContent: "center" },
  headerName: { fontSize: 18, fontWeight: "900", color: COLORS.secondary },
  msgRow: { marginBottom: 16, width: "100%", flexDirection: "row" },
  bubble: { maxWidth: "80%", padding: 14, borderRadius: 20 },
  bubbleUser: { backgroundColor: COLORS.secondary, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  senderNameTag: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.primary,
    marginBottom: 4,
    letterSpacing: 1,
  },
  msgText: { fontSize: 15, lineHeight: 22, fontWeight: "500" },
  imageAttachmentWrap: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  imageAttachment: {
    width: Math.min(wp(58), 280),
    height: 160,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  fileAttachment: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: Math.min(wp(60), 300),
  },
  fileAttachmentText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: "700",
  },
  msgTime: { fontSize: 10, fontWeight: "700" },
  composer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    paddingTop: 10,
    transform: [{ translateY: -hp(7) }],
  },
  composerInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 30,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  composerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.secondary,
    paddingHorizontal: 12,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 32,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 48,
    padding: 32,
  },
  modalHeading: {
    fontSize: 24,
    fontWeight: "900",
    color: COLORS.secondary,
    marginBottom: 24,
  },
  orgItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: 24,
  },
  orgNameText: { flex: 1, fontSize: 16, color: COLORS.gray, fontWeight: "600" },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  attachSheet: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 20,
    width: "100%",
  },
  attachTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.secondary,
    marginBottom: 14,
  },
  attachOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  attachIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  attachLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.secondary,
  },
  attachSubLabel: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.gray,
    fontWeight: "500",
  },
  attachCancel: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.lightGray,
  },
  attachCancelText: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.secondary,
  },
});
