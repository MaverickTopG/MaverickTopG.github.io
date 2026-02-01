import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Database, X, FileSpreadsheet, CheckCircle2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

export const UploadDataCard: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const downloadTemplate = () => {
    const header = ['Volunteer Task', 'Hours', 'Date', 'Organization', 'Description'];
    const rows = [
      ['Tree Planting', '4.5', '2024-06-15', 'Changes for Good', 'Planted oak trees in the park'],
      ['Food Drive', '3.0', '2024-06-18', 'Community Kitchen', 'Sorted canned goods'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'volunteer-log-template.xlsx');
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportStatus('Processing file...');

    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      
      if (!user) {
        setImportStatus('You must be logged in to upload data.');
        return;
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
      
      const normalized = raw.map((row) => {
        // Normalize keys to lowercase and trim
        const entries = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
          acc[key.trim().toLowerCase()] = String(value).trim();
          return acc;
        }, {});

        return {
          task: entries['volunteer task'] || entries['task'] || 'Imported Activity',
          hours: entries['hours'] || entries['hours contributed'] || entries['total hours'] || '0',
          date: entries['date'] || entries['date logged'] || new Date().toISOString().split('T')[0],
          org: entries['organization'] || entries['org'] || 'Personal',
          desc: entries['description'] || entries['notes'] || '',
        };
      }).filter((row) => parseFloat(row.hours) > 0);

      if (!normalized.length) {
        setImportStatus('No valid rows found. Please check the template format.');
        return;
      }

      const db = getFirestoreDb();
      let count = 0;
      
      for (const row of normalized) {
        const logRef = doc(collection(db, 'volunteer_logs'));
        const parsedHours = parseFloat(row.hours);
        const parsedDate = new Date(row.date);
        
        await setDoc(logRef, {
          user_id: user.uid,
          volunteer_name: user.displayName || 'Volunteer',
          volunteering_task: row.task,
          hours_contributed: parsedHours,
          date: !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString(),
          organization_name: row.org,
          description: row.desc,
          approve: 'approved', // Auto-approve personal imports
          source: 'import',
          created_at: serverTimestamp(),
          status: 'approved',
        });
        count++;
      }

      setImportStatus(`Successfully imported ${count} logs!`);
      setTimeout(() => {
          setImportStatus(null);
          setShowModal(false);
      }, 2000);

    } catch (error) {
      console.error('Import failed', error);
      setImportStatus('Upload failed. Please try again with the template.');
    } finally {
      if (fileInputRef.current) {
         fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <motion.div 
        onClick={() => setShowModal(true)}
        whileHover={{ scale: 1.01 }}
        className="w-full relative rounded-[2.5rem] bg-white border border-gray-100 shadow-sm p-8 group cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Data Management</span>
            <h3 className="text-xl font-bold text-gray-900 group-hover:text-lime-600 transition-colors">Upload Data</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center group-hover:bg-lime-50 transition-colors">
            <Upload className="w-6 h-6 text-gray-400 group-hover:text-lime-600 transition-colors" />
          </div>
        </div>
        
        <p className="mt-4 text-sm text-gray-500">
          Import external volunteer logs or sync with other platforms.
        </p>
      </motion.div>

      <AnimatePresence>
        {showModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                 {/* Backdrop */}
                 <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowModal(false)}
                 />
                 
                 {/* Modal Content */}
                 <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="bg-white rounded-[2.5rem] w-full max-w-xl relative shadow-2xl overflow-hidden flex flex-col max-h-[90vh] overflow-y-auto"
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
                                    <span>Upload File</span>
                                </button>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">Import Logs</h3>
                            <p className="text-gray-500 mt-1">Bulk upload your volunteer history.</p>
                            {importStatus && (
                              <p className={`text-sm font-medium mt-2 ${importStatus.includes('Success') ? 'text-green-600' : 'text-lime-600'}`}>
                                {importStatus}
                              </p>
                            )}
                        </div>
                        <button 
                            onClick={() => setShowModal(false)}
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
                                {['Task', 'Hours', 'Date', 'Org'].map((header, i) => (
                                    <div key={i} className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0">
                                        {header}
                                    </div>
                                ))}
                            </div>
                            {/* Example Row 1 */}
                            <div className="grid grid-cols-4 bg-white border-b border-gray-100">
                                <div className="p-3 text-sm font-medium text-gray-900 border-r border-gray-100">Tree Planting</div>
                                <div className="p-3 text-sm text-gray-600 border-r border-gray-100">4.5</div>
                                <div className="p-3 text-sm text-gray-600 border-r border-gray-100">2024-06-15</div>
                                <div className="p-3 text-sm text-gray-600">Changes for Good</div>
                            </div>
                             {/* Example Row 2 */}
                             <div className="grid grid-cols-4 bg-white">
                                <div className="p-3 text-sm font-medium text-gray-900 border-r border-gray-100">Food Drive</div>
                                <div className="p-3 text-sm text-gray-600 border-r border-gray-100">3.0</div>
                                <div className="p-3 text-sm text-gray-600 border-r border-gray-100">2024-06-18</div>
                                <div className="p-3 text-sm text-gray-600">Community Kitchen</div>
                            </div>
                        </div>
                    </div>

                    {/* Checklist */}
                    <div className="px-8 pb-8">
                        <div className="flex flex-col gap-2 mb-6">
                            {[
                                "File format must be .xlsx or .csv",
                                "Date format should be YYYY-MM-DD",
                                "Hours must be a number"
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                                    <CheckCircle2 className="w-4 h-4 text-lime-500" />
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={downloadTemplate}
                                className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
                            >
                                <Download className="w-5 h-5" />
                                Excel Template
                            </button>
                            <button
                                onClick={() => {
                                  const header = ['Volunteer Task,Hours,Date,Organization,Description'];
                                  const rows = [
                                    'Tree Planting,4.5,2024-06-15,Changes for Good,Planted oak trees in the park',
                                    'Food Drive,3.0,2024-06-18,Community Kitchen,Sorted canned goods',
                                  ];
                                  const csvContent = [header, ...rows].join('\n');
                                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                  const link = document.createElement('a');
                                  const url = URL.createObjectURL(blob);
                                  link.setAttribute('href', url);
                                  link.setAttribute('download', 'volunteer-log-template.csv');
                                  link.style.visibility = 'hidden';
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                                className="w-full py-4 bg-lime-100 hover:bg-lime-200 text-lime-800 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
                            >
                                <FileSpreadsheet className="w-5 h-5" />
                                CSV Template
                            </button>
                        </div>
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
