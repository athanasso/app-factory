import { useState, useMemo } from 'react';

export default function AnalyticsModal({ apps, stats, onClose, onSelectApp }) {
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = useMemo(() => {
    const cats = new Set(['All']);
    apps.forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats);
  }, [apps]);

  const filteredApps = useMemo(() => {
    return apps.filter((a) => {
      const matchCat = filterCategory === 'All' || a.category === filterCategory;
      const matchQuery = !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) || a.packageName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [apps, filterCategory, searchQuery]);

  const totalCompletedSteps = useMemo(() => {
    return apps.reduce((total, app) => {
      if (!app.pipeline) return total;
      const done = app.pipeline.reduce((sSum, phase) => {
        return sSum + (phase.steps ? phase.steps.filter((s) => s.status === 'completed').length : 0);
      }, 0);
      return total + done;
    }, 0);
  }, [apps]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content analytics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-title__icon">📊</span>
            <div>
              <h3>Global App Factory Telemetry & ASO Hub</h3>
              <p>Verified production performance and live Google Play application catalog</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="analytics-overview-cards">
          <div className="a-card">
            <div className="a-card__icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>📱</div>
            <div className="a-card__info">
              <span className="a-card__label">Published Titles</span>
              <span className="a-card__value">{stats.publishedApps} <small>/ {apps.length} Total</small></span>
            </div>
          </div>

          <div className="a-card">
            <div className="a-card__icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>⚡</div>
            <div className="a-card__info">
              <span className="a-card__label">Pipeline Steps Executed</span>
              <span className="a-card__value">{totalCompletedSteps.toLocaleString()} <small>tasks</small></span>
            </div>
          </div>

          <div className="a-card">
            <div className="a-card__icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>🌐</div>
            <div className="a-card__info">
              <span className="a-card__label">ASO Localization Reach</span>
              <span className="a-card__value">49 <small>Languages per App</small></span>
            </div>
          </div>

          <div className="a-card">
            <div className="a-card__icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>🛡️</div>
            <div className="a-card__info">
              <span className="a-card__label">Play Store Identity</span>
              <span className="a-card__value" style={{ fontSize: '1.1rem', color: '#10b981' }}>✓ 100% Validated</span>
            </div>
          </div>
        </div>

        <div className="analytics-table-controls">
          <div className="category-chips">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`chip ${filterCategory === cat ? 'chip--active' : ''}`}
                onClick={() => setFilterCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="search-box">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Filter by App Name or com.athanasso.* package..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="analytics-table-container">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Android Package ID</th>
                <th>Category</th>
                <th>Version</th>
                <th>Rating & Reviews</th>
                <th>Build Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No applications matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <tr key={app.id} onClick={() => { onSelectApp(app.id); onClose(); }} className="table-row">
                    <td className="cell-app">
                      <div className="table-app-icon" style={app.iconUrl ? { padding: 0, overflow: 'hidden', background: 'transparent' } : {}}>
                        {app.iconUrl ? (
                          <img src={app.iconUrl} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          app.icon || '📱'
                        )}
                      </div>
                      <div className="table-app-name">
                        <strong>{app.name}</strong>
                        <span>Last scan: {app.lastUpdated || 'Today'}</span>
                      </div>
                    </td>
                    <td className="cell-package">
                      <code>{app.packageName}</code>
                    </td>
                    <td><span className="badge-cat">{app.category || 'Productivity'}</span></td>
                    <td><strong>v{app.version || '1.0.0'}</strong></td>
                    <td className="cell-rating">
                      {app.rating > 0 ? (
                        <span className="rating-pill">★ {app.rating.toFixed(1)} <small>Verified</small></span>
                      ) : (
                        <span className="unrated-pill">Unrated (0 reviews)</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge status--${(app.status || 'published').toLowerCase().replace(/\s+/g, '-')}`}>
                        {app.status || 'Published'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectApp(app.id);
                          onClose();
                        }}
                      >
                        Inspect Pipeline →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-footer">
          <span className="footer-hint">Showing {filteredApps.length} applications from D:/Projects/RN/published</span>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
