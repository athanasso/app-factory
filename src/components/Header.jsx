export default function Header({ selectedApp, stats, isConnected, onOpenAnalytics, onOpenSettings, onOpenNewApp }) {
  const totalSteps = selectedApp
    ? selectedApp.pipeline.reduce((sum, s) => sum + s.steps.length, 0)
    : 0;
  const completedSteps = selectedApp
    ? selectedApp.pipeline.reduce(
        (sum, s) => sum + s.steps.filter((st) => st.status === 'completed').length,
        0
      )
    : 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <header className="header app-header">
      <div className="header__left">
        <div className="header__logo">
          <div className="header__logo-icon">🏭</div>
          <span>App Factory</span>
        </div>
        <div className="header__separator" />
        <div className="header__breadcrumb">
          <span>Pipeline</span>
          {selectedApp && (
            <>
              <span style={{ color: 'var(--text-placeholder)' }}>›</span>
              <span className="header__breadcrumb-active">{selectedApp.name}</span>
            </>
          )}
        </div>
      </div>

      <div className="header__center">
        <div className="header__status header__status--running">
          <div className="header__status-dot" />
          Engine Running
        </div>
        {selectedApp && (
          <div className="header__progress-mini">
            <div className="header__progress-bar-mini">
              <div
                className="header__progress-bar-mini-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span>
              {completedSteps}/{totalSteps}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{progressPercent}%</span>
          </div>
        )}
      </div>

      <div className="header__right">
        <button className="header__btn" onClick={onOpenAnalytics}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20V10M6 20V4M18 20v-6" />
          </svg>
          Analytics
        </button>
        <button className="header__btn" onClick={onOpenSettings}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Settings
        </button>
        <button className="header__btn header__btn--primary" onClick={onOpenNewApp}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New App
        </button>
      </div>
    </header>
  );
}
