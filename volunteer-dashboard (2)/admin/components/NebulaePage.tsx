
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Send, 
  Search, 
  ExternalLink, 
  Zap, 
  Cpu, 
  Layers, 
  Globe, 
  Info,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Award,
  Users2,
  Compass,
  Plus,
  FileText,
  X,
  History as HistoryIcon
} from 'lucide-react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  onSnapshot 
} from 'firebase/firestore';
import { getFirestoreDb, getFirebaseAuth } from '../lib/firebase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  grounding?: any[];
}

const INTELLIGENCE_MODULES = [
  {
    id: 'grants',
    title: 'Grant Discovery',
    description: 'Find eligible funds',
    icon: Award,
    color: 'indigo',
    prompt: 'Find grants I am eligible for this quarter'
  },
  {
    id: 'outreach',
    title: 'Volunteer Reach',
    description: 'Fill critical roles',
    icon: Users2,
    color: 'emerald',
    prompt: 'How can I fill my current volunteer roles faster?'
  },
  {
    id: 'guidance',
    title: 'Decision Support',
    description: 'Optimize my portal',
    icon: Compass,
    color: 'amber',
    prompt: 'What are my next best actions for this week?'
  }
];

export const NebulaePage: React.FC = () => {
  const [input, setInput] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [groundingResults, setGroundingResults] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<{file: File, type: string, preview?: string}[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [grantMode, setGrantMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const grantSearchTimerRef = useRef<number | null>(null);
  const lastGrantQueryRef = useRef<string>('');

  // Persistence Logic
  const saveToFirestore = async (newMessages: Message[], results: any[]) => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const user = auth.currentUser;
    if (!user) return;

    try {
      if (!chatId) {
        const docRef = await addDoc(collection(db, 'nebulae_chats'), {
          userId: user.uid,
          messages: newMessages,
          groundingResults: results,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          title: newMessages.find(m => m.role === 'user')?.content.slice(0, 40) || 'New Intelligence Session'
        });
        setChatId(docRef.id);
      } else {
        await updateDoc(doc(db, 'nebulae_chats', chatId), {
          messages: newMessages,
          groundingResults: results,
          updatedAt: Timestamp.now(),
          title: newMessages.find(m => m.role === 'user')?.content.slice(0, 40) || 'New Intelligence Session'
        });
      }
    } catch (err) {
      console.error('Persistence failed', err);
    }
  };

  const loadSession = async (id: string) => {
    const db = getFirestoreDb();
    try {
      const snap = await getDoc(doc(db, 'nebulae_chats', id));
      if (snap.exists()) {
        const data = snap.data();
        setMessages(data.messages || []);
        setGroundingResults(data.groundingResults || []);
        setChatId(id);
        setHistoryOpen(false);
      }
    } catch (err) {
      console.error('Load session failed', err);
    }
  };

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, 'nebulae_chats'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSessions(list);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  useEffect(() => {
    if (!grantMode) return;
    const queryText = input.trim();
    if (isThinking || queryText.length < 3 || queryText === lastGrantQueryRef.current) return;

    if (grantSearchTimerRef.current) {
      window.clearTimeout(grantSearchTimerRef.current);
    }

    grantSearchTimerRef.current = window.setTimeout(() => {
      lastGrantQueryRef.current = queryText;
      handleSendMessage(undefined, buildGrantPrompt(queryText), queryText);
    }, 600);

    return () => {
      if (grantSearchTimerRef.current) {
        window.clearTimeout(grantSearchTimerRef.current);
      }
    };
  }, [input, grantMode, isThinking]);

  const buildGrantPrompt = (queryText: string) => {
    return `Context: You are in Grant Discovery mode. Focus on eligibility, geography, and deadlines. Prioritize grants that fund volunteer engagement, training, and coordination.
Query: ${queryText}
Output: Provide a concise shortlist with clickable links and a one-line eligibility note each.`;
  };

  const handleSendMessage = async (e?: React.FormEvent, overrideInput?: string, displayInput?: string) => {
    if (e) e.preventDefault();
    const finalInput = overrideInput ?? input;
    if ((!finalInput.trim() && attachments.length === 0) || isThinking) return;
    if (grantSearchTimerRef.current) {
      window.clearTimeout(grantSearchTimerRef.current);
    }
    if (grantMode) {
      lastGrantQueryRef.current = (displayInput ?? finalInput).trim();
    }

    // Helper to convert File to Gemini part
    const fileToGenerativePart = async (file: File) => {
      return new Promise<{inlineData: {data: string, mimeType: string}}>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = (reader.result as string).split(',')[1];
          resolve({
            inlineData: { data: base64Data, mimeType: file.type }
          });
        };
        reader.readAsDataURL(file);
      });
    };

    const userMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: (displayInput ?? finalInput) || (attachments.length > 0 ? `Sent ${attachments.length} attachment(s)` : '')
    };
    
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    const currentInput = finalInput;
    const currentAttachments = [...attachments];
    
    setInput('');
    setAttachments([]);
    setIsThinking(true);

    try {
      const genAI = new GoogleGenerativeAI("AIzaSyCX9iZt_rDr0B1jQu-pqhGHiQm3avmDt6o");
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite",
        tools: [{ 
          // @ts-ignore
          googleSearch: {} 
        }],
      });

      // Map previous messages to Gemini format
      const historyContents = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      // Prepare current multi-modal parts
      const currentParts: any[] = [{ text: currentInput || "Please analyze these attachments." }];
      
      for (const at of currentAttachments) {
        if (at.type === 'image' || at.file.type === 'application/pdf') {
          const part = await fileToGenerativePart(at.file);
          currentParts.push(part);
        } else {
          const text = await at.file.text();
          currentParts.push({ text: `Content of ${at.file.name}:\n${text}` });
        }
      }

      const response = await model.generateContent({
        contents: [
          ...historyContents,
          { role: 'user', parts: currentParts }
        ],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.7,
        },
        systemInstruction: {
          role: 'system',
          parts: [{
            text: `You are Nebulae, the flagship intelligence layer for NexoLink. Your core objective is to serve as a high-fidelity co-pilot for nonprofit admins. 

            You operate across three priority topics:
            🥇 TOPIC 1: Grant Discovery & Readiness
            🥈 TOPIC 2: Volunteer Opportunity Distribution
            🥉 TOPIC 3: Portal Guidance & decision Support

            MULTI-MODAL CAPABILITY:
            You can see images and read documents (PDF, Word, Text). 
            - If an user sends a grant guideline, analyze it for readiness.
            - If an user sends an event photo, suggest social media captions.
            - If an user sends a project plan, identify missing Manpower needs.

            STYLE: High-level vocabulary, professional, reassuring, and intelligent. If searching for grants, ALWAYS provide clickable markdown links.`
          }]
        }
      });

      const text = response.response.text();
      const groundingMetadata = response.response.candidates?.[0]?.groundingMetadata;
      const chunks = groundingMetadata?.groundingChunks || [];

      setMessages(prev => {
        const assistantMessage: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'assistant', 
          content: text,
          grounding: chunks
        };
        const updated = [...prev, assistantMessage];
        
        const newResults = [...groundingResults, ...chunks];
        setGroundingResults(newResults);
        saveToFirestore(updated, newResults);
        return updated;
      });

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: "I've encountered a sync latency in processing these inputs. Please try a smaller file or text only." 
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const newAttachments = files.map(file => ({
        file,
        type: file.type.startsWith('image/') ? 'image' : 'document',
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      }));
      setAttachments(prev => [...prev, ...newAttachments]);
    }
  };

  return (
    <div className="w-full h-full bg-[#FAFAFA] flex overflow-hidden relative font-sans">
      
      {/* Immersive Animated Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            opacity: [0.2, 0.4, 0.2] 
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[20%] -right-[10%] w-[1000px] h-[1000px] bg-gradient-to-br from-[#D2F677]/10 to-transparent rounded-full blur-[160px]"
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            rotate: [0, -90, 0],
            opacity: [0.1, 0.3, 0.1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[20%] -left-[10%] w-[800px] h-[800px] bg-gradient-to-tr from-gray-200/40 to-transparent rounded-full blur-[140px]"
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative z-10 border-r border-gray-100">
        
        {/* Floating Header */}
        <div className="px-12 py-8 flex items-center justify-between bg-white/60 backdrop-blur-3xl sticky top-0 z-20 border-b border-gray-100">
           <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-black rounded-[1.5rem] flex items-center justify-center shadow-[0_20px_40px_rgba(0,0,0,0.1)] group">
                 <Sparkles className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
              </div>
              <div>
                 <h2 className="text-4xl font-[1000] text-gray-900 tracking-tighter italic uppercase leading-none">Nebulae AI</h2>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all shadow-sm
                  ${sidebarOpen ? 'bg-[#D2F677] text-black border-[#D2F677]' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'}`}
              >
                 <Layers className={`w-4 h-4 ${sidebarOpen ? 'text-black' : 'text-gray-400'}`} />
                 <span className="text-[10px] font-bold uppercase tracking-widest">Grants</span>
              </button>
              <button 
                onClick={() => setHistoryOpen(!historyOpen)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all shadow-sm
                  ${historyOpen ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'}`}
              >
                 <Clock className="w-4 h-4" />
                 <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
              </button>
           </div>
        </div>

        {/* Chat Stream */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar px-12 py-10 space-y-12"
        >
           {/* Welcome Dashboard - Premium Center Layout */}
           {messages.length === 0 && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center"
             >
                <div className="max-w-3xl px-6">
                   <motion.div
                     initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                     animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                     transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                     className="mb-12 relative"
                   >
                      <h1 className="text-6xl md:text-7xl font-[1000] text-gray-900 tracking-tighter italic uppercase leading-[0.9] mb-6">
                         How can I <span className="text-transparent bg-clip-text bg-gradient-to-r from-black via-gray-700 to-[#D2F677] animate-gradient-x">help you</span> today?
                      </h1>
                      <div className="h-1 w-24 bg-[#D2F677] mx-auto rounded-full shadow-[0_0_20px_#D2F677]" />
                      
                      <motion.p 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="mt-8 text-sm font-bold text-gray-400 uppercase tracking-[0.4em]"
                      >
                         Volunteer Impact Intelligence Synchronized and Ready
                      </motion.p>
                   </motion.div>

                   <div className="flex flex-wrap justify-center gap-4 mt-8">
                      {INTELLIGENCE_MODULES.map((module, idx) => (
                        <motion.button
                          key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + idx * 0.1 }}
                onClick={() => {
                            if (module.id === 'grants') {
                              setGrantMode(true);
                              setSidebarOpen(true);
                              window.setTimeout(() => inputRef.current?.focus(), 0);
                            } else {
                              setGrantMode(false);
                              handleSendMessage(undefined, module.prompt);
                            }
                          }}
                          className="px-6 py-3.5 bg-white border border-gray-100 rounded-full hover:border-[#D2F677] hover:shadow-xl hover:shadow-[#D2F677]/10 transition-all flex items-center gap-3 group relative overflow-hidden"
                        >
                           <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-[#D2F677] group-hover:text-black transition-all">
                              <module.icon className="w-4 h-4" />
                           </div>
                           <span className="text-xs font-black text-gray-500 uppercase tracking-widest group-hover:text-black transition-colors">
                              {module.title}
                           </span>
                           <Plus className="w-3 h-3 text-gray-300 group-hover:text-black" />
                        </motion.button>
                      ))}
                   </div>
                </div>
             </motion.div>
           )}

           <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] flex flex-col gap-3 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                     <div 
                       className={`p-8 rounded-[2.5rem] text-xl font-medium leading-relaxed tracking-tight shadow-lg transition-all
                        ${msg.role === 'user' 
                          ? 'bg-black text-white rounded-tr-none' 
                          : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)]'
                        }`}
                     >
                        {msg.content}
                        
                        {/* Grounding Inline Links */}
                        {msg.grounding && msg.grounding.length > 0 && (
                          <div className="mt-8 pt-8 border-t border-gray-100 flex flex-wrap gap-3">
                             {msg.grounding.map((chunk, i) => (
                                chunk.web && (
                                  <a 
                                    key={i}
                                    href={chunk.web.uri}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#D2F677]/10 text-gray-700 rounded-xl text-xs font-[1000] uppercase tracking-tighter hover:bg-[#D2F677] hover:text-black hover:scale-105 transition-all"
                                  >
                                    <Globe className="w-3 h-3" />
                                    {chunk.web.title || 'Source'}
                                  </a>
                                )
                             ))}
                          </div>
                        )}
                     </div>
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">
                        {msg.role === 'user' ? 'Dashboard Admin' : 'Nebulae Intelligence'}
                     </span>
                  </div>
                </motion.div>
              ))}
              
              {isThinking && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-full bg-white border border-gray-100 flex items-center justify-center relative overflow-hidden shadow-sm">
                     <motion.div 
                       animate={{ 
                         scale: [1, 1.5, 1],
                         opacity: [0.2, 0.5, 0.2]
                       }}
                       transition={{ duration: 1.5, repeat: Infinity }}
                       className="absolute inset-0 bg-[#D2F677]"
                     />
                     <Zap className="w-5 h-5 text-black relative z-10 animate-pulse" />
                  </div>
                  <span className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] italic">Synthesizing intelligence...</span>
                </motion.div>
              )}
           </AnimatePresence>
        </div>

        {/* Dynamic Action Input */}
        <div className="p-10 bg-transparent">
           <form 
             onSubmit={handleSendMessage}
             onDragEnter={handleDrag}
             onDragLeave={handleDrag}
             onDragOver={handleDrag}
             onDrop={handleDrop}
             className={`max-w-4xl mx-auto flex items-center gap-4 bg-white border rounded-[3rem] p-3 transition-all duration-300 relative
               ${isDragging 
                 ? 'border-[#D2F677] bg-[#D2F677]/5 shadow-[0_0_40px_rgba(210,246,119,0.2)] scale-[1.02]' 
                 : grantMode
                    ? 'border-[#D2F677] shadow-[0_0_35px_rgba(120,255,120,0.35)] ring-2 ring-[#7CFF7A]/40'
                    : 'border-gray-200 focus-within:border-[#D2F677] focus-within:shadow-[0_0_30px_rgba(210,246,119,0.1)] shadow-xl shadow-gray-200/50'
               }`}
           >
              {grantMode && !isDragging && (
                <div className="absolute -top-7 left-8 flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-[#7CFF7A]/20 text-[10px] font-black uppercase tracking-[0.3em] text-[#1B3A1B]">
                    Grant Context Active
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white border border-[#7CFF7A]/40 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                    Focus: Volunteer Engagement + Training
                  </span>
                </div>
              )}
              {isDragging && (
                <div className="absolute inset-0 z-10 bg-[#D2F677]/10 rounded-[3rem] flex items-center justify-center pointer-events-none">
                  <div className="flex items-center gap-3 px-6 py-3 bg-[#D2F677] text-black rounded-full shadow-lg scale-110">
                    <Plus className="w-5 h-5 animate-bounce" />
                    <span className="text-xs font-black uppercase tracking-widest">Drop files to attach</span>
                  </div>
                </div>
              )}
              <input 
                type="file" 
                id="nebulae-file-upload" 
                className="hidden" 
                multiple
                accept="image/*,.doc,.docx,.pdf,.txt"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const newAttachments = files.map(file => ({
                    file,
                    type: file.type.startsWith('image/') ? 'image' : 'document',
                    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
                  }));
                  setAttachments(prev => [...prev, ...newAttachments]);
                }}
              />
              
              {/* Attachment Previews */}
              {attachments.length > 0 && (
                <div className="absolute bottom-full left-0 mb-4 flex flex-wrap gap-2 px-12">
                   {attachments.map((at, i) => (
                     <div key={i} className="relative group p-2 bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-2">
                         {at.type === 'image' ? (
                           <img src={at.preview} className="w-10 h-10 rounded-lg object-cover" />
                         ) : (
                           <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-gray-500" />
                           </div>
                         )}
                        <span className="text-[10px] font-bold text-gray-500 max-w-[100px] truncate">{at.file.name}</span>
                        <button 
                          type="button"
                          onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center scale-0 group-hover:scale-100 transition-transform shadow-sm"
                        >
                           <X className="w-3 h-3" />
                        </button>
                     </div>
                   ))}
                </div>
              )}

              <button 
                type="button"
                onClick={() => document.getElementById('nebulae-file-upload')?.click()}
                className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
              >
                 <Plus className="w-6 h-6" />
              </button>
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                ref={inputRef}
                placeholder="Ask Anything: 'Find 2024 environmental grants in Seattle'..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 placeholder:text-gray-400 font-bold text-lg"
              />
              <button 
                type="submit"
                disabled={!input.trim() || isThinking}
                className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center hover:bg-gray-800 hover:scale-105 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale shadow-lg"
              >
                 <Send className="w-6 h-6" />
              </button>
           </form>
        </div>
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="w-[420px] h-full bg-white flex flex-col p-10 relative z-20 border-l border-gray-100 shadow-2xl"
          >
             <div className="mb-12">
                <h3 className="text-xs font-[1000] text-gray-400 uppercase tracking-[0.5em] mb-4">Grant Intelligence</h3>
                 <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black text-gray-900 italic uppercase tracking-tighter">Live Discoveries</h2>
                 </div>
             </div>

             {/* Discovery Stream */}
             <div className="flex-1 space-y-6 overflow-y-auto no-scrollbar">
                {groundingResults.length > 0 ? (
                  groundingResults.map((res, j) => (
                    <motion.div 
                      key={j}
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: j * 0.1 }}
                      className="p-6 bg-gray-50 border border-gray-100 rounded-[2rem] hover:border-[#D2F677] hover:bg-white transition-all group cursor-pointer shadow-sm"
                    >
                       <div className="flex justify-between items-start mb-4">
                          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-[#D2F677] group-hover:text-black transition-all">
                             <Layers className="w-5 h-5" />
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-[#D2F677] transition-colors" />
                       </div>
                       <h4 className="font-bold text-gray-900 text-base leading-snug mb-2 group-hover:text-[#D2F677] transition-colors">
                          {res.web?.title || "Verification Pending"}
                       </h4>
                       <p className="text-xs text-gray-400 font-medium line-clamp-2">
                          Real-time metadata suggests high alignment with current volunteer initiatives.
                       </p>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20 opacity-40">
                     <div className="w-20 h-20 rounded-[2.5rem] bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center mb-6">
                      <AlertCircle className="w-8 h-8 text-gray-300" />
                     </div>
                     <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Awaiting Queries</h4>
                     <p className="text-[10px] font-bold text-gray-400 max-w-[200px] mt-2">Perform a grant search to populate intelligence feed.</p>
                  </div>
                )}
             </div>

             {/* AI Health & Status / Controls */}
             <div className="mt-10 pt-10 border-t border-gray-100 space-y-6">
                <button 
                  onClick={() => {
                     setGroundingResults([]);
                     if (chatId) {
                       const db = getFirestoreDb();
                       updateDoc(doc(db, 'nebulae_chats', chatId), { groundingResults: [] });
                     }
                  }}
                  className="w-full py-5 bg-[#D2F677] rounded-2xl text-black font-[1000] text-xs uppercase tracking-[0.2em] italic hover:bg-black hover:text-white transition-all shadow-xl shadow-black/5"
                >
                   REFRESH GRANT SEARCH
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Overlay Panel */}
      <AnimatePresence>
         {historyOpen && (
           <>
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setHistoryOpen(false)}
               className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]"
             />
             <motion.div 
               initial={{ x: '100%' }}
               animate={{ x: 0 }}
               exit={{ x: '100%' }}
               transition={{ type: 'spring', damping: 25, stiffness: 200 }}
               className="fixed top-0 right-0 w-[450px] h-full bg-white z-[101] shadow-2xl flex flex-col p-10 font-sans border-l border-gray-100"
             >
                <div className="flex items-center justify-between mb-12">
                   <h2 className="text-3xl font-black text-gray-900 italic uppercase tracking-tighter">History Context</h2>
                   <button 
                     onClick={() => setHistoryOpen(false)}
                     className="w-12 h-12 rounded-full border border-gray-100 text-gray-900 flex items-center justify-center hover:bg-gray-50 transition-colors"
                   >
                      <X className="w-6 h-6" />
                   </button>
                </div>

                <div className="mb-10">
                   <button 
                     onClick={() => {
                       setChatId(null);
                       setMessages([]);
                       setGroundingResults([]);
                       setHistoryOpen(false);
                     }}
                     className="w-full py-4 bg-[#D2F677] hover:bg-black hover:text-white text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-lg active:scale-95"
                   >
                      + Start New Session
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
                   <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4 px-2">Recent Intelligence</h3>
                   {sessions.length > 0 ? (
                     sessions.map((session) => (
                       <button
                         key={session.id}
                         onClick={() => loadSession(session.id)}
                         className={`w-full p-6 rounded-[2rem] text-left transition-all group border ${
                           chatId === session.id 
                             ? 'bg-[#D2F677] border-[#D2F677] text-black' 
                             : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-[#D2F677]/50 hover:bg-gray-100'
                         }`}
                       >
                          <div className="flex items-center gap-3 mb-2">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${chatId === session.id ? 'bg-black/10' : 'bg-gray-200'}`}>
                                <Clock className="w-4 h-4" />
                             </div>
                             <span className="text-[10px] font-[1000] uppercase tracking-widest opacity-60">
                                {session.updatedAt?.toDate
                                  ? session.updatedAt.toDate().toLocaleDateString()
                                  : session.createdAt?.toDate
                                    ? session.createdAt.toDate().toLocaleDateString()
                                    : 'Recent'}
                             </span>
                          </div>
                          <p className="font-bold text-sm leading-relaxed line-clamp-2 text-gray-900">
                             {session.title || session.messages?.[0]?.content || "Empty intelligence session"}
                          </p>
                       </button>
                     ))
                   ) : (
                     <div className="flex flex-col items-center justify-center h-full text-center opacity-40 py-20">
                        <HistoryIcon className="w-12 h-12 text-gray-300 mb-4" />
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No history yet</p>
                     </div>
                   )}
                </div>
             </motion.div>
           </>
         )}
      </AnimatePresence>
    </div>
  );
};
