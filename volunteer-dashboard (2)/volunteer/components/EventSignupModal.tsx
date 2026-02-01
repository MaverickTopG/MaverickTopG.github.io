import React from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, MapPin, Clock } from 'lucide-react';

interface EventSignupModalProps {
  event: any;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export const EventSignupModal: React.FC<EventSignupModalProps> = ({ event, onClose, onConfirm, loading }) => {
  if (!event) return null;

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
                   <span className="font-semibold text-gray-900">{new Date(event.startDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                 <div>
                   <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Time</span>
                   <span className="font-semibold text-gray-900">
                     {event.startTime && event.endTime 
                       ? `${new Date(`2000-01-01T${event.startTime}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${new Date(`2000-01-01T${event.endTime}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` 
                       : 'Time TBA'}
                   </span>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                 <div>
                   <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Location</span>
                   <span className="font-semibold text-gray-900">
                     {[event.venue, event.addressLine1, event.city].filter(Boolean).join(', ') || 'Remote / TBA'}
                   </span>
                 </div>
               </div>
             </div>
          </div>
          
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
            onClick={onConfirm}
            disabled={loading}
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
