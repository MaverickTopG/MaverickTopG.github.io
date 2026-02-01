import React from 'react';
import { motion } from 'framer-motion';
import { Clock, CheckCircle2, AlertCircle, MapPin } from 'lucide-react';

interface RecentActivityTableProps {
  logs: any[];
}

export const RecentActivityTable: React.FC<RecentActivityTableProps> = ({ logs }) => {
  return (
    <div className="flex flex-col gap-6">


      <div className="overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100 pb-4">
              <th className="pb-4 font-black">Mission / Task</th>
              <th className="pb-4 font-black text-center">Hours</th>
              <th className="pb-4 font-black text-center">Status</th>
              <th className="pb-4 font-black text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-gray-400 font-medium">
                  No recent activity found. Start by logging a mission!
                </td>
              </tr>
            ) : (
              logs.map((log, idx) => (
                <motion.tr 
                  key={log.id || idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group hover:bg-gray-50/50 transition-colors"
                >
                  <td className="py-5">
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-900 group-hover:text-black transition-colors">
                        {log.site || log.volunteering_task || 'Service Activity'}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3 h-3 text-gray-300" />
                        <span className="text-xs text-gray-400 font-medium">
                          {(!log.organization_name || log.organization_name === 'Personal') ? 'Self-Logged' : log.organization_name}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-5 text-center">
                    <span className="inline-flex items-center px-3 py-1 bg-gray-100 rounded-full text-sm font-bold text-gray-700 group-hover:bg-lime-100 group-hover:text-lime-700 transition-all">
                      {log.hours_contributed || log.hours || 0}h
                    </span>
                  </td>
                  <td className="py-5">
                    <div className="flex justify-center">
                      {(!log.organization_name || log.organization_name === 'Personal') ? (
                         <div className="flex items-center gap-1.5 text-gray-500" title="Self-Logged">
                           <CheckCircle2 className="w-4 h-4" />
                           <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">Self-Logged</span>
                         </div>
                      ) : log.approve === 'accepted' || log.status === 'approved' ? (
                        <div className="flex items-center gap-1.5 text-green-600" title="Accepted">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">Verified</span>
                        </div>
                      ) : log.approve === 'rejected' || log.status === 'denied' ? (
                        <div className="flex items-center gap-1.5 text-red-500" title="Rejected">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">Rejected</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-500" title="Pending">
                          <Clock className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">Pending</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-5 text-right font-medium text-gray-500 text-sm whitespace-nowrap">
                    {new Date(log.date || log.created_at).toLocaleDateString('en-US', {
                      month: 'numeric',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
