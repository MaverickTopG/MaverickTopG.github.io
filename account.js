// @ts-nocheck
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Linking,
  Dimensions,
  Platform,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import {
  Info,
  ShieldCheck,
  Key,
  Medal,
  Clock,
  Checks,
  Sparkle,
  TrashSimple,
  CheckCircle,
  Lock,
  CaretRight,
  Heart,
  CaretLeft,
  Check,
  Plus,
  ArrowRight,
  IdentificationCard,
} from "phosphor-react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../../auth/AuthContext";
import { db } from "../../auth/firebase";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { withHaptics } from "../../utils/haptics";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const wp = (p: number) => (SCREEN_W * p) / 100;
const hp = (p: number) => (SCREEN_H * p) / 100;

const ICON_MAP: Record<string, any> = {
  "time-outline": Clock,
  "checkmark-done-outline": Checks,
  "information-circle-outline": Info,
  "shield-checkmark-outline": ShieldCheck,
  "key-outline": Key,
  "ribbon-outline": Medal,
  "sparkles-outline": Sparkle,
  "trash-outline": TrashSimple,
  "checkmark-circle": CheckCircle,
  "lock-closed": Lock,
  "chevron-forward": CaretRight,
  "chevron-back": CaretLeft,
  checkmark: Check,
  add: Plus,
  "arrow-forward": ArrowRight,
  heart: Heart,
  "id-card-outline": IdentificationCard,
  sparkles: Sparkle,
};

const withAlpha = (color: string, alpha: number) => {
  if (!color || color.indexOf('#') !== 0) return color;
  const opacity = Math.round(Math.min(Math.max(alpha || 1, 0), 1) * 255);
  return color + opacity.toString(16).toUpperCase().padStart(2, '0');
};

const GridBackground = React.memo(() => {
  // Simpler, cleaner background for the "Admin Portal" look
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
       {/* Pure white background */}
       <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />
       {/* Subtle grid with very low opacity to maintain some texture but keep it clean */}
      <View
         style={[
           styles.gridContainer,
           { opacity: 0.03 } 
         ]}
       >
          {Array.from({ length: 15 }).map((_, i) => (
           <View key={`v-${i}`} style={[styles.gridLineV, { backgroundColor: '#111827' }, { left: `${(i / 14) * 100}%` }]} />
         ))}
         {Array.from({ length: 15 }).map((_, i) => (
           <View key={`h-${i}`} style={[styles.gridLineH, { backgroundColor: '#111827' }, { top: `${(i / 14) * 100}%` }]} />
         ))}
       </View>
    </View>
  );
});

const Icon = ({ name, size = wp(5), color = "#111827" }) => {
  const Comp = ICON_MAP[name] || Info;
  return <Comp size={size} color={color} weight="bold" />;
};

/* -------------------------------------------------------------
   FORMATTERS
   ------------------------------------------------------------- */
function formatHours(total: number) {
  const value = Number(total) || 0;
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
}
const formatInteger = (value: number) => `${Math.round(Number(value) || 0)}`;

/* -------------------------------------------------------------
   HELPER: deep-navigate to any of the given route names
   (walks up through parent navigators)
   ------------------------------------------------------------- */
const navigateToScreenDeep =
  (navigation: any) =>
  (
    routeCandidates: string[] = [],
    params: Record<string, any> | undefined = undefined
  ): boolean => {
    let current = navigation;
    while (current) {
      const state = current.getState?.();
      const routeNames = state?.routeNames;
      if (Array.isArray(routeNames)) {
        for (const name of routeCandidates) {
          if (routeNames.includes(name)) {
            current.navigate(name, params);
            return true;
          }
        }
      }
      current = current.getParent?.();
    }
    return false;
  };

/* -------------------------------------------------------------
   HELPER: specifically for the Volunteer tab stack
   ------------------------------------------------------------- */
const navigateToVolunteerScreen =
  (navigation: any) =>
  (targetScreen: string = "VolunteerLogs"): boolean => {
    return navigateToScreenDeep(navigation)(["Volunteer"], {
      screen: targetScreen,
    });
  };

/* -------------------------------------------------------------
   HELPER: specifically for the Account stack Admin Portal
   (looks for "AdminPortal" first, but also tries a couple of
   reasonable names in case you changed it)
   ------------------------------------------------------------- */
const navigateToAdminPortalDeep =
  (navigation: any) => (): boolean => {
    return navigateToScreenDeep(navigation)(
      ["AdminPortal", "Admin", "AccountAdmin"],
      undefined
    );
  };

// normalize organization code/id for deduplication
const normalizeOrgCode = (value: any): string | null => {
  if (!value) return null;
  const text = String(value).trim().toUpperCase();
  return text || null;
};

const countUniqueOrganizations = (docs: any[] = []): number => {
  const seen = new Set<string>();
  docs.forEach((docSnap) => {
    const data = docSnap.data?.() || {};
    if (data.removed_by_user || data.status === "revoked") return;
    if (data.is_personal) return;
    const code =
      normalizeOrgCode(
        data.access_code || data.organizationCode || data.org_access_code
      ) || null;
    const linkedId =
      data.linked_org_id || data.organization_id || data.org_id || null;
    const key = code || (linkedId ? String(linkedId) : docSnap.id);
    if (key) seen.add(key);
  });
  return seen.size;
};

export default function AccountScreen() {
  const navigation = useNavigation();
  const { user, userProfile } = useContext(AuthContext);
  const isGuest = !user;

  const [orgCount, setOrgCount] = useState(0);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [stats, setStats] = useState({
    totalHours: 0,
    totalSessions: 0,
    approved: 0,
    pending: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [pullDistance, setPullDistance] = useState(0);

  const goToVolunteer = navigateToVolunteerScreen(navigation);
  const goToAdminPortalDeep = navigateToAdminPortalDeep(navigation);

  /* -------------------------------------------------------------
     LOGIN FLOW (used by Admin Portal + masked sections)
     ------------------------------------------------------------- */
  const goToLogin = useCallback(() => {
    // 1) try Volunteer tab's Login
    const reached = goToVolunteer("Login");
    if (reached) return;

    // 2) fallback: maybe current navigator has Login
    try {
      navigation.navigate("Login" as never);
    } catch (e) {
      console.warn("Login screen not found on current navigator");
    }
  }, [navigation, goToVolunteer]);

  /* -------------------------------------------------------------
     FETCH VOLUNTEER LOG STATS
     ------------------------------------------------------------- */
  useEffect(() => {
    if (!user) {
      setStats({ totalHours: 0, totalSessions: 0, approved: 0, pending: 0 });
      setLoadingStats(false);
      return;
    }

    setLoadingStats(true);
    const logsQuery = query(
      collection(db, "volunteer_logs"),
      where("user_id", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => {
        let totalHours = 0;
        let totalSessions = 0;
        let approved = 0;
        let pending = 0;

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const hoursValue = data.hours_contributed ?? data.hours;
          totalHours += Number(hoursValue) || 0;
          totalSessions += 1;

          // if no org, auto-approve
          if (!data.organization_id) {
            approved += 1;
            return;
          }

          const status = (data.approve || "").toString().toLowerCase();
          if (status === "accepted" || status.startsWith("approved")) {
            approved += 1;
          } else if (status.includes("denied")) {
            // denied → counted only in totalSessions
          } else {
            pending += 1;
          }
        });

        setStats({ totalHours, totalSessions, approved, pending });
        setLoadingStats(false);
      },
      (error) => {
        console.error("Failed to load volunteer stats", error);
        setLoadingStats(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  /* -------------------------------------------------------------
     FETCH USER ORGS
     ------------------------------------------------------------- */
  useEffect(() => {
    if (!user) {
      setOrgCount(0);
      setLoadingOrgs(false);
      return;
    }

    setLoadingOrgs(true);
    const orgsQuery = query(collection(db, "users"), where("user_id", "==", user.uid));

    const unsubscribe = onSnapshot(
      orgsQuery,
      (snapshot) => {
        setOrgCount(countUniqueOrganizations(snapshot.docs));
        setLoadingOrgs(false);
      },
      (error) => {
        console.error("Failed to load organizations", error);
        setOrgCount(0);
        setLoadingOrgs(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // force-refresh org count when returning to this screen
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        try {
          const orgsQuery = query(
            collection(db, "users"),
            where("user_id", "==", user.uid)
          );
          const snapshot = await getDocs(orgsQuery);
          setOrgCount(countUniqueOrganizations(snapshot.docs));
        } catch (err) {
          console.warn("Failed to refresh organizations on focus", err);
        }
      })();
    }, [user])
  );

  /* -------------------------------------------------------------
     DISPLAY NAME / INITIALS
     ------------------------------------------------------------- */
  const displayName = useMemo(() => {
    if (isGuest) return "Guest Volunteer";
    if (userProfile?.firstName || userProfile?.lastName) {
      return [userProfile.firstName, userProfile.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    if (user?.displayName) return user.displayName;
    return user?.email || "Volunteer";
  }, [isGuest, user, userProfile]);

  const initials = useMemo(() => {
    const name = displayName || "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return "VL";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }, [displayName]);

  /* -------------------------------------------------------------
     EXTERNAL LINKS
     ------------------------------------------------------------- */
  const openPrivacyPolicy = () =>
    Linking.openURL(
      "https://nexolink-b8eb5.web.app/privacy_policy.html"
    ).catch(() => {});

  /* -------------------------------------------------------------
     QUICK ACTIONS
     (Admin Portal tries to hit AdminPortal first, then login)
     ------------------------------------------------------------- */
  const quickActions = useMemo(
    () => [
      {
        key: "about",
        title: "About",
        subtitle: "Learn more about NexoLink",
        icon: "information-circle-outline",
        accent: "#E0E7FF", // Indigo-50
        onPress: () => navigation.navigate("About" as never),
      },
      {
        key: "privacy",
        title: "Privacy Policy",
        subtitle: "Understand how we use your data",
        icon: "shield-checkmark-outline",
        accent: "#FCE7F3", // Pink-50
        onPress: openPrivacyPolicy,
      },
      {
        key: "adminPortal",
        title: "Admin Portal",
        subtitle: "Manage sites, hours, and teams",
        icon: "key-outline",
        accent: "#ECFCCB", // Lime-100 (Tertiary feel)
        onPress: () => {
          // 1) first, try to navigate to AdminPortal in this/parent stack
          const reached = goToAdminPortalDeep();
          if (reached) return;

          // 2) if we didn't find it and the user is a guest → go to login
          if (isGuest) {
            goToLogin();
            return;
          }

          // 3) if user is NOT a guest but we still couldn't find AdminPortal,
          // at least warn in console so you can see it in dev
          console.warn(
            "AdminPortal screen not found in the current navigator tree."
          );
        },
      },
      {
        key: "badges",
        title: "Badges",
        subtitle: "Celebrate achievements",
        icon: "ribbon-outline",
        accent: "#FEF3C7", // Amber-50
        onPress: () => navigation.navigate("Badges" as never),
      },
    ],
    [navigation, isGuest, goToLogin, goToAdminPortalDeep]
  );

  const quoteOfTheDay = useMemo(() => {
    const quotes = [
      "Small acts, when multiplied by millions, can transform the world.",
      "Service is the rent we pay for the privilege of living on this earth.",
      "Your time is someone else's breakthrough.",
      "Kindness begins with a single hour.",
      "Impact grows when you show up consistently.",
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }, []);

  /* -------------------------------------------------------------
     FORMATTED NUMBERS
     ------------------------------------------------------------- */
  const totalHoursLabel = useMemo(
    () => formatHours(stats.totalHours || 0),
    [stats.totalHours]
  );
  const totalSessionsLabel = useMemo(
    () => formatInteger(stats.totalSessions || 0),
    [stats.totalSessions]
  );
  const orgCountLabel = useMemo(
    () => formatInteger(orgCount || 0),
    [orgCount]
  );

  const statsCards = useMemo(
    () => [
      {
        key: "hours",
        label: "Total Hours",
        value: loadingStats || isGuest ? "—" : totalHoursLabel,
        icon: Clock,
      },
      {
        key: "sessions",
        label: "Sessions Logged",
        value: loadingStats || isGuest ? "—" : totalSessionsLabel,
        icon: Checks,
      },
    ],
    [
      totalHoursLabel,
      totalSessionsLabel,
      isGuest,
      loadingStats,
    ]
  );

  /* -------------------------------------------------------------
     DELETE HANDLER
     (Delete lives in the Volunteer stack)
     ------------------------------------------------------------- */
  const handleDeleteAccount = () => {
    if (isGuest) {
      goToLogin();
      return;
    }

    const reached = goToVolunteer("Delete");
    if (reached) return;

    // last resort
    try {
      navigation.navigate("Delete" as never);
    } catch {
      console.warn("Delete screen not found in any parent navigator");
    }
  };

  /* -------------------------------------------------------------
     RENDER
     ------------------------------------------------------------- */
  return (
    <View style={styles.container}>
      <GridBackground />
      <StatusBar
        barStyle="dark-content"
        translucent
        backgroundColor="transparent"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          if (offsetY < 0) {
            setPullDistance(Math.min(-offsetY, hp(16)));
          } else if (pullDistance !== 0) {
            setPullDistance(0);
          }
        }}
      >
        <View
          style={[
            styles.pullQuoteWrap,
            {
              height: pullDistance,
              opacity: Math.min(pullDistance / hp(10), 1),
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.pullQuoteText}>{quoteOfTheDay}</Text>
        </View>
        {/* HERO */}
        <View style={styles.heroCard}>
          <View style={styles.heroBody}>
            <View style={[styles.avatar, { backgroundColor: "#1F2937" }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName}>{displayName}</Text>
              <Text style={styles.heroSubtitle}>
                {isGuest
                  ? "Sign in to unlock your impact data."
                  : loadingStats
                  ? "Syncing your impact…"
                  : "Your architecture of impact is growing."}
              </Text>
            </View>
          </View>
        </View>

        {/* STATS SECTION */}
        {!isGuest && (
          <View style={[styles.statsRow, styles.cardSurface]}>
            {statsCards.map((card, idx) => (
              <React.Fragment key={card.key}>
                <View style={styles.statModule}>
                  <Text style={styles.statValue}>{card.value}</Text>
                  <Text style={styles.statLabel}>{card.label}</Text>
                </View>
                {idx === 0 && <View style={styles.statDivider} />}
              </React.Fragment>
            ))}
          </View>
        )}

        {/* QUICK ACTIONS */}
        <Text style={styles.sectionHeading}>Quick actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action, idx) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.actionCard,
                styles.cardSurface,
              ]}
              onPress={withHaptics(action.onPress, "medium")}
              activeOpacity={0.9}
            >
              <View style={[styles.actionIconWrapper, { backgroundColor: action.accent || "#F3F4F6" }]}>
                <Icon name={action.icon} size={wp(6)} color="#111827" />
              </View>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isGuest ? null : null}

        {/* SETTINGS */}
        {!isGuest && (
          <View style={[styles.settingsCard, styles.cardSurface, { backgroundColor: '#111827' }]}>
            <View style={styles.settingsHeader}>
              <Text style={[styles.settingsTitle, { color: '#FFFFFF' }]}>Support & settings</Text>
              <Sparkle size={wp(4.5)} color="#84cc16" weight="bold" />
            </View>

            <TouchableOpacity
              style={styles.settingsRow}
              activeOpacity={0.8}
              onPress={withHaptics(handleDeleteAccount, "heavy")}
            >
              <View style={[styles.settingsIcon, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                <TrashSimple size={wp(4.8)} color="#EF4444" weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingsRowTitle, { color: '#FFFFFF' }]}>Delete account</Text>
                <Text style={[styles.settingsRowSubtitle, { color: '#9CA3AF' }]}>
                  Permanently remove your data
                </Text>
              </View>
              <CaretRight
                size={wp(4.2)}
                color="#6B7280"
                weight="bold"
              />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------------
   STYLES
   ------------------------------------------------------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: {
    paddingHorizontal: wp(6),
    paddingBottom: hp(12),
    paddingTop: hp(8),
  },
  // ... (keep pull quote styles)
  pullQuoteWrap: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: wp(8),
    marginBottom: wp(4),
  },
  pullQuoteText: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: wp(3.4),
    fontWeight: "600",
    lineHeight: wp(5),
  },

  // HERO
  heroCard: {
    padding: wp(6),
    borderRadius: wp(6),
    marginBottom: wp(6),
    backgroundColor: "#111827", // Dark Blue (Secondary)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  heroBody: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: wp(16),
    height: wp(16),
    borderRadius: wp(8),
    justifyContent: "center",
    alignItems: "center",
    marginRight: wp(5),
    backgroundColor: "#1F2937",
    borderWidth: 2,
    borderColor: "#374151",
  },
  avatarInitials: {
    fontSize: wp(6),
    fontWeight: "800",
    color: "#84cc16", // Lime Green accent
  },
  heroName: {
    fontSize: wp(6),
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  heroSubtitle: {
    fontSize: wp(3.2),
    color: "#9CA3AF",
    fontWeight: "500",
    marginTop: wp(1.2),
  },

  // STATS ROW
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: wp(6),
    marginBottom: wp(8),
    // Card Surface properties
    backgroundColor: "#FFFFFF",
    borderRadius: wp(6),
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  statModule: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: wp(6),
    fontWeight: "900",
    color: "#111827",
  },
  statLabel: {
    fontSize: wp(2.8),
    fontWeight: "700",
    color: "#6B7280",
    marginTop: wp(1),
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statDivider: {
    width: 1,
    height: wp(10),
    backgroundColor: "#E5E7EB",
  },

  // SECTIONS
  sectionHeading: {
    fontSize: wp(3.6),
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.3,
    marginBottom: wp(4),
    marginLeft: wp(1),
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  cardSurface: {
     backgroundColor: "#FFFFFF",
     borderRadius: wp(6),
     borderWidth: 1,
     borderColor: "#F3F4F6",
     shadowColor: "#000",
     shadowOffset: { width: 0, height: 4 },
     shadowOpacity: 0.03,
     shadowRadius: 8,
     elevation: 2,
  },
  actionCard: {
    width: "48%",
    padding: wp(5),
    marginBottom: wp(4),
    aspectRatio: 1.1,
    justifyContent: "center",
  },
  actionIconWrapper: {
    width: wp(12),
    height: wp(12),
    borderRadius: wp(6),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: wp(4),
  },
  actionTitle: {
    fontSize: wp(4),
    fontWeight: "800",
    color: "#111827",
    marginBottom: wp(1),
  },
  actionSubtitle: {
    fontSize: wp(3),
    color: "#6B7280",
    fontWeight: "500",
    lineHeight: wp(4.5),
  },

  // SETTINGS
  settingsCard: {
    padding: wp(6),
    marginTop: wp(4),
    borderRadius: wp(6),
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: wp(6),
  },
  settingsTitle: {
    fontSize: wp(4.5),
    fontWeight: "800",
    color: "#FFFFFF",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: wp(4),
    borderRadius: wp(4),
  },
  settingsIcon: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(5),
    justifyContent: "center",
    alignItems: "center",
    marginRight: wp(4),
  },
  settingsRowTitle: {
    fontSize: wp(3.8),
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: wp(0.5),
  },
  settingsRowSubtitle: {
    fontSize: wp(3),
    color: "#9CA3AF",
    fontWeight: "500",
  },

  // BACKGROUND
  gridContainer: {
    position: 'absolute',
    top: -hp(20),
    left: -wp(50),
    width: SCREEN_W * 2,
    height: SCREEN_H * 2,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  // Removed backgroundGradient as we use solid white
  glowPool: {
    position: 'absolute',
    width: wp(80),
    height: wp(80),
    borderRadius: wp(40),
    backgroundColor: '#84cc16', // Lime glow
    opacity: 0.1,
  },

  // LOGIN BUTTON (Guest)
  guestActionContainer: {
    marginTop: wp(10),
    alignItems: "center",
  },
});
