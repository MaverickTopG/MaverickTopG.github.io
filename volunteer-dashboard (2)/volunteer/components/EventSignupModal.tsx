import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, MapPin, Clock } from 'lucide-react';

type ShiftOption = {
  id?: string;
  startTime?: string;
  endTime?: string;
};

interface EventSignupModalProps {
  event: any;
  onClose: () => void;
  onConfirm: (selection: { selectedDates: string[]; selectedShifts: ShiftOption[] }) => void;
  loading: boolean;
}

export const EventSignupModal: React.FC<EventSignupModalProps> = ({ event, onClose, onConfirm, loading }) => {
  if (!event) return null;

  const parseLocalDate = (value?: string) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatDateLabel = (value?: string) => {
    const date = parseLocalDate(value);
    if (!date) return 'Date TBA';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTimeRange = (start?: string, end?: string) => {
    if (!start && !end) return 'Time TBA';
    const toTime = (t?: string) => {
      if (!t) return '';
      const [h, m] = t.split(':');
      const hours = Number(h);
      if (Number.isNaN(hours)) return t;
      const date = new Date();
      date.setHours(hours, Number(m || 0), 0, 0);
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };
    if (!end) return toTime(start);
    return `${toTime(start)} - ${toTime(end)}`;
  };

  const formatLocation = () => {
    if (event.location) return event.location;
    return [event.venue, event.addressLine1, [event.city, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' • ');
  };

  const dateOptions = useMemo(() => {
    const start = parseLocalDate(event.startDate);
    const end = parseLocalDate(event.endDate || event.startDate);
    if (!start || !end) return [];
    const days: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const year = cursor.getFullYear();
      const month = String(cursor.getMonth() + 1).padStart(2, '0');
      const day = String(cursor.getDate()).padStart(2, '0');
      days.push(`${year}-${month}-${day}`);
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [event.endDate, event.startDate]);

  const shiftOptions = useMemo(() => {
    const shifts = Array.isArray(event.shifts) ? event.shifts : [];
    return shifts.map((shift: ShiftOption, index: number) => ({
      key: shift.id || `${shift.startTime || 'shift'}-${shift.endTime || ''}-${index}`,
      shift,
    }));
  }, [event.shifts]);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedShiftKeys, setSelectedShiftKeys] = useState<string[]>([]);

  useEffect(() => {
    setSelectedDates([]);
    if (shiftOptions.length === 1) {
      setSelectedShiftKeys([shiftOptions[0].key]);
    } else {
      setSelectedShiftKeys([]);
    }
  }, [event.id, shiftOptions]);

  const requiresDateSelection = dateOptions.length > 1;
  const requiresShiftSelection = shiftOptions.length > 0;
  const canConfirm =
    (!requiresDateSelection || selectedDates.length > 0) &&
    (!requiresShiftSelection || selectedShiftKeys.length > 0) &&
    !loading;

  const selectedShifts = shiftOptions
    .filter((option) => selectedShiftKeys.includes(option.key))
    .map((option) => option.shift);

  const displayDate = (() => {
    if (requiresDateSelection) {
      if (selectedDates.length === 1) return formatDateLabel(selectedDates[0]);
      if (selectedDates.length > 1) return `${selectedDates.length} days selected`;
      return `${formatDateLabel(event.startDate)} - ${formatDateLabel(event.endDate || event.startDate)}`;
    }
    return formatDateLabel(event.startDate);
  })();

  const displayTime = (() => {
    if (shiftOptions.length > 1) {
      if (selectedShiftKeys.length === 1) {
        const single = selectedShifts[0];
        return formatTimeRange(single?.startTime, single?.endTime);
      }
      if (selectedShiftKeys.length > 1) return `${selectedShiftKeys.length} shifts selected`;
      return 'Select shift(s)';
    }
    if (shiftOptions.length === 1) {
      const single = shiftOptions[0].shift;
      return formatTimeRange(single?.startTime, single?.endTime);
    }
    return formatTimeRange(event.startTime, event.endTime);
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-[2.5rem] w-full max-w-lg relative shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-8 pb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Confirm Registration</h3>
            <p className="text-gray-500 mt-1">You are about to reserve a spot for:</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-8 space-y-4">
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
             <h4 className="font-bold text-gray-900 text-lg mb-4">{event.title}</h4>
             
             <div className="space-y-3">
             <div className="flex items-start gap-3">
                 <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                 <div>
                   <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Date</span>
                   <span className="font-semibold text-gray-900">{displayDate}</span>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                 <div>
                   <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Time</span>
                   <span className="font-semibold text-gray-900">{displayTime}</span>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                 <div>
                   <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Location</span>
                   <span className="font-semibold text-gray-900">
                     {formatLocation() || 'Remote / TBA'}
                   </span>
                 </div>
               </div>
             </div>
          </div>

          {(requiresDateSelection || requiresShiftSelection) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
              {requiresDateSelection && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Select Day(s)</span>
                    <span className="text-[10px] font-bold text-gray-400">{selectedDates.length} selected</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dateOptions.map((date) => {
                      const isSelected = selectedDates.includes(date);
                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => {
                            setSelectedDates((prev) =>
                              isSelected ? prev.filter((d) => d !== date) : [...prev, date]
                            );
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                            isSelected
                              ? 'bg-lime-100 text-lime-700 border-lime-200 shadow-sm'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                          }`}
                          aria-pressed={isSelected}
                        >
                          {formatDateLabel(date)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {requiresShiftSelection && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Select Shift(s)</span>
                    <span className="text-[10px] font-bold text-gray-400">{selectedShiftKeys.length} selected</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {shiftOptions.map((option) => {
                      const label = formatTimeRange(option.shift?.startTime, option.shift?.endTime);
                      const isSelected = selectedShiftKeys.includes(option.key);
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => {
                            setSelectedShiftKeys((prev) =>
                              isSelected ? prev.filter((key) => key !== option.key) : [...prev, option.key]
                            );
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                            isSelected
                              ? 'bg-lime-100 text-lime-700 border-lime-200 shadow-sm'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                          }`}
                          aria-pressed={isSelected}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <p className="text-sm text-center text-gray-500 px-4">
            By confirming, you agree to attend this event. You can cancel later if plans change.
          </p>
        </div>

        <div className="p-8 pt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const resolvedDates = requiresDateSelection
                ? selectedDates
                : event.startDate
                  ? [event.startDate]
                  : [];
              onConfirm({ selectedDates: resolvedDates, selectedShifts });
            }}
            disabled={!canConfirm}
            className="flex-1 py-4 bg-lime-400 hover:bg-lime-500 text-lime-950 rounded-xl font-bold shadow-lg shadow-lime-400/20 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-lime-900/30 border-t-lime-900 rounded-full animate-spin" />
            ) : (
              'Reserve Spot'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
