import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Search, Filter, Check, ChevronRight } from 'lucide-react';
import { useVolunteerMetrics } from '../hooks/useVolunteerMetrics';
import { RecentActivityTable } from './RecentActivityTable';

export const VolunteerActivityPage: React.FC = () => {
  const { allLogs, loading } = useVolunteerMetrics();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All Activity');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [hoveringOrganizations, setHoveringOrganizations] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 7;

  const filters = useMemo(() => {
    return [
      'All Activity',
      'Highest Hours', 
      'Lowest Hours',
      'Pending Approval',
    ];
  }, []);

  const organizations = useMemo(() => {
    return Array.from(new Set(
      allLogs
        .map(log => log.organization_name)
        .filter(Boolean)
    )).sort();
  }, [allLogs]);

  const isPersonalLog = (log: any) => {
    if (log?.is_personal) return true;
    const orgId = String(log?.organization_id || log?.org_id || log?.organizationId || '').toLowerCase();
    const orgName = String(log?.organization_name || log?.org_name || log?.organization || '').toLowerCase();
    return orgId.startsWith('personal-') || orgName === 'personal';
  };

  const isPendingLog = (log: any) => {
    if (isPersonalLog(log)) return false;
    const raw = String(log?.approve || log?.status || '').toLowerCase().trim();
    if (!raw) return true;
    if (raw === 'accepted' || raw === 'approved' || raw === 'verified') return false;
    if (raw.startsWith('approved') || raw.includes('approved by')) return false;
    if (['declined', 'rejected', 'denied', 'canceled', 'cancelled', 'revoked'].some((token) => raw.includes(token))) {
      return false;
    }
    return ['pending', 'requested', 'awaiting', 'request', 'approval', 'needs approval'].some((token) => raw.includes(token));
  };

  const filteredLogs = useMemo(() => {
    let logs = [...allLogs];

    // 1. Search Filter
    if (searchQuery) {
      logs = logs.filter(log => {
        const name = String(log.activity_name || log.site || '').toLowerCase();
        const location = String(log.location || log.organization_name || '').toLowerCase();
        const query = searchQuery.toLowerCase();
        return name.includes(query) || location.includes(query);
      });
    }

    // 2. Category/Sort Filter
    switch (activeFilter) {
      case 'All Activity':
        break; // Default sort is date descending (from hook)
      case 'Highest Hours':
        logs.sort((a, b) => (Number(b.hours_contributed || 0) - Number(a.hours_contributed || 0)));
        break;
      case 'Lowest Hours':
        logs.sort((a, b) => (Number(a.hours_contributed || 0) - Number(b.hours_contributed || 0)));
        break;
      case 'Pending Approval':
        logs = logs.filter((log) => isPendingLog(log));
        break;
      default: 
        // Assume it's an Organization Name
        logs = logs.filter(log => log.organization_name === activeFilter);
        break;
    }

    return logs;
  }, [allLogs, searchQuery, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useMemo(() => {
    setPage(1);
  }, [searchQuery, activeFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-lime-300 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Loading activity...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full flex flex-col gap-8 mt-8 pb-10"
    >
      <div className="flex flex-col gap-6">

         {/* Search and Filter Bar */}
         <div className="flex justify-start">
            <div className="flex gap-3 w-full md:w-auto">
              {/* Search Bar */}
              <div className="relative flex-1 md:w-72 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-lime-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search activity..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 bg-white rounded-2xl border-none shadow-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-lime-300 outline-none transition-all"
                />
              </div>

              {/* Filter Button & Dropdown */}
              <div className="relative z-50">
                <button
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm transition-all border border-transparent ${showFilterMenu ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                >
                  <Filter className="w-5 h-5" />
                </button>

                <AnimatePresence>
                  {showFilterMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40 bg-transparent"
                        onClick={() => {
                          setShowFilterMenu(false);
                          setHoveringOrganizations(false); // Close submenu on main menu close
                        }}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-14 left-0 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50"
                      >
                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Filter By</div>
                        {filters.map((f) => (
                          <button
                            key={f}
                            onClick={() => {
                              setActiveFilter(f);
                              setShowFilterMenu(false);
                              setHoveringOrganizations(false); // Close submenu on filter select
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                              activeFilter === f
                                ? 'bg-gray-50 text-gray-900'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            <span className="truncate">{f}</span>
                            {activeFilter === f && <Check className="w-4 h-4 text-lime-600 shrink-0" />}
                          </button>
                        ))}
                        
                        {/* Organizations Nested Menu */}
                        {organizations.length > 0 && (
                          <div 
                            className="relative group"
                            onMouseEnter={() => setHoveringOrganizations(true)}
                            onMouseLeave={() => setHoveringOrganizations(false)}
                          >
                            <button
                              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between text-gray-600 hover:bg-gray-50 hover:text-gray-900`}
                            >
                              <span>Organizations</span>
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </button>

                            {/* Sub-menu */}
                            <div className="absolute left-full top-0 ml-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 hidden group-hover:block">
                              <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Organization</div>
                              <div className="max-h-[300px] overflow-y-auto">
                                {organizations.map((org) => (
                                  <button
                                    key={org}
                                    onClick={() => {
                                      setActiveFilter(org);
                                      setShowFilterMenu(false);
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                                      activeFilter === org
                                        ? 'bg-gray-50 text-gray-900'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }`}
                                  >
                                    <span className="truncate">{org === 'Personal' ? 'Self-Logged' : org}</span>
                                    {activeFilter === org && <Check className="w-4 h-4 text-lime-600 shrink-0" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
         </div>

         <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100/50 flex flex-col min-h-[500px]">
           <RecentActivityTable logs={pagedLogs} />
           
           <div className="pt-6 mt-auto border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Showing {pagedLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:hover:bg-white"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-4 py-2 bg-gray-900 rounded-xl text-xs font-bold text-white shadow-lg shadow-gray-900/10 hover:bg-black transition-colors disabled:opacity-50 disabled:hover:bg-gray-900"
                >
                  Next
                </button>
              </div>
           </div>
         </div>
      </div>
    </motion.div>
  );
};
