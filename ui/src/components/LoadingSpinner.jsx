import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({ size = 20, className = '' }) => {
  return (
    <Loader2
      size={size}
      className={`animate-spin text-accent-purple ${className}`}
      aria-label="Loading"
    />
  );
};

export const LoadingOverlay = ({ message = 'Loading...' }) => {
  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-50">
      <LoadingSpinner size={32} />
      <p className="text-sm text-text-secondary">{message}</p>
    </div>
  );
};

export const LoadingState = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <LoadingSpinner size={32} />
      <p className="text-sm text-text-secondary">{message}</p>
    </div>
  );
};
