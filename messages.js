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

const buildScopedGroupThreadId = (orgCode, scopeId = null) => {
  const normalizedCode = normalizeOrgCode(orgCode);
  if (!normalizedCode) return "";
  if (!scopeId) return `org-${normalizedCode}-all`;
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
  if (!scopeId) return `org-${normalizedCode}-user-${normalizedParticipantId}`;
  return `org-${normalizedCode}-scope-${sanitizeScopeToken(scopeId)}-user-${normalizedParticipantId}`;
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
        if (!user) return setLoading(false);
        setLoading(true);
        try {
          const db = getFirestoreDb();
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setSenderName(
              `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
                data.name ||
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
          const processDoc = (d) => {
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
            const code = normalizeOrgCode(
              data.access_code || data.orgCode || data.org_code,
            );
            const linkedId = String(
              data.linked_org_id || data.orgId || data.org_id || "",
            ).trim();
            const scopeId = extractGroupScopeIdFromRecord(data);
            const scopeName = resolveGroupScopeNameFromRecord(data, scopeId);
            const scopeKey = toScopeKey(scopeId);
            const orgName = data.name || data.orgName || code || "Organization";
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
          orgMembershipSnaps.forEach(processDoc);
          userMembershipSnaps.forEach(processDoc);
          const uniqueOrgs = loadedOrgs.filter(
            (v, i, a) =>
              a.findIndex(
                (t) => t.membershipKey && v.membershipKey && t.membershipKey === v.membershipKey,
              ) === i,
          );
          setUserOrgs(uniqueOrgs);
          setCurrentOrg((prev) => {
            if (!prev) return uniqueOrgs[0] || null;
            const matched =
              uniqueOrgs.find(
                (org) => org.membershipKey && org.membershipKey === prev.membershipKey,
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
    if (!ExpoNotifications || !notificationsEnabledRef.current || !message) return;
    try {
      const activeThreadId = activeThread?.threadId || activeThread?.id || null;
      if (activeThreadId && message.threadId === activeThreadId) return;

      const threadId = String(message.threadId || "");
      const groupThreadId = buildScopedGroupThreadId(
        currentOrg?.code,
        currentOrg?.scopeId || null,
      );
      let title = "New message";
      if (threadId && groupThreadId && threadId === groupThreadId) {
        title = currentOrg?.name
          ? `${currentOrg.displayName || currentOrg.name} • All Volunteers`
          : "All Volunteers";
      } else {
        const matchedVolunteer =
          volunteers.find(
            (v) =>
              buildScopedDirectThreadId(
                currentOrg?.code,
                currentOrg?.scopeId || null,
                v.id,
              ) === threadId,
          ) ||
          volunteers.find((v) => v.id === message.senderId);
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
    const unsubList = [];
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
          if (data.user_id !== currentUser?.uid && d.id !== currentUser?.uid) {
            volunteerMap.set(participantId, {
              id: participantId,
              name:
                `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
                data.name ||
                "Volunteer",
              role: data.role || "Volunteer",
            });
          }
        });
        setVolunteers(
          Array.from(volunteerMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
      });
      unsubList.push(unsub);
    };
    if (currentOrg.code) subscribe("users", "access_code", currentOrg.code);
    if (currentOrg.orgId) {
      subscribe("users", "orgId", currentOrg.orgId);
      subscribe("users", "org_id", currentOrg.orgId);
      subscribe("users", "linked_org_id", currentOrg.orgId);
      subscribe("users", "organization_id", currentOrg.orgId);
    }
    return () => unsubList.forEach((u) => u());
  }, [currentOrg, currentUser]);

  // Global Messages Subscription (for Thread Previews)
  useEffect(() => {
    if (!currentOrg) return;
    hasSeededMessageSnapshotRef.current = false;
    notifiedMessageIdsRef.current = new Set();
    const db = getFirestoreDb();
    const q = currentOrg.code
      ? query(collection(db, "messages"), where("orgCode", "==", currentOrg.code))
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
          const activeThreadId = activeThread?.threadId || activeThread?.id || null;
          const isUnread = !activeThreadId || msg.threadId !== activeThreadId;
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
    const db = getFirestoreDb();
    const q = query(
      collection(db, "messages"),
      where("threadId", "==", activeThread.threadId || activeThread.id),
    );
    return onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
      setActiveMessages(
        msgs.sort(
          (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0),
        ),
      );
    });
  }, [activeThread]);

  const conversations = useMemo(() => {
    const list = [];
    if (currentOrg?.code) {
      const gId = buildScopedGroupThreadId(
        currentOrg.code,
        currentOrg.scopeId || null,
      );
      const gMsgs = rawMessages.filter((m) => m.threadId === gId);
      list.push({
        id: gId,
        threadId: gId,
        name: "All Volunteers",
        type: "group",
        role: "Broadcast Channel",
        initials: "AV",
        lastMessage: gMsgs[0]?.text || "Official announcements",
        time: formatTimeLabel(gMsgs[0]?.createdAt),
      });
    }
    volunteers.forEach((v) => {
      const tId = buildScopedDirectThreadId(
        currentOrg?.code,
        currentOrg?.scopeId || null,
        v.id,
      );
      const vMsgs = rawMessages.filter((m) => m.threadId === tId);
      list.push({
        id: v.id,
        threadId: tId,
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
  }, [targetUserId, targetOrgCode, targetOrgId, targetGroupId, userOrgs, currentOrg]);

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
          const tId = buildScopedDirectThreadId(
            currentOrg?.code,
            currentOrg?.scopeId || null,
            volunteer.id,
          );
          handledTargetRef.current = deepLinkKey;
          setActiveThread({
            id: volunteer.id,
            threadId: tId,
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
                                {org.displayName || org.name || org.code || "Organization"}
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
      <Modal visible={showOrgPicker} transparent animationType="fade">
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

      <Modal visible={showAttachMenu} transparent animationType="fade">
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
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
