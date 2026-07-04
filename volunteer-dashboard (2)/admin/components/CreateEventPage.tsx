import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Image as ImageIcon,
  Check,
  Type,
  Plus,
  X,
  Loader2,
  Repeat,
  Trash2,
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb, getFirebaseStorage } from '../lib/firebase';
import { subscribeToOrgAdminContext } from '../lib/orgContext';
import {
  createEvent,
  updateEvent,
  upsertShift,
  type EventRecurrence,
  type EventShift,
  type EventStatus,
  type NewEventInput,
  type ShiftRole,
  type VolunteerEvent,
} from '../lib/eventsService';

interface CreateEventPageProps {
  onBack: () => void;
}

type RoleFormEntry = {
  localId: string;
  name: string;
  capacity: string;
  originalSignedUpCount: number;
};

type ShiftFormEntry = {
  localId: string;
  firestoreId?: string;
  date: string;
  startTime: string;
  endTime: string;
  repeatCount: string;
  roles: RoleFormEntry[];
};

const EVENT_DRAFT_EDIT_KEY = 'nexolink:event-edit-id';
const RECURRENCE_OPTIONS = [
  { key: 'one_time' as const, label: 'One-Time' },
  { key: 'weekly' as const, label: 'Weekly' },
  { key: 'biweekly' as const, label: 'Biweekly' },
  { key: 'monthly' as const, label: 'Monthly' },
];

const makeLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const makeBlankRole = (): RoleFormEntry => ({
  localId: makeLocalId(),
  name: '',
  capacity: '',
  originalSignedUpCount: 0,
});

const makeBlankShift = (): ShiftFormEntry => ({
  localId: makeLocalId(),
  date: '',
  startTime: '',
  endTime: '',
  repeatCount: '4',
  roles: [makeBlankRole()],
});

const sanitizePathToken = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');

const formatDateForInput = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTimeForInput = (date: Date): string => {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const shiftToFormEntry = (shift: EventShift): ShiftFormEntry => ({
  localId: shift.id,
  firestoreId: shift.id,
  date: formatDateForInput(shift.date),
  startTime: formatTimeForInput(shift.startTime),
  endTime: formatTimeForInput(shift.endTime),
  repeatCount: '4',
  roles: Object.entries(shift.roles).map(([roleId, role]) => ({
    localId: roleId,
    name: role.name,
    capacity: String(role.capacity),
    originalSignedUpCount: role.signedUpCount,
  })),
});

const combineDateAndTime = (dateStr: string, timeStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = (timeStr || '00:00').split(':').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
};

const dateOnly = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1, 0, 0, 0, 0);
};

const addRecurrenceInterval = (dateStr: string, recurrence: EventRecurrence, multiplier: number): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const base = new Date(year || 1970, (month || 1) - 1, day || 1);
    base.setDate(base.getDate() + (recurrence === 'weekly' ? 7 : 14) * multiplier);
    return formatDateForInput(base);
  }
  if (recurrence === 'monthly') {
    const targetMonthIndex = (month || 1) - 1 + multiplier;
    const targetYear = (year || 1970) + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const daysInTargetMonth = new Date(targetYear, normalizedMonthIndex + 1, 0).getDate();
    const clampedDay = Math.min(day || 1, daysInTargetMonth);
    return formatDateForInput(new Date(targetYear, normalizedMonthIndex, clampedDay));
  }
  return dateStr;
};

export const CreateEventPage: React.FC<CreateEventPageProps> = ({ onBack }) => {
  const [activeCategory, setActiveCategory] = useState('Community');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState('');
  const [adminUid, setAdminUid] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverImagePreview, setCoverImagePreview] = useState('');
  const [recurrence, setRecurrence] = useState<EventRecurrence>('one_time');
  const [shifts, setShifts] = useState<ShiftFormEntry[]>([makeBlankShift()]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const categories = ['Community', 'Environment', 'Education', 'Health', 'Crisis Relief'];

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    let unsubContext: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubContext) {
        unsubContext();
        unsubContext = null;
      }
      if (!user) {
        setOrgId('');
        setAdminUid('');
        return;
      }
      setAdminUid(user.uid);
      unsubContext = subscribeToOrgAdminContext(db, user.uid, (context) => {
        setOrgId(context.orgId || '');
      });
    });
    return () => {
      unsubscribeAuth();
      if (unsubContext) unsubContext();
    };
  }, []);

  useEffect(() => {
    const draftId = sessionStorage.getItem(EVENT_DRAFT_EDIT_KEY)?.trim() || '';
    sessionStorage.removeItem(EVENT_DRAFT_EDIT_KEY);
    if (!draftId || !orgId) return;

    let cancelled = false;
    const loadDraft = async () => {
      setIsLoadingDraft(true);
      try {
        const db = getFirestoreDb();
        const eventSnap = await getDoc(doc(db, 'organizations', orgId, 'events', draftId));
        if (!eventSnap.exists()) {
          if (!cancelled) setEditingEventId(null);
          return;
        }
        const data = eventSnap.data() || {};
        if (cancelled) return;

        setEditingEventId(draftId);
        setTitle(String(data.title || ''));
        setDescription(String(data.description || ''));
        setActiveCategory(String(data.category || 'Community') || 'Community');
        setLocation(String(data.location || ''));
        setCoverImageUrl(String(data.coverImageURL || ''));
        setCoverImagePreview(String(data.coverImageURL || ''));
        setRecurrence((data.recurrence as EventRecurrence) || 'one_time');

        const shiftsSnap = await getDocs(collection(db, 'organizations', orgId, 'events', draftId, 'shifts'));
        if (cancelled) return;
        const loadedShifts = shiftsSnap.docs.map((shiftDoc) => {
          const shiftData = shiftDoc.data() as Record<string, unknown>;
          const rawRoles = (shiftData.roles as Record<string, unknown>) || {};
          const shift: EventShift = {
            id: shiftDoc.id,
            eventId: draftId,
            orgId,
            date: (shiftData.date as { toDate?: () => Date })?.toDate?.() || new Date(),
            startTime: (shiftData.startTime as { toDate?: () => Date })?.toDate?.() || new Date(),
            endTime: (shiftData.endTime as { toDate?: () => Date })?.toDate?.() || new Date(),
            roles: Object.fromEntries(
              Object.entries(rawRoles).map(([roleId, value]) => {
                const roleData = (value as Record<string, unknown>) || {};
                return [
                  roleId,
                  {
                    name: String(roleData.name || ''),
                    capacity: Number(roleData.capacity || 0),
                    signedUpCount: Number(roleData.signedUpCount || 0),
                  } as ShiftRole,
                ];
              }),
            ),
          };
          return shiftToFormEntry(shift);
        });
        setShifts(loadedShifts.length > 0 ? loadedShifts : [makeBlankShift()]);
      } catch (error) {
        console.error('Failed to load draft event for edit:', error);
        if (!cancelled) setEditingEventId(null);
      } finally {
        if (!cancelled) setIsLoadingDraft(false);
      }
    };

    loadDraft();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    const localUrl = URL.createObjectURL(file);
    if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = localUrl;
    setCoverImagePreview(localUrl);

    setIsUploading(true);
    try {
      const storage = getFirebaseStorage();
      const safeFileName = sanitizePathToken(String(file.name || `cover_${Date.now()}.jpg`));
      const storageRef = ref(storage, `events/${orgId}/cover_${Date.now()}_${safeFileName}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setCoverImageUrl(url);
      setCoverImagePreview(url);
      if (previewUrlRef.current === localUrl) {
        URL.revokeObjectURL(localUrl);
        previewUrlRef.current = null;
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const addShift = () => {
    setShifts((prev) => [...prev, makeBlankShift()]);
  };

  const removeShift = (localId: string) => {
    setShifts((prev) => (prev.length > 1 ? prev.filter((s) => s.localId !== localId) : prev));
  };

  const updateShiftField = (localId: string, field: 'date' | 'startTime' | 'endTime' | 'repeatCount', value: string) => {
    setShifts((prev) => prev.map((s) => (s.localId === localId ? { ...s, [field]: value } : s)));
  };

  const addRole = (shiftLocalId: string) => {
    setShifts((prev) =>
      prev.map((s) => (s.localId === shiftLocalId ? { ...s, roles: [...s.roles, makeBlankRole()] } : s)),
    );
  };

  const removeRole = (shiftLocalId: string, roleLocalId: string) => {
    setShifts((prev) =>
      prev.map((s) =>
        s.localId === shiftLocalId && s.roles.length > 1
          ? { ...s, roles: s.roles.filter((r) => r.localId !== roleLocalId) }
          : s,
      ),
    );
  };

  const updateRole = (shiftLocalId: string, roleLocalId: string, field: 'name' | 'capacity', value: string) => {
    setShifts((prev) =>
      prev.map((s) =>
        s.localId === shiftLocalId
          ? { ...s, roles: s.roles.map((r) => (r.localId === roleLocalId ? { ...r, [field]: value } : r)) }
          : s,
      ),
    );
  };

  const repeatShift = (shiftLocalId: string) => {
    const source = shifts.find((s) => s.localId === shiftLocalId);
    const count = parseInt(source?.repeatCount || '0', 10);
    if (!source || recurrence === 'one_time' || !source.date || !count || count <= 0) return;
    const clones: ShiftFormEntry[] = [];
    for (let i = 1; i <= count; i += 1) {
      clones.push({
        localId: makeLocalId(),
        date: addRecurrenceInterval(source.date, recurrence, i),
        startTime: source.startTime,
        endTime: source.endTime,
        repeatCount: '4',
        roles: source.roles.map((role) => ({
          localId: makeLocalId(),
          name: role.name,
          capacity: role.capacity,
          originalSignedUpCount: 0,
        })),
      });
    }
    setShifts((prev) => [...prev, ...clones]);
  };

  const handlePublish = async (status: EventStatus = 'published') => {
    if (!orgId) {
      alert('Organization data is still loading. Please try again.');
      return;
    }
    if (status === 'published' && !title) {
      alert('Please fill in a title to publish.');
      return;
    }

    setIsSubmitting(true);
    try {
      const db = getFirestoreDb();
      const input: NewEventInput = {
        orgId,
        title,
        description,
        category: activeCategory,
        location,
        recurrence,
        coverImageURL: coverImageUrl || null,
        visibility: 'public',
        status,
        createdBy: adminUid || null,
      };

      let eventId = editingEventId;
      if (eventId) {
        const existingSnap = await getDoc(doc(db, 'organizations', orgId, 'events', eventId));
        const existing = existingSnap.data() || {};
        const fullEvent: VolunteerEvent = {
          id: eventId,
          orgId,
          title,
          description,
          category: activeCategory,
          startDate: null,
          endDate: null,
          location,
          totalCapacity: Number(existing.totalCapacity || 0),
          totalSignedUp: Number(existing.totalSignedUp || 0),
          recurrence,
          coverImageURL: coverImageUrl || null,
          visibility: 'public',
          status,
          createdBy: (existing.createdBy as string) || adminUid || null,
          createdAt: null,
          updatedAt: null,
          archived: false,
        };
        await updateEvent(db, fullEvent);
      } else {
        eventId = await createEvent(db, input);
      }

      for (const shiftEntry of shifts) {
        if (!shiftEntry.date) continue;
        const roles: Record<string, ShiftRole> = {};
        shiftEntry.roles.forEach((role) => {
          if (!role.name.trim()) return;
          roles[role.localId] = {
            name: role.name.trim(),
            capacity: parseInt(role.capacity, 10) || 0,
            signedUpCount: role.originalSignedUpCount,
          };
        });
        await upsertShift(db, orgId, eventId, {
          id: shiftEntry.firestoreId,
          date: dateOnly(shiftEntry.date),
          startTime: combineDateAndTime(shiftEntry.date, shiftEntry.startTime),
          endTime: combineDateAndTime(shiftEntry.date, shiftEntry.endTime),
          roles,
        });
      }

      onBack();
    } catch (error) {
      console.error('Publish failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 50 } },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="w-full flex flex-col gap-6 mt-8 pb-10">
      <motion.div variants={item} className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors" />
        </button>
        <div>
          <h2 className="text-3xl font-medium text-gray-900 tracking-tight">
            {editingEventId ? 'Edit Event' : 'Create Event'}
          </h2>
          <p className="text-gray-500 font-medium">
            {isLoadingDraft
              ? 'Loading last saved draft...'
              : editingEventId
                ? 'Update your saved draft details.'
                : 'Coordinate a new volunteer opportunity.'}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={item} className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                <Type className="w-4 h-4 text-gray-900" />
              </div>
              Event Details
            </h3>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-900 ml-1">Event Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. City Park Restoration"
                  className="w-full h-14 px-5 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-900 ml-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the event, objectives, and what volunteers should expect..."
                  className="w-full h-32 p-5 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all resize-none font-medium leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-900 ml-1">Category</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                        activeCategory === cat
                          ? 'bg-gray-900 text-white border-gray-900 shadow-lg shadow-gray-900/10'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-900 ml-1">Location</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. 123 Community Center Dr."
                    className="w-full h-14 pl-12 pr-5 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-gray-900" />
                </div>
                Shifts &amp; Roles
              </h3>
              <button
                onClick={addShift}
                className="text-xs font-bold text-lime-600 hover:text-lime-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Shift
              </button>
            </div>

            <div className="space-y-6">
              {shifts.map((shift, shiftIdx) => (
                <div key={shift.localId} className="p-6 bg-gray-50/70 rounded-3xl border border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Shift {shiftIdx + 1}
                    </span>
                    {shifts.length > 1 && (
                      <button
                        onClick={() => removeShift(shift.localId)}
                        className="p-1.5 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={shift.date}
                        onChange={(e) => updateShiftField(shift.localId, 'date', e.target.value)}
                        className="w-full h-12 pl-11 pr-4 bg-white rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                      />
                    </div>
                    <div className="flex-1 relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="time"
                        value={shift.startTime}
                        onChange={(e) => updateShiftField(shift.localId, 'startTime', e.target.value)}
                        className="w-full h-12 pl-11 pr-4 bg-white rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                      />
                    </div>
                    <div className="flex-1 relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="time"
                        value={shift.endTime}
                        onChange={(e) => updateShiftField(shift.localId, 'endTime', e.target.value)}
                        className="w-full h-12 pl-11 pr-4 bg-white rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Roles</label>
                      <button
                        onClick={() => addRole(shift.localId)}
                        className="text-xs font-bold text-lime-600 hover:text-lime-700 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Role
                      </button>
                    </div>
                    {shift.roles.map((role) => (
                      <div key={role.localId} className="flex gap-3 items-center">
                        <input
                          type="text"
                          value={role.name}
                          onChange={(e) => updateRole(shift.localId, role.localId, 'name', e.target.value)}
                          placeholder="Role name, e.g. Bookshelver"
                          className="flex-1 h-11 px-4 bg-white rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                        />
                        <input
                          type="number"
                          value={role.capacity}
                          onChange={(e) => updateRole(shift.localId, role.localId, 'capacity', e.target.value)}
                          placeholder="Capacity"
                          className="w-28 h-11 px-4 bg-white rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                        />
                        {shift.roles.length > 1 && (
                          <button
                            onClick={() => removeRole(shift.localId, role.localId)}
                            className="p-2 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {recurrence !== 'one_time' && (
                    <div className="flex items-center gap-3 pt-2">
                      <input
                        type="number"
                        min={1}
                        value={shift.repeatCount}
                        onChange={(e) => updateShiftField(shift.localId, 'repeatCount', e.target.value)}
                        className="w-20 h-10 px-3 bg-white rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                      />
                      <button
                        onClick={() => repeatShift(shift.localId)}
                        disabled={!shift.date}
                        className="text-xs font-bold text-lime-600 hover:text-lime-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Repeat className="w-3.5 h-3.5" />
                        Repeat {RECURRENCE_OPTIONS.find((o) => o.key === recurrence)?.label.toLowerCase()}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="flex flex-col gap-6">
          <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4 ml-1">Cover Image</h3>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 hover:border-lime-300 transition-all cursor-pointer group h-64 relative overflow-hidden ${isUploading ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {coverImagePreview || coverImageUrl ? (
                <>
                  <img src={coverImagePreview || coverImageUrl} className="absolute inset-0 w-full h-full object-cover" />
                  <div
                    className={`absolute inset-0 ${isUploading ? 'bg-black/40 opacity-100' : 'bg-black/40 opacity-0 group-hover:opacity-100'} transition-opacity flex items-center justify-center`}
                  >
                    {isUploading ? <Loader2 className="w-8 h-8 text-white animate-spin" /> : <ImageIcon className="w-8 h-8 text-white" />}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-lime-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {isUploading ? <Loader2 className="w-8 h-8 text-lime-600 animate-spin" /> : <ImageIcon className="w-8 h-8 text-lime-600" />}
                  </div>
                  <p className="font-bold text-gray-900 text-sm">Click to upload</p>
                  <p className="text-[10px] text-gray-400 mt-1">SVG, PNG, JPG or GIF</p>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4 ml-1">Recurrence</h3>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {RECURRENCE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setRecurrence(option.key)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                      recurrence === option.key
                        ? 'bg-lime-100 text-lime-800 border-lime-300'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs font-medium text-gray-500 ml-1">
                {recurrence === 'one_time'
                  ? 'This event runs once and then ends.'
                  : `Informational label for this program, and sets the interval each shift's "Repeat" button uses (${recurrence === 'weekly' ? 'every 7 days' : recurrence === 'biweekly' ? 'every 14 days' : 'every month'}).`}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => handlePublish('published')}
              disabled={isSubmitting || isUploading || isLoadingDraft}
              className="w-full h-14 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-lg shadow-xl shadow-gray-900/10 hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {editingEventId ? 'Update Event' : 'Publish Event'}
            </button>
            <button
              onClick={() => handlePublish('draft')}
              disabled={isSubmitting || isUploading || isLoadingDraft}
              className="w-full h-14 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-2xl font-bold transition-colors disabled:opacity-50"
            >
              {editingEventId ? 'Save Draft Changes' : 'Save as Draft'}
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};
