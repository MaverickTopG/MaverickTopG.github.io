// @ts-nocheck
import React, {
  useMemo,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
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
  SafeAreaView,
  Image,
} from "react-native";
import { BlurView } from "expo-blur";
import { Button as SwiftUIButton, ContextMenu, Host } from "@expo/ui/swift-ui";
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
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
} from "react-native-reanimated";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowRight,
  Calendar,
  MapPin,
  Clock,
  Funnel,
  MagnifyingGlass,
  Check,
  CaretRight,
  Sparkle,
  Globe,
  Strategy,
  TrendUp,
  X,
  Buildings,
  Users,
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
  addDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";

let ExpoNotifications = null;
try {
  ExpoNotifications = require("expo-notifications");
} catch (e) {
  ExpoNotifications = null;
}

if (ExpoNotifications && !globalThis.__nexolinkNotificationsHandlerSet) {
  ExpoNotifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  globalThis.__nexolinkNotificationsHandlerSet = true;
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

const withHaptics =
  (fn, type = "light") =>
  (...args) => {
    triggerHaptic(type);
    return fn?.(...args);
  };

// --- Utilities ---
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

const scopedMembershipMatchesRecord = (record = {}, membershipScopeId = null) => {
  const recordScopeId = extractGroupScopeIdFromRecord(record);
  if (membershipScopeId) {
    // Scoped memberships can still access legacy org-wide entries with no explicit scope.
    return !recordScopeId || recordScopeId === membershipScopeId;
  }
  return !recordScopeId;
};

const formatScopedOrgLabel = (orgName, scopeName, scopeId) =>
  scopeId ? `${orgName} (${scopeName})` : orgName;

const parseNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (!normalized) return null;
    const parsed = Number(normalized[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveEventCapacity = (event) => {
  const capacity = parseNumber(
    event.capacity ??
      event.capacity_value ??
      event.maxCapacity ??
      event.max_capacity,
  );
  if (Number.isFinite(capacity) && capacity > 0) return capacity;
  const maxVolunteers = parseNumber(
    event.maxVolunteers ??
      event.max_volunteers ??
      event.maxVolunteer ??
      event.max_volunteer,
  );
  if (Number.isFinite(maxVolunteers) && maxVolunteers > 0) return maxVolunteers;
  if (
    event.peoplePerSlot &&
    Array.isArray(event.timeSlots) &&
    event.timeSlots.length
  ) {
    return event.timeSlots.length * event.peoplePerSlot;
  }
  return 0;
};

const formatEventDate = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { month: "JAN", day: "01", full: "Date TBA" };
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: d.getDate().toString().padStart(2, "0"),
    full: d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
    }),
  };
};

const formatTimeRange = (start, end) => {
  if (!start && !end) return "Time TBA";
  const toTime = (t) => {
    if (!t) return "";
    const parts = t.split(":");
    const hours = Number(parts[0]);
    if (isNaN(hours)) return t;
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${h12}:${parts[1] || "00"} ${ampm}`;
  };
  if (!end) return toTime(start);
  return `${toTime(start)} - ${toTime(end)}`;
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

export default function EventsScreen() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [signups, setSignups] = useState({});
  const [signupCounts, setSignupCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isReserving, setIsReserving] = useState(false);
  const [activeOrgFilter, setActiveOrgFilter] = useState("All");
  const [organizations, setOrganizations] = useState([]);
  const orgPickerRef = useRef(null);
  const orgPickerSnapPoints = useMemo(() => [hp(48)], []);
  const hasSeededEventsSnapshotRef = useRef(false);
  const notifiedEventIdsRef = useRef(new Set());
  const notificationsEnabledRef = useRef(false);

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

  useEffect(() => {
    let cancelled = false;
    const setupNotifications = async () => {
      if (!ExpoNotifications) return;
      try {
        if (Platform.OS === "android") {
          await ExpoNotifications.setNotificationChannelAsync("events", {
            name: "Events",
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
        if (!cancelled) notificationsEnabledRef.current = !!granted;
      } catch (e) {
        if (!cancelled) notificationsEnabledRef.current = false;
      }
    };
    setupNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendNewEventNotification = async (eventData = {}) => {
    if (!ExpoNotifications || !notificationsEnabledRef.current) return;
    const orgName = String(
      eventData.orgName ||
        eventData.organizationName ||
        eventData.org_name ||
        eventData.name ||
        "Your organization",
    ).trim();
    const scopeId = extractGroupScopeIdFromRecord(eventData);
    const scopeName = resolveGroupScopeNameFromRecord(eventData, scopeId);
    const scopedOrgName = formatScopedOrgLabel(orgName, scopeName, scopeId);
    const title = String(eventData.title || "New event").trim() || "New event";
    const dateInfo = formatEventDate(eventData.startDate).full;
    const venue = String(
      eventData.venue || eventData.location || eventData.addressLine1 || "",
    ).trim();
    const body = [scopedOrgName, dateInfo !== "Date TBA" ? dateInfo : "", venue]
      .filter(Boolean)
      .join(" • ");
    try {
      await ExpoNotifications.scheduleNotificationAsync({
        content: {
          title: `New Event: ${title}`,
          body: body || "A new event is now available.",
          sound: "default",
          data: {
            eventId: eventData.id || null,
            orgCode:
              eventData.orgCode ||
              eventData.org_code ||
              eventData.organizationCode ||
              null,
            orgId:
              eventData.orgId ||
              eventData.org_id ||
              eventData.organizationId ||
              null,
            targetGroupId: extractGroupScopeIdFromRecord(eventData),
            subAdminGroupId: extractGroupScopeIdFromRecord(eventData),
          },
        },
        trigger: null,
      });
    } catch (e) {
      // no-op
    }
  };

  // Auth & Org Discovery
  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    let unsubEvents = null;
    let unsubSignupsByEmail = null;
    let unsubSignupsByUserId = null;
    let signupsFromEmail = {};
    let signupsFromUserId = {};

    const applySignups = () => {
      setSignups({ ...signupsFromUserId, ...signupsFromEmail });
    };

    const cleanupSubscriptions = () => {
      unsubEvents?.();
      unsubSignupsByEmail?.();
      unsubSignupsByUserId?.();
      unsubEvents = null;
      unsubSignupsByEmail = null;
      unsubSignupsByUserId = null;
      signupsFromEmail = {};
      signupsFromUserId = {};
    };

    const authUnsub = onAuthStateChanged(auth, async (user) => {
      cleanupSubscriptions();
      setCurrentUser(user);
      hasSeededEventsSnapshotRef.current = false;
      notifiedEventIdsRef.current = new Set();
      if (!user) {
        setEvents([]);
        setSignups({});
        setSignupCounts({});
        setOrganizations(["All"]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
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

        const myMemberships = [];
        const membershipKeySet = new Set();
        const orgNames = new Set(["All"]);

        const collectMembership = (data = {}, fallbackId = "") => {
          const membershipStatus =
            data.status ||
            data.join_status ||
            data.request_status ||
            data.membership_status ||
            data.approval_status ||
            data.default_share_status;
          if (!isAcceptedMembershipStatus(membershipStatus)) return;
          const normalizedStatus = String(data.status || "").toLowerCase();
          const isPersonal = Boolean(
            data.is_personal ||
            String(fallbackId || "")
              .toLowerCase()
              .includes("personal") ||
            String(data.access_code || data.orgCode || data.org_code || "")
              .toLowerCase()
              .includes("personal"),
          );
          if (
            isPersonal ||
            normalizedStatus === "archived" ||
            normalizedStatus === "inactive" ||
            normalizedStatus === "revoked" ||
            data.archived_at ||
            data.archived_by_user
          ) {
            return;
          }

          const code = normalizeOrgCode(
            data.access_code ||
              data.orgCode ||
              data.org_code ||
              data.organizationCode,
          );

          const orgId = String(
            data.orgId ||
              data.org_id ||
              data.organizationId ||
              data.linked_org_id ||
              fallbackId ||
              "",
          ).trim();
          const scopeId = extractGroupScopeIdFromRecord(data);
          const scopeName = resolveGroupScopeNameFromRecord(data, scopeId);
          const scopeKey = toScopeKey(scopeId);
          const identity = orgId || code || String(fallbackId || "").trim();
          if (!identity) return;

          const name = String(
            data.orgName ||
              data.organizationName ||
              data.org_name ||
              data.name ||
              "",
          ).trim();
          if (
            name &&
            name.toLowerCase() !== "organization" &&
            name.toLowerCase() !== "personal"
          ) {
            orgNames.add(formatScopedOrgLabel(name, scopeName, scopeId));
          }

          const membershipKey = `${scopeKey}::${identity}`;
          if (membershipKeySet.has(membershipKey)) return;
          membershipKeySet.add(membershipKey);
          myMemberships.push({
            membershipKey,
            code: code || null,
            orgId: orgId || null,
            scopeId,
            scopeName,
            scopeKey,
            orgName: name || code || "Organization",
          });
          if (!name && code) {
            orgNames.add(formatScopedOrgLabel(code, scopeName, scopeId));
          }
        };

        orgMembershipSnaps.forEach((d) => collectMembership(d.data(), d.id));
        userMembershipSnaps.forEach((d) => collectMembership(d.data(), d.id));

        if (!myMemberships.length) {
          setEvents([]);
          setSignups({});
          setSignupCounts({});
          setOrganizations(["All"]);
          setLoading(false);
          return;
        }

        // Subscribe to Events
        const qEvents = query(
          collection(db, "events"),
          where("status", "!=", "draft"),
        );
        unsubEvents = onSnapshot(qEvents, (snapshot) => {
          const loaded = [];
          const dynamicNames = new Set(orgNames);
          const belongsToMyOrg = (data = {}) => {
            const evtCode = normalizeOrgCode(
              data.access_code ||
                data.orgCode ||
                data.org_code ||
                data.organizationCode,
            );
            const evtId = String(
              data.orgId ||
                data.org_id ||
                data.organizationId ||
                data.linked_org_id ||
                "",
            );
            return myMemberships.some((membership) => {
              const orgMatches =
                (evtCode && membership.code && evtCode === membership.code) ||
                (evtId && membership.orgId && evtId === membership.orgId);
              if (!orgMatches) return false;
              return scopedMembershipMatchesRecord(data, membership.scopeId);
            });
          };

          if (!hasSeededEventsSnapshotRef.current) {
            snapshot.forEach((docSnap) => {
              notifiedEventIdsRef.current.add(docSnap.id);
            });
            hasSeededEventsSnapshotRef.current = true;
          } else {
            snapshot.docChanges().forEach((change) => {
              if (change.type !== "added") return;
              const addedData = change.doc.data() || {};
              const eventId = change.doc.id;
              if (notifiedEventIdsRef.current.has(eventId)) return;
              notifiedEventIdsRef.current.add(eventId);
              if (!belongsToMyOrg(addedData)) return;
              if (String(addedData.status || "").toLowerCase() === "archived")
                return;
              const creatorId = String(
                addedData.createdBy ||
                  addedData.created_by ||
                  addedData.creatorId ||
                  addedData.authorId ||
                  "",
              ).trim();
              if (creatorId && creatorId === user.uid) return;
              void sendNewEventNotification({ id: eventId, ...addedData });
            });
          }

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.status === "archived") return;
            const evtCode = normalizeOrgCode(
              data.access_code ||
                data.orgCode ||
                data.org_code ||
                data.organizationCode,
            );
            const evtId = String(
              data.orgId ||
                data.org_id ||
                data.organizationId ||
                data.linked_org_id ||
                "",
            );
            const evtScopeId = extractGroupScopeIdFromRecord(data);
            const evtScopeName = resolveGroupScopeNameFromRecord(
              data,
              evtScopeId,
            );

            if (belongsToMyOrg(data)) {
              const evtName = String(
                data.orgName ||
                  data.organizationName ||
                  data.org_name ||
                  data.name ||
                  data.schoolName ||
                  "",
              ).trim();
              const scopedOrgLabel = formatScopedOrgLabel(
                evtName || "Organization",
                evtScopeName,
                evtScopeId,
              );
              if (scopedOrgLabel) dynamicNames.add(scopedOrgLabel);
              loaded.push({
                id: docSnap.id,
                ...data,
                orgCode:
                  data.orgCode ||
                  data.org_code ||
                  data.organizationCode ||
                  evtCode ||
                  null,
                orgId:
                  data.orgId ||
                  data.org_id ||
                  data.organizationId ||
                  evtId ||
                  null,
                target_group_id: evtScopeId,
                targetGroupId: evtScopeId,
                target_group_name: evtScopeName,
                targetGroupName: evtScopeName,
                sub_admin_group_id: evtScopeId,
                subAdminGroupId: evtScopeId,
                sub_admin_group_name: evtScopeName,
                subAdminGroupName: evtScopeName,
                group_scope_id: evtScopeId,
                group_scope_name: evtScopeName,
                orgDisplayName: scopedOrgLabel,
              });
            }
          });
          loaded.sort(
            (a, b) =>
              new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
          );
          setEvents(loaded);
          setOrganizations(
            Array.from(dynamicNames).sort((a, b) => a.localeCompare(b)),
          );
          setLoading(false);
        });

        // Subscribe to User's Signups
        if (user.email) {
          const qSignupsByEmail = query(
            collection(db, "event_signups"),
            where("volunteerEmail", "==", user.email),
          );
          unsubSignupsByEmail = onSnapshot(qSignupsByEmail, (snapshot) => {
            const map = {};
            snapshot.forEach((d) => {
              const data = d.data();
              const eventId = String(
                data.eventId || data.event_id || "",
              ).trim();
              if (!eventId) return;
              map[eventId] = { id: d.id, ...data, eventId };
            });
            signupsFromEmail = map;
            applySignups();
          });
        }

        const qSignupsByUserId = query(
          collection(db, "event_signups"),
          where("volunteerId", "==", user.uid),
        );
        unsubSignupsByUserId = onSnapshot(qSignupsByUserId, (snapshot) => {
          const map = {};
          snapshot.forEach((d) => {
            const data = d.data();
            const eventId = String(data.eventId || data.event_id || "").trim();
            if (!eventId) return;
            map[eventId] = { id: d.id, ...data, eventId };
          });
          signupsFromUserId = map;
          applySignups();
        });
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    });

    return () => {
      cleanupSubscriptions();
      authUnsub?.();
    };
  }, []);

  // Sync Signup Counts
  useEffect(() => {
    if (!events.length) {
      setSignupCounts({});
      return;
    }
    const db = getFirestoreDb();
    const eventIds = events.map((e) => e.id);
    const chunks = [];
    for (let i = 0; i < eventIds.length; i += 10) {
      chunks.push(eventIds.slice(i, i + 10));
    }

    const unsubscribers = chunks.map((chunk) =>
      onSnapshot(
        query(collection(db, "event_signups"), where("eventId", "in", chunk)),
        (snapshot) => {
          const counts = {};
          snapshot.forEach((d) => {
            const eid = String(
              d.data().eventId || d.data().event_id || "",
            ).trim();
            if (!eid) return;
            counts[eid] = (counts[eid] || 0) + 1;
          });
          setSignupCounts((prev) => {
            const next = { ...prev };
            chunk.forEach((id) => {
              delete next[id];
            });
            Object.entries(counts).forEach(([id, count]) => {
              next[id] = count;
            });
            return next;
          });
        },
      ),
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub?.());
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const txt = searchQuery.toLowerCase();
      const orgName = String(
        ev.orgDisplayName ||
        ev.orgName ||
          ev.organizationName ||
          ev.org_name ||
          ev.name ||
          ev.schoolName ||
          "",
      ).trim();
      const matchesSearch =
        String(ev.title || "")
          .toLowerCase()
          .includes(txt) ||
        String(ev.description || "")
          .toLowerCase()
          .includes(txt) ||
        String(ev.city || "")
          .toLowerCase()
          .includes(txt) ||
        String(ev.venue || "")
          .toLowerCase()
          .includes(txt) ||
        String(ev.location || "")
          .toLowerCase()
          .includes(txt) ||
        String(ev.addressLine1 || "")
          .toLowerCase()
          .includes(txt) ||
        orgName.toLowerCase().includes(txt);
      const matchesOrg =
        activeOrgFilter === "All" || orgName === activeOrgFilter;
      return matchesSearch && matchesOrg;
    });
  }, [events, searchQuery, activeOrgFilter]);

  useEffect(() => {
    if (!organizations.includes(activeOrgFilter)) {
      setActiveOrgFilter("All");
    }
  }, [organizations, activeOrgFilter]);

  const handleReserve = async () => {
    if (!selectedEvent || isReserving) return;
    setIsReserving(true);
    triggerHaptic("medium");
    try {
      const db = getFirestoreDb();
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        Alert.alert("Sign-in required", "Please sign in to reserve a spot.");
        setIsReserving(false);
        return;
      }

      const capacity = resolveEventCapacity(selectedEvent);
      const current = signupCounts[selectedEvent.id] || 0;
      if (capacity > 0 && current >= capacity) {
        Alert.alert("Event full", "This event is currently full.");
        setIsReserving(false);
        return;
      }

      const dateInfo = formatEventDate(selectedEvent.startDate);
      const timeInfo = formatTimeRange(
        selectedEvent.startTime,
        selectedEvent.endTime,
      );
      const eventScopeId = extractGroupScopeIdFromRecord(selectedEvent);
      const eventScopeName = resolveGroupScopeNameFromRecord(
        selectedEvent,
        eventScopeId,
      );

      await addDoc(collection(db, "event_signups"), {
        eventId: selectedEvent.id,
        volunteerId: user.uid,
        volunteerName: user.displayName || "Volunteer",
        volunteerEmail: user.email,
        status: "confirmed",
        role: "Volunteer",
        slotLabel: `${dateInfo.full} • ${timeInfo}`,
        selectedDates: selectedEvent.startDate ? [selectedEvent.startDate] : [],
        selectedShifts:
          Array.isArray(selectedEvent.shifts) && selectedEvent.shifts.length
            ? selectedEvent.shifts
            : [],
        orgId:
          selectedEvent.orgId ||
          selectedEvent.org_id ||
          selectedEvent.organizationId ||
          null,
        orgCode:
          selectedEvent.orgCode ||
          selectedEvent.org_code ||
          selectedEvent.organizationCode ||
          null,
        target_group_id: eventScopeId,
        targetGroupId: eventScopeId,
        target_group_name: eventScopeName,
        targetGroupName: eventScopeName,
        sub_admin_group_id: eventScopeId,
        subAdminGroupId: eventScopeId,
        sub_admin_group_name: eventScopeName,
        subAdminGroupName: eventScopeName,
        group_scope_id: eventScopeId,
        group_scope_name: eventScopeName,
        createdAt: serverTimestamp(),
        eventTitle: selectedEvent.title,
        eventDate: selectedEvent.startDate,
      });

      triggerHaptic("success");
      setSelectedEvent(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReserving(false);
    }
  };

  const handleCancel = async (eid) => {
    const signup = signups[eid];
    if (!signup) return;
    Alert.alert(
      "Cancel registration?",
      "Are you sure you want to cancel your reservation?",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel Registration",
          style: "destructive",
          onPress: async () => {
            triggerHaptic("medium");
            try {
              await deleteDoc(
                doc(getFirestoreDb(), "event_signups", signup.id),
              );
              triggerHaptic("light");
            } catch (err) {
              console.error(err);
            }
          },
        },
      ],
    );
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

  const featuredEvent = filteredEvents[0];
  const upcomingEvents = filteredEvents.slice(1);
  const openOrgPicker = useCallback(() => {
    orgPickerRef.current?.expand?.();
  }, []);

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
                <Text style={styles.heroTitle}>Impact</Text>
                {Platform.OS === "ios" ? (
                  <Host style={styles.filterMenuHost}>
                    <ContextMenu activationMethod="singlePress">
                      <ContextMenu.Items>
                        {organizations.map((org) => (
                          <SwiftUIButton
                            key={`org-filter-${org}`}
                            systemImage={
                              activeOrgFilter === org
                                ? "checkmark.circle.fill"
                                : "building.2"
                            }
                            onPress={() =>
                              withHaptics(
                                () => setActiveOrgFilter(org),
                                "success",
                              )()
                            }
                          >
                            {org}
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
                    onPress={openOrgPicker}
                    style={styles.filterBtn}
                  >
                    <Funnel size={22} color={COLORS.secondary} weight="bold" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.heroSubtitle}>Discovery.</Text>
            </View>
          </FadeUpView>
        </View>

        {/* Discovery Engine Filters */}
        <View style={styles.discoveryBar}>
          <View style={styles.searchBox}>
            <MagnifyingGlass
              size={20}
              color={COLORS.gray}
              style={{ marginLeft: 12 }}
            />
            <TextInput
              style={styles.input}
              placeholder="Search opportunities..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {loading ? (
          <ActivityIndicator
            color={COLORS.secondary}
            style={{ marginTop: 60 }}
          />
        ) : filteredEvents.length === 0 ? (
          <FadeUpView delay={200}>
            <View style={styles.emptyState}>
              <Strategy size={48} color={COLORS.gray} opacity={0.3} />
              <Text style={styles.emptyText}>
                No events match your criteria.
              </Text>
            </View>
          </FadeUpView>
        ) : (
          <View style={styles.bentoGrid}>
            {/* Featured Event - Large Bento Card */}
            {featuredEvent && (
              <FadeUpView delay={200}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setSelectedEvent(featuredEvent)}
                  style={styles.featuredCard}
                >
                  <View style={styles.cardGlow} />
                  <View style={styles.tagRow}>
                    <View style={styles.featuredTag}>
                      <Sparkle
                        size={12}
                        color={COLORS.secondary}
                        weight="fill"
                      />
                      <Text style={styles.featuredTagText}>FEATURED</Text>
                    </View>
                    <Text style={styles.orgBadge}>
                      {featuredEvent.orgDisplayName || featuredEvent.orgName || "NexoLink"}
                    </Text>
                  </View>
                  <Text style={styles.featuredTitle}>
                    {featuredEvent.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <Clock size={16} color={COLORS.secondary} weight="bold" />
                    <Text style={styles.metaText}>
                      {formatEventDate(featuredEvent.startDate).full}
                    </Text>
                  </View>
                  <View style={styles.metaRow}>
                    <MapPin size={16} color={COLORS.secondary} weight="bold" />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {featuredEvent.venue || featuredEvent.location || "TBA"}
                    </Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <View style={styles.signupPill}>
                      <Users size={14} color={COLORS.white} weight="bold" />
                      <Text style={styles.signupText}>
                        {signupCounts[featuredEvent.id] || 0} Joined
                      </Text>
                    </View>
                    <ArrowRight
                      size={20}
                      color={COLORS.secondary}
                      weight="bold"
                    />
                  </View>
                </TouchableOpacity>
              </FadeUpView>
            )}

            {/* Upcoming Section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Opportunities</Text>
              <View style={styles.sectionLine} />
            </View>

            {upcomingEvents.map((item, i) => {
              const dateInfo = formatEventDate(item.startDate);
              const isSignedUp = !!signups[item.id];
              return (
                <FadeUpView key={item.id} delay={300 + i * 100}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setSelectedEvent(item)}
                    style={styles.eventCard}
                  >
                    <View style={styles.dateBox}>
                      <Text style={styles.dateMonth}>{dateInfo.month}</Text>
                      <Text style={styles.dateDay}>{dateInfo.day}</Text>
                    </View>
                    <View style={styles.cardContent}>
                      <View style={styles.cardTop}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {isSignedUp && (
                          <View style={styles.registeredBadge}>
                            <Check
                              size={10}
                              color={COLORS.primary}
                              weight="bold"
                            />
                            <Text style={styles.registeredText}>
                              REGISTERED
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardOrg} numberOfLines={1}>
                        {item.orgDisplayName || item.orgName || "Organization"}
                      </Text>
                      <View style={styles.cardMeta}>
                        <View style={styles.metaMini}>
                          <Clock size={12} color={COLORS.gray} />
                          <Text style={styles.metaMiniText}>
                            {formatTimeRange(item.startTime, item.endTime)}
                          </Text>
                        </View>
                        <View style={styles.metaMini}>
                          <MapPin size={12} color={COLORS.gray} />
                          <Text style={styles.metaMiniText} numberOfLines={1}>
                            {item.venue || "TBA"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <CaretRight size={18} color={COLORS.gray} weight="bold" />
                  </TouchableOpacity>
                </FadeUpView>
              );
            })}
          </View>
        )}
      </Animated.ScrollView>

      {/* Detail Immersion Modal */}
      <Modal visible={!!selectedEvent} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setSelectedEvent(null)}
                style={styles.closeBtn}
              >
                <X size={24} color={COLORS.secondary} weight="bold" />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Discovery Detail</Text>
              <View style={{ width: 44 }} />
            </View>

            {selectedEvent && (
              <ScrollView
                contentContainerStyle={styles.modalScroll}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalHero}>
                  <Text style={styles.modalTitle}>{selectedEvent.title}</Text>
                  <Text style={styles.modalOrg}>
                    {selectedEvent.orgDisplayName || selectedEvent.orgName || "NexoLink Impact"}
                  </Text>
                </View>

                {/* Info Bento */}
                <View style={styles.infoGrid}>
                  <View style={[styles.infoCard, { flex: 1.2 }]}>
                    <Calendar
                      size={20}
                      color={COLORS.secondary}
                      weight="bold"
                    />
                    <Text style={styles.infoLabel}>DATE</Text>
                    <Text style={styles.infoValue}>
                      {formatEventDate(selectedEvent.startDate).full}
                    </Text>
                  </View>
                  <View style={[styles.infoCard, { flex: 0.8 }]}>
                    <Clock size={20} color={COLORS.secondary} weight="bold" />
                    <Text style={styles.infoLabel}>TIME</Text>
                    <Text style={styles.infoValue}>
                      {formatTimeRange(
                        selectedEvent.startTime,
                        selectedEvent.endTime,
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.locationCard}>
                  <MapPin size={20} color={COLORS.secondary} weight="bold" />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.infoLabel}>LOCATION</Text>
                    <Text style={styles.infoValue}>
                      {selectedEvent.venue || "Venue TBA"}
                    </Text>
                    <Text style={styles.locationSub}>
                      {selectedEvent.addressLine1 ||
                        selectedEvent.location ||
                        ""}
                    </Text>
                  </View>
                </View>

                <View style={styles.descSection}>
                  <Text style={[styles.infoLabel, { marginBottom: 12 }]}>
                    ABOUT THE MISSION
                  </Text>
                  <Text style={styles.descText}>
                    {selectedEvent.description ||
                      "Join this impactful mission to support your community. NexoLink coordinates volunteers for world-class local action."}
                  </Text>
                </View>

                <View style={styles.impactCard}>
                  <TrendUp size={24} color={COLORS.primary} weight="bold" />
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={styles.impactTitle}>Global Impact</Text>
                    <Text style={styles.impactSub}>
                      This event contributes to Sustainable Goal #17:
                      Partnerships for the Goals.
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              {selectedEvent && signups[selectedEvent.id] ? (
                <TouchableOpacity
                  onPress={() => {
                    handleCancel(selectedEvent.id);
                    setSelectedEvent(null);
                  }}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel Registration</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleReserve}
                  disabled={isReserving}
                  style={styles.reserveBtn}
                >
                  {isReserving ? (
                    <ActivityIndicator color={COLORS.secondary} />
                  ) : (
                    <>
                      <Text style={styles.reserveBtnText}>Reserve Spot</Text>
                      <ArrowRight
                        size={20}
                        color={COLORS.secondary}
                        weight="bold"
                      />
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <BottomSheet
        ref={orgPickerRef}
        index={-1}
        snapPoints={orgPickerSnapPoints}
        enablePanDownToClose
        backgroundStyle={styles.pickerSheetBg}
        handleIndicatorStyle={styles.pickerSheetHandle}
      >
        <View style={styles.pickerContent}>
          <Text style={styles.pickerHeading}>Filter Discovery</Text>
          <BottomSheetScrollView style={{ maxHeight: hp(38) }}>
            {organizations.map((o) => (
              <TouchableOpacity
                key={o}
                onPress={withHaptics(() => {
                  setActiveOrgFilter(o);
                  orgPickerRef.current?.close?.();
                }, "success")}
                style={[
                  styles.orgItem,
                  activeOrgFilter === o && { backgroundColor: COLORS.accent },
                ]}
              >
                <Buildings
                  size={20}
                  color={activeOrgFilter === o ? COLORS.secondary : COLORS.gray}
                />
                <Text
                  style={[
                    styles.orgNameText,
                    activeOrgFilter === o && {
                      color: COLORS.secondary,
                      fontWeight: "900",
                    },
                  ]}
                >
                  {o}
                </Text>
                {activeOrgFilter === o && <View style={styles.itemDot} />}
              </TouchableOpacity>
            ))}
          </BottomSheetScrollView>
        </View>
      </BottomSheet>
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
  discoveryBar: { flexDirection: "row", gap: 12, marginBottom: hp(4) },
  searchBox: {
    flex: 1,
    height: 54,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.secondary,
    paddingHorizontal: 12,
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
  bentoGrid: { gap: 20 },
  featuredCard: {
    backgroundColor: COLORS.primary,
    padding: 32,
    borderRadius: 48,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 12,
  },
  cardGlow: {
    position: "absolute",
    top: -100,
    right: -100,
    width: 240,
    height: 240,
    backgroundColor: COLORS.white,
    opacity: 0.4,
    borderRadius: 999,
  },
  tagRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  featuredTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  featuredTagText: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.secondary,
    letterSpacing: 1,
  },
  orgBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(0,0,0,0.5)",
    backgroundColor: "rgba(0,0,0,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  featuredTitle: {
    fontSize: wp(8),
    fontWeight: "900",
    color: COLORS.secondary,
    letterSpacing: -1,
    lineHeight: wp(8.5),
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  metaText: { fontSize: 14, fontWeight: "700", color: "rgba(0,0,0,0.6)" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  signupPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 100,
  },
  signupText: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.gray,
    letterSpacing: 0.5,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: "rgba(0,0,0,0.05)" },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#F8F9FA",
    padding: 16,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  dateBox: {
    width: 48,
    height: 48,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  dateMonth: { fontSize: 10, fontWeight: "900", color: COLORS.gray },
  dateDay: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.secondary,
    lineHeight: 22,
  },
  cardContent: { flex: 1 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.secondary,
    flex: 1,
  },
  registeredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  registeredText: { fontSize: 8, fontWeight: "900", color: COLORS.primary },
  cardOrg: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: "700",
    marginTop: 2,
  },
  cardMeta: { flexDirection: "row", gap: 12, marginTop: 6 },
  metaMini: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaMiniText: { fontSize: 11, fontWeight: "600", color: COLORS.gray },
  emptyState: { padding: 60, alignItems: "center", justifyContent: "center" },
  emptyText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.gray,
    textAlign: "center",
  },
  modalBg: { flex: 1, backgroundColor: COLORS.white },
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalHeaderTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.gray,
    letterSpacing: 1,
  },
  modalScroll: { paddingHorizontal: 32, paddingBottom: 120 },
  modalHero: { marginTop: 24, marginBottom: 32 },
  modalTitle: {
    fontSize: wp(9),
    fontWeight: "900",
    color: COLORS.secondary,
    letterSpacing: -1,
    lineHeight: wp(10),
  },
  modalOrg: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.primary,
    marginTop: 8,
    letterSpacing: 1,
  },
  infoGrid: { flexDirection: "row", gap: 16, marginBottom: 16 },
  infoCard: {
    backgroundColor: "#F8F9FA",
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: COLORS.gray,
    letterSpacing: 2,
    marginBottom: 8,
  },
  infoValue: { fontSize: 15, fontWeight: "800", color: COLORS.secondary },
  locationCard: {
    backgroundColor: "#F8F9FA",
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
  },
  locationSub: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.gray,
    marginTop: 2,
  },
  descSection: { marginBottom: 32 },
  descText: {
    fontSize: 15,
    color: COLORS.gray,
    lineHeight: 24,
    fontWeight: "500",
  },
  impactCard: {
    backgroundColor: COLORS.secondary,
    padding: 24,
    borderRadius: 32,
    flexDirection: "row",
    alignItems: "center",
  },
  impactTitle: { fontSize: 18, fontWeight: "900", color: COLORS.white },
  impactSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 4,
    fontWeight: "600",
  },
  modalFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
    paddingTop: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  reserveBtn: {
    height: 64,
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  reserveBtnText: { fontSize: 18, fontWeight: "900", color: COLORS.secondary },
  cancelBtn: {
    height: 60,
    backgroundColor: COLORS.lightGray,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.secondary,
    opacity: 0.6,
  },
  pickerSheetBg: { backgroundColor: COLORS.white },
  pickerSheetHandle: { backgroundColor: "rgba(0,0,0,0.18)" },
  pickerContent: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  pickerHeading: {
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
});
