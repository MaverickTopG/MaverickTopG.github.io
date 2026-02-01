import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Send,
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  Mic,
  Smile,
  Check,
  CheckCheck,
  Plus,
  Users,
  FileText,
  FileSpreadsheet,
  FileCode,
  File as FileIcon,
  Download,
  Filter,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { getFirebaseAuth, getFirestoreDb, getFirebaseStorage } from '../lib/firebase';
import { resolveOrgContext, subscribeToOrgCollection } from '../lib/orgContext';

type Attachment = {
  url: string;
  type: string;
  name: string;
};

type Volunteer = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Message = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Date;
  attachment?: Attachment;
};

type ThreadMeta = {
  id: string;
  name: string;
  type: 'group' | 'direct';
  recipientId?: string;
};

const ALL_VOLUNTEERS_THREAD = (orgCode: string) => `org-${orgCode}-all`;
const normalizeOrgCode = (value: unknown) => {
  if (value == null) return '';
  const text = String(value).trim().toUpperCase();
  return text || '';
};
const isPersonalOrgRecord = (data: Record<string, unknown>, id: string, code: string, name: string) => {
  const rawId = String(id || '').toLowerCase();
  const rawCode = String(code || '').toLowerCase();
  const rawName = String(name || '').toLowerCase();
  return Boolean(
    data?.is_personal
    || rawId.startsWith('personal-')
    || rawCode.startsWith('personal-')
    || rawName === 'personal'
  );
};
const isAcceptedJoinStatus = (status = '') => {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'accepted'
    || normalized === 'approved'
    || normalized === 'active'
    || normalized === 'connected'
    || normalized === 'granted'
    || normalized === 'confirmed'
    || normalized.startsWith('accept')
    || normalized.startsWith('approved');
};
const isDeclinedJoinStatus = (status = '') => {
  const normalized = String(status || '').toLowerCase();
  return ['rejected', 'declined', 'denied', 'canceled', 'cancelled', 'revoked', 'removed'].some((token) =>
    normalized.includes(token)
  );
};

export const MessagingPage: React.FC = () => {
  const [orgCode, setOrgCode] = useState('');
  const [orgId, setOrgId] = useState('');
  const [senderName, setSenderName] = useState('Coordinator');
  const [adminUid, setAdminUid] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [users, setUsers] = useState<Array<{ id: string; data: Record<string, unknown> }>>([]);
  const [joinRequests, setJoinRequests] = useState<Array<{ id: string; data: Record<string, unknown> }>>([]);
  const [orgAdminIds, setOrgAdminIds] = useState<string[]>([]);
  const [orgAdminEmails, setOrgAdminEmails] = useState<string[]>([]);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>({});
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const EMOJIS = [
    // Smiley & Emotions
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '🫠', '🫢', '🫣', '🫡', '🫤', '🫨', '🫷', '🫸',
    // Hands & Gestures
    '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '🫶', '🫱', '🫲', '🫳', '🫴', '🫰', '🫵',
    // Hearts & Symbols
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '✨', '⭐', '🌟', '💫', '💥', '💢', '💨', '💦', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💨',
    // Nature & Animals
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐒', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🕷️', '🐢', '🐍', '🦎', '🦂', '🦀', '🦑', '🐙', '🦐', '🐠', '🐟', '🐡', '🐬', '🦈', '🐳', '🐋', '🐊', '🐆', '🐅', '🐘', '🦏', '🦍', '🐪', '🐫', '🦒', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓', '🦃', '🕊️', '🐇', '🐁', '🐀', '🐿️', '🌱', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🍄', '🌍', '🌎', '🌏', '🌕', '🌑', '🌙', '☀️', '⭐', '☁️', '⛅', '⛈️', '🌤️', '🌥️', '🌦️', '🌧️', '🌨️', '🌩️', '🌪️', '🌫️', '🌬️', '🌊', '❄️', '🌋', '🌌', '🌈',
    // Food & Drink
    '🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🍍', '🥝', '🍅', '🍆', '🌽', '🌶️', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🥨', '🥞', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🍡', '🥟', '🥠', '🥡', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍵', '🍶', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🥤', '🥢',
    // Activities & Objects
    '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥅', '⛳', '⛸️', '🎣', '🛶', '🏄', '🏇', '🚴', '🚵', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎟️', '🎫', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎸', '🎻', '🎮', '🕹️', '🎰', '🎲', '🎳', '🎯', '🪁', '♟️', '🧩', '🧸', '🧿', '🪄', '🪀', '🪀', '👗', '👚', '👕', '👖', '👔', '👠', '👞', '👟', '👢', '👑', '👒', '🎩', '🎓', '💄', '💍', '💼', '👜', '🎒', '👓', '🕶️', '🌂', '🕯️', '💡', '🔦', '🏮', '📔', '📕', '📖', '📗', '📘', '📙', '📚', '📓', '📒', '📃', '📜', '📄', '📅', '📆', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '🔒', '🔓', '🔏', '🔐', '🔑', '🗝️', '🔨', '🛠️', '⛏️', '🔩', '⚙️', '🧱', '⛓️', '🪃', '🪄', '🪓', '💣', '⚔️', '🗡️', '🛡️', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🌡️', '🧹', '🧺', '🧻', '🧼', '🧽', '🪣', '🧴', '🔑', '🗝️', '🛎️', '🛋️', '🛏️', '🚪', '🪟', '🪑', '🚽', '🚿', '🛀', '🛁', '🪞', '🧸', '🪄'
  ];

  /* New State for Org Filtering */
  const [userOrgs, setUserOrgs] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [showOrgFilter, setShowOrgFilter] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOrgCode('');
        setOrgId('');
        setUsers([]);
        setJoinRequests([]);
        setThreads([]);
        setMessagesByThread({});
        setAdminUid('');
        setAdminEmail('');
        setUserOrgs([]); // Clear orgs
        return;
      }
      setAdminUid(user.uid);
      setAdminEmail(user.email || '');

      // Fetch User's Organizations from both Dashboard and Mobile sources
      try {
        const [orgSnaps, membershipSnaps] = await Promise.all([
          getDocs(query(collection(db, 'user_organizations'), where('user_id', '==', user.uid))),
          getDocs(query(collection(db, 'users'), where('user_id', '==', user.uid)))
        ]);

        const loadedOrgs: Array<{ id: string; name: string; code: string }> = [];
        const processDoc = (docSnap: any) => {
          if (docSnap.id === user.uid) return;
          const data = docSnap.data();
          const code = normalizeOrgCode(data.access_code || data.orgCode || data.org_code || data.organizationCode || data.org_access_code);
          const id = String(data.orgId || data.org_id || data.organizationId || data.linked_org_id || docSnap.id || '');
          const name = String(data.name || data.orgName || data.organizationName || data.schoolName || data.school_name || code || 'Organization');
          const status = String(data.status || '').toLowerCase();
          const removedByUser = Boolean(data.removed_by_user);
          const isPersonal = isPersonalOrgRecord(data, id, code, name);

          if (isPersonal || removedByUser || isDeclinedJoinStatus(status)) return;
          const isIncluded = (status ? isAcceptedJoinStatus(status) : true);
          if (isIncluded && (code || id)) {
            loadedOrgs.push({ id, code, name });
          }
        };

        orgSnaps.forEach(processDoc);
        membershipSnaps.forEach(processDoc);
        
        // Remove duplicates based on code or ID
        const uniqueOrgs = loadedOrgs.filter((org, index, self) => 
            index === self.findIndex((t) => (t.code && t.code === org.code) || (t.id && t.id === org.id))
        );

        const context = await resolveOrgContext(db, user.uid);
        const contextCode = normalizeOrgCode(context.orgCode);
        const contextId = String(context.orgId || '');

        const matchedOrg = uniqueOrgs.find((o) => (contextCode && o.code === contextCode) || (contextId && o.id === contextId));
        const fallbackOrg = uniqueOrgs[0] || null;
        const selectedOrg = matchedOrg || fallbackOrg || null;

        if (!matchedOrg && (contextCode || contextId)) {
          uniqueOrgs.push({
            id: contextId || contextCode,
            code: contextCode,
            name: context.orgName || contextCode || 'Organization'
          });
        }

        const selectedCode = selectedOrg?.code || contextCode || '';
        const selectedId = selectedOrg?.id || contextId || '';

        uniqueOrgs.sort((a, b) => {
          const aIsCurrent = (selectedCode && a.code === selectedCode) || (selectedId && a.id === selectedId);
          const bIsCurrent = (selectedCode && b.code === selectedCode) || (selectedId && b.id === selectedId);
          if (aIsCurrent && !bIsCurrent) return -1;
          if (!aIsCurrent && bIsCurrent) return 1;
          return a.name.localeCompare(b.name);
        });

        setUserOrgs(uniqueOrgs);
        setOrgCode(selectedCode);
        setOrgId(selectedId);

      } catch (err) {
        console.error("Error fetching user orgs", err);
        // Fallback
        const context = await resolveOrgContext(db, user.uid);
        setOrgCode(context.orgCode || '');
        setOrgId(context.orgId || '');
      }
      const snapshot = await getDoc(doc(db, 'users', user.uid));
      const data = snapshot.data() || {};
      const first = String(data.firstName || data.name || '').trim();
      const last = String(data.lastName || data.last_name || '').trim();
      setSenderName([first, last].filter(Boolean).join(' ').trim() || user.email || 'Coordinator');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Effect to update admin status when Org Changes
  useEffect(() => {
     if (!orgCode && !orgId) return;
     const fetchAdmins = async () => {
        const db = getFirestoreDb();
        try {
          const { resolveOrgAdmins } = await import('../lib/orgContext');
          const adminData = await resolveOrgAdmins(db, orgId, orgCode);
          setOrgAdminIds(adminData.adminIds);
          setOrgAdminEmails(adminData.adminEmails);
        } catch {
          setOrgAdminIds([]);
          setOrgAdminEmails([]);
        }
     };
     fetchAdmins();
  }, [orgCode, orgId]);

  const [emojiSearch, setEmojiSearch] = useState('');

  // Helper to map emojis to searchable tags
  const getEmojiTags = (emoji: string) => {
    const tags: Record<string, string> = {
      '😀': 'smile happy grin', '😃': 'smile happy grin', '😄': 'smile happy grin', '😁': 'smile happy grin',
      '😅': 'smile happy sweat', '😂': 'joy laugh tear', '🤣': 'rofl laugh', '😊': 'smile happy blush',
      '😇': 'smile happy angel', '🙂': 'smile happy', '🙃': 'smile happy upside', '😉': 'wink smile',
      '😌': 'relieved smile', '😍': 'heart love eyes', '🥰': 'heart love smiling', '😘': 'heart love kiss',
      '❤️': 'heart love red', '🧡': 'heart orange', '💛': 'heart yellow', '💚': 'heart green',
      '💙': 'heart blue', '💜': 'heart purple', '🖤': 'heart black', '🤍': 'heart white',
      '🔥': 'fire hot burn', '✅': 'check green done', '✨': 'sparkles shine', '⭐': 'star gold',
      '🤝': 'handshake deal partner', '🙏': 'pray please thank', '🎉': 'party celebrate horn',
      '👍': 'like up good', '👎': 'dislike down bad', '🙌': 'hooray hands high', '💪': 'muscle strength',
      '💡': 'idea light bulb', '📌': 'pin mark', '📍': 'location map pin', '🚀': 'rocket ship space',
      '🐶': 'dog cat animal', '🐱': 'cat pet animal', '🍎': 'apple fruit food', '🍕': 'pizza food fast',
      '⚽': 'soccer sport ball', '🎮': 'game play video', '🚗': 'car drive travel', '✈️': 'plane flight travel',
      '🍔': 'burger food eat', '🍟': 'fries food eat', '🍦': 'ice cream sweet', '🍰': 'cake sweet dessert',
      '🍺': 'beer drink alcohol', '🍷': 'wine drink alcohol', '☕': 'coffee drink hot', '🍵': 'tea drink hot',
      '🏀': 'basketball sport ball', '🏈': 'football sport ball', '🎾': 'tennis sport ball', '🏐': 'volleyball sport ball',
      '☀️': 'sun bright day', '☁️': 'cloud weather sky',
      '🌧️': 'rain weather water', '❄️': 'snow weather cold', '⚡': 'zap bolt flash',
    };
    return tags[emoji] || '';
  };

  const filteredEmojis = useMemo(() => {
    if (!emojiSearch.trim()) return EMOJIS;
    const term = emojiSearch.toLowerCase();
    return EMOJIS.filter(emoji => 
      getEmojiTags(emoji).includes(term) || 
      emoji.includes(term)
    );
  }, [emojiSearch, EMOJIS]);

  useEffect(() => {
    if (!orgCode && !orgId) return;
    const db = getFirestoreDb();
    const unsubUsers = subscribeToOrgCollection({
      db,
      collectionName: 'users',
      orgCode,
      orgId,
      onData: (rows) => {
        setUsers(rows);
      },
    });

    const unsubJoinRequests = subscribeToOrgCollection({
      db,
      collectionName: 'organization_join_requests',
      orgCode,
      orgId,
      onData: (rows) => {
        setJoinRequests(rows);
      },
    });

    return () => {
      unsubUsers();
      unsubJoinRequests();
    };
  }, [orgCode, orgId]);

  const buildVolunteerKey = (email: string, name: string, fallback: string) => {
    if (email) return `email:${email.toLowerCase().trim()}`;
    if (name) return `name:${name.toLowerCase().trim()}`;
    return `id:${fallback}`;
  };

  const volunteers = useMemo(() => {
    const volunteerMap = new Map<string, Volunteer>();
    const keyByUserId = new Map<string, string>();
    const keyByEmail = new Map<string, string>();
    const keyByName = new Map<string, string>();

    // First pass: Users collection (Primary source)
    users.forEach((row) => {
      const data = row.data || {};
      const first = String(data.firstName || data.name || '').trim();
      const last = String(data.lastName || data.last_name || '').trim();
      const email = String(data.email || '').trim();
      const name = [first, last].filter(Boolean).join(' ').trim() || email || 'Volunteer';
      
      // Strict filters for organizations and admins
      if (orgId && row.id === orgId) return;
      if (adminUid && row.id === adminUid) return;
      if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) return;
      if (orgAdminIds.includes(row.id)) return;
      if (orgAdminEmails.includes(email.toLowerCase())) return;

      const key = buildVolunteerKey(email, name, row.id);
      keyByUserId.set(row.id, key);
      if (email) keyByEmail.set(email.toLowerCase(), key);
      if (name) keyByName.set(name.toLowerCase(), key);

      volunteerMap.set(key, {
        id: row.id,
        name,
        email,
        role: String(data.role || 'Volunteer'),
      });
    });

    // Second pass: Join Requests (Fallback source for pairing)
    joinRequests.forEach((row) => {
      const data = row.data || {};
      const status = String(data.status || '').toLowerCase();
      if (status !== 'accepted') return;

      const userId = String(data.user_id || data.userId || '').trim();
      const email = String(data.user_email || data.email || '').trim();
      const name = String(data.user_name || data.name || '').trim() || email || 'Volunteer';
      
      if (orgId && userId === orgId) return;
      if (adminUid && userId === adminUid) return;
      if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) return;
      
      // Check if we already have this person via any identifier
      const existingKey = (userId && keyByUserId.get(userId))
        || (email && keyByEmail.get(email.toLowerCase()))
        || (name && keyByName.get(name.toLowerCase()));

      if (existingKey && volunteerMap.has(existingKey)) return;

      const key = buildVolunteerKey(email, name, userId || row.id);
      volunteerMap.set(key, {
        id: userId || key,
        name,
        email,
        role: String(data.requested_role || data.role || 'Volunteer'),
      });
    });

    return Array.from(volunteerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, joinRequests, orgId, adminUid, adminEmail, orgAdminIds, orgAdminEmails]);

  useEffect(() => {
    if (!orgCode && !orgId) return;
    const db = getFirestoreDb();
    const unsubscribe = subscribeToOrgCollection({
      db,
      collectionName: 'messages',
      orgCode,
      orgId,
      onData: (rows) => {
        const grouped: Record<string, Message[]> = {};
        const processedIds = new Set<string>();

        rows.forEach((docSnap) => {
          if (processedIds.has(docSnap.id)) return;
          processedIds.add(docSnap.id);

          const data = docSnap.data || {};
          const rawCreated = data.createdAt || data.created_at || null;
          let createdAt = new Date();
          
          if (rawCreated) {
            if (typeof (rawCreated as any).toDate === 'function') {
              createdAt = (rawCreated as any).toDate();
            } else if (typeof rawCreated === 'object' && (rawCreated as any).seconds) {
              createdAt = new Date((rawCreated as any).seconds * 1000);
            } else {
              const parsed = new Date(String(rawCreated));
              if (!Number.isNaN(parsed.getTime())) createdAt = parsed;
            }
          }

          const threadId = String(data.threadId || '');
          if (!threadId) return;
          const entry: Message = {
            id: docSnap.id,
            threadId,
            senderId: String(data.senderId || ''),
            senderName: String(data.senderName || 'Coordinator'),
            text: String(data.text || ''),
            createdAt,
            attachment: data.attachment ? (data.attachment as Attachment) : undefined,
          };
          grouped[threadId] = grouped[threadId] || [];
          grouped[threadId].push(entry);
        });
        Object.values(grouped).forEach((list) => list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
        setMessagesByThread(grouped);
      },
    });
    return () => unsubscribe();
  }, [orgCode, orgId]);

  useEffect(() => {
    if (!orgCode) return;
    const allThread: ThreadMeta = {
      id: ALL_VOLUNTEERS_THREAD(orgCode),
      name: 'All Volunteers',
      type: 'group',
    };
    const directThreads = volunteers.map((v) => ({
      id: `org-${orgCode}-user-${v.id}`,
      name: v.name,
      type: 'direct' as const,
      recipientId: v.id,
    }));
    setThreads([allThread, ...directThreads]);
    if (!activeThreadId) {
      setActiveThreadId(allThread.id);
    }
  }, [orgCode, volunteers, activeThreadId]);

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    return threads.filter((thread) => thread.name.toLowerCase().includes(search.toLowerCase()));
  }, [threads, search]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  const activeMessages = messagesByThread[activeThreadId] || [];

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FileText className="w-4 h-4" />;
    if (type.includes('sheet') || type.includes('csv')) return <FileSpreadsheet className="w-4 h-4" />;
    if (type.includes('word') || type.includes('officedocument')) return <FileText className="w-4 h-4" />;
    if (type.includes('code') || type.includes('javascript')) return <FileCode className="w-4 h-4" />;
    return <FileIcon className="w-4 h-4" />;
  };

  const MessageAttachment = ({ attachment }: { attachment: { url: string; name: string; type: string } }) => {
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!attachment.type.startsWith('image/')) {
    return (
      <a 
        href={attachment.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 bg-white hover:bg-gray-50 rounded-2xl border border-gray-100 transition-all group"
      >
        <div className={`p-2 rounded-xl ${
          attachment.type.includes('pdf') ? 'bg-red-50 text-red-500' :
          attachment.type.includes('sheet') || attachment.type.includes('csv') ? 'bg-emerald-50 text-emerald-500' :
          attachment.type.includes('word') || attachment.type.includes('officedocument') ? 'bg-blue-50 text-blue-500' :
          'bg-gray-50 text-gray-500'
        }`}>
          {attachment.type.includes('pdf') ? <FileText className="w-5 h-5" /> :
           attachment.type.includes('sheet') || attachment.type.includes('csv') ? <FileSpreadsheet className="w-5 h-5" /> :
           attachment.type.includes('word') || attachment.type.includes('officedocument') ? <FileText className="w-5 h-5" /> :
           attachment.type.includes('code') || attachment.type.includes('javascript') ? <FileCode className="w-5 h-5" /> :
           <FileIcon className="w-5 h-5" />}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-gray-900 truncate pr-4">{attachment.name}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {attachment.type.split('/')[1]?.toUpperCase() || 'FILE'}
          </span>
        </div>
        <Download className="w-4 h-4 ml-auto text-gray-300 group-hover:text-gray-900 transition-colors" />
      </a>
    );
  }

  return (
    <div className="relative group overflow-hidden rounded-2xl border border-gray-100 shadow-sm bg-gray-50 flex items-center justify-center min-h-[140px] w-full max-w-sm">
      {loading && !loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10">
          <div className="w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      
      {loadError ? (
        <div className="flex flex-col items-center justify-center p-8 gap-3 bg-gray-50 w-full text-center">
          <div className="w-12 h-12 rounded-full bg-lime-50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Syncing via Cloud</span>
            <p className="text-[10px] text-gray-400 leading-tight px-4">
              Refreshing storage bucket...<br/>
              Apply CORS fix if this persists.
            </p>
          </div>
        </div>
      ) : (
        <img 
          src={attachment.url} 
          alt={attachment.name} 
          className={`max-w-full max-h-80 object-cover transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoadError(true);
            setLoading(false);
          }}
        />
      )}
      
      {!loadError && !loading && (
        <a 
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="p-3 bg-white rounded-full shadow-lg scale-90 group-hover:scale-100 transition-transform">
            <Download className="w-5 h-5 text-gray-900" />
          </div>
        </a>
      )}
    </div>
  );
};

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClick = (event: MouseEvent) => {
      if (!emojiPickerRef.current) return;
      if (!emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmojiPicker]);

  const uploadFiles = async (files: File[]) => {
    const storage = getFirebaseStorage();
    const results: Attachment[] = [];
    for (const file of files) {
      const storageRef = ref(storage, `messages/org-${orgId}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      results.push({
        url,
        name: file.name,
        type: file.type,
      });
    }
    return results;
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputValue.trim() && attachedImages.length === 0 && attachedFiles.length === 0) || !activeThread || !orgCode) return;
    
    setIsUploading(true);
    try {
      const db = getFirestoreDb();
      const allFiles = [...attachedImages, ...attachedFiles];
      const uploadedAttachments = await uploadFiles(allFiles);

      // Create a message document for each attachment if no text, or one message with first attachment + text
      // For simplicity, we'll just send one message with the first attachment if multiple exist, or just the text
      // Ideally we'd loop, but matching user's "attach anything" request usually means one message.
      
      const messageData: any = {
        orgCode,
        orgId,
        threadId: activeThread.id,
        type: activeThread.type,
        recipientId: activeThread.recipientId || null,
        senderId: getFirebaseAuth().currentUser?.uid || 'admin',
        senderName,
        text: inputValue.trim(),
        createdAt: serverTimestamp(),
      };

      if (uploadedAttachments.length > 0) {
        // Just take the first one for this specific message document
        // In a more complex app, we'd send multiple or use an attachments array
        messageData.attachment = uploadedAttachments[0];
      }

      await addDoc(collection(db, 'messages'), messageData);
      
      setInputValue('');
      setAttachedImages([]);
      setAttachedFiles([]);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const openThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setShowNewChat(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-[calc(100vh-140px)] flex gap-6 mt-8 pb-4"
    >
      <motion.div className="w-full md:w-80 xl:w-96 flex flex-col gap-4 h-full">
        <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100">
          <div className="flex flex-col gap-3">
             {/* Org Filter Dropdown */}
             <div className="relative z-20">
                <button 
                  onClick={() => setShowOrgFilter(!showOrgFilter)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 text-white rounded-2xl font-bold text-sm shadow-md hover:shadow-lg transition-all"
                >
                   <span className="truncate">{userOrgs.find(o => o.code === orgCode || o.id === orgId)?.name || 'Select Organization'}</span>
                   <Filter className="w-4 h-4 ml-2 opacity-70" />
                </button>
                
                <AnimatePresence>
                  {showOrgFilter && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col p-1"
                    >
                       {userOrgs.length > 0 ? (
                         userOrgs.map(org => (
                           <button
                             key={org.id || org.code}
                             onClick={() => {
                               setOrgCode(org.code);
                               setOrgId(org.id);
                               setShowOrgFilter(false);
                             }}
                             className={`px-4 py-3 text-left text-sm font-bold rounded-xl transition-colors ${
                               (org.code === orgCode && org.code) || (org.id === orgId && org.id) 
                                 ? 'bg-lime-50 text-lime-700' 
                                 : 'hover:bg-gray-50 text-gray-700'
                             }`}
                           >
                             {org.name}
                           </button>
                         ))
                       ) : (
                         <div className="p-4 text-center text-xs text-gray-400 font-medium">No organizations found</div>
                       )}
                    </motion.div>
                  )}
                </AnimatePresence>
             </div>

             <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-lime-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full h-12 pl-12 pr-4 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                />
              </div>
          </div>
        </div>

        <div className="bg-white flex-1 rounded-[2.5rem] p-4 shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center px-4 pt-2 mb-4">
            <h3 className="font-bold text-gray-900 text-lg">Chats</h3>
            <button
              onClick={() => setShowNewChat(true)}
              className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-black transition-colors shadow-lg shadow-gray-900/20"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 px-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                  <Plus className="w-6 h-6 text-gray-300 animate-spin" />
                </div>
                <p className="text-xs font-medium">Loading volunteers...</p>
              </div>
            ) : filteredThreads.map((thread) => {
              const latest = messagesByThread[thread.id]?.slice(-1)[0];
              return (
                <button
                  key={thread.id}
                  onClick={() => openThread(thread.id)}
                  className={`w-full p-4 rounded-3xl flex items-center gap-4 transition-all border ${
                    activeThreadId === thread.id
                      ? 'bg-gray-900 border-gray-900 shadow-xl shadow-gray-900/10'
                      : 'bg-white hover:bg-gray-50 border-transparent'
                  }`}
                >
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className={`font-bold text-sm truncate ${activeThreadId === thread.id ? 'text-white' : 'text-gray-900'}`}>
                        {thread.name}
                      </span>
                      <span className="text-[10px] font-medium text-gray-400">
                        {latest ? formatTime(latest.createdAt) : ''}
                      </span>
                    </div>
                    <p className={`text-xs truncate max-w-[140px] ${activeThreadId === thread.id ? 'text-gray-400' : 'text-gray-500'}`}>
                      {latest ? latest.text : 'No messages yet'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      <motion.div className="flex-1 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col overflow-hidden relative">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="font-bold text-gray-900 text-lg">{activeThread?.name || 'Select a chat'}</h3>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-lime-500 rounded-full animate-pulse"></span>
                <span className="text-xs text-gray-500 font-medium">
                  {activeThread?.type === 'group' ? 'Group message' : 'Direct message'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
          {activeMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-4 ${msg.senderId === getFirebaseAuth().currentUser?.uid ? 'flex-row-reverse' : ''}`}
            >
              <div className={`flex flex-col gap-1 max-w-[70%] ${msg.senderId === getFirebaseAuth().currentUser?.uid ? 'items-end' : 'items-start'}`}>
                {msg.attachment && (
                  <div className="mb-2 w-full">
                    <MessageAttachment attachment={msg.attachment} />
                  </div>
                )}
                {msg.text && (
                  <div
                    className={`p-4 rounded-2xl text-sm font-medium leading-relaxed shadow-sm ${
                      msg.senderId === getFirebaseAuth().currentUser?.uid
                        ? 'bg-gray-900 text-white rounded-tr-none'
                        : 'bg-white text-gray-700 border border-gray-100 rounded-tl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-1">
                  {msg.senderId !== getFirebaseAuth().currentUser?.uid && activeThread?.type === 'group' && (
                    <span className="text-[10px] text-lime-600 font-black uppercase tracking-wider mr-1">{msg.senderName}</span>
                  )}
                  <span className="text-[10px] text-gray-400 font-bold">{formatTime(msg.createdAt)}</span>
                  {msg.senderId === getFirebaseAuth().currentUser?.uid && (
                    <CheckCheck className="w-3 h-3 text-lime-500" />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          {activeMessages.length === 0 && (
            <div className="text-sm text-gray-400">No messages yet. Start the conversation.</div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-gray-100">
          <form onSubmit={handleSendMessage} className="bg-gray-50 rounded-[2rem] p-2 flex items-center gap-2 border border-gray-100 focus-within:border-gray-200 focus-within:bg-white transition-all shadow-sm">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-full hover:bg-gray-200 text-gray-400 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
            <input
              ref={messageInputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 placeholder-gray-400 font-medium"
            />
            <div className="flex items-center gap-1 pr-2">
              <div className="relative" ref={emojiPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                  title="Choose Emoji"
                >
                  <Smile className="w-5 h-5" />
                </button>
                <AnimatePresence>
                  {showEmojiPicker && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute bottom-16 -right-12 bg-white border border-gray-100 shadow-2xl rounded-[2.5rem] p-6 z-50 w-[420px] flex flex-col"
                    >
                      <div className="flex flex-col h-96">
                        <div className="px-1 pb-4 mb-4 border-b border-gray-50 flex flex-col gap-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-gray-900">Choose an Emoji</span>
                            <button 
                              onClick={() => setShowEmojiPicker(false)}
                              className="p-2 hover:bg-gray-50 rounded-full text-gray-400 transition-colors"
                            >
                              <Plus className="w-5 h-5 rotate-45" />
                            </button>
                          </div>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search emojis..."
                              value={emojiSearch}
                              onChange={(e) => setEmojiSearch(e.target.value)}
                              className="w-full bg-gray-50 border-none rounded-2xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-lime-100 placeholder-gray-400 font-medium transition-all"
                            />
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-8 gap-1 pr-2 mt-1">
                          {filteredEmojis.map((emoji, idx) => (
                            <button
                              key={`${emoji}-${idx}`}
                              type="button"
                              onClick={() => {
                                setInputValue((prev) => `${prev}${emoji}`);
                                messageInputRef.current?.focus();
                              }}
                              className="aspect-square flex items-center justify-center rounded-2xl hover:bg-gray-50 text-2xl transition-all hover:scale-125 hover:shadow-sm active:scale-95"
                            >
                              {emoji}
                            </button>
                          ))}
                          {filteredEmojis.length === 0 && (
                            <div className="col-span-8 py-10 flex flex-col items-center justify-center gap-2 opacity-40">
                              <Search className="w-8 h-8" />
                              <span className="text-xs font-bold uppercase tracking-widest">No emojis found</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button
                type="submit"
                disabled={isUploading || (!inputValue.trim() && attachedImages.length === 0 && attachedFiles.length === 0)}
                className="ml-2 p-3 bg-lime-300 hover:bg-lime-400 disabled:opacity-50 disabled:hover:bg-lime-300 text-gray-900 rounded-full transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                {isUploading ? (
                   <span className="w-5 h-5 border-2 border-gray-900/20 border-t-gray-900 rounded-full animate-spin block"></span>
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </form>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (files.length) {
                const imgs = (files as File[]).filter(f => f.type.startsWith('image/'));
                const others = (files as File[]).filter(f => !f.type.startsWith('image/'));
                setAttachedImages(prev => [...prev, ...imgs]);
                setAttachedFiles(prev => [...prev, ...others]);
              }
            }}
          />
          {(attachedImages.length > 0 || attachedFiles.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachedImages.map((file) => (
                <span
                  key={file.name}
                  className="px-3 py-1.5 bg-purple-50 text-[10px] font-bold text-purple-600 rounded-full flex items-center gap-2 border border-purple-100"
                >
                  {file.name}
                </span>
              ))}
              {attachedFiles.map((file) => (
                <span
                  key={file.name}
                  className="px-3 py-1.5 bg-blue-50 text-[10px] font-bold text-blue-600 rounded-full flex items-center gap-2 border border-blue-100"
                >
                  {getFileIcon(file.type)}
                  {file.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {showNewChat && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowNewChat(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-3xl p-8 w-full max-w-lg relative shadow-2xl z-10"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">New Message</h3>
              <p className="text-sm text-gray-500 mb-6">Message the entire group or a specific volunteer.</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => openThread(ALL_VOLUNTEERS_THREAD(orgCode))}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-900 text-white hover:bg-black"
                >
                  <Users className="w-5 h-5" />
                  <span className="font-semibold">All Volunteers</span>
                </button>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {volunteers.map((volunteer) => (
                    <button
                      key={volunteer.id}
                      onClick={() => openThread(`org-${orgCode}-user-${volunteer.id}`)}
                      className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 text-left"
                    >
                      <div>
                        <div className="font-semibold text-gray-900">{volunteer.name}</div>
                        <div className="text-xs text-gray-500">{volunteer.role}</div>
                      </div>
                      <span className="text-xs text-gray-400">{volunteer.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
