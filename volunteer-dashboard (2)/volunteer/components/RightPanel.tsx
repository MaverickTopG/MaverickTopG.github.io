import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MoreHorizontal, ArrowUpRight, MessageSquare, Users, Activity, Clock, Database, FileSpreadsheet, X, Download, CheckCircle2, Upload, Calendar, Globe, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { fetchOrgCollectionDocs, resolveOrgContext } from '../lib/orgContext';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type RightPanelProps = {
  monthlyHours: number;
  busiestDay: string;
  avgWeeklyHours: number;
  weeklyHoursByDay: number[];
  retentionRate: number;
  weeklyActive: number;
};

export const RightPanel: React.FC<RightPanelProps> = ({
  monthlyHours,
  busiestDay,
  avgWeeklyHours,
  weeklyHoursByDay,
  retentionRate,
  weeklyActive,
}) => {
  const [showGuide, setShowGuide] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [monthlyGoalHours, setMonthlyGoalHours] = useState(20);
  const [goalInput, setGoalInput] = useState('20');
  const [orgCode, setOrgCode] = useState('');
  const [orgId, setOrgId] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('nexolinkMonthlyGoalHours');
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setMonthlyGoalHours(parsed);
        setGoalInput(String(parsed));
      }
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setOrgCode('');
        setOrgId('');
        return;
      }
      try {
        const context = await resolveOrgContext(db, user.uid);
        setOrgCode(context.orgCode || '');
        setOrgId(context.orgId || '');
      } catch (error) {
        console.error('Failed to load organization code', error);
      }
    });

    return () => unsubscribe();
  }, []);

  const bars = useMemo(() => {
    const max = Math.max(...weeklyHoursByDay, 0);
    if (!max) return new Array(7).fill(0);
    return weeklyHoursByDay.map((value) => value / max);
  }, [weeklyHoursByDay]);

  const goalPercent = useMemo(() => {
    if (!monthlyGoalHours) return 0;
    return Math.round((monthlyHours / monthlyGoalHours) * 100);
  }, [monthlyHours, monthlyGoalHours]);

  const listItems = [
    {
      title: 'Active Volunteers',
      subtitle: `${weeklyActive} active this week`,
      icon: <Users className="w-5 h-5" />,
    },
    { 
      title: 'Avg. Weekly Hours', 
      subtitle: `${avgWeeklyHours.toFixed(1)} hrs per volunteer`, 
      icon: <Clock className="w-5 h-5" /> 
    },
    { title: 'Retention Rate', subtitle: `${retentionRate}% volunteer participation`, icon: <TrendingUp className="w-5 h-5" /> },
  ];

  const downloadTemplate = () => {
    const header = ['Name', 'Volunteer Task', 'Hours', 'Date'];
    const rows = [
      ['Sarah M.', 'Tree Planting', '4.5', '2024-06-15'],
      ['Alex T.', 'Food Drive', '3.0', '2024-06-18'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'nexolink-volunteer-template.xlsx');
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportStatus('Processing file...');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
      const normalized = raw.map((row) => {
        const entries = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
          acc[key.trim().toLowerCase()] = String(value).trim();
          return acc;
        }, {});
        return {
          name: entries['name'] || entries['volunteer name'] || '',
          task: entries['volunteer task'] || entries['task'] || '',
          hours: entries['hours'] || entries['hours contributed'] || entries['total hours'] || '',
          date: entries['date'] || entries['date logged'] || '',
        };
      }).filter((row) => row.name && row.hours && row.date);

      if (!orgCode && !orgId) {
        setImportStatus('Organization code not found. Please re-login.');
        return;
      }

      if (!normalized.length) {
        setImportStatus('No valid rows found. Check the template format.');
        return;
      }

      const db = getFirestoreDb();
      const existingSnapshot = await fetchOrgCollectionDocs(
        db,
        'users',
        orgCode || null,
        orgId || null,
      );
      const existingMap = new Map<string, string>();
      existingSnapshot.forEach((docSnap) => {
        const user = docSnap.data || {};
        const first = String(user.firstName || user.name || '').trim();
        const last = String(user.lastName || user.last_name || '').trim();
        const name = [first, last].filter(Boolean).join(' ').trim();
        if (name) existingMap.set(name.toLowerCase(), docSnap.id);
      });

      let batch = writeBatch(db);
      let batchCount = 0;
      const flushBatch = async () => {
        if (batchCount === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      };
      const userIdByName = new Map(existingMap);

      for (const row of normalized) {
        const displayName = row.name.trim();
        const key = displayName.toLowerCase();
        let userId = userIdByName.get(key);
        if (!userId) {
          const userRef = doc(collection(db, 'users'));
          const [firstName, ...rest] = displayName.split(' ');
          const lastName = rest.join(' ').trim();
          batch.set(userRef, {
            firstName: firstName || displayName,
            lastName,
            email: '',
            role: 'volunteer',
            organizationCode: orgCode || '',
            accessCode: orgCode || '',
            organization_id: orgId || orgCode || '',
            createdAt: serverTimestamp(),
          });
          batchCount += 1;
          userId = userRef.id;
          userIdByName.set(key, userId);
        }

        const logRef = doc(collection(db, 'volunteer_logs'));
        const parsedHours = parseFloat(row.hours);
        const parsedDate = new Date(row.date);
        batch.set(logRef, {
          user_id: userId,
          organization_id: orgId || orgCode || '',
          organization_code: orgCode || '',
          org_access_code: orgCode || '',
          volunteer_name: displayName,
          volunteering_task: row.task || 'Imported hours',
          hours_contributed: Number.isNaN(parsedHours) ? 0 : parsedHours,
          date: Number.isNaN(parsedDate.getTime()) ? row.date : parsedDate.toISOString(),
          approve: 'approved',
          source: 'import',
          created_at: serverTimestamp(),
        });
        batchCount += 1;

        if (batchCount >= 450) {
          await flushBatch();
        }
      }

      await flushBatch();
      setImportStatus(`Imported ${normalized.length} logs successfully.`);
    } catch (error) {
      console.error('Import failed', error);
      setImportStatus('Upload failed. Please try again with the template.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 h-full">
        
        {/* Combined Monthly Goal Card */}
        <motion.div 
          whileHover={{ scale: 1.01 }}
          className="w-full relative rounded-[2.5rem] bg-gray-900 shadow-lg flex items-center justify-between p-8 min-h-[140px]"
        >
          <div className="flex flex-col">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">
              Monthly Goal • {new Date().toLocaleDateString(undefined, { month: 'long' })}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold text-white">{monthlyHours}</span>
              <span className="text-gray-500 text-sm font-medium">/ {monthlyGoalHours} hrs</span>
            </div>
          </div>
          
          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                {/* Track */}
                <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#1F2937"
                    strokeWidth="10"
                    strokeLinecap="round"
                />
                {/* Progress Indicator */}
                <motion.circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#D2F677"
                    strokeWidth="10"
                    strokeLinecap="round"
                    initial={{ strokeDasharray: 251.2, strokeDashoffset: 251.2 }}
                    animate={{ strokeDashoffset: 251.2 * (1 - Math.min(100, Math.max(0, goalPercent)) / 100) }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-white">{Math.max(0, goalPercent)}%</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowGoalModal(true)}
            className="absolute top-4 right-6 text-white hover:opacity-80 transition-opacity"
            aria-label="Configure monthly goal"
          >
            <ArrowUpRight className="w-5 h-5" />
          </button>
        </motion.div>

        {/* List Items */}
        <div className="flex flex-col gap-4">
          
          {/* Busiest Day Card (Dark Styled) */}
          <motion.button 
              whileHover={{ scale: 1.01 }}
              className="bg-gray-900 rounded-[2.5rem] p-8 text-left group transition-all relative overflow-hidden shadow-lg"
          >
              <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white">
                      <Activity className="w-6 h-6" />
                  </div>
                  <div className="text-right">
                      <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest block mb-1">Busiest Day</span>
                      <span className="text-3xl font-bold text-white">{busiestDay}</span>
                  </div>
              </div>
              
              <div className="flex items-end gap-2 h-16 w-full mt-2">
                 {bars.map((h, i) => {
                     const isBusiest = busiestDay !== '—' && DAY_LABELS[i] === busiestDay;
                     const heightPct = h > 0 ? h * 100 : 15;
                     return (
                       <div key={i} className="flex-1 flex flex-col h-full justify-end items-center gap-2">
                           <motion.div 
                              initial={{ height: 0 }}
                              animate={{ height: `${heightPct}%` }}
                              transition={{ duration: 0.8, delay: i * 0.05, ease: "backOut" }}
                              className={`w-full max-w-[12px] rounded-full ${isBusiest ? 'bg-lime-300' : 'bg-white/10'}`}
                           />
                           <span className={`text-[9px] font-bold uppercase ${isBusiest ? 'text-lime-300' : 'text-gray-600'}`}>
                             {DAY_LABELS[i][0]}
                           </span>
                       </div>
                     );
                 })}
              </div>
          </motion.button>

          {listItems.slice(1).map((item, idx) => (
              <motion.button 
                  key={idx} 
                  whileHover={{ scale: 1.02 }}
                  className="bg-[#EAEAEA] rounded-[2.5rem] p-7 text-left group hover:bg-white hover:shadow-lg transition-all relative overflow-hidden"
              >
                  <div className="flex justify-between items-start mb-4">
                      <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center shadow-sm text-gray-900">
                          {item.icon}
                      </div>
                  </div>
                  <h4 className="font-bold text-gray-900 text-xl mb-1">{item.title}</h4>
                  <p className="text-sm text-gray-500 leading-tight font-semibold">{item.subtitle}</p>
              </motion.button>
          ))}

          {/* Transfer Data Button (Replaces Event Ideas) */}
          <motion.button 
              onClick={() => setShowGuide(true)}
              whileHover={{ scale: 1.02 }}
              className="bg-[#EAEAEA] rounded-[2rem] p-6 text-left group hover:bg-gray-900 hover:text-white transition-all relative overflow-hidden"
          >
              <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-gray-900 group-hover:bg-gray-800 group-hover:text-white transition-colors">
                      <Database className="w-5 h-5" />
                  </div>
              </div>
              <h4 className="font-semibold text-gray-900 group-hover:text-white text-lg mb-1">Transfer Data</h4>
              <p className="text-sm text-gray-500 group-hover:text-gray-400 leading-tight font-medium">View Excel import guide...</p>
          </motion.button>
        </div>

      </div>

      {/* Guide Modal */}
      <AnimatePresence>
        {showGuide && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                 {/* Backdrop */}
                 <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowGuide(false)}
                 />
                 
                 {/* Modal Content */}
                 <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="bg-white rounded-[2.5rem] w-full max-w-xl relative shadow-2xl overflow-hidden flex flex-col"
                 >
                    {/* Modal Header */}
                    <div className="p-8 pb-4 flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-lime-100 rounded-2xl flex items-center justify-center text-lime-700">
                                    <FileSpreadsheet className="w-6 h-6" />
                                </div>
                                <button
                                    onClick={handleUploadClick}
                                    className="h-12 px-5 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-lime-500/20 group"
                                >
                                    <Upload className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                                    <span>Upload</span>
                                </button>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">Data Import Guide</h3>
                            <p className="text-gray-500 mt-1">Organize your Excel sheet with these exact columns.</p>
                            {importStatus && (
                              <p className="text-sm text-gray-500 mt-2">{importStatus}</p>
                            )}
                        </div>
                        <button 
                            onClick={() => setShowGuide(false)}
                            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Table Visualization */}
                    <div className="px-8 py-4">
                        <div className="border border-gray-200 rounded-2xl overflow-hidden">
                            {/* Header Row */}
                            <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-200">
                                {['Name', 'Volunteer Task', 'Hours', 'Date'].map((header, i) => (
                                    <div key={i} className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0">
                                        {header}
                                    </div>
                                ))}
                            </div>
                            {/* Example Row 1 */}
                            <div className="grid grid-cols-4 bg-white border-b border-gray-100">
                                <div className="p-3 text-sm font-medium text-gray-900 border-r border-gray-100">Sarah M.</div>
                                <div className="p-3 text-sm text-gray-600 border-r border-gray-100">Tree Planting</div>
                                <div className="p-3 text-sm text-gray-600 border-r border-gray-100">4.5</div>
                                <div className="p-3 text-sm text-gray-600">2024-06-15</div>
                            </div>
                             {/* Example Row 2 */}
                             <div className="grid grid-cols-4 bg-white">
                                <div className="p-3 text-sm font-medium text-gray-900 border-r border-gray-100">Alex T.</div>
                                <div className="p-3 text-sm text-gray-600 border-r border-gray-100">Food Drive</div>
                                <div className="p-3 text-sm text-gray-600 border-r border-gray-100">3.0</div>
                                <div className="p-3 text-sm text-gray-600">2024-06-18</div>
                            </div>
                        </div>
                    </div>

                    {/* Checklist */}
                    <div className="px-8 pb-8">
                        <div className="flex flex-col gap-2 mb-6">
                            {[
                                "File format must be .xlsx or .csv",
                                "Date format should be YYYY-MM-DD",
                                "Hours must be a number (decimals allowed)"
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                                    <CheckCircle2 className="w-4 h-4 text-lime-500" />
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                        
                        <button
                            onClick={downloadTemplate}
                            className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
                        >
                            <Download className="w-5 h-5" />
                            Download Template File
                        </button>
                    </div>

                 </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Monthly Goal Modal */}
      <AnimatePresence>
        {showGoalModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowGoalModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-[2.5rem] w-full max-w-lg relative shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">Monthly Goal</h3>
                  <p className="text-gray-500 mt-1">Set a target for total volunteer hours each month.</p>
                </div>
                <button
                  onClick={() => setShowGoalModal(false)}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-gray-50 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Goal Hours</p>
                  <p className="text-sm text-gray-500 mt-1">Default is 20 hours.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={goalInput}
                    onChange={(event) => setGoalInput(event.target.value)}
                    className="w-24 text-center text-lg font-bold text-gray-900 rounded-xl border border-gray-200 bg-white py-2 focus:outline-none focus:ring-2 focus:ring-lime-300"
                  />
                  <span className="text-sm font-semibold text-gray-500">hrs</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900"
                  onClick={() => {
                    setGoalInput(String(monthlyGoalHours || 20));
                    setShowGoalModal(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-black"
                  onClick={() => {
                    const next = Math.max(1, Number(goalInput) || 20);
                    setMonthlyGoalHours(next);
                    setGoalInput(String(next));
                    window.localStorage.setItem('nexolinkMonthlyGoalHours', String(next));
                    setShowGoalModal(false);
                  }}
                >
                  Save Goal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={handleFileSelected}
      />
    </>
  );
};
