import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

export type EventStatus = 'draft' | 'published' | 'archived';
export type EventVisibility = 'public' | 'private';
export type EventRecurrence = 'one_time' | 'weekly' | 'biweekly' | 'monthly';

export type ShiftRole = {
  name: string;
  capacity: number;
  signedUpCount: number;
};

export type EventShift = {
  id: string;
  eventId: string;
  orgId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  roles: Record<string, ShiftRole>;
};

export type VolunteerEvent = {
  id: string;
  orgId: string;
  title: string;
  description: string;
  category: string;
  startDate: Date | null;
  endDate: Date | null;
  location: string;
  totalCapacity: number;
  totalSignedUp: number;
  recurrence: EventRecurrence;
  coverImageURL: string | null;
  visibility: EventVisibility;
  status: EventStatus;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  archived: boolean;
};

export type EventRegistration = {
  id: string;
  userId: string;
  orgId: string;
  eventId: string;
  eventTitle: string;
  shiftId: string;
  roleId: string;
  roleName: string;
  shiftDate: Date | null;
  displayName: string | null;
  status: string;
  registeredAt: Date | null;
};

export type NewEventInput = {
  orgId: string;
  title: string;
  description: string;
  category: string;
  location: string;
  recurrence: EventRecurrence;
  coverImageURL: string | null;
  visibility: EventVisibility;
  status: EventStatus;
  createdBy: string | null;
};

export type NewShiftInput = {
  id?: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  roles: Record<string, ShiftRole>;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const raw = value as { toDate?: () => Date; seconds?: number };
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (typeof raw.seconds === 'number') return new Date(raw.seconds * 1000);
  return null;
};

const eventsRef = (db: Firestore, orgId: string) => collection(db, 'organizations', orgId, 'events');
const shiftsRef = (db: Firestore, orgId: string, eventId: string) =>
  collection(db, 'organizations', orgId, 'events', eventId, 'shifts');
const registrationsRef = (db: Firestore, orgId: string, eventId: string) =>
  collection(db, 'organizations', orgId, 'events', eventId, 'registrations');
const publicOrgEventRef = (db: Firestore, orgId: string, eventId: string) =>
  doc(db, 'publicOrgPages', orgId, 'events', eventId);

const mapEvent = (docSnap: QueryDocumentSnapshot | DocumentSnapshot, orgId: string): VolunteerEvent => {
  const data = docSnap.data() as Record<string, unknown>;
  return {
    id: docSnap.id,
    orgId,
    title: String(data.title || ''),
    description: String(data.description || ''),
    category: String(data.category || 'Community'),
    startDate: toDate(data.startDate),
    endDate: toDate(data.endDate),
    location: String(data.location || ''),
    totalCapacity: Number(data.totalCapacity || 0),
    totalSignedUp: Number(data.totalSignedUp || 0),
    recurrence: (data.recurrence as EventRecurrence) || 'one_time',
    coverImageURL: data.coverImageURL ? String(data.coverImageURL) : null,
    visibility: (data.visibility as EventVisibility) || 'public',
    status: (data.status as EventStatus) || 'published',
    createdBy: data.createdBy ? String(data.createdBy) : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    archived: Boolean(data.archived),
  };
};

const mapShift = (docSnap: QueryDocumentSnapshot, eventId: string, orgId: string): EventShift => {
  const data = docSnap.data() as Record<string, unknown>;
  const rawRoles = (data.roles as Record<string, unknown>) || {};
  const roles: Record<string, ShiftRole> = {};
  Object.entries(rawRoles).forEach(([roleId, value]) => {
    const roleData = (value as Record<string, unknown>) || {};
    roles[roleId] = {
      name: String(roleData.name || ''),
      capacity: Number(roleData.capacity || 0),
      signedUpCount: Number(roleData.signedUpCount || 0),
    };
  });
  return {
    id: docSnap.id,
    eventId,
    orgId,
    date: toDate(data.date) || new Date(),
    startTime: toDate(data.startTime) || new Date(),
    endTime: toDate(data.endTime) || new Date(),
    roles,
  };
};

const mapRegistration = (docSnap: QueryDocumentSnapshot): EventRegistration => {
  const data = docSnap.data() as Record<string, unknown>;
  return {
    id: docSnap.id,
    userId: String(data.userId || ''),
    orgId: String(data.orgId || ''),
    eventId: String(data.eventId || ''),
    eventTitle: String(data.eventTitle || ''),
    shiftId: String(data.shiftId || ''),
    roleId: String(data.roleId || ''),
    roleName: String(data.roleName || ''),
    shiftDate: toDate(data.shiftDate),
    displayName: data.displayName ? String(data.displayName) : null,
    status: String(data.status || 'registered'),
    registeredAt: toDate(data.registeredAt),
  };
};

/** Live-updating list of every non-archived event in the org. */
export const observeEvents = (
  db: Firestore,
  orgId: string,
  onChange: (events: VolunteerEvent[]) => void,
) =>
  onSnapshot(eventsRef(db, orgId), (snap) => {
    const rows = snap.docs.map((docSnap) => mapEvent(docSnap, orgId)).filter((e) => !e.archived);
    onChange(rows);
  });

/** Live-updating list of an event's shifts, sorted by date ascending. */
export const observeShifts = (
  db: Firestore,
  orgId: string,
  eventId: string,
  onChange: (shifts: EventShift[]) => void,
) =>
  onSnapshot(shiftsRef(db, orgId, eventId), (snap) => {
    const rows = snap.docs.map((docSnap) => mapShift(docSnap, eventId, orgId));
    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    onChange(rows);
  });

/** Live-updating list of an event's registrations. Read-only — no register/cancel here. */
export const observeRegistrations = (
  db: Firestore,
  orgId: string,
  eventId: string,
  onChange: (registrations: EventRegistration[]) => void,
) =>
  onSnapshot(registrationsRef(db, orgId, eventId), (snap) => {
    onChange(snap.docs.map(mapRegistration));
  });

/** Mirrors a published+public+non-archived event (with at least one shift) into
 * publicOrgPages/{orgId}/events/{eventId}; deletes the mirror otherwise. Matches
 * EventService.swift's syncPublicMirror exactly. */
const syncPublicMirror = async (db: Firestore, event: VolunteerEvent): Promise<void> => {
  const ref = publicOrgEventRef(db, event.orgId, event.id);
  if (event.visibility === 'public' && event.status === 'published' && !event.archived && event.startDate) {
    const spots = Math.max(0, event.totalCapacity - event.totalSignedUp);
    await setDoc(ref, {
      title: event.title,
      category: event.category,
      startDate: Timestamp.fromDate(event.startDate),
      location: event.location,
      spotsLeft: spots,
      orgId: event.orgId,
      eventId: event.id,
    });
  } else {
    await deleteDoc(ref).catch(() => undefined);
  }
};

/** Creates a new event with no shifts yet (startDate/endDate/totalCapacity all start
 * null/null/0 — they're populated once the first shift is upserted). */
export const createEvent = async (db: Firestore, input: NewEventInput): Promise<string> => {
  const ref = doc(eventsRef(db, input.orgId));
  await setDoc(ref, {
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    category: input.category,
    startDate: null,
    endDate: null,
    location: input.location,
    totalCapacity: 0,
    totalSignedUp: 0,
    recurrence: input.recurrence,
    coverImageURL: input.coverImageURL,
    visibility: input.visibility,
    status: input.status,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    archived: false,
  });
  await syncPublicMirror(db, {
    id: ref.id,
    orgId: input.orgId,
    title: input.title,
    description: input.description,
    category: input.category,
    startDate: null,
    endDate: null,
    location: input.location,
    totalCapacity: 0,
    totalSignedUp: 0,
    recurrence: input.recurrence,
    coverImageURL: input.coverImageURL,
    visibility: input.visibility,
    status: input.status,
    createdBy: input.createdBy,
    createdAt: null,
    updatedAt: null,
    archived: false,
  });
  return ref.id;
};

/** Updates an event's editable fields (title/description/category/location/recurrence/
 * coverImageURL/visibility/status). Takes the full current event object (not a partial
 * patch) so the public-mirror sync always has the complete, correct state to check. */
export const updateEvent = async (db: Firestore, event: VolunteerEvent): Promise<void> => {
  const ref = doc(eventsRef(db, event.orgId), event.id);
  await setDoc(
    ref,
    {
      title: event.title,
      description: event.description,
      category: event.category,
      location: event.location,
      recurrence: event.recurrence,
      coverImageURL: event.coverImageURL,
      visibility: event.visibility,
      status: event.status,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await syncPublicMirror(db, event);
};

export const archiveEvent = async (db: Firestore, orgId: string, eventId: string): Promise<void> => {
  await setDoc(
    doc(eventsRef(db, orgId), eventId),
    { archived: true, status: 'archived' as EventStatus, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await deleteDoc(publicOrgEventRef(db, orgId, eventId)).catch(() => undefined);
};

const summarizeShifts = (
  shifts: EventShift[],
): { startDate: Date | null; endDate: Date | null; totalCapacity: number } => {
  if (shifts.length === 0) return { startDate: null, endDate: null, totalCapacity: 0 };
  const times = shifts.map((s) => s.date.getTime());
  const totalCapacity = shifts.reduce(
    (sum, shift) => sum + Object.values(shift.roles).reduce((roleSum, role) => roleSum + role.capacity, 0),
    0,
  );
  return {
    startDate: new Date(Math.min(...times)),
    endDate: new Date(Math.max(...times)),
    totalCapacity,
  };
};

/** Recomputes startDate/endDate/totalCapacity from an event's current shifts, then
 * re-syncs the public mirror (a shift add/edit/delete can turn a mirror-less draft
 * event, or one with a stale startDate, into one that now qualifies — or no longer
 * qualifies — for the public mirror). Pure read-then-write, no transaction (matches
 * EventService.swift's own non-transactional recompute — shift add/edit/delete is an
 * infrequent admin action, not a hot path). */
const recomputeEventSummary = async (db: Firestore, orgId: string, eventId: string): Promise<void> => {
  const snap = await getDocs(shiftsRef(db, orgId, eventId));
  const shifts = snap.docs.map((docSnap) => mapShift(docSnap, eventId, orgId));
  const summary = summarizeShifts(shifts);
  await setDoc(
    doc(eventsRef(db, orgId), eventId),
    {
      startDate: summary.startDate ? Timestamp.fromDate(summary.startDate) : null,
      endDate: summary.endDate ? Timestamp.fromDate(summary.endDate) : null,
      totalCapacity: summary.totalCapacity,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  const updatedSnap = await getDoc(doc(eventsRef(db, orgId), eventId));
  if (updatedSnap.exists()) {
    await syncPublicMirror(db, mapEvent(updatedSnap, orgId));
  }
};

/** Creates a new shift (no `id`) or overwrites an existing one (`id` set), then
 * recomputes the parent event's summary fields. */
export const upsertShift = async (
  db: Firestore,
  orgId: string,
  eventId: string,
  shift: NewShiftInput,
): Promise<string> => {
  const ref = shift.id ? doc(shiftsRef(db, orgId, eventId), shift.id) : doc(shiftsRef(db, orgId, eventId));
  await setDoc(
    ref,
    {
      eventId,
      orgId,
      date: Timestamp.fromDate(shift.date),
      startTime: Timestamp.fromDate(shift.startTime),
      endTime: Timestamp.fromDate(shift.endTime),
      roles: shift.roles,
    },
    { merge: true },
  );
  await recomputeEventSummary(db, orgId, eventId);
  return ref.id;
};

export const deleteShift = async (db: Firestore, orgId: string, eventId: string, shiftId: string): Promise<void> => {
  await deleteDoc(doc(shiftsRef(db, orgId, eventId), shiftId));
  await recomputeEventSummary(db, orgId, eventId);
};

/** Deletes every shift and registration under the event, then the event document
 * itself, then its public mirror if present. Firestore does not cascade-delete
 * subcollections, so this must enumerate and delete them explicitly. */
export const deleteEventCascade = async (db: Firestore, orgId: string, eventId: string): Promise<void> => {
  const [shiftsSnap, registrationsSnap] = await Promise.all([
    getDocs(shiftsRef(db, orgId, eventId)),
    getDocs(registrationsRef(db, orgId, eventId)),
  ]);
  await Promise.all([
    ...shiftsSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)),
    ...registrationsSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)),
  ]);
  await deleteDoc(doc(eventsRef(db, orgId), eventId));
  await deleteDoc(publicOrgEventRef(db, orgId, eventId)).catch(() => undefined);
};
