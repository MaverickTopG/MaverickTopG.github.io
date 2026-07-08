import {
  collection,
  onSnapshot,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

export type HourLogRequest = {
  id: string;
  userId: string;
  hours: number;
  description: string;
  date: string;
  createdAtMs: number;
};

const mapHourLog = (docSnap: QueryDocumentSnapshot): HourLogRequest => {
  const data = docSnap.data() as Record<string, unknown>;
  const createdAt = data.createdAt as { toMillis?: () => number } | undefined;
  const createdAtMs = typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0;
  return {
    id: docSnap.id,
    userId: String(data.userId || ''),
    hours: Number(data.hours || 0),
    description: String(data.description || ''),
    date: String(data.date || ''),
    createdAtMs,
  };
};

/** Live-updating list of an org's pending hour-log requests, for the admin review inbox. */
export const subscribePendingHourLogs = (
  db: Firestore,
  orgId: string,
  onChange: (logs: HourLogRequest[]) => void,
): Unsubscribe => {
  const logsRef = collection(db, 'organizations', orgId, 'hourLogs');
  const pendingQuery = query(logsRef, where('status', '==', 'pending'));
  return onSnapshot(pendingQuery, (snap) => {
    onChange(snap.docs.map(mapHourLog));
  });
};

/** Admin-only. Approves a pending hour log via the verifyHourLog Cloud Function. */
export const verifyHourLog = async (
  functionsInstance: Functions,
  orgId: string,
  logId: string,
): Promise<void> => {
  const call = httpsCallable(functionsInstance, 'verifyHourLog');
  await call({ orgId, logId });
};

/** Admin-only. Denies a pending hour log via the rejectHourLog Cloud Function. */
export const rejectHourLog = async (
  functionsInstance: Functions,
  orgId: string,
  logId: string,
  reason: string,
): Promise<void> => {
  const call = httpsCallable(functionsInstance, 'rejectHourLog');
  await call({ orgId, logId, reason });
};

/** Admin-only. Checks a volunteer in at the Kiosk terminal via the kioskCheckIn Cloud Function. */
export const kioskCheckIn = async (
  functionsInstance: Functions,
  orgId: string,
  email: string,
  task: string,
): Promise<{ displayName: string }> => {
  const call = httpsCallable<
    { orgId: string; email: string; task: string },
    { ok: boolean; displayName: string }
  >(functionsInstance, 'kioskCheckIn');
  const result = await call({ orgId, email, task });
  return { displayName: result.data.displayName || '' };
};

/** Admin-only. Checks a volunteer out at the Kiosk terminal via the kioskCheckOut Cloud Function. */
export const kioskCheckOut = async (
  functionsInstance: Functions,
  orgId: string,
  email: string,
): Promise<{ hours: number }> => {
  const call = httpsCallable<{ orgId: string; email: string }, { ok: boolean; hours: number }>(
    functionsInstance,
    'kioskCheckOut',
  );
  const result = await call({ orgId, email });
  return { hours: result.data.hours };
};
