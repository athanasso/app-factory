export default function Sidebar({
  apps,
  selectedAppId,
  onSelectApp,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  totalApps,
  stats,
}) {
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'live', label: 'Live' },
    { id: 'review', label: 'In Review' },
    { id: 'building', label: 'Building' },
    { id: 'failed', label: 'Failed' },
  ];

  const getBadgeClass = (status) => {
    const map = {
      Approved: 'badge--approved',
      Published: 'badge--published',
      'In Review': 'badge--in-review',
      Failed: 'badge--failed',
      Rejected: 'badge--rejected',
      Created: 'badge--created',
      Draft: 'badge--draft',
      Updating: 'badge--updating',
    };
    return map[status] || 'badge--created';
  };

  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__title">Apps</span>
        <span className="sidebar__count">{totalApps}</span>
      </div>

      <div className="sidebar__search">
        <input
          type="text"
          className="sidebar__search-input"
          placeholder="Search apps..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="sidebar__filters">
        {filters.map((f) => (
          <button
            key={f.id}
            className={`sidebar__filter ${filter === f.id ? 'sidebar__filter--active' : ''}`}
            onClick={() => onFilterChange(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="sidebar__list">
        {apps.map((app) => (
          <div
            key={app.id}
            className={`sidebar__app ${selectedAppId === app.id ? 'sidebar__app--active' : ''}`}
            onClick={() => onSelectApp(app.id)}
          >
            <div className="sidebar__app-icon" style={app.iconUrl ? { padding: 0, overflow: 'hidden', background: 'transparent' } : {}}>
              {app.iconUrl ? (
                <img src={app.iconUrl} alt={app.name} style={{ width: '100%', height: '100%', borderRadius: 'var(--radius-md, 8px)', objectFit: 'cover' }} />
              ) : (
                app.icon
              )}
            </div>
            <div className="sidebar__app-info">
              <div className="sidebar__app-name">{app.name}</div>
              <div className="sidebar__app-package">{app.packageName}</div>
            </div>
            <div className="sidebar__app-badge">
              <span className={`badge ${getBadgeClass(app.status)}`}>{app.status}</span>
            </div>
          </div>
        ))}
        {apps.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            No apps match your filter.
          </div>
        )}
      </div>

      <div className="sidebar__stats">
        <div className="sidebar__stat">
          <div className="sidebar__stat-value" style={{ color: 'var(--color-success)' }}>
            {stats.publishedApps}
          </div>
          <div className="sidebar__stat-label">Live</div>
        </div>
        <div className="sidebar__stat">
          <div className="sidebar__stat-value" style={{ color: 'var(--color-warning)' }}>
            {stats.inReview}
          </div>
          <div className="sidebar__stat-label">Review</div>
        </div>
        <div className="sidebar__stat">
          <div className="sidebar__stat-value" style={{ color: 'var(--color-info)' }}>
            {stats.inProgress}
          </div>
          <div className="sidebar__stat-label">Building</div>
        </div>
        <div className="sidebar__stat">
          <div className="sidebar__stat-value" style={{ color: 'var(--color-danger)' }}>
            {stats.failed}
          </div>
          <div className="sidebar__stat-label">Failed</div>
        </div>
      </div>
    </div>
  );
}
