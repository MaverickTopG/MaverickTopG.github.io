import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes, type FirebaseStorage } from 'firebase/storage';

export type ThreadKind = 'direct' | 'event' | 'group';
export type MessageKind = 'text' | 'image' | 'file' | 'system';

export type MessageThread = {
  id: string;
  orgId: string;
  kind: ThreadKind;
  title: string;
  participantIds: string[];
  lastMessage: string | null;
  lastMessageAt: Date | null;
  createdAt: Date | null;
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string | null;
  body: string;
  kind: MessageKind;
  attachmentURL: string | null;
  readBy: string[];
  createdAt: Date | null;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const raw = value as { toDate?: () => Date; seconds?: number };
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (typeof raw.seconds === 'number') return new Date(raw.seconds * 1000);
  return null;
};

const threadsRef = (db: Firestore, orgId: string) => collection(db, 'organizations', orgId, 'threads');
const messagesRef = (db: Firestore, orgId: string, threadId: string) =>
  collection(db, 'organizations', orgId, 'threads', threadId, 'messages');

const mapThread = (docSnap: QueryDocumentSnapshot, orgId: string): MessageThread => {
  const data = docSnap.data() as Record<string, unknown>;
  return {
    id: docSnap.id,
    orgId,
    kind: (data.kind as ThreadKind) || 'direct',
    title: String(data.title || ''),
    participantIds: Array.isArray(data.participantIds) ? (data.participantIds as string[]) : [],
    lastMessage: data.lastMessage ? String(data.lastMessage) : null,
    lastMessageAt: toDate(data.lastMessageAt),
    createdAt: toDate(data.createdAt),
  };
};

const mapMessage = (docSnap: QueryDocumentSnapshot, threadId: string): ThreadMessage => {
  const data = docSnap.data() as Record<string, unknown>;
  return {
    id: docSnap.id,
    threadId,
    senderId: String(data.senderId || ''),
    senderName: data.senderName ? String(data.senderName) : null,
    body: String(data.body || ''),
    kind: (data.kind as MessageKind) || 'text',
    attachmentURL: data.attachmentURL ? String(data.attachmentURL) : null,
    readBy: Array.isArray(data.readBy) ? (data.readBy as string[]) : [],
    createdAt: toDate(data.createdAt),
  };
};

/** Live-updating list of every thread in the org, sorted most-recent-first (matches MessagingService.observeThreads). */
export const subscribeToThreads = (
  db: Firestore,
  orgId: string,
  onChange: (threads: MessageThread[]) => void,
) =>
  onSnapshot(threadsRef(db, orgId), (snap) => {
    const rows = snap.docs.map((docSnap) => mapThread(docSnap, orgId));
    rows.sort((a, b) => (b.lastMessageAt?.getTime() || 0) - (a.lastMessageAt?.getTime() || 0));
    onChange(rows);
  });

/** Live-updating list of a thread's messages, sorted oldest-first (matches MessagingService.observeMessages). */
export const subscribeToMessages = (
  db: Firestore,
  orgId: string,
  threadId: string,
  onChange: (messages: ThreadMessage[]) => void,
) =>
  onSnapshot(messagesRef(db, orgId, threadId), (snap) => {
    const rows = snap.docs.map((docSnap) => mapMessage(docSnap, threadId));
    rows.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
    onChange(rows);
  });

/** Find-or-create a direct thread for an exact participant set (matches MessagingService.ensureDirectThread). */
export const ensureDirectThread = async (
  db: Firestore,
  orgId: string,
  title: string,
  participantIds: string[],
): Promise<MessageThread> => {
  const target = [...participantIds].sort();
  const snap = await getDocs(query(threadsRef(db, orgId), where('kind', '==', 'direct')));
  for (const docSnap of snap.docs) {
    const existing = mapThread(docSnap, orgId);
    const existingSorted = [...existing.participantIds].sort();
    if (
      existingSorted.length === target.length
      && existingSorted.every((id, index) => id === target[index])
    ) {
      return existing;
    }
  }
  const newRef = doc(threadsRef(db, orgId));
  await setDoc(newRef, {
    orgId,
    kind: 'direct',
    title,
    participantIds,
    createdAt: serverTimestamp(),
  });
  return {
    id: newRef.id,
    orgId,
    kind: 'direct',
    title,
    participantIds,
    lastMessage: null,
    lastMessageAt: null,
    createdAt: new Date(),
  };
};

/** Find-or-create a named group thread, merging in any new participants (matches MessagingService.ensureGroupThread). */
export const ensureGroupThread = async (
  db: Firestore,
  orgId: string,
  groupName: string,
  participantIds: string[],
): Promise<MessageThread> => {
  const snap = await getDocs(
    query(threadsRef(db, orgId), where('kind', '==', 'group'), where('title', '==', groupName)),
  );
  const existingDoc = snap.docs[0];
  if (existingDoc) {
    const existing = mapThread(existingDoc, orgId);
    const merged = Array.from(new Set([...existing.participantIds, ...participantIds]));
    if (merged.length !== existing.participantIds.length) {
      await updateDoc(existingDoc.ref, { participantIds: merged });
      return { ...existing, participantIds: merged };
    }
    return existing;
  }
  const newRef = doc(threadsRef(db, orgId));
  await setDoc(newRef, {
    orgId,
    kind: 'group',
    title: groupName,
    participantIds,
    createdAt: serverTimestamp(),
  });
  return {
    id: newRef.id,
    orgId,
    kind: 'group',
    title: groupName,
    participantIds,
    lastMessage: null,
    lastMessageAt: null,
    createdAt: new Date(),
  };
};

/** Send a text message (matches MessagingService.send). */
export const sendText = async (
  db: Firestore,
  orgId: string,
  threadId: string,
  senderId: string,
  senderName: string | null,
  body: string,
): Promise<void> => {
  const batch = writeBatch(db);
  const messageRef = doc(messagesRef(db, orgId, threadId));
  batch.set(messageRef, {
    threadId,
    senderId,
    senderName: senderName || null,
    body,
    kind: 'text',
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });
  batch.update(doc(threadsRef(db, orgId), threadId), {
    lastMessage: body,
    lastMessageAt: serverTimestamp(),
  });
  await batch.commit();
};

/** Upload an image to Storage and send it as an image message (matches MessagingService.sendImage). */
export const sendImage = async (
  db: Firestore,
  storage: FirebaseStorage,
  orgId: string,
  threadId: string,
  senderId: string,
  senderName: string | null,
  file: File,
  caption: string,
): Promise<void> => {
  const fileName = `${crypto.randomUUID()}.jpg`;
  const fileRef = storageRef(storage, `messages/${orgId}/${threadId}/${fileName}`);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  const body = caption.trim() ? caption.trim() : 'Sent an image';

  const batch = writeBatch(db);
  const messageRef = doc(messagesRef(db, orgId, threadId));
  batch.set(messageRef, {
    threadId,
    senderId,
    senderName: senderName || null,
    body,
    kind: 'image',
    attachmentURL: url,
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });
  batch.update(doc(threadsRef(db, orgId), threadId), {
    lastMessage: '📷 Image',
    lastMessageAt: serverTimestamp(),
  });
  await batch.commit();
};

/** Upload a file to Storage and send it as a file message (matches MessagingService.sendFile). */
export const sendFile = async (
  db: Firestore,
  storage: FirebaseStorage,
  orgId: string,
  threadId: string,
  senderId: string,
  senderName: string | null,
  file: File,
): Promise<void> => {
  const fileRef = storageRef(storage, `messages/${orgId}/${threadId}/${file.name}`);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);

  const batch = writeBatch(db);
  const messageRef = doc(messagesRef(db, orgId, threadId));
  batch.set(messageRef, {
    threadId,
    senderId,
    senderName: senderName || null,
    body: file.name,
    kind: 'file',
    attachmentURL: url,
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });
  batch.update(doc(threadsRef(db, orgId), threadId), {
    lastMessage: `📎 ${file.name}`,
    lastMessageAt: serverTimestamp(),
  });
  await batch.commit();
};
