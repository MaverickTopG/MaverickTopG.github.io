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
  X,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb, getFirebaseStorage } from '../lib/firebase';
import { subscribeToOrgAdminContext } from '../lib/orgContext';
import {
  ensureDirectThread,
  ensureGroupThread,
  sendFile,
  sendImage,
  sendText,
  subscribeToMessages,
  subscribeToThreads,
  type MessageThread,
  type ThreadMessage,
} from '../lib/messagingService';

type Volunteer = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const normalizeNameValue = (value: unknown) => String(value || '').trim();

const resolvePersonNameFromRecord = (record: Record<string, unknown> = {}) => {
  const first = normalizeNameValue(record.firstName || record.first_name);
  const last = normalizeNameValue(record.lastName || record.last_name);
  const firstLast = [first, last].filter(Boolean).join(' ').trim();
  if (firstLast) return firstLast;

  const displayLike =
    normalizeNameValue(record.displayName) ||
    normalizeNameValue(record.user_name) ||
    normalizeNameValue(record.userName) ||
    normalizeNameValue(record.fullName);
  if (displayLike) return displayLike;

  return normalizeNameValue(record.name);
};

const getExtension = (fileName: string) => {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : '';
};

const MESSAGE_TARGET_KEY = 'nexolink:message-target';

interface MessagingPageProps {
  isActive?: boolean;
}

export const MessagingPage: React.FC<MessagingPageProps> = ({ isActive = true }) => {
  const [orgId, setOrgId] = useState('');
  const [senderName, setSenderName] = useState('Coordinator');
  const [adminUid, setAdminUid] = useState('');
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, ThreadMessage[]>>({});
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

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    let unsubContext: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubContext) {
        unsubContext();
        unsubContext = null;
      }
      if (!user) {
        setOrgId('');
        setAdminUid('');
        setVolunteers([]);
        setThreads([]);
        setMessagesByThread({});
        setActiveThreadId('');
        setLoading(false);
        return;
      }
      setAdminUid(user.uid);
      unsubContext = subscribeToOrgAdminContext(db, user.uid, (context) => {
        setOrgId(context.orgId || '');
      });

      const snapshot = await getDoc(doc(db, 'users', user.uid));
      const data = snapshot.data() || {};
      setSenderName(
        resolvePersonNameFromRecord(data as Record<string, unknown>)
          || user.displayName
          || user.email
          || 'Coordinator',
      );
      setLoading(false);
    });
    return () => {
      unsubscribeAuth();
      if (unsubContext) unsubContext();
    };
  }, []);

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
    if (!orgId) {
      setVolunteers([]);
      return;
    }
    const db = getFirestoreDb();
    const volunteersRef = collection(db, 'organizations', orgId, 'volunteers');
    const q = query(volunteersRef, where('status', '==', 'active'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows: Volunteer[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            return {
              id: docSnap.id,
              name: String(data.displayName || data.email || 'Volunteer'),
              email: String(data.email || ''),
              role: String(data.role || 'Volunteer'),
              archived: Boolean(data.archived),
            };
          })
          .filter((row) => !row.archived)
          .map(({ archived, ...row }) => row);
        setVolunteers(rows.sort((a, b) => a.name.localeCompare(b.name)));
      },
      (error) => {
        console.error('Failed to load volunteers for messaging', error);
      },
    );
    return () => unsubscribe();
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !adminUid) return;
    const db = getFirestoreDb();
    const participantIds = Array.from(new Set([adminUid, ...volunteers.map((v) => v.id)]));
    ensureGroupThread(db, orgId, 'All Volunteers', participantIds).catch((error) => {
      console.error('Failed to ensure All Volunteers thread', error);
    });
  }, [orgId, adminUid, volunteers]);

  useEffect(() => {
    if (!orgId) {
      setThreads([]);
      return;
    }
    const db = getFirestoreDb();
    const unsubscribe = subscribeToThreads(db, orgId, (rows) => {
      setThreads(rows);
      setActiveThreadId((current) => current || rows[0]?.id || '');
    });
    return () => unsubscribe();
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !activeThreadId) return;
    const db = getFirestoreDb();
    const unsubscribe = subscribeToMessages(db, orgId, activeThreadId, (rows) => {
      setMessagesByThread((prev) => ({ ...prev, [activeThreadId]: rows }));
    });
    return () => unsubscribe();
  }, [orgId, activeThreadId]);

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    return threads.filter((thread) => thread.title.toLowerCase().includes(search.toLowerCase()));
  }, [threads, search]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  const activeMessages = messagesByThread[activeThreadId] || [];
  const allVolunteersThread = threads.find((thread) => thread.kind === 'group' && thread.title === 'All Volunteers');

  useEffect(() => {
    if (!isActive || !orgId || !adminUid || !volunteers.length) return;
    const raw = sessionStorage.getItem(MESSAGE_TARGET_KEY);
    if (!raw) return;

    let target: { id?: string; email?: string; name?: string } | null = null;
    try {
      target = JSON.parse(raw);
    } catch (err) {
      console.warn('Invalid message target payload', err);
      sessionStorage.removeItem(MESSAGE_TARGET_KEY);
      return;
    }

    const targetId = (target?.id || '').trim();
    let resolved = volunteers.find((vol) => vol.id === targetId);

    if (!resolved && target?.email) {
      resolved = volunteers.find(
        (vol) => vol.email && vol.email.toLowerCase() === target?.email?.toLowerCase(),
      );
    }

    if (!resolved && target?.name) {
      resolved = volunteers.find(
        (vol) => vol.name && vol.name.toLowerCase() === target?.name?.toLowerCase(),
      );
    }

    if (!resolved) return;

    const volunteer = resolved;
    sessionStorage.removeItem(MESSAGE_TARGET_KEY);
    const db = getFirestoreDb();
    ensureDirectThread(db, orgId, volunteer.name, [adminUid, volunteer.id])
      .then((thread) => {
        setActiveThreadId(thread.id);
        setShowNewChat(false);
        setSearch('');
        window.setTimeout(() => messageInputRef.current?.focus(), 0);
      })
      .catch((error) => {
        console.error('Failed to open direct thread from message target', error);
      });
  }, [isActive, orgId, adminUid, volunteers]);

  const getFileIcon = (extension: string) => {
    if (extension === 'pdf') return <FileText className="w-4 h-4" />;
    if (extension === 'csv' || extension === 'xlsx' || extension === 'xls') return <FileSpreadsheet className="w-4 h-4" />;
    if (extension === 'doc' || extension === 'docx') return <FileText className="w-4 h-4" />;
    if (extension === 'js' || extension === 'ts' || extension === 'json') return <FileCode className="w-4 h-4" />;
    return <FileIcon className="w-4 h-4" />;
  };

  const MessageAttachment = ({ url, kind, fileName }: { url: string; kind: 'image' | 'file'; fileName: string }) => {
  const [loadError, setLoadError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadAttachment = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Failed to download attachment', error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (kind !== 'image') {
    const extension = getExtension(fileName);
    return (
      <button
        type="button"
        onClick={downloadAttachment}
        className="flex items-center gap-3 p-3 bg-white hover:bg-gray-50 rounded-2xl border border-gray-100 transition-all group text-left w-full"
      >
        <div className={`p-2 rounded-xl ${
          extension === 'pdf' ? 'bg-red-50 text-red-500' :
          extension === 'csv' || extension === 'xlsx' || extension === 'xls' ? 'bg-emerald-50 text-emerald-500' :
          extension === 'doc' || extension === 'docx' ? 'bg-blue-50 text-blue-500' :
          'bg-gray-50 text-gray-500'
        }`}>
          {getFileIcon(extension)}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-gray-900 truncate pr-4">{fileName}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {extension ? extension.toUpperCase() : 'FILE'}
          </span>
        </div>
        {isDownloading ? (
          <span className="w-4 h-4 ml-auto border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4 ml-auto text-gray-300 group-hover:text-gray-900 transition-colors" />
        )}
      </button>
    );
  }

  return (
    <div className="relative group overflow-hidden rounded-2xl border border-gray-100 shadow-sm bg-gray-50 flex items-center justify-center min-h-[140px] w-full max-w-sm">
      {imgLoading && !loadError && (
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
          src={url}
          alt={fileName || 'Attachment'}
          className={`max-w-full max-h-80 object-cover transition-opacity duration-300 ${imgLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setImgLoading(false)}
          onError={() => {
            setLoadError(true);
            setImgLoading(false);
          }}
        />
      )}

      {!loadError && !imgLoading && (
        <button
          type="button"
          onClick={downloadAttachment}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="p-3 bg-white rounded-full shadow-lg scale-90 group-hover:scale-100 transition-transform">
            {isDownloading ? (
              <span className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin block" />
            ) : (
              <Download className="w-5 h-5 text-gray-900" />
            )}
          </div>
        </button>
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

  const handleStartDirectChat = async (volunteer: Volunteer) => {
    if (!orgId || !adminUid) return;
    const db = getFirestoreDb();
    try {
      const thread = await ensureDirectThread(db, orgId, volunteer.name, [adminUid, volunteer.id]);
      openThread(thread.id);
    } catch (error) {
      console.error('Failed to start direct chat', error);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedText = inputValue.trim();
    if ((!trimmedText && attachedImages.length === 0 && attachedFiles.length === 0) || !activeThreadId || !orgId) return;

    setIsUploading(true);
    try {
      const db = getFirestoreDb();
      const storage = getFirebaseStorage();
      const senderId = getFirebaseAuth().currentUser?.uid || adminUid;

      if (attachedImages.length === 0 && attachedFiles.length === 0) {
        await sendText(db, orgId, activeThreadId, senderId, senderName, trimmedText);
      } else {
        // If no image is attached, the typed text has nowhere to ride as a
        // caption (sendFile has no caption param, matching iOS exactly), so
        // send it as its own text message first rather than dropping it.
        if (attachedImages.length === 0 && trimmedText) {
          await sendText(db, orgId, activeThreadId, senderId, senderName, trimmedText);
        }
        let firstImageCaptionApplied = false;
        for (const file of attachedImages) {
          const caption = !firstImageCaptionApplied ? trimmedText : '';
          await sendImage(db, storage, orgId, activeThreadId, senderId, senderName, file, caption);
          firstImageCaptionApplied = true;
        }
        for (const file of attachedFiles) {
          await sendFile(db, storage, orgId, activeThreadId, senderId, senderName, file);
        }
      }

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
                        {thread.title}
                      </span>
                      <span className="text-[10px] font-medium text-gray-400">
                        {latest ? formatTime(latest.createdAt) : ''}
                      </span>
                    </div>
                    <p className={`text-xs truncate max-w-[140px] ${activeThreadId === thread.id ? 'text-gray-400' : 'text-gray-500'}`}>
                      {latest ? latest.body : 'No messages yet'}
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
              <h3 className="font-bold text-gray-900 text-lg">{activeThread?.title || 'Select a chat'}</h3>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-lime-500 rounded-full animate-pulse"></span>
                <span className="text-xs text-gray-500 font-medium">
                  {activeThread?.kind === 'group' ? 'Group message' : 'Direct message'}
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
                {msg.attachmentURL && (msg.kind === 'image' || msg.kind === 'file') && (
                  <div className="mb-2 w-full">
                    <MessageAttachment
                      url={msg.attachmentURL}
                      kind={msg.kind === 'image' ? 'image' : 'file'}
                      fileName={msg.body || (msg.kind === 'image' ? 'photo.jpg' : 'file')}
                    />
                  </div>
                )}
                {msg.body && msg.kind !== 'file' && (
                  <div
                    className={`p-4 rounded-2xl text-sm font-medium leading-relaxed shadow-sm ${
                      msg.senderId === getFirebaseAuth().currentUser?.uid
                        ? 'bg-gray-900 text-white rounded-tr-none'
                        : 'bg-white text-gray-700 border border-gray-100 rounded-tl-none'
                    }`}
                  >
                    {msg.body}
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-1">
                  {msg.senderId !== getFirebaseAuth().currentUser?.uid && activeThread?.kind === 'group' && (
                    <span className="text-[10px] text-lime-600 font-black uppercase tracking-wider mr-1">{msg.senderName || 'Coordinator'}</span>
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
              event.target.value = '';
            }}
          />
          {(attachedImages.length > 0 || attachedFiles.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachedImages.map((file) => (
                <span
                  key={`${file.name}-${file.lastModified}`}
                  className="px-3 py-1.5 bg-lime-50 text-[10px] font-bold text-lime-700 rounded-full flex items-center gap-2 border border-lime-200"
                >
                  {file.name}
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedImages((prev) => prev.filter((f) => f !== file));
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    className="text-lime-500 hover:text-lime-700 transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {attachedFiles.map((file) => (
                <span
                  key={`${file.name}-${file.lastModified}`}
                  className="px-3 py-1.5 bg-lime-50 text-[10px] font-bold text-lime-700 rounded-full flex items-center gap-2 border border-lime-200"
                >
                  {getFileIcon(getExtension(file.name))}
                  {file.name}
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedFiles((prev) => prev.filter((f) => f !== file));
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    className="text-lime-500 hover:text-lime-700 transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
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
                  onClick={() => allVolunteersThread && openThread(allVolunteersThread.id)}
                  disabled={!allVolunteersThread}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-900 text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Users className="w-5 h-5" />
                  <span className="font-semibold">All Volunteers</span>
                </button>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {volunteers.map((volunteer) => (
                    <button
                      key={volunteer.id}
                      onClick={() => handleStartDirectChat(volunteer)}
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

const formatTime = (date: Date | null) =>
  date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
