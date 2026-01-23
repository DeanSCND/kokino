import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export const ServiceStatus = ({ serviceName, checkUrl, interval = 5000 }) => {
  const [status, setStatus] = useState('checking');
  const [lastCheck, setLastCheck] = useState(null);

  const checkStatus = async () => {
    try {
      const response = await fetch(checkUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });

      if (response.ok) {
        setStatus('healthy');
      } else {
        setStatus('unhealthy');
      }
    } catch (error) {
      setStatus('unavailable');
    } finally {
      setLastCheck(new Date());
    }
  };

  useEffect(() => {
    checkStatus();
    const timer = setInterval(checkStatus, interval);
    return () => clearInterval(timer);
  }, [checkUrl, interval]);

  const getStatusIcon = () => {
    switch (status) {
      case 'healthy':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'unhealthy':
        return <AlertTriangle size={14} className="text-yellow-500" />;
      case 'unavailable':
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <RefreshCw size={14} className="text-text-secondary animate-spin" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'healthy':
        return 'Online';
      case 'unhealthy':
        return 'Degraded';
      case 'unavailable':
        return 'Offline';
      default:
        return 'Checking...';
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg">
      {getStatusIcon()}
      <span className="text-xs text-text-secondary">
        {serviceName}: {getStatusText()}
      </span>
    </div>
  );
};

export const ServiceStatusBanner = ({ brokerAvailable, githubAvailable }) => {
  if (brokerAvailable && githubAvailable) {
    return null; // All services healthy
  }

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-3">
      <div className="flex items-start gap-3 max-w-screen-xl mx-auto">
        <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-yellow-400">Service Degradation</h3>
          <ul className="mt-1 text-xs text-yellow-400/80 space-y-1">
            {!brokerAvailable && (
              <li>• Message broker is offline - Real-time features unavailable</li>
            )}
            {!githubAvailable && (
              <li>• GitHub integration unavailable - Using cached data</li>
            )}
          </ul>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-yellow-400 hover:text-yellow-300 underline"
        >
          Retry
        </button>
      </div>
    </div>
  );
};
