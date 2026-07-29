import { useState, useEffect, useCallback, useRef } from 'react';
import { mockApps as fallbackApps, getFactoryStats as fallbackStats } from '../data/mockApps';

const API_URL = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/ws';

export function useAppEngine() {
  const [apps, setApps] = useState(fallbackApps);
  const [stats, setStats] = useState(fallbackStats());
  const [runningApps, setRunningApps] = useState(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);

  // Fetch initial data from Backend Server
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/apps`);
      if (res.ok) {
        const data = await res.json();
        setApps(data.apps);
        setStats(data.stats);
      }
    } catch (error) {
      console.warn('[Engine] Backend offline, falling back to local static cache.', error.message);
    }
  }, []);

  // Connect WebSocket for real-time streaming pipeline progress
  useEffect(() => {
    fetchData();

    let socket;
    let reconnectTimer;

    const connectWs = () => {
      socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected to App Factory live stream.');
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'APP_UPDATE' && data.app) {
            setApps((prevApps) => {
              const idx = prevApps.findIndex((a) => a.id === data.app.id);
              if (idx !== -1) {
                const copy = [...prevApps];
                copy[idx] = data.app;
                return copy;
              }
              return [data.app, ...prevApps];
            });
            if (data.stats) {
              setStats(data.stats);
            }
            setRunningApps((prev) => {
              const copy = new Set(prev);
              if (data.isRunning) copy.add(data.app.id);
              else copy.delete(data.app.id);
              return copy;
            });
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse stream event:', e);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        // Retry connection automatically
        reconnectTimer = setTimeout(connectWs, 3000);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connectWs();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchData]);

  // Trigger pipeline execution for an app
  const runPipeline = useCallback(async (appId, { fromScratch = true } = {}) => {
    setRunningApps((prev) => new Set(prev).add(appId));
    try {
      const res = await fetch(`${API_URL}/apps/${appId}/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromScratch }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Pipeline execution failed');
      }
      console.log(`[Engine] Pipeline job triggered for app: ${appId}`);
    } catch (err) {
      console.error('[Engine] Failed to execute pipeline:', err.message);
      setRunningApps((prev) => {
        const copy = new Set(prev);
        copy.delete(appId);
        return copy;
      });
      alert(`Could not run pipeline: ${err.message}. Make sure backend server is running!`);
    }
  }, []);

  const createApp = useCallback(async (appData) => {
    try {
      const res = await fetch(`${API_URL}/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appData),
      });
      if (res.ok) {
        const data = await res.json();
        setApps((prev) => [data.app, ...prev.filter(a => a.id !== data.app.id)]);
        if (data.stats) setStats(data.stats);
        return data.app;
      }
    } catch (error) {
      console.error('Error creating app:', error);
      throw error;
    }
    return null;
  }, []);

  const getEngineSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/settings`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }, []);

  const updateEngineSettings = useCallback(async (newSettings) => {
    try {
      const res = await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }, []);

  return {
    apps,
    stats,
    isConnected,
    isRunning: (appId) => runningApps.has(appId),
    runPipeline,
    createApp,
    getEngineSettings,
    updateEngineSettings,
    refresh: fetchData,
  };
}
