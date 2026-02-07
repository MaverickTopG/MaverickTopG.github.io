import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ScrollView,
  TextInput,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  SafeAreaView
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeIn
} from "react-native-reanimated";
import { 
  ArrowLeft, 
  CalendarBlank, 
  MapPinLine, 
  UsersThree, 
  Clock, 
  CheckCircle,
  MagnifyingGlass,
  Funnel,
  CaretDown,
  X
} from "phosphor-react-native";

// --- Firebase Imports ---
import { getApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';

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

// --- Grid Background ---
const GridBackground = () => {
  const glowAlpha = useSharedValue(0.15);

  useEffect(() => {
    glowAlpha.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.15, { duration: 2500, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowAlpha.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.glowPool, { top: "20%", left: "6%" }, glowStyle]} />
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

export default function EventsScreen() {
  const navigation = useNavigation();
  
  // State
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [events, setEvents] = useState([]);
  const [signups, setSignups] = useState({}); // Map: eventId -> signupDoc
  const [searchQuery, setSearchQuery] = useState("");
  
  const [userOrganizations, setUserOrganizations] = useState([]); // List of org names
  const [myOrgCodes, setMyOrgCodes] = useState(new Set());
  const [myOrgIds, setMyOrgIds] = useState(new Set());
  
  const [activeFilter, setActiveFilter] = useState('All Events');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [processingId, setProcessingId] = useState(null); // Loading state for signups

  // Data Loading
  useEffect(() => {
    let unsubAuth, unsubEvents, unsubSignups;
    const auth = getFirebaseAuth();
    
    unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setEvents([]); 
        setLoading(false); 
        return;
      }

      const db = getFirestoreDb();

      // 1. Fetch User Orgs
      try {
        const qOrgs = query(collection(db, 'user_organizations'), where('user_id', '==', user.uid));
        const orgSnaps = await getDocs(qOrgs);
        
        const codes = new Set();
        const ids = new Set();
        const names = new Set();
        
        orgSnaps.forEach(doc => {
            const d = doc.data();
            const status = (d.status || '').toLowerCase();
            // Whitelist Check
            if (['active', 'accepted', 'approved', 'connected', 'granted'].some(v => status.includes(v)) || !status) {
                 if (d.orgCode) codes.add(d.orgCode.toUpperCase());
                 if (d.org_code) codes.add(d.org_code.toUpperCase());
                 if (d.orgId) ids.add(String(d.orgId));
                 if (d.organizationId) ids.add(String(d.organizationId));
                 
                 const name = d.name || d.orgName || d.schoolName;
                 if (name) names.add(name);
            }
        });
        
        setMyOrgCodes(codes);
        setMyOrgIds(ids);
        setUserOrganizations(Array.from(names).sort());

        // 2. Subscribe to Events
        const qEvents = query(collection(db, 'events'), where('status', '!=', 'draft'));
        unsubEvents = onSnapshot(qEvents, (snapshot) => {
            const loaded = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.status === 'archived') return; // Skip archived
                
                const evtOrgCode = (d.orgCode || d.org_code || '').toUpperCase();
                const evtOrgId = String(d.orgId || d.org_id || '');
                
                // Match Logic
                const isMatch = (evtOrgCode && codes.has(evtOrgCode)) || (evtOrgId && ids.has(evtOrgId));
                if (isMatch) {
                    loaded.push({ id: doc.id, ...d });
                }
            });
            // Client-side sort by date
            loaded.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
            setEvents(loaded);
            setLoading(false);
        });

        // 3. Subscribe to Signups
        const qSignups = query(collection(db, 'event_signups'), where('volunteerEmail', '==', user.email));
        unsubSignups = onSnapshot(qSignups, (snapshot) => {
            const map = {};
            snapshot.forEach(doc => {
                const d = doc.data();
                map[d.eventId] = { id: doc.id, status: d.status };
            });
            setSignups(map);
        });

      } catch (e) {
        console.error("Error loading events", e);
        setLoading(false);
      }
    });

    return () => {
        if(unsubAuth) unsubAuth();
        if(unsubEvents) unsubEvents();
        if(unsubSignups) unsubSignups();
    };
  }, []);

  // Actions
  const handleReserve = async (event) => {
     if (!currentUser) return;
     setProcessingId(event.id);
     try {
        const db = getFirestoreDb();
        const fullName = currentUser.displayName || 'Volunteer';
        
        await addDoc(collection(db, 'event_signups'), {
            eventId: event.id,
            volunteerId: currentUser.uid,
            volunteerName: fullName,
            volunteerEmail: currentUser.email,
            status: 'confirmed',
            role: 'Volunteer',
            createdAt: serverTimestamp(),
            eventTitle: event.title,
            eventDate: event.startDate
        });
        Alert.alert("Success", "You have reserved a spot!");
     } catch (e) {
        Alert.alert("Error", "Could not reserve spot.");
     } finally {
        setProcessingId(null);
     }
  };

  const handleCancel = async (eventId) => {
     const signup = signups[eventId];
     if (!signup) return;
     
     Alert.alert("Cancel Reservation", "Are you sure you want to cancel?", [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive", 
          onPress: async () => {
             setProcessingId(eventId);
             try {
                const db = getFirestoreDb();
                await deleteDoc(doc(db, 'event_signups', signup.id));
             } catch (e) {
                Alert.alert("Error", "Could not cancel.");
             } finally {
                setProcessingId(null);
             }
          }
        }
     ]);
  };

  // Filtering
  const filteredEvents = useMemo(() => {
     return events.filter(ev => {
        // Search
        const q = searchQuery.toLowerCase();
        const matchesSearch = !q || ev.title.toLowerCase().includes(q) || (ev.city || '').toLowerCase().includes(q);
        if (!matchesSearch) return false;
        
        // Org Filter
        if (activeFilter !== 'All Events') {
            const orgName = ev.orgName || ev.organizationName || ev.name || '';
            if (orgName !== activeFilter) return false;
        }
        return true;
     });
  }, [events, searchQuery, activeFilter]);

  // Helpers
  const formatDate = (dateStr) => {
     if (!dateStr) return { month: 'TBA', day: '--' };
     const d = new Date(dateStr);
     if (isNaN(d.getTime())) return { month: 'TBA', day: '--' };
     return {
        month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        day: d.getDate()
     };
  };

  const formatTime = (start, end) => {
      if (!start) return 'Time TBA';
      // Simple parse assumes HH:mm string or similar
      const toTime = t => {
         // Hacky fix for different time formats if needed, assuming ISO or HH:mm
         const attempt = new Date(`2000-01-01T${t}`);
         if (isNaN(attempt.getTime())) return t;
         return attempt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      };
      return end ? `${toTime(start)} - ${toTime(end)}` : toTime(start);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <GridBackground />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
              <ArrowLeft size={20} color={LIME} weight="bold" />
            </TouchableOpacity>
            <View style={styles.brandPill}>
                 <View style={styles.neonDot} />
                 <Text style={styles.brandText}>EVENTS</Text>
            </View>
        </View>
        
        <Text style={styles.screenTitle}>Volunteer Opportunities</Text>
        
        <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
                <MagnifyingGlass size={18} color="#94A3B8" weight="bold" />
                <TextInput 
                    placeholder="Search events..."
                    placeholderTextColor="#64748B"
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>
            <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilterModal(true)}>
                <Funnel size={20} color={activeFilter !== 'All Events' ? LIME : DARK} weight="fill" />
            </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
         {loading ? (
             <ActivityIndicator size="large" color={LIME} style={{ marginTop: 40 }} />
         ) : filteredEvents.length === 0 ? (
             <View style={styles.emptyContainer}>
                 <CalendarBlank size={48} color="#CBD5E1" weight="duotone" />
                 <Text style={styles.emptyTitle}>No events found</Text>
                 <Text style={styles.emptySubtitle}>Try adjusting your search or check back later.</Text>
             </View>
         ) : (
             filteredEvents.map((event, index) => {
                 const date = formatDate(event.startDate);
                 const isSignedUp = !!signups[event.id];
                 const isProcessing = processingId === event.id;
                 
                 return (
                    <Animated.View 
                        key={event.id}
                        entering={FadeIn.delay(index * 100).duration(600)}
                        style={styles.eventCard}
                    >
                        {/* Image/Date Area */}
                        <View style={styles.cardImageContainer}>
                            {event.coverImageUrl ? (
                                <Image source={{ uri: event.coverImageUrl }} style={styles.cardImage} />
                            ) : (
                                <View style={[styles.cardImage, styles.placeholderImage]}>
                                    <CalendarBlank size={32} color="#CBD5E1" />
                                </View>
                            )}
                            <View style={styles.dateBadge}>
                                <Text style={styles.dateMonth}>{date.month}</Text>
                                <Text style={styles.dateDay}>{date.day}</Text>
                            </View>
                        </View>
                        
                        {/* Info Area */}
                        <View style={styles.cardContent}>
                             {/* Organization & Status */}
                             <View style={styles.metaRow}>
                                <View style={[
                                    styles.statusPill, 
                                    isSignedUp ? styles.statusRegistered : styles.statusOpen
                                ]}>
                                    <Text style={[
                                        styles.statusText,
                                        isSignedUp ? styles.textRegistered : styles.textOpen
                                    ]}>
                                        {isSignedUp ? "REGISTERED" : (event.status || "OPEN").toUpperCase()}
                                    </Text>
                                </View>
                                {event.shifts && event.shifts.length > 0 && (
                                    <View style={styles.shiftPill}>
                                        <Text style={styles.shiftText}>{event.shifts.length} SHIFTS</Text>
                                    </View>
                                )}
                             </View>

                             <Text style={styles.cardTitle}>{event.title}</Text>
                             
                             <View style={styles.detailsRow}>
                                 <View style={styles.detailItem}>
                                     <Clock size={14} color="#64748B" />
                                     <Text style={styles.detailText}>{formatTime(event.startTime, event.endTime)}</Text>
                                 </View>
                                 <View style={styles.detailItem}>
                                     <MapPinLine size={14} color="#64748B" />
                                     <Text style={styles.detailText} numberOfLines={1}>
                                        {[event.venue, event.city].filter(Boolean).join(', ') || 'TBA'}
                                     </Text>
                                 </View>
                             </View>
                             
                             {/* Action Button */}
                             <TouchableOpacity 
                                style={[
                                    styles.actionBtn, 
                                    isSignedUp ? styles.btnCancel : styles.btnReserve,
                                    isProcessing && { opacity: 0.7 }
                                ]}
                                onPress={() => isSignedUp ? handleCancel(event.id) : handleReserve(event)}
                                disabled={isProcessing}
                             >
                                 {isProcessing ? (
                                     <ActivityIndicator size="small" color={isSignedUp ? "#EF4444" : "#FFF"} />
                                 ) : isSignedUp ? (
                                     <Text style={styles.btnTextCancel}>Cancel Registration</Text>
                                 ) : (
                                     <>
                                        <Text style={styles.btnTextReserve}>Reserve Spot</Text>
                                        <ArrowLeft size={16} color="#FFF" style={{ transform: [{ rotate: '180deg' }] }} />
                                     </>
                                 )}
                             </TouchableOpacity>
                        </View>
                    </Animated.View>
                 );
             })
         )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
         <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFilterModal(false)}>
            <View style={styles.modalContent}>
               <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Filter by Organization</Text>
                  <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                      <X size={20} color={DARK} />
                  </TouchableOpacity>
               </View>
               <ScrollView style={{ maxHeight: hp(40) }} contentContainerStyle={{ gap: 8 }}>
                  <TouchableOpacity 
                      style={[styles.filterOpt, activeFilter === 'All Events' && styles.filterOptActive]}
                      onPress={() => { setActiveFilter('All Events'); setShowFilterModal(false); }}
                  >
                      <Text style={[styles.filterText, activeFilter === 'All Events' && styles.filterTextActive]}>All Events</Text>
                      {activeFilter === 'All Events' && <CheckCircle size={16} color={LIME} weight="fill" />}
                  </TouchableOpacity>
                  {userOrganizations.map(org => (
                      <TouchableOpacity 
                          key={org}
                          style={[styles.filterOpt, activeFilter === org && styles.filterOptActive]}
                          onPress={() => { setActiveFilter(org); setShowFilterModal(false); }}
                      >
                          <Text style={[styles.filterText, activeFilter === org && styles.filterTextActive]}>{org}</Text>
                          {activeFilter === org && <CheckCircle size={16} color={LIME} weight="fill" />}
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
  // ... Grid ...
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
  
  // Header
  header: {
    paddingTop: Platform.OS === 'ios' ? hp(6) : hp(5),
    paddingHorizontal: wp(6),
    paddingBottom: hp(2),
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: hp(2)
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DARK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: {width:0, height:4},
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6
  },
  neonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LIME
  },
  brandText: {
    fontSize: 10,
    fontWeight: '800',
    color: DARK,
    letterSpacing: 1
  },
  screenTitle: {
    fontSize: wp(7),
    fontWeight: '800',
    color: DARK,
    marginBottom: hp(2)
  },
  searchRow: {
    flexDirection: 'row',
    gap: 12
  },
  searchContainer: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: "#000",
    shadowOffset: {width:0, height:2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: DARK,
    fontWeight: '500'
  },
  filterBtn: {
    width: 48,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: "#000",
    shadowOffset: {width:0, height:2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },

  // Scroll Content
  scrollContent: {
    paddingHorizontal: wp(6),
    paddingBottom: hp(10),
    paddingTop: hp(1)
  },
  emptyContainer: {
     alignItems: 'center',
     justifyContent: 'center',
     paddingTop: hp(8),
     opacity: 0.6
  },
  emptyTitle: {
     fontSize: 18,
     fontWeight: '700',
     color: DARK,
     marginTop: 16
  },
  emptySubtitle: {
     fontSize: 14,
     color: "#64748B",
     marginTop: 4
  },

  // Event Card
  eventCard: {
     backgroundColor: '#FFFFFF',
     borderRadius: 24,
     marginBottom: 20,
     overflow: 'hidden',
     borderWidth: 1,
     borderColor: 'rgba(0,0,0,0.04)',
     shadowColor: "#000",
     shadowOffset: {width:0, height:8},
     shadowOpacity: 0.06,
     shadowRadius: 16,
     elevation: 3
  },
  cardImageContainer: {
     height: 150,
     position: 'relative'
  },
  cardImage: {
     width: '100%',
     height: '100%',
     resizeMode: 'cover'
  },
  placeholderImage: {
     backgroundColor: '#F1F5F9',
     alignItems: 'center',
     justifyContent: 'center'
  },
  dateBadge: {
     position: 'absolute',
     top: 12,
     left: 12,
     backgroundColor: 'rgba(255,255,255,0.95)',
     borderRadius: 12,
     paddingHorizontal: 10,
     paddingVertical: 6,
     alignItems: 'center',
     elevation: 4,
     shadowColor: "#000",
     shadowOffset: {width:0, height:2},
     shadowOpacity: 0.1,
     shadowRadius: 4,
  },
  dateMonth: {
     fontSize: 10,
     fontWeight: '800',
     color: '#64748B',
     marginBottom: 1
  },
  dateDay: {
     fontSize: 18,
     fontWeight: '800',
     color: DARK,
     lineHeight: 20
  },
  
  cardContent: {
     padding: 20
  },
  cardTitle: {
     fontSize: 20,
     fontWeight: '700',
     color: DARK,
     marginBottom: 12
  },
  metaRow: {
     flexDirection: 'row',
     gap: 8,
     marginBottom: 10
  },
  statusPill: {
     paddingHorizontal: 8,
     paddingVertical: 4,
     borderRadius: 8,
     borderWidth: 1
  },
  statusOpen: {
     backgroundColor: '#F1F5F9',
     borderColor: '#E2E8F0'
  },
  statusRegistered: {
     backgroundColor: '#DCFCE7',
     borderColor: '#BBF7D0'
  },
  statusText: {
     fontSize: 10,
     fontWeight: '700'
  },
  textOpen: { color: '#64748B' },
  textRegistered: { color: '#166534' },

  shiftPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  shiftText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB'
  },

  detailsRow: {
     flexDirection: 'row',
     flexWrap: 'wrap',
     gap: 16,
     marginBottom: 20
  },
  detailItem: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 6
  },
  detailText: {
     fontSize: 13,
     fontWeight: '600',
     color: '#64748B'
  },
  
  actionBtn: {
     height: 48,
     borderRadius: 14,
     alignItems: 'center',
     justifyContent: 'center',
     flexDirection: 'row',
     gap: 8
  },
  btnReserve: {
     backgroundColor: DARK,
  },
  btnCancel: {
     backgroundColor: '#FEF2F2',
     borderWidth: 1,
     borderColor: '#FEE2E2'
  },
  btnTextReserve: {
     color: '#FFFFFF',
     fontSize: 14,
     fontWeight: '700'
  },
  btnTextCancel: {
     color: '#EF4444',
     fontSize: 14,
     fontWeight: '700'
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: {width:0, height:20},
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DARK
  },
  filterOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12
  },
  filterOptActive: {
    backgroundColor: '#F0FDF4'
  },
  filterText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#64748B'
  },
  filterTextActive: {
    color: DARK,
    fontWeight: '600'
  }
});
