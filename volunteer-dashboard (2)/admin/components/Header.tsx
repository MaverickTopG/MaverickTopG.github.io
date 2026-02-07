import React, { useMemo, useState, useEffect } from 'react';
import { 
  Download, 
  Bell, 
  Sparkles, 
  QrCode, 
  X, 
  Check, 
  FileSpreadsheet, 
  FileText,
  Copy,
  Monitor
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { resolveOrgContext, subscribeToOrgCollection, fetchOrgCollectionDocs } from '../lib/orgContext';
import { KioskModal } from './KioskModal';
import { Toast } from './Toast';

interface HeaderProps {
  isKioskOpen: boolean;
  setIsKioskOpen: (open: boolean) => void;
  orgContext: { id: string; code: string; name: string };
}

export const Header: React.FC<HeaderProps> = ({ isKioskOpen, setIsKioskOpen, orgContext }) => {
  const [copied, setCopied] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [requests, setRequests] = useState<Array<{ id: string; name: string; role: string; time: string }>>([]);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [toast, setToast] = useState<{ isVisible: boolean; message: string; type: 'success' | 'error' }>({
    isVisible: false,
    message: '',
    type: 'success',
  });

  const orgCode = orgContext.code;
  const orgId = orgContext.id;
  const accessCode = orgCode || '—';
  const auth = getFirebaseAuth();
  const userId = auth.currentUser?.uid || null;

  useEffect(() => {
    if (!orgCode && !orgId) return;
    const db = getFirestoreDb();
    const unsubscribe = subscribeToOrgCollection({
      db,
      collectionName: 'organization_join_requests',
      orgCode,
      orgId,
      filters: [['status', '==', 'pending']],
      onData: (rows) => {
        const pending: Array<{ id: string; name: string; role: string; time: string }> = [];
        rows.forEach((row) => {
          const data = row.data as any || {};
          const createdAt = data.created_at || data.createdAt || null;
          const createdAtDate =
            typeof createdAt?.toDate === 'function'
              ? createdAt.toDate()
              : createdAt?.seconds
                ? new Date(createdAt.seconds * 1000)
                : createdAt
                  ? new Date(createdAt)
                  : null;
          const minutesAgo = createdAtDate
            ? Math.max(1, Math.round((Date.now() - createdAtDate.getTime()) / 60000))
            : 1;
          pending.push({
            id: row.id,
            name: data.user_name || data.userName || data.user_email || 'Volunteer',
            role: data.requested_role || data.role || data.requestedRole || 'Event Helper',
            time: `${minutesAgo}m ago`,
          });
        });
        pending.sort((a, b) => (a.time > b.time ? -1 : 1));
        setRequests(pending.slice(0, 3));
      },
    });

    return () => unsubscribe();
  }, [orgCode, orgId]);

  // Initial fetch for Auto-Processing state
  useEffect(() => {
    if (!orgId && !userId) return;
    const db = getFirestoreDb();
    const fetchSettings = async () => {
      try {
        const collections = ['volunteer_organizations', 'organizations', 'orgs'];
        let resolved = false;
        if (orgId) {
          for (const coll of collections) {
            const docRef = doc(db, coll, orgId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              const data = snap.data();
              setAutoProcessing(!!data.auto_process_logs);
              resolved = true;
              break;
            }
          }
        }
        if (!resolved && userId) {
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            setAutoProcessing(!!data.auto_process_logs);
          }
        }
      } catch (err) {
        console.error('Failed to fetch auto-log settings', err);
      }
    };
    fetchSettings();
  }, [orgId, userId]);

  const toggleAutoProcessing = async () => {
    if (!orgId && !userId) return;
    const newState = !autoProcessing;
    const db = getFirestoreDb();
    
    try {
      setAutoProcessing(newState);
      
      const collections = ['volunteer_organizations', 'organizations', 'orgs'];
      let updated = false;
      if (orgId) {
        for (const coll of collections) {
          const docRef = doc(db, coll, orgId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            await setDoc(docRef, { auto_process_logs: newState }, { merge: true });
            updated = true;
            break;
          }
        }
      }
      if (!updated && userId) {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, { auto_process_logs: newState }, { merge: true });
      }

      setToast({
        isVisible: true,
        message: newState 
          ? 'Auto Volunteer Log Processing Activated' 
          : 'Auto Volunteer Log Processing Deactivated',
        type: 'success'
      });
    } catch (err) {
      console.error('Toggle failed', err);
      setAutoProcessing(!newState); // revert
      setToast({
        isVisible: true,
        message: 'Failed to update AI settings',
        type: 'error'
      });
    }
  };

  const handleCopy = () => {
    if (!accessCode || accessCode === '—') return;
    navigator.clipboard.writeText(accessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleDropdown = (name: string) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const closeDropdowns = () => setActiveDropdown(null);

  const dropdownVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.95, filter: 'blur(10px)' },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1, 
      filter: 'blur(0px)',
      transition: { type: 'spring', stiffness: 300, damping: 25 } 
    },
    exit: { opacity: 0, y: 10, scale: 0.95, filter: 'blur(10px)', transition: { duration: 0.15 } }
  };

  const qrUrl = useMemo(() => {
    if (!accessCode || accessCode === '—') return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(accessCode)}`;
  }, [accessCode]);

  const fetchExportRows = async () => {
    if (!orgCode && !orgId) throw new Error('Organization code not found.');
    const db = getFirestoreDb();
    const rows: Array<Record<string, string | number>> = [];
    const records = await fetchOrgCollectionDocs(db, 'volunteer_logs', orgCode || null, orgId || null);
    records.forEach((docSnap) => {
      const data = docSnap.data as any || {};
      rows.push({
        name: data.volunteer_name || data.name || 'Volunteer',
        task: data.volunteering_task || data.task || data.site || 'Service',
        hours: Number(data.hours_contributed ?? data.hours ?? 0),
        date: data.date ? new Date(data.date).toISOString().slice(0, 10) : '',
      });
    });
    return rows;
  };

  const handleExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    try {
      setExportStatus('Preparing export...');
      const rows = await fetchExportRows();
      if (!rows.length) {
        setExportStatus('No data to export.');
        return;
      }

      if (format === 'xlsx' || format === 'csv') {
        const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['name', 'task', 'hours', 'date'] });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Volunteer Logs');
        if (format === 'xlsx') {
          XLSX.writeFile(workbook, 'nexolink-volunteer-export.xlsx');
        } else {
          XLSX.writeFile(workbook, 'nexolink-volunteer-export.csv');
        }
      }

      if (format === 'pdf') {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
        pdf.setFontSize(16);
        pdf.text('NexoLink Volunteer Export', 40, 50);
        pdf.setFontSize(10);
        let y = 80;
        const lineHeight = 18;
        rows.forEach((row, index) => {
          if (y > 720) {
            pdf.addPage();
            y = 60;
          }
          pdf.text(
            `${row.name} • ${row.task} • ${row.hours} hrs • ${row.date}`,
            40,
            y,
          );
          y += lineHeight;
        });
        pdf.save('nexolink-volunteer-export.pdf');
      }

      setExportStatus('Export ready.');
      setTimeout(() => setExportStatus(null), 2000);
    } catch (error) {
      console.error('Export failed', error);
      setExportStatus('Export failed.');
      setTimeout(() => setExportStatus(null), 2000);
    }
  };

  return (
    <header className="relative z-40 flex flex-col md:flex-row md:items-start md:justify-between gap-6">
      
      {/* Backdrop for closing dropdowns */}
      {activeDropdown && (
        <div className="fixed inset-0 z-30 bg-transparent" onClick={closeDropdowns} />
      )}

      <div className="max-w-2xl">
        <h1 className="text-5xl md:text-[3.5rem] leading-[1.1] font-medium tracking-tight text-gray-900">
          Volunteer
          <span className="inline-flex items-center justify-center w-12 h-12 mx-3 bg-lime-300 rounded-2xl align-middle shadow-sm">
            <Sparkles className="w-6 h-6 text-gray-900" strokeWidth={1.5} />
          </span>
          Dashboard
        </h1>
      </div>

      <div className="flex items-center gap-4 mt-2 relative z-40">
        
        {/* Access Code Button */}
        <button 
          className="h-12 px-5 bg-white rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-all shadow-sm border border-gray-100 group min-w-[140px]"
          onClick={handleCopy}
          title="Click to copy"
        >
          {copied ? (
             <span className="text-lime-600 font-bold text-sm tracking-wide">Copied!</span>
          ) : (
             <>
                <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Code:</span>
                <span className="font-mono text-base font-bold text-gray-900 tracking-widest">{accessCode}</span>
             </>
          )}
        </button>

        {/* Kiosk Button */}
        <button 
          onClick={() => setIsKioskOpen(true)}
          className="w-12 h-12 bg-white rounded-full flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm border border-gray-100 group"
          aria-label="Kiosk"
        >
          <Monitor className="w-5 h-5 text-gray-400 group-hover:text-gray-900 transition-colors" />
        </button>

        {/* AI Toggle Button */}
        <button 
          onClick={toggleAutoProcessing}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-sm border group
            ${autoProcessing 
              ? 'bg-lime-300 border-lime-400 shadow-[0_0_20px_rgba(190,242,100,0.3)]' 
              : 'bg-white border-gray-100 hover:bg-gray-50'
            }`}
          title={autoProcessing ? "Auto-Log Processing Active" : "Activate Auto-Log Processing"}
        >
          <Sparkles className={`w-5 h-5 transition-colors ${autoProcessing ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-900'}`} />
        </button>


        {/* QR Code Button & Dropdown */}
        <div className="relative">
          <button 
            onClick={() => toggleDropdown('qr')}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-sm border border-gray-100 relative
              ${activeDropdown === 'qr' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            aria-label="QR Code"
          >
            <QrCode className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {activeDropdown === 'qr' && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute top-14 right-0 w-72 bg-white rounded-[2rem] shadow-2xl border border-gray-100 p-6 flex flex-col items-center text-center overflow-hidden"
              >
                <div className="w-48 h-48 bg-gray-900 rounded-2xl mb-4 p-3 flex items-center justify-center">
                  {qrUrl ? (
                    <img
                      src={qrUrl}
                      alt="Volunteer join QR"
                      className="w-full h-full rounded-xl bg-white p-2 object-contain"
                    />
                  ) : (
                    <div className="w-full h-full rounded-xl bg-white/90 flex items-center justify-center text-xs text-gray-500">
                      QR unavailable
                    </div>
                  )}
                </div>
                <h3 className="font-bold text-lg text-gray-900 mb-1">Join via Mobile</h3>
                <p className="text-sm text-gray-500 mb-4">Scan to instantly join the volunteer team session.</p>
                <a
                  href={qrUrl || '#'}
                  download={`nexolink-qr-${accessCode || 'code'}.png`}
                  className="w-full py-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-900 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    Download QR Code
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications Button & Dropdown */}
        <div className="relative">
          <button 
            onClick={() => toggleDropdown('notifications')}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-sm border border-gray-100 relative
            ${activeDropdown === 'notifications' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {requests.length > 0 ? (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full"></span>
            ) : null}
          </button>

          <AnimatePresence>
             {activeDropdown === 'notifications' && (
                <motion.div
                  variants={dropdownVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="absolute top-14 right-[-60px] md:right-0 w-80 bg-white rounded-[2rem] shadow-2xl border border-gray-100 p-2 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-gray-50 flex justify-between items-center">
                      <h3 className="font-semibold text-gray-900">Requests</h3>
                      <span className="bg-lime-100 text-lime-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        {requests.length} New
                      </span>
                  </div>
                  <div className="flex flex-col gap-1 p-2">
                      {requests.length === 0 ? (
                        <div className="px-3 py-6 text-sm text-gray-500 text-center">
                          No new volunteer requests right now.
                        </div>
                      ) : (
                        requests.map((req, i) => (
                            <div key={req.id || i} className="flex items-start gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors group">
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h4 className="text-sm font-bold text-gray-900">{req.name}</h4>
                                        <span className="text-[10px] text-gray-400 font-medium">{req.time}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mb-2 truncate">Requests to join as {req.role}</p>
                                    <div className="flex gap-2">
                                        <button className="flex-1 bg-lime-300 hover:bg-lime-400 text-gray-900 text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors">
                                            <Check className="w-3 h-3" /> Accept
                                        </button>
                                        <button className="px-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-lg flex items-center justify-center transition-colors">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                      )}
                  </div>
                  <button className="w-full py-2.5 text-center text-xs font-semibold text-gray-500 hover:text-gray-900 border-t border-gray-50 hover:bg-gray-50 transition-colors">
                      View all notifications
                  </button>
                </motion.div>
             )}
          </AnimatePresence>
        </div>

        {/* Export Button & Dropdown */}
        <div className="relative">
          <button 
            onClick={() => toggleDropdown('export')}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg relative
            ${activeDropdown === 'export' ? 'bg-gray-800 text-white scale-95' : 'bg-[#161618] text-white hover:bg-black hover:scale-105'}`}
            aria-label="Export"
          >
            <Download className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {activeDropdown === 'export' && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute top-14 right-0 w-64 bg-white rounded-[2rem] shadow-2xl border border-gray-100 p-2 overflow-hidden"
              >
                 <div className="px-4 py-3">
                      <h3 className="font-semibold text-gray-900">Export Data</h3>
                      <p className="text-xs text-gray-500">Download report for current view.</p>
                      {exportStatus && (
                        <p className="text-[11px] text-gray-400 mt-1">{exportStatus}</p>
                      )}
                  </div>
                  <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleExport('xlsx')}
                        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors text-left group"
                      >
                          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center group-hover:bg-green-100 transition-colors">
                              <FileSpreadsheet className="w-5 h-5" />
                          </div>
                          <div>
                              <span className="block text-sm font-bold text-gray-900">Excel</span>
                              <span className="block text-[10px] text-gray-400">.xlsx spreadsheet</span>
                          </div>
                      </button>
                      <button
                        onClick={() => handleExport('pdf')}
                        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors text-left group"
                      >
                          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                              <FileText className="w-5 h-5" />
                          </div>
                          <div>
                              <span className="block text-sm font-bold text-gray-900">PDF Report</span>
                              <span className="block text-[10px] text-gray-400">.pdf document</span>
                          </div>
                      </button>
                      <button
                        onClick={() => handleExport('csv')}
                        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors text-left group"
                      >
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                              <Copy className="w-5 h-5" />
                          </div>
                          <div>
                              <span className="block text-sm font-bold text-gray-900">CSV</span>
                              <span className="block text-[10px] text-gray-400">Raw data format</span>
                          </div>
                      </button>
                  </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      <KioskModal isOpen={isKioskOpen} onClose={() => setIsKioskOpen(false)} orgContext={orgContext} />
      
      <Toast 
        isVisible={toast.isVisible}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </header>
  );
};
