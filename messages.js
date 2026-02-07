import React, { useMemo, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { ArrowRight, ChatCircleDots, Funnel, Buildings, Users } from "phosphor-react-native";

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
} from "firebase/firestore";

const { width, height } = Dimensions.get("window");
const wp = (p) => (width * p) / 100;
const hp = (p) => (height * p) / 100;

const LIME = "#32FF7E";
const DARK = "#111827";
const BASE_BG = "#F6F5F2";

// --- Firebase Helpers ---
const getFirebaseApp = () => {
  if (getApps().length > 0) return getApp();
  throw new Error("Firebase app not initialized");
};
const getFirebaseAuth = () => getAuth(getFirebaseApp());
const getFirestoreDb = () => getFirestore(getFirebaseApp());

const normalizeOrgCode = (value) => (value ? String(value).trim().toUpperCase() : null);

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

const GridBackground = () => {
  const glowAlpha = useSharedValue(0.15);

  React.useEffect(() => {
    glowAlpha.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.15, { duration: 2500, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [glowAlpha]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowAlpha.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.glowPool, { top: "22%", left: "6%" }, glowStyle]} />
      <Animated.View style={[styles.glowPool, { bottom: "18%", right: "6%" }, glowStyle]} />
      <View
        style={[
          styles.gridContainer,
          { transform: [{ perspective: 1000 }, { rotateX: "60deg" }, { rotateZ: "-15deg" }, { scale: 1.5 }] },
        ]}
      >
        {Array.from({ length: 15 }).map((_, i) => (
          <View key={`v-${i}`} style={[styles.gridLineV, { left: `${(i / 14) * 100}%` }]} />
        ))}
        {Array.from({ length: 15 }).map((_, i) => (
          <View key={`h-${i}`} style={[styles.gridLineH, { top: `${(i / 14) * 100}%` }]} />
        ))}
      </View>
      <View style={styles.backgroundGradient} />
    </View>
  );
};

const MessageTile = ({ item, onPress }) => (
  <TouchableOpacity style={styles.messageCard} activeOpacity={0.9} onPress={onPress}>
    <View style={styles.avatarWrap}>
      <View style={[styles.avatarCircle, item.type === 'group' && styles.groupAvatar]}>
        {item.type === 'group' ? (
          <Users size={24} color={DARK} weight="bold" />
        ) : (
          <Text style={styles.avatarText}>{item.initials}</Text>
        )}
      </View>
      {item.online ? <View style={styles.statusDot} /> : null}
    </View>
    <View style={styles.messageContent}>
      <View style={styles.messageHeader}>
        <Text style={styles.messageName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.messageTime}>{item.time}</Text>
      </View>
      <Text style={styles.messageRole}>{item.role}</Text>
      <Text style={styles.messagePreview} numberOfLines={1}>
        {item.lastMessage || "No messages yet"}
      </Text>
    </View>
    <View style={styles.messageActions}>
      {item.unread ? (
        <View style={styles.unreadPill}>
          <Text style={styles.unreadText}>{item.unread}</Text>
        </View>
      ) : null}
      <ArrowRight size={16} color={"rgba(15,23,42,0.6)"} weight="bold" />
    </View>
  </TouchableOpacity>
);

export default function MessagesScreen() {
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [senderName, setSenderName] = useState("Volunteer");
  const [userOrgs, setUserOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const [rawMessages, setRawMessages] = useState([]);
  const [volunteers, setVolunteers] = useState([]);

  useEffect(() => {
    let authUnsub = null;

    try {
      const auth = getFirebaseAuth();
      authUnsub = onAuthStateChanged(auth, async (user) => {
        setCurrentUser(user);
        if (!user) {
          setUserOrgs([]);
          setCurrentOrg(null);
          setRawMessages([]);
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          const db = getFirestoreDb();
          
          // Fetch user profile for sender name
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const full = `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.name || data.displayName || user.displayName || "Volunteer";
            setSenderName(full);
          }

          // Fetch Orgs for the user from both sources (membership and profile docs)
          const [orgSnaps, membershipSnaps] = await Promise.all([
            getDocs(query(collection(db, "user_organizations"), where("user_id", "==", user.uid))),
            getDocs(query(collection(db, "users"), where("user_id", "==", user.uid)))
          ]);
          
          const loadedOrgs = [];
          
          const processDoc = (docSnap) => {
            // Even if docSnap.id === user.uid, we might want to check it for orgCode
            // But usually many membership docs exist with user_id == uid
            const data = docSnap.data() || {};
            const code = normalizeOrgCode(data.access_code || data.orgCode || data.org_code || data.organizationCode || data.org_access_code || null);
            const id = String(data.orgId || data.org_id || data.organizationId || data.linked_org_id || docSnap.id || "");
            const name = data.name || data.orgName || data.organizationName || data.schoolName || data.school_name || code || "Organization";
            const status = (data.status || "").toLowerCase();
            
            // Filters
            if (["rejected", "declined", "removed"].some((s) => status.includes(s))) return;
            if (data.is_personal) return;
            if (id.toLowerCase().startsWith("personal-") || String(code || "").toLowerCase().startsWith("personal-") || String(name || "").toLowerCase() === "personal") return;

            loadedOrgs.push({ id, code, name });
          };

          orgSnaps.forEach(processDoc);
          membershipSnaps.forEach(processDoc);
          
          // Fix: Ensure the user's own profile is checked for organization info
          if (userDoc && userDoc.exists()) {
             processDoc(userDoc);
          }

          const uniqueOrgs = loadedOrgs.filter(
            (v, i, a) => a.findIndex((t) => (t.code && v.code && t.code === v.code) || (t.id && v.id && String(t.id) === String(v.id))) === i
          );
          
          setUserOrgs(uniqueOrgs);
          setCurrentOrg(uniqueOrgs[0] || null);
        } catch (e) {
          console.error("Failed to load organizations", e);
        } finally {
          setLoading(false);
        }
      });
    } catch (e) {
      console.warn("Firebase not ready", e);
      setLoading(false);
    }

    return () => {
      if (authUnsub) authUnsub();
    };
  }, []);

  // Fetch Volunteers for the current organization
  useEffect(() => {
    if (!currentOrg) return;
    const db = getFirestoreDb();
    
    setLoading(true);
    const listeners = [];
    const volunteerMap = new Map();

    const updateVolunteers = () => {
      const list = Array.from(volunteerMap.values()).sort((a,b) => a.name.localeCompare(b.name));
      setVolunteers(list);
    };

    const ORG_CODE_FIELDS = ['accessCode', 'access_code', 'org_access_code', 'orgCode', 'org_code', 'organizationCode', 'organization_code'];
    const ORG_ID_FIELDS = ['organizationId', 'organization_id', 'orgId', 'org_id', 'linked_org_id', 'linkedOrgId'];

    const subscribe = (colName, field, value, mapper) => {
      const q = query(collection(db, colName), where(field, "==", value));
      const unsub = onSnapshot(q, (snap) => {
        snap.forEach(d => {
          const data = d.data();
          const uid = data.user_id || data.userId || d.id;
          if (uid === currentUser?.uid) return;
          const v = mapper(d);
          if (v) volunteerMap.set(v.id, v);
        });
        updateVolunteers();
      });
      listeners.push(unsub);
    };

    // User Data Mapper
    const userMapper = (d) => {
      const data = d.data();
      return {
        id: d.id,
        name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name || data.email || 'Volunteer',
        role: data.role || 'Volunteer',
        email: data.email
      };
    };

    // Join Request Mapper
    const joinMapper = (d) => {
      const data = d.data();
      if (data.status !== 'accepted') return null;
      const uid = data.user_id || data.userId || d.id;
      return {
        id: uid,
        name: data.user_name || data.name || data.user_email || 'Volunteer',
        role: data.requested_role || data.role || 'Volunteer',
        email: data.user_email || data.email
      };
    };

    // Subscribe to all possible fields in 'users'
    if (currentOrg.code) {
      ORG_CODE_FIELDS.forEach(f => subscribe("users", f, currentOrg.code, userMapper));
      ORG_CODE_FIELDS.forEach(f => subscribe("users", f, currentOrg.code.toLowerCase(), userMapper));
    }
    if (currentOrg.id) {
      ORG_ID_FIELDS.forEach(f => subscribe("users", f, currentOrg.id, userMapper));
    }

    // Subscribe to all possible fields in 'organization_join_requests'
    if (currentOrg.id) {
      subscribe("organization_join_requests", "orgId", currentOrg.id, joinMapper);
      subscribe("organization_join_requests", "organizationId", currentOrg.id, joinMapper);
    }
    if (currentOrg.code) {
      subscribe("organization_join_requests", "orgCode", currentOrg.code, joinMapper);
    }

    setLoading(false);
    return () => listeners.forEach(u => u());
  }, [currentOrg?.id, currentOrg?.code, currentUser?.uid]);

  // Handle Messages subscription
  useEffect(() => {
    if (!currentOrg) return;
    const db = getFirestoreDb();
    let q;
    if (currentOrg.id) {
      q = query(collection(db, "messages"), where("orgId", "==", currentOrg.id));
    } else if (currentOrg.code) {
      q = query(collection(db, "messages"), where("orgCode", "==", currentOrg.code));
    } else {
      setRawMessages([]);
      return;
    }

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const msgs = [];
        snapshot.forEach((docSnap) => msgs.push({ id: docSnap.id, ...docSnap.data() }));
        msgs.sort((a, b) => {
          const ta = a.createdAt?.seconds || 0;
          const tb = b.createdAt?.seconds || 0;
          return tb - ta;
        });
        setRawMessages(msgs);
      },
      (err) => console.error("Msg sub error", err)
    );

    return () => unsub();
  }, [currentOrg?.id, currentOrg?.code]);

  const conversations = useMemo(() => {
    const list = [];
    
    // 1. All Volunteers Group
    if (currentOrg?.code) {
      const groupThreadId = `org-${currentOrg.code}-all`;
      const groupMsgs = rawMessages.filter(m => m.threadId === groupThreadId);
      list.push({
        id: groupThreadId,
        name: "All Volunteers",
        type: 'group',
        role: "Broadcast Channel",
        initials: "AV",
        lastMessage: groupMsgs[0]?.text || "Official announcements for everyone",
        time: formatTimeLabel(groupMsgs[0]?.createdAt),
        unread: 0,
      });
    }

    // 2. Direct Messages from Volunteers
    volunteers.forEach(v => {
      const threadId = `org-${currentOrg?.code}-user-${v.id}`;
      const vMsgs = rawMessages.filter(m => m.threadId === threadId);
      list.push({
        id: v.id,
        threadId,
        name: v.name,
        type: 'direct',
        role: v.role,
        initials: initialsFromName(v.name),
        lastMessage: vMsgs[0]?.text || "",
        time: formatTimeLabel(vMsgs[0]?.createdAt),
        unread: 0,
        online: false,
      });
    });

    return list;
  }, [rawMessages, volunteers, currentOrg?.code]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <GridBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroTagRow}>
              <Text style={styles.heroTag}>NEXOLINK</Text>
              <View style={styles.neonDot} />
            </View>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowOrgPicker(true)}
              activeOpacity={0.85}
            >
              <Funnel size={16} color={LIME} weight="bold" />
            </TouchableOpacity>
          </View>
          <Text style={styles.heroTitle} numberOfLines={1}>{currentOrg?.name || "Messages"}</Text>
          <Text style={styles.heroSubtitle}>
            Direct and group channels for your team.
          </Text>
          <View style={styles.heroBadge}>
            <ChatCircleDots size={16} weight="bold" color={LIME} />
            <Text style={styles.heroBadgeText}>{`${conversations.length} total channels`}</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>People & Groups</Text>
          <Text style={styles.sectionHint}>Tap to open chat</Text>
        </View>

        {loading && conversations.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={LIME} size="large" />
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Empty Portal</Text>
            <Text style={styles.emptySub}>No connections found for this organization.</Text>
          </View>
        ) : (
          conversations.map((item) => (
            <MessageTile
              key={item.id}
              item={item}
              onPress={() =>
                navigation.navigate(
                  "Chat",
                  { 
                    // Verbose params to hit the right key
                    threadId: item.threadId, 
                    thread_id: item.threadId,
                    channelId: item.threadId,
                    conversationId: item.threadId,
                    
                    // User identifiers
                    userId: item.id,
                    user_id: item.id,
                    recipientId: item.id,
                    
                    name: item.name,
                    title: item.name, 
                    headerTitle: item.name,
                    
                    type: item.type,
                    role: item.role,
                    initials: item.initials,
                    
                    // Context
                    senderName: senderName, 
                    orgCode: currentOrg?.code,
                    orgId: currentOrg?.id,
                    organizationId: currentOrg?.id,
                    
                    // original objects
                    person: { ...item }, 
                    org: { ...currentOrg }
                  }
                )
              }
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={showOrgPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOrgPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOrgPicker(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Organization</Text>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              {userOrgs.map((org) => (
                <TouchableOpacity
                  key={org.id}
                  style={[
                    styles.orgItem,
                    currentOrg?.id === org.id && styles.orgItemActive,
                  ]}
                  onPress={() => {
                    setCurrentOrg(org);
                    setShowOrgPicker(false);
                  }}
                >
                  <Buildings
                    size={20}
                    color={currentOrg?.id === org.id ? DARK : "#64748B"}
                    weight={currentOrg?.id === org.id ? "fill" : "regular"}
                  />
                  <Text
                    style={[
                      styles.orgName,
                      currentOrg?.id === org.id && styles.orgNameActive,
                    ]}
                  >
                    {org.name}
                  </Text>
                  {currentOrg?.id === org.id && <View style={styles.checkDot} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BASE_BG },
  content: {
    paddingTop: hp(8),
    paddingBottom: hp(6),
    paddingHorizontal: wp(6),
  },
  gridContainer: {
    position: "absolute",
    top: -hp(20),
    left: -wp(50),
    width: width * 2,
    height: height * 2,
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(15,23,42,0.04)",
  },
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(15,23,42,0.04)",
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(246,245,242,0.85)",
  },
  glowPool: {
    position: "absolute",
    width: wp(80),
    height: wp(80),
    borderRadius: wp(40),
    backgroundColor: "rgba(50, 255, 126, 0.16)",
  },
  heroCard: {
    borderRadius: wp(10),
    paddingVertical: hp(4.4),
    paddingHorizontal: wp(7),
    backgroundColor: DARK,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 8,
    marginBottom: hp(3.4),
  },
  heroHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTagRow: { flexDirection: "row", alignItems: "center" },
  heroTag: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "700",
    letterSpacing: 2,
    fontSize: wp(3.2),
  },
  neonDot: {
    width: wp(1.2),
    height: wp(1.2),
    borderRadius: wp(0.6),
    backgroundColor: LIME,
    marginLeft: wp(1.5),
    marginTop: wp(0.6),
  },
  heroTitle: {
    marginTop: hp(1.8),
    fontSize: wp(6.5),
    fontWeight: "800",
    color: "#F8FAFC",
  },
  heroSubtitle: {
    marginTop: hp(1.2),
    fontSize: wp(3.6),
    color: "rgba(248,250,252,0.7)",
    lineHeight: wp(5),
  },
  heroBadge: {
    marginTop: hp(2),
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: wp(3.4),
    paddingVertical: hp(0.6),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  heroBadgeText: { color: "#F8FAFC", fontWeight: "700", fontSize: wp(3.2) },
  filterButton: {
    width: wp(9.5),
    height: wp(9.5),
    borderRadius: wp(4.75),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: hp(1.6),
  },
  sectionTitle: {
    fontSize: wp(4.8),
    fontWeight: "700",
    color: DARK,
  },
  sectionHint: {
    fontSize: wp(3.2),
    color: "rgba(15,23,42,0.5)",
  },
  messageCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: hp(1.6),
    paddingHorizontal: wp(4.4),
    backgroundColor: "#FBFBF8",
    borderRadius: wp(6),
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    marginBottom: hp(1.6),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 4,
  },
  avatarWrap: { marginRight: wp(4), position: "relative" },
  avatarCircle: {
    width: wp(12),
    height: wp(12),
    borderRadius: wp(6),
    backgroundColor: "rgba(50,255,126,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  groupAvatar: {
    backgroundColor: LIME,
  },
  avatarText: { fontWeight: "800", color: DARK, fontSize: wp(4) },
  statusDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: wp(3),
    height: wp(3),
    borderRadius: wp(1.5),
    backgroundColor: LIME,
    borderWidth: 2,
    borderColor: "#FBFBF8",
  },
  messageContent: { flex: 1, gap: 3 },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  messageName: {
    fontSize: wp(4),
    fontWeight: "700",
    color: DARK,
    flex: 1,
    marginRight: 8,
  },
  messageTime: { fontSize: wp(3), color: "rgba(15,23,42,0.45)" },
  messageRole: { fontSize: wp(3.1), color: "rgba(15,23,42,0.5)" },
  messagePreview: { fontSize: wp(3.3), color: "rgba(15,23,42,0.7)" },
  messageActions: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginLeft: wp(3),
    gap: 8,
  },
  unreadPill: {
    backgroundColor: LIME,
    borderRadius: 999,
    paddingHorizontal: wp(2.2),
    paddingVertical: hp(0.4),
  },
  unreadText: {
    color: DARK,
    fontWeight: "800",
    fontSize: wp(3),
  },
  loadingWrap: {
    paddingVertical: hp(6),
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    paddingVertical: hp(6),
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: wp(4.2),
    fontWeight: "700",
    color: DARK,
  },
  emptySub: {
    marginTop: hp(0.6),
    fontSize: wp(3.2),
    color: "rgba(15,23,42,0.55)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: wp(6),
  },
  modalContent: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: 24,
    padding: 24,
    maxHeight: hp(50),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DARK,
    marginBottom: 16,
  },
  orgItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  orgItemActive: {
    backgroundColor: "#F0FDF4",
  },
  orgName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
    flex: 1,
  },
  orgNameActive: {
    color: DARK,
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LIME,
  },
});
