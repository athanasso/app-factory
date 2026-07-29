import { useState } from 'react';
import TesterAutomationCard from './TesterAutomationCard';

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronIcon = ({ collapsed }) => (
  <svg
    className={`pipeline-section__chevron ${collapsed ? 'pipeline-section__chevron--collapsed' : ''}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

function PipelineStep({ step }) {
  const statusLabels = {
    completed: 'Completed',
    running: 'Running',
    pending: 'Pending',
    failed: 'Failed',
    skipped: 'Skipped',
  };

  return (
    <div className={`pipeline-step pipeline-step--${step.status}`}>
      <div className={`pipeline-step__indicator pipeline-step__indicator--${step.status}`}>
        {step.status === 'completed' && <CheckIcon />}
        {step.status === 'failed' && <XIcon />}
        {step.status === 'running' && <div className="spinner" />}
      </div>

      <div className="pipeline-step__content">
        <div className="pipeline-step__name">{step.name}</div>
        {step.subtitle && <div className="pipeline-step__subtitle">{step.subtitle}</div>}
      </div>

      {step.status === 'running' && (
        <div className="pipeline-step__progress">
          <div
            className="pipeline-step__progress-fill"
            style={{ width: `${step.progress}%` }}
          />
        </div>
      )}

      <div className="pipeline-step__status">
        <span className={`pipeline-step__status-text pipeline-step__status-text--${step.status}`}>
          {statusLabels[step.status]}
        </span>
      </div>
    </div>
  );
}

function PipelineSection({ section }) {
  const [collapsed, setCollapsed] = useState(false);
  const completedCount = section.steps.filter((s) => s.status === 'completed').length;
  const totalCount = section.steps.length;
  const allCompleted = completedCount === totalCount;

  return (
    <div className="pipeline-section">
      <div className="pipeline-section__header" onClick={() => setCollapsed(!collapsed)}>
        <ChevronIcon collapsed={collapsed} />
        <span className="pipeline-section__title">{section.title}</span>
        <span className="pipeline-section__count">
          {completedCount}/{totalCount}
          {allCompleted && ' ✓'}
        </span>
      </div>
      {!collapsed && (
        <div className="pipeline-section__steps">
          {section.steps.map((step) => (
            <PipelineStep key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PipelineView({ app, stats, isRunning, onRunPipeline, onRetryFailed }) {
  const totalSteps = app.pipeline.reduce((sum, s) => sum + s.steps.length, 0);
  const completedSteps = app.pipeline.reduce(
    (sum, s) => sum + s.steps.filter((st) => st.status === 'completed').length,
    0
  );
  const runningSteps = app.pipeline.reduce(
    (sum, s) => sum + s.steps.filter((st) => st.status === 'running').length,
    0
  );
  const failedSteps = app.pipeline.reduce(
    (sum, s) => sum + s.steps.filter((st) => st.status === 'failed').length,
    0
  );
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

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

  const formatRevenue = (val) => {
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val.toFixed(0)}`;
  };

  const formatDownloads = (val) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val.toString();
  };

  return (
    <div className="pipeline-view">
      {/* App Detail Header */}
      <div className="pipeline-header">
        <div className="pipeline-header__left">
          <div className="pipeline-header__icon" style={app.iconUrl ? { padding: 0, overflow: 'hidden', background: 'transparent' } : {}}>
            {app.iconUrl ? (
              <img src={app.iconUrl} alt={app.name} style={{ width: '100%', height: '100%', borderRadius: '8px', objectFit: 'cover' }} />
            ) : (
              app.icon
            )}
          </div>
          <div className="pipeline-header__info">
            <div className="pipeline-header__name">
              {app.name}
              <span style={{ marginLeft: 10 }}>
                <span className={`badge ${getBadgeClass(app.status)}`}>{app.status}</span>
              </span>
              {app.isReal && (
                <span style={{ marginLeft: 6 }}>
                  <span className="badge badge--approved" style={{ background: '#105230', borderColor: '#1a7f4b', fontSize: '0.75rem' }}>Local RN Project</span>
                </span>
              )}
            </div>
            <div className="pipeline-header__meta">
              <span className="pipeline-header__meta-item">
                <code>{app.packageName}</code>
              </span>
              <span className="pipeline-header__meta-item">v{app.version}</span>
              <span className="pipeline-header__meta-item">{app.category}</span>
              {app.sourcePath && (
                <span className="pipeline-header__meta-item" style={{ color: 'var(--color-info)', fontSize: '0.8rem' }}>
                  📁 {app.sourcePath}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="pipeline-header__right">
          <button 
            className="header__btn" 
            onClick={onRunPipeline} 
            disabled={isRunning}
            style={isRunning ? { opacity: 0.6, cursor: 'not-allowed', borderColor: 'var(--color-warning)', color: 'var(--color-warning)' } : {}}
          >
            {isRunning ? (
              <>
                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                Executing...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run Pipeline
              </>
            )}
          </button>
          <button 
            className="header__btn" 
            onClick={onRetryFailed} 
            disabled={isRunning}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
            Retry Failed
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card__label">Revenue</div>
          <div className="stat-card__value stat-card__value--revenue">
            {formatRevenue(app.revenue || 0)}
          </div>
          <div className="stat-card__change" style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '0.8rem' }}>
            Live Google Play
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Downloads</div>
          <div className="stat-card__value stat-card__value--downloads">
            {formatDownloads(app.downloads || 0)}
          </div>
          <div className="stat-card__change" style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '0.8rem' }}>
            Live Telemetry
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Rating</div>
          <div className="stat-card__value stat-card__value--rating">
            {app.rating > 0 ? `★ ${app.rating.toFixed(1)}` : 'Unrated'}
          </div>
          <div className="stat-card__change" style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '0.8rem' }}>
            {app.rating > 0 ? 'Verified Users' : 'No reviews yet'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Last Updated</div>
          <div className="stat-card__value" style={{ fontSize: '0.95rem' }}>
            {app.lastUpdated || 'Recent'}
          </div>
        </div>
      </div>

      {/* Mandatory 14-Day Tester Automation Suite (Displayed ONLY when accountType === 'Personal') */}
      <TesterAutomationCard app={app} stats={stats} />

      {/* Progress Bar */}
      <div className="progress-section">
        <div className="progress-bar">
          <div className="progress-bar__fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="progress-info">
          <div className="progress-info__left">
            <span className="progress-info__percentage">{progressPercent}%</span>
            <span>
              {completedSteps}/{totalSteps} steps completed
            </span>
            {runningSteps > 0 && (
              <span style={{ color: 'var(--color-info)' }}>· {runningSteps} running</span>
            )}
            {failedSteps > 0 && (
              <span style={{ color: 'var(--color-danger)' }}>· {failedSteps} failed</span>
            )}
          </div>
          <div className="progress-info__right">
            {progressPercent < 100 ? 'est. ~12h remaining' : 'Pipeline complete'}
          </div>
        </div>
      </div>

      {/* Pipeline Sections */}
      {app.pipeline.map((section) => (
        <PipelineSection key={section.id} section={section} />
      ))}
    </div>
  );
}
