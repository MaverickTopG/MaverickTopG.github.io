import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface StatsCardProps {
  title: string;
  value: string;
  total: string;
  percentage: number;
  color: 'white' | 'lime';
  icon: React.ReactNode;
  trend?: number[];
  showTotal?: boolean;
  showMenuDots?: boolean;
}

export const StatsCard: React.FC<StatsCardProps> = ({ 
  title, 
  value, 
  total, 
  percentage, 
  color,
  icon,
  trend = [],
  showTotal = true,
  showMenuDots = false
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const isLime = color === 'lime';
  // Use a fixed set of 7 blobs with specific styles as requested
  const BLOB_COUNT = 7;
  const normalizedTrend = trend.slice(-BLOB_COUNT);
  const maxTrend = Math.max(...normalizedTrend, 0);

  return (
    <motion.div 
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`
      relative p-6 rounded-[2.5rem] flex flex-col justify-between h-64 shadow-sm
      ${isLime ? 'bg-lime-300' : 'bg-white'}
    `}>
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          {/* Icon Container */}
          <div className={`w-12 h-12 flex items-center justify-center rounded-2xl border ${isLime ? 'bg-white/40 border-white/20' : 'bg-gray-50 border-gray-100'}`}>
            {icon}
          </div>
          <span className="font-medium text-lg text-gray-900 tracking-tight">{title}</span>
        </div>
        {showMenuDots ? (
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isLime ? 'bg-black/10' : 'bg-gray-100'
            }`}
          >
            <div className="flex flex-col gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isLime ? 'bg-gray-900/70' : 'bg-gray-400'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isLime ? 'bg-gray-900/70' : 'bg-gray-400'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isLime ? 'bg-gray-900/70' : 'bg-gray-400'}`} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Main Metric */}
      <div className="mt-2 text-left w-full">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-medium tracking-tight text-gray-900">{value}</span>
          {showTotal && total ? (
            <span className="text-lg text-gray-400 font-medium tracking-tight">/ {total}</span>
          ) : null}
        </div>
        
        {/* Floating badge */}
        <div className={`
            inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold mt-3
            ${isLime ? 'bg-gray-900 text-white' : 'bg-lime-300 text-gray-900'}
        `}>
             <span>{percentage}%</span>
             <div className={`w-2 h-2 rounded-full ${isLime ? 'bg-lime-300' : 'bg-gray-900'}`}></div>
        </div>
      </div>

      {/* Visual Bars */}
      <div className="flex items-end justify-center gap-2 w-full h-16 mt-4 relative">
          {Array.from({ length: BLOB_COUNT }).map((_, i) => {
            const val = normalizedTrend[i] || 0;
            const ratio = maxTrend ? val / maxTrend : 0;
            
            // Define base colors and dynamic colors based on value
            const minOpacity = 0.15;
            const maxOpacity = 0.85;
            const currentOpacity = minOpacity + ratio * (maxOpacity - minOpacity);
            
            const dynamicColor = isLime 
              ? `rgba(17, 24, 39, ${currentOpacity})` 
              : `rgba(17, 24, 39, ${currentOpacity - 0.1})`;

            let style: React.CSSProperties = {
              backgroundColor: dynamicColor,
              borderRadius: '9999px',
              transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            };

            // Calculate height dynamically. Tallest blob is ~56px
            const minH = 16;
            const maxH = 56;
            const dynamicHeight = minH + ratio * (maxH - minH);
            let finalHeight = dynamicHeight;

            switch(i) {
              case 0: // horizontal pill
                style.width = '32px';
                finalHeight = Math.max(16, dynamicHeight * 0.4);
                break;
              case 1: // vertical pill
                style.width = '36px';
                finalHeight = dynamicHeight * 0.9;
                break;
              case 2: // circle/pill
                style.width = '36px';
                finalHeight = dynamicHeight * 0.75;
                break;
              case 3: // horizontal pill
                style.width = '32px';
                finalHeight = Math.max(16, dynamicHeight * 0.45);
                break;
              case 4: // tall vertical pill
                style.width = '36px';
                finalHeight = dynamicHeight;
                break;
              case 5: // circle/pill
                style.width = '36px';
                finalHeight = dynamicHeight * 0.8;
                break;
              case 6: // dashed vertical pill (Current Day)
                style.width = '38px';
                finalHeight = dynamicHeight * 1.05;
                style.backgroundColor = 'transparent';
                style.border = `2px dashed ${dynamicColor}`;
                break;
            }

            style.height = `${finalHeight}px`;

            return (
              <div 
                key={i} 
                className="flex items-center justify-center relative"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <AnimatePresence>
                  {hoveredIndex === i && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: -finalHeight - 12, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      className="absolute bottom-0 z-50 bg-white px-3 py-1.5 rounded-xl shadow-xl border border-gray-100 whitespace-nowrap mb-2 pointer-events-none"
                    >
                      <span className="text-sm font-bold text-gray-900">
                        {val.toLocaleString()} {title.toLowerCase().includes('volunteers') ? 'volunteers' : 'hrs'}
                      </span>
                      {/* Tooltip triangle */}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-r border-b border-gray-100 rotate-45" />
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: style.height, opacity: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.5 }}
                  style={style}
                  className="cursor-default"
                />
              </div>
            );
          })}
      </div>
    </motion.div>
  );
};
