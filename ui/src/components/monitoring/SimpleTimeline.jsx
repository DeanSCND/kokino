import React, { useState, useEffect } from 'react';
import { useObservabilityStore } from '../../stores';

const BROKER_URL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';

export const SimpleTimeline = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Get timeRange from store
  const { timeRange } = useObservabilityStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Use timeRange from store or default to 24 hours
        const from = timeRange?.[0] || new Date(Date.now() - 86400000).toISOString();
        const to = timeRange?.[1] || new Date().toISOString();
        const response = await fetch(`${BROKER_URL}/api/monitoring/timeline?from=${from}&to=${to}&limit=100`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setEntries(data.entries || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
  if (entries.length === 0) return <div className="p-4">No entries</div>;

  return (
    <div className="h-full overflow-auto bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-bold mb-4">Simple Timeline ({entries.length} entries)</h2>
      <div className="space-y-4">
        {entries.map((entry, index) => (
          <div key={entry.id || index} className="border-b pb-2">
            <div className="flex gap-4 text-sm">
              <span className="font-medium">{entry.agent_id}</span>
              <span className="text-gray-500">{entry.type}</span>
              <span className="text-gray-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="text-sm mt-1 text-gray-700">
              {entry.content?.substring(0, 100)}...
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};