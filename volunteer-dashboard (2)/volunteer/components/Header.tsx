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
  Monitor,
  Layout, 
  Share2, 
  Plus,
  Trash2,
  Link2
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { resolveOrgContext, subscribeToOrgCollection, fetchOrgCollectionDocs } from '../lib/orgContext';
import { KioskModal } from './KioskModal';
import { LogActivityModal } from './LogActivityModal';
import { JoinOrgModal } from './JoinOrgModal';
import { QuitOrgModal } from './QuitOrgModal';


interface HeaderProps {
  isKioskOpen: boolean;
  setIsKioskOpen: (open: boolean) => void;
  orgContext: { id: string; code: string; name: string };
  userProfile?: any;
  planTier?: string;
}

export const Header: React.FC<HeaderProps> = ({ isKioskOpen, setIsKioskOpen, orgContext, userProfile, planTier }) => {
  const [copied, setCopied] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isQuitModalOpen, setIsQuitModalOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const orgCode = orgContext.code;
  const orgId = orgContext.id;
  const accessCode = orgCode || '—';

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

  const fetchExportRows = async () => {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('Not logged in.');
    
    const db = getFirestoreDb();
    const rows: Array<Record<string, string | number>> = [];
    
    // For volunteers, we fetch their own logs
    const records = await fetchOrgCollectionDocs(db, 'volunteer_logs', null, null);
    // Note: fetchOrgCollectionDocs might need adjusting or we use a separate fetch for personal logs
    // In this implementation, we rely on the same structure if applicable.
    
    records.forEach((docSnap) => {
      const data = docSnap.data as any || {};
      if (data.user_id === user.uid) {
        rows.push({
          name: data.volunteer_name || data.name || 'Volunteer',
          task: data.volunteering_task || data.task || data.site || 'Service',
          hours: Number(data.hours_contributed ?? data.hours ?? 0),
          date: data.date ? new Date(data.date).toISOString().slice(0, 10) : '',
        });
      }
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
          XLSX.writeFile(workbook, 'my-volunteer-export.xlsx');
        } else {
          XLSX.writeFile(workbook, 'my-volunteer-export.csv');
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
        pdf.save('my-volunteer-report.pdf');
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
    <header className="relative z-40 flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-12">
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
        
        {/* Quit Organization Button */}
        <button
          onClick={() => setIsQuitModalOpen(true)}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-sm border border-gray-100 bg-white text-gray-600 hover:bg-gray-50 active:scale-95"
          title="Quit Organization"
        >
          <Trash2 className="w-5 h-5" />
        </button>

        {/* Join Organization Button */}
        <button
          onClick={() => setIsJoinModalOpen(true)}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-sm border border-gray-100 bg-white text-gray-600 hover:bg-gray-50 active:scale-95"
          title="Join Organization"
        >
          <Link2 className="w-5 h-5" />
        </button>

        {/* Log Mission Button */}
        <button
          onClick={() => setIsLogModalOpen(true)}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-sm border border-gray-100 bg-white text-gray-600 hover:bg-gray-50 active:scale-95"
          title="Log Mission"
        >
          <Plus className="w-5 h-5" />
        </button>

        {/* Export Button & Dropdown */}
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

      <LogActivityModal 
        isOpen={isLogModalOpen} 
        onClose={() => setIsLogModalOpen(false)} 
        orgContext={orgContext}
        userProfile={userProfile}
      />

      <JoinOrgModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        userProfile={userProfile}
      />

      <QuitOrgModal
        isOpen={isQuitModalOpen}
        onClose={() => setIsQuitModalOpen(false)}
        orgContext={orgContext}
      />
    </header>
  );
};
