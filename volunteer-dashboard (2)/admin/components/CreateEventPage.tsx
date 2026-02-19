import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  AlignLeft, 
  Image as ImageIcon, 
  Check, 
  ChevronDown, 
  Type,
  Plus,
  X,
  Loader2
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getFirestoreDb, getFirebaseStorage } from '../lib/firebase';
import { resolveOrgContext } from '../lib/orgContext';

interface CreateEventPageProps {
  onBack: () => void;
}

interface Shift {
  id: string;
  startTime: string;
  endTime: string;
}

const EVENT_DRAFT_EDIT_KEY = 'nexolink:event-edit-id';

const normalizeShifts = (rawShifts: unknown, startTime: unknown, endTime: unknown): Shift[] => {
  const fallback = [{ id: '1', startTime: '', endTime: '' }];
  if (Array.isArray(rawShifts)) {
    const normalized = rawShifts
      .map((raw, index) => {
        if (!raw || typeof raw !== 'object') return null;
        const row = raw as Record<string, unknown>;
        return {
          id: String(row.id || row.shiftId || `${Date.now()}-${index}`),
          startTime: String(row.startTime || ''),
          endTime: String(row.endTime || ''),
        };
      })
      .filter((shift): shift is Shift => Boolean(shift));
    if (normalized.length > 0) return normalized;
  }

  if (startTime || endTime) {
    return [
      {
        id: '1',
        startTime: String(startTime || ''),
        endTime: String(endTime || ''),
      },
    ];
  }

  return fallback;
};

export const CreateEventPage: React.FC<CreateEventPageProps> = ({ onBack }) => {
  const [activeCategory, setActiveCategory] = useState('Community');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [orgData, setOrgData] = useState<{ orgId: string; orgCode: string } | null>(null);
  
  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [maxVolunteers, setMaxVolunteers] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverImagePreview, setCoverImagePreview] = useState('');
  const [isDateRange, setIsDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([{ id: '1', startTime: '', endTime: '' }]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const categories = ['Community', 'Environment', 'Education', 'Health', 'Crisis Relief'];

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const context = await resolveOrgContext(db, user.uid, user.email || null);
        setOrgData({ orgId: context.orgId || '', orgCode: context.orgCode || '' });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const draftId = sessionStorage.getItem(EVENT_DRAFT_EDIT_KEY)?.trim() || '';
    sessionStorage.removeItem(EVENT_DRAFT_EDIT_KEY);
    if (!draftId) {
      setEditingEventId(null);
      return;
    }

    let cancelled = false;
    const loadDraft = async () => {
      setIsLoadingDraft(true);
      try {
        const db = getFirestoreDb();
        const snap = await getDoc(doc(db, 'events', draftId));
        if (!snap.exists()) {
          if (!cancelled) setEditingEventId(null);
          return;
        }
        const data = snap.data() || {};
        if (cancelled) return;

        const nextTitle = String(data.title || '');
        const nextDescription = String(data.description || '');
        const nextCategory = String(data.category || 'Community');
        const nextLocation = String(data.location || '');
        const nextMaxVolunteers = data.maxVolunteers != null ? String(data.maxVolunteers) : '';
        const nextCoverUrl = String(data.coverImageUrl || '');
        const nextStartDate = String(data.startDate || '');
        const rawEndDate = data.endDate ? String(data.endDate) : '';
        const hasDateRange = Boolean(rawEndDate && nextStartDate && rawEndDate !== nextStartDate);
        const nextEndDate = hasDateRange ? rawEndDate : '';

        setEditingEventId(draftId);
        setTitle(nextTitle);
        setDescription(nextDescription);
        setActiveCategory(nextCategory || 'Community');
        setLocation(nextLocation);
        setMaxVolunteers(nextMaxVolunteers);
        setCoverImageUrl(nextCoverUrl);
        setCoverImagePreview(nextCoverUrl);
        setIsDateRange(hasDateRange);
        setStartDate(nextStartDate);
        setEndDate(nextEndDate);
        setShifts(normalizeShifts(data.shifts, data.startTime, data.endTime));
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
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    if (previewUrlRef.current && previewUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = localUrl;
    setCoverImagePreview(localUrl);

    if (!orgData) {
      console.warn('Org data not ready yet. Skipping cover upload.');
      return;
    }

    setIsUploading(true);
    try {
      const storage = getFirebaseStorage();
      const storageRef = ref(storage, `events/${orgData.orgId}/cover_${Date.now()}_${file.name}`);
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
    setShifts([...shifts, { id: Math.random().toString(36).substr(2, 9), startTime: '', endTime: '' }]);
  };

  const removeShift = (id: string) => {
    if (shifts.length > 1) {
      setShifts(shifts.filter(s => s.id !== id));
    }
  };

  const updateShift = (id: string, field: 'startTime' | 'endTime', value: string) => {
    setShifts(shifts.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handlePublish = async (status: 'published' | 'draft' = 'published') => {
    if (!orgData) {
      alert('Organization data is still loading. Please try again.');
      return;
    }
    if (status === 'published' && (!title || !startDate)) {
      alert('Please fill in required fields (Title and Start Date) to publish.');
      return;
    }

    setIsSubmitting(true);
    try {
      const db = getFirestoreDb();
      const eventData = {
        title,
        description,
        category: activeCategory,
        location,
        maxVolunteers: parseInt(maxVolunteers) || 0,
        coverImageUrl,
        isDateRange,
        startDate,
        endDate: isDateRange ? endDate : startDate,
        shifts,
        status,
        orgId: orgData.orgId,
        orgCode: orgData.orgCode,
      };

      if (editingEventId) {
        await updateDoc(doc(db, 'events', editingEventId), {
          ...eventData,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'events'), {
          ...eventData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
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
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 50 } }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full flex flex-col gap-6 mt-8 pb-10"
    >
      
      {/* Header */}
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
          
          {/* Main Form */}
          <motion.div variants={item} className="lg:col-span-2 flex flex-col gap-6">
              
              <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                          <Type className="w-4 h-4 text-gray-900" />
                      </div>
                      Event Details
                  </h3>
                  
                  <div className="space-y-6">
                      {/* Title */}
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

                      {/* Description */}
                      <div className="space-y-2">
                          <label className="text-sm font-bold text-gray-900 ml-1">Description</label>
                          <textarea 
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="Describe the event, objectives, and what volunteers should expect..." 
                              className="w-full h-32 p-5 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all resize-none font-medium leading-relaxed"
                          />
                      </div>

                      {/* Category Pills */}
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
                  </div>
              </div>

              {/* Logistics */}
              <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-gray-900" />
                      </div>
                      Date & Logistics
                  </h3>
                  
                  <div className="space-y-6">
                      <div className="flex flex-col md:flex-row gap-6">
                          <div className="flex-1 space-y-2">
                              <div className="flex justify-between items-center mb-1">
                                  <label className="text-sm font-bold text-gray-900 ml-1">
                                      {isDateRange ? 'Start Date' : 'Date'}
                                  </label>
                                  <button 
                                      onClick={() => setIsDateRange(!isDateRange)}
                                      className="text-xs font-bold text-lime-600 hover:text-lime-700"
                                  >
                                      {isDateRange ? 'Switch to Single Day' : 'Switch to Date Range'}
                                  </button>
                              </div>
                              <div className="relative">
                                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                  <input 
                                      type="date" 
                                      value={startDate}
                                      onChange={(e) => setStartDate(e.target.value)}
                                      className="w-full h-14 pl-12 pr-5 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all font-medium"
                                  />
                              </div>
                          </div>
                          
                          <AnimatePresence>
                              {isDateRange && (
                                <motion.div 
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="flex-1 space-y-2"
                                >
                                    <label className="text-sm font-bold text-gray-900 ml-1">End Date</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input 
                                            type="date" 
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full h-14 pl-12 pr-5 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all font-medium"
                                        />
                                    </div>
                                </motion.div>
                              )}
                          </AnimatePresence>
                      </div>

                      {/* Multiple Shifts */}
                      <div className="space-y-4">
                          <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-gray-900 ml-1">Available Shifts</label>
                              <button 
                                  onClick={addShift}
                                  className="text-xs font-bold text-lime-600 hover:text-lime-700 flex items-center gap-1"
                              >
                                  <Plus className="w-3 h-3" />
                                  Add Shift
                              </button>
                          </div>
                          <div className="space-y-3">
                              {shifts.map((shift, idx) => (
                                  <div key={shift.id} className="flex gap-4 items-center">
                                      <div className="flex-1 relative">
                                          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                          <input 
                                              type="time" 
                                              value={shift.startTime}
                                              onChange={(e) => updateShift(shift.id, 'startTime', e.target.value)}
                                              className="w-full h-12 pl-12 pr-5 bg-gray-50 rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                                          />
                                      </div>
                                      <div className="text-gray-400 font-bold">—</div>
                                      <div className="flex-1 relative">
                                          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                          <input 
                                              type="time" 
                                              value={shift.endTime}
                                              onChange={(e) => updateShift(shift.id, 'endTime', e.target.value)}
                                              className="w-full h-12 pl-12 pr-5 bg-gray-50 rounded-xl border-none text-sm font-medium focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                                          />
                                      </div>
                                      {shifts.length > 1 && (
                                          <button 
                                              onClick={() => removeShift(shift.id)}
                                              className="p-2 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors"
                                          >
                                              <X className="w-4 h-4" />
                                          </button>
                                      )}
                                  </div>
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

          </motion.div>

          {/* Sidebar Settings */}
          <motion.div variants={item} className="flex flex-col gap-6">
              
              {/* Media Upload */}
              <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 ml-1">Cover Image</h3>
                  <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      className="hidden" 
                  />
                  <div 
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                      className={`border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 hover:border-lime-300 transition-all cursor-pointer group h-64 relative overflow-hidden ${isUploading ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                      {coverImagePreview || coverImageUrl ? (
                          <>
                              <img src={coverImagePreview || coverImageUrl} className="absolute inset-0 w-full h-full object-cover" />
                              <div className={`absolute inset-0 ${isUploading ? 'bg-black/40 opacity-100' : 'bg-black/40 opacity-0 group-hover:opacity-100'} transition-opacity flex items-center justify-center`}>
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

              {/* Requirements */}
              <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 ml-1">Requirements</h3>
                  
                  <div className="space-y-4">
                      <div className="space-y-2">
                          <label className="text-sm font-bold text-gray-900 ml-1">Max Volunteers</label>
                          <div className="relative">
                              <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                              <input 
                                  type="number" 
                                  value={maxVolunteers}
                                  onChange={(e) => setMaxVolunteers(e.target.value)}
                                  placeholder="0"
                                  className="w-full h-14 pl-12 pr-5 bg-gray-50 rounded-2xl border-none text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all font-medium"
                              />
                          </div>
                      </div>
                  </div>
              </div>

              {/* Action Buttons */}
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
