import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { motion } from 'framer-motion';
import type { ChartPoint } from '../lib/metrics';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const DOT_RADIUS = 5;

// Custom shape for the empty state (no data)
const renderEmptyState = (x: number, y: number, width: number) => {
    const emptyHeight = 240; 
    const drawY = y - emptyHeight;
    const cx = x + width / 2;
    const dotY = drawY + 20;

    return (
        <g>
            <rect 
                x={x} 
                y={drawY} 
                width={width} 
                height={emptyHeight} 
                fill="transparent"
                stroke="rgba(156, 163, 175, 0.3)"
                strokeWidth={2}
                strokeDasharray="6 4"
                rx={width / 2} 
                ry={width / 2} 
            />
            <circle 
                cx={cx} 
                cy={dotY} 
                r={DOT_RADIUS} 
                fill="#9CA3AF" 
            />
        </g>
    );
};

// Custom shape that draws overlapping bars, striped pattern, or empty state
const UnifiedBarRenderer = (props: any) => {
    const { x, y, width, height, payload } = props;
    
    if (!payload) return null;

    const { scoreHours, scoreVolunteers, realHours, realVolunteers } = payload;
    
    // Handle Empty State
    if (realHours === 0 && realVolunteers === 0) {
        return renderEmptyState(x, y + height, width);
    }

    const baseline = y + height;
    const fullHeight = height;
    const hoursHeight = (scoreHours / 100) * fullHeight;
    const volunteersHeight = (scoreVolunteers / 100) * fullHeight;
    
    const cx = x + width / 2;
    const isMatched = realHours > 0 && realHours === realVolunteers;

    return (
        <g>
            {isMatched ? (
                // Diagonal Split (Top Green, Bottom Black)
                <g>
                    <rect 
                        x={x} 
                        y={baseline - hoursHeight} 
                        width={width} 
                        height={hoursHeight} 
                        fill="url(#diagonal-split-gradient)" 
                        rx={width / 2} 
                        ry={width / 2} 
                    />
                    <circle 
                        cx={cx} 
                        cy={baseline - hoursHeight + 15} 
                        r={DOT_RADIUS} 
                        fill="#111827" 
                    />
                </g>
            ) : (
                // Overlapping Case
                <g>
                    {hoursHeight >= volunteersHeight ? (
                        <>
                            {/* Hours - Lime Bar (Background - taller or equal) */}
                            {scoreHours > 0 && (
                                <g>
                                    <rect 
                                        x={x} 
                                        y={baseline - hoursHeight} 
                                        width={width} 
                                        height={hoursHeight} 
                                        fill="#D2F677" 
                                        rx={width / 2} 
                                        ry={width / 2} 
                                    />
                                    <circle 
                                        cx={cx} 
                                        cy={baseline - hoursHeight + 15} 
                                        r={DOT_RADIUS} 
                                        fill="#111827" 
                                    />
                                </g>
                            )}
                            {/* Volunteers - Black Bar (Foreground - shorter) */}
                            {scoreVolunteers > 0 && (
                                <g>
                                    <rect 
                                        x={x + (width * 0.075)} 
                                        y={baseline - volunteersHeight} 
                                        width={width * 0.85} 
                                        height={volunteersHeight} 
                                        fill="#111827" 
                                        rx={(width * 0.85) / 2} 
                                        ry={(width * 0.85) / 2} 
                                    />
                                    <circle 
                                        cx={cx} 
                                        cy={baseline - volunteersHeight + 15} 
                                        r={DOT_RADIUS} 
                                        fill="#FFFFFF" 
                                    />
                                </g>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Volunteers - Black Bar (Background - taller) */}
                            {scoreVolunteers > 0 && (
                                <g>
                                    <rect 
                                        x={x} 
                                        y={baseline - volunteersHeight} 
                                        width={width} 
                                        height={volunteersHeight} 
                                        fill="#111827" 
                                        rx={width / 2} 
                                        ry={width / 2} 
                                    />
                                    <circle 
                                        cx={cx} 
                                        cy={baseline - volunteersHeight + 15} 
                                        r={DOT_RADIUS} 
                                        fill="#FFFFFF" 
                                    />
                                </g>
                            )}
                            {/* Hours - Lime Bar (Foreground - shorter) */}
                            {scoreHours > 0 && (
                                <g>
                                    <rect 
                                        x={x + (width * 0.075)} 
                                        y={baseline - hoursHeight} 
                                        width={width * 0.85} 
                                        height={hoursHeight} 
                                        fill="#D2F677" 
                                        rx={(width * 0.85) / 2} 
                                        ry={(width * 0.85) / 2} 
                                    />
                                    <circle 
                                        cx={cx} 
                                        cy={baseline - hoursHeight + 15} 
                                        r={DOT_RADIUS} 
                                        fill="#111827" 
                                    />
                                </g>
                            )}
                        </>
                    )}
                </g>
            )}
        </g>
    );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-4 rounded-2xl shadow-xl border border-gray-100 min-w-[160px]">
        <p className="mb-3 text-gray-500 text-xs font-bold uppercase tracking-wider">{label}</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-900"/>
                <span className="text-sm font-medium text-gray-600">Volunteers</span>
             </div>
             <span className="font-bold text-gray-900">{data.realVolunteers.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-lime-300"/>
                <span className="text-sm font-medium text-gray-600">Hours</span>
             </div>
             <span className="font-bold text-gray-900">{data.realHours.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

type AnalyticsChartProps = {
  weeklyData: ChartPoint[];
  monthlyData: ChartPoint[];
  yearlyData: ChartPoint[];
  weekOffset?: number;
  onWeekOffsetChange?: (value: number) => void;
};

export const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
  weeklyData,
  monthlyData,
  yearlyData,
  weekOffset = 0,
  onWeekOffsetChange,
}) => {
  const [activeTab, setActiveTab] = useState<'Weekly' | 'Monthly' | 'Yearly'>('Weekly');

  const weekRangeLabel = useMemo(() => {
    if (activeTab !== 'Weekly') return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const start = new Date(today);
    start.setDate(start.getDate() - day + weekOffset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const displayStart = new Date(start);
    displayStart.setDate(displayStart.getDate() - 1);
    const format = (d: Date) =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${format(displayStart)} - ${format(end)}`;
  }, [activeTab, weekOffset]);

  const data = useMemo(() => {
    switch (activeTab) {
      case 'Weekly': return weeklyData;
      case 'Monthly': return monthlyData;
      case 'Yearly': return yearlyData;
      default: return weeklyData;
    }
  }, [activeTab, weeklyData, monthlyData, yearlyData]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-8">
            <h2 className="text-3xl font-medium text-gray-900 tracking-tight">Statistics</h2>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-900 border-2 border-gray-900"></div>
                    <span className="text-gray-600">Volunteers</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-lime-300 border border-gray-200"></div>
                    <span className="text-gray-600">Hours Logged</span>
                </div>
            </div>
            {activeTab === 'Weekly' && (
              <div className="flex items-center gap-2 ml-2">
                <button
                  type="button"
                  onClick={() => onWeekOffsetChange?.(weekOffset - 1)}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                  aria-label="Previous week"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onWeekOffsetChange?.(Math.min(0, weekOffset + 1))}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-40"
                  aria-label="Next week"
                  disabled={weekOffset >= 0}
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-gray-500 ml-2">{weekRangeLabel}</span>
              </div>
            )}
        </div>
        
        {/* View Switcher */}
        <div className="bg-gray-100 p-1 rounded-2xl flex items-center self-start sm:self-auto">
          {['Weekly', 'Monthly', 'Yearly'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`
                relative px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 z-10
                ${activeTab === tab ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}
              `}
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="activeChartTab"
                  className="absolute inset-0 bg-white rounded-xl shadow-sm -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 20, right: 0, left: 0, bottom: 30 }}
              barSize={activeTab === 'Monthly' ? 32 : 48}
            >
              <defs>
                <linearGradient id="diagonal-split-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="50%" stopColor="#D2F677" />
                  <stop offset="50%" stopColor="#111827" />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 13, fontWeight: 600 }} 
                  dy={15}
                  interval={0}
              />
              <YAxis hide domain={[0, 110]} />
              
              <Tooltip 
                  cursor={{ fill: '#F3F4F6', opacity: 0.5, radius: 24 }}
                  content={<CustomTooltip />}
              />
              
              {/* Single Consolidated Bar for Center Aligment */}
              <Bar 
                  dataKey={() => 100} 
                  shape={<UnifiedBarRenderer />} 
                  animationDuration={1000}
              />

            </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
