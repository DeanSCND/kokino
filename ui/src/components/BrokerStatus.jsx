import React from 'react';
import { Wifi, WifiOff, Loader2, AlertTriangle } from 'lucide-react';
import { useBrokerHealth } from '../hooks/useBrokerHealth';

export const BrokerStatus = ({ className = '' }) => {
  const { isConnected, lastCheck, error } = useBrokerHealth(5000);

  const getStatusIcon = () => {
    if (isConnected === null) {
      return <Loader2 size={14} className="animate-spin text-text-muted" />;
    }
    if (isConnected) {
      return <Wifi size={14} className="text-green-500" />;
    }
    return <WifiOff size={14} className="text-red-500" />;
  };

  const getStatusText = () => {
    if (isConnected === null) return 'Checking broker...';
    if (isConnected) return 'Broker connected';
    return 'Broker offline';
  };

  const getStatusColor = () => {
    if (isConnected === null) return 'bg-gray-500/20 border-gray-500/30';
    if (isConnected) return 'bg-green-500/20 border-green-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getStatusColor()} ${className}`}
      title={error || (lastCheck ? `Last check: ${lastCheck.toLocaleTimeString()}` : 'Connecting...')}
    >
      {getStatusIcon()}
      <span className="text-xs font-medium text-text-primary">{getStatusText()}</span>
      {!isConnected && error && (
        <AlertTriangle size={12} className="text-red-400" title={error} />
      )}
    </div>
  );
};
