import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  isVisible: boolean;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
          className="fixed bottom-12 right-12 z-[10001] flex items-center gap-4 bg-white px-8 py-5 rounded-[2.5rem] shadow-[0_30px_70px_rgba(0,0,0,0.15)] border border-gray-100 min-w-[320px]"
        >
          <div className={`p-2 rounded-full ${type === 'success' ? 'bg-lime-100 text-lime-600' : 'bg-red-100 text-red-600'}`}>
            {type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
          </div>
          <p className="text-gray-900 font-[900] text-lg uppercase tracking-tight italic">
            {message}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
