import { useState, useRef, useCallback, useEffect } from 'react';
import { useAppEngine } from './hooks/useAppEngine';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import PipelineView from './components/PipelineView';
import StatsPanel from './components/StatsPanel';
import EngineBar from './components/EngineBar';
import NewAppModal from './components/NewAppModal';
import SettingsModal from './components/SettingsModal';
import AnalyticsModal from './components/AnalyticsModal';
import './index.css';

function App() {
  const { apps, stats, isConnected, isRunning, runPipeline, createApp, getEngineSettings, updateEngineSettings } = useAppEngine();
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const mainRef = useRef(null);

  // Automatically select the first app once loaded if none selected
  useEffect(() => {
    if (!selectedAppId && apps.length > 0) {
      // Prioritize selecting one of the newly detected real React Native apps!
      const defaultApp = apps.find((a) => a.isReal && a.status === 'Created') || apps[0];
      setSelectedAppId(defaultApp.id);
    }
  }, [apps, selectedAppId]);

  const handleSelectApp = useCallback((id) => {
    setSelectedAppId(id);
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const selectedApp = apps.find((a) => a.id === selectedAppId);

  const filteredApps = apps.filter((app) => {
    const matchesSearch =
      !search ||
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.packageName.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'live' && (app.status === 'Published' || app.status === 'Approved')) ||
      (filter === 'review' && app.status === 'In Review') ||
      (filter === 'building' && (app.status === 'Created' || app.status === 'Draft' || app.status === 'Updating')) ||
      (filter === 'failed' && (app.status === 'Failed' || app.status === 'Rejected'));

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="app-layout">
      <Header 
        selectedApp={selectedApp} 
        stats={stats} 
        isConnected={isConnected} 
        onOpenAnalytics={() => setActiveModal('analytics')}
        onOpenSettings={() => setActiveModal('settings')}
        onOpenNewApp={() => setActiveModal('newApp')}
      />
      <div className="app-sidebar">
        <Sidebar
          apps={filteredApps}
          selectedAppId={selectedAppId}
          onSelectApp={handleSelectApp}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          totalApps={apps.length}
          stats={stats}
        />
      </div>
      <div className="app-main">
        <main className="main" ref={mainRef}>
          {selectedApp ? (
            <>
              <StatsPanel stats={stats} />
              <PipelineView 
                app={selectedApp}
                stats={stats}
                isRunning={isRunning(selectedApp.id)}
                onRunPipeline={() => runPipeline(selectedApp.id, { fromScratch: true })}
                onRetryFailed={() => runPipeline(selectedApp.id, { fromScratch: false })}
              />
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state__icon">🏭</div>
              <div className="empty-state__title">Select an app</div>
              <div className="empty-state__desc">
                Choose an app from the sidebar to view its pipeline status and details.
              </div>
            </div>
          )}
        </main>
      </div>
      <EngineBar stats={stats} isConnected={isConnected} />

      {activeModal === 'newApp' && (
        <NewAppModal 
          onClose={() => setActiveModal(null)} 
          onCreateApp={createApp}
          onSelectApp={handleSelectApp}
        />
      )}
      {activeModal === 'settings' && (
        <SettingsModal 
          onClose={() => setActiveModal(null)} 
          getEngineSettings={getEngineSettings}
          updateEngineSettings={updateEngineSettings}
        />
      )}
      {activeModal === 'analytics' && (
        <AnalyticsModal 
          apps={apps}
          stats={stats}
          onClose={() => setActiveModal(null)} 
          onSelectApp={handleSelectApp}
        />
      )}
    </div>
  );
}

export default App;
