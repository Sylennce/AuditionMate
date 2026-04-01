import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

const DEFAULT_TOAST_MS = 1200;

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, DEFAULT_TOAST_MS);
    return () => clearTimeout(timer);
  }, [onClose, message]); // Message dependency ensures timer restarts if message changes, but usually id is better if available.

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      className={`fixed bottom-36 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl border backdrop-blur-md ${
        type === 'success'
          ? 'bg-emerald-600/90 border-emerald-500 text-white'
          : type === 'error'
          ? 'bg-red-600/90 border-red-500 text-white'
          : 'bg-zinc-800/90 border-zinc-700 text-white'
      }`}
    >
      {type === 'success' ? <CheckCircle size={18} /> : type === 'error' ? <AlertCircle size={18} /> : <AlertCircle size={18} className="text-zinc-400" />}
      <span className="text-sm font-bold tracking-tight overflow-hidden text-ellipsis whitespace-nowrap max-w-[70vw]">
        {message}
      </span>
      <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
        <X size={14} />
      </button>
    </motion.div>
  );
};

export const ToastContainer: React.FC<{ toasts: { id: string; message: string; type: ToastType }[]; onRemove: (id: string) => void }> = ({ toasts, onRemove }) => {
  return (
    <AnimatePresence>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </AnimatePresence>
  );
};
