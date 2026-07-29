import { useState, useEffect } from 'react';

export default function EngineBar({ stats, isConnected = false }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const uptime = '7d 14h 32m';
  const memUsage = '342MB';

  return (
    <div className="engine-bar">
      <div className="engine-bar__left">
        <div className="engine-bar__dot" style={{ backgroundColor: isConnected ? '#238636' : '#da3633' }} />
        <span style={{ color: isConnected ? '#2ea043' : '#f85149', fontWeight: 600 }}>
          {isConnected ? 'Live Engine Connected' : 'Engine Disconnected (Local Static Mode)'}
        </span>
        <span style={{ color: 'var(--text-placeholder)' }}>|</span>
        <span>Pipeline v2.5.0-AI</span>
        <span style={{ color: 'var(--text-placeholder)' }}>|</span>
        <span>Play Console API Ready</span>
      </div>
      <div className="engine-bar__right">
        <span>Uptime: {uptime}</span>
        <span>Mem: {memUsage}</span>
        <span>{stats.publishedApps} live · {stats.inProgress} queued</span>
        <span>
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>
    </div>
  );
}
