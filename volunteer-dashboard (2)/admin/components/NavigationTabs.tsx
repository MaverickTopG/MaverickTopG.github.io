import React, { useState } from 'react';
import { motion } from 'framer-motion';

export const NavigationTabs: React.FC = () => {
  const tabs = [
    'Organization',
    'Volunteers',
    'Events',
    'Impact Reports',
    'Donations',
    'Integrations',
    'Settings',
  ];

  const [activeTab, setActiveTab] = useState('Organization');

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`
            relative px-6 py-3 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 z-10
            ${activeTab === tab 
              ? 'text-white' 
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-transparent hover:border-gray-200'
            }
          `}
        >
          {activeTab === tab && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-[#161618] rounded-full -z-10 shadow-md"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          {tab}
        </button>
      ))}
    </div>
  );
};