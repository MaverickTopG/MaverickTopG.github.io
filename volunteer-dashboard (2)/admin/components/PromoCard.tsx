import React from 'react';
import { motion } from 'framer-motion';

type VolunteerEntry = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  totalHours?: number;
};

type PromoCardProps = {
  volunteers: VolunteerEntry[];
  monthLabel?: string;
};

const getVolunteerName = (volunteer: VolunteerEntry) => {
  const first = (volunteer.firstName || '').trim();
  const last = (volunteer.lastName || '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  return (volunteer.email || 'Volunteer').trim();
};

export const PromoCard: React.FC<PromoCardProps> = ({ volunteers, monthLabel }) => {
  const ranked = volunteers.map((volunteer, index) => ({
    rank: index + 1,
    name: getVolunteerName(volunteer),
    hours: volunteer.totalHours || 0,
  }));

  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="relative h-64 rounded-[2.5rem] bg-white p-6 flex flex-col shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-semibold text-lg text-gray-900 tracking-tight">Top Volunteers</h3>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-0.5">
            {(monthLabel || 'Monthly').toUpperCase()}
          </p>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 flex flex-col justify-between py-1">
        {ranked.length === 0 ? (
          <div className="text-sm text-gray-500 font-medium">No volunteer activity yet.</div>
        ) : ranked.map((v, i) => (
          <div key={i} className="flex items-center justify-between group cursor-default">
            <div className="flex items-center gap-4">
              {/* Rank Badge */}
              <div className={`
                 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                 ${v.rank === 1 ? 'bg-lime-300 text-gray-900' : 'bg-gray-100 text-gray-500'}
              `}>
                 #{v.rank}
              </div>
              <span className="font-semibold text-gray-900 text-base group-hover:text-lime-600 transition-colors">{v.name}</span>
            </div>
            
            <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                <span className="font-bold text-gray-900 text-sm">{v.hours.toFixed(1)}</span>
                <span className="text-[10px] text-gray-500 font-medium ml-1">hrs</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
