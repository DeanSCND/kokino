import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info
};

const COLORS = {
  success: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-400',
    icon: 'text-green-500'
  },
  error: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    icon: 'text-red-500'
  },
  warning: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    icon: 'text-yellow-500'
  },
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    icon: 'text-blue-500'
  }
};

export const Toast = ({ message, type = 'info', onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const Icon = ICONS[type];
  const colors = COLORS[type];

  useEffect(() => {
    // Trigger enter animation
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 150);
    }, 150);
  };

  return (
    <div
      className={`
        pointer-events-auto
        flex items-start gap-3 p-4
        ${colors.bg} border ${colors.border} rounded-lg
        shadow-lg backdrop-blur-sm
        min-w-[300px] max-w-[500px]
        transition-all duration-300 ease-out
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
      role="alert"
    >
      <Icon size={20} className={`${colors.icon} flex-shrink-0 mt-0.5`} />
      <p className={`text-sm ${colors.text} flex-1`}>{message}</p>
      <button
        onClick={handleClose}
        className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
        aria-label="Close notification"
      >
        <X size={16} className="text-text-secondary" />
      </button>
    </div>
  );
};
