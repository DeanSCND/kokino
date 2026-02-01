import React, { useState, useEffect } from 'react';

export const SimpleTimeline = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://127.0.0.1:5050/api/monitoring/timeline?from=2026-01-30&to=2026-02-01&limit=100');
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