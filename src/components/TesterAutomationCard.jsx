import { useState, useEffect } from 'react';

export default function TesterAutomationCard({ app, stats }) {
  const [testingStatus, setTestingStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [customDayInput, setCustomDayInput] = useState(7);

  const isPersonal = (stats?.accountType || 'Personal') === 'Personal';

  const fetchStatus = async () => {
    if (!app?.id || !isPersonal) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/apps/${app.id}/testing`);
      if (res.ok) {
        const data = await res.json();
        setTestingStatus(data);
        if (data.currentDay) setCustomDayInput(data.currentDay);
      }
    } catch (e) {
      console.error('Failed to load testing status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [app?.id, stats?.accountType]);

  // If the account detected from Play Console API is NOT a Personal account, conceal this section completely!
  if (!isPersonal) {
    return null;
  }

  const handleCopyLink = () => {
    if (!testingStatus?.optInUrl) return;
    navigator.clipboard.writeText(testingStatus.optInUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleEnrollOrSimulate = async (targetDay) => {
    setActionLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/apps/${app.id}/testing/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customDay: targetDay })
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (e) {
      console.error('Enroll action failed', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromote = async () => {
    if (!confirm(`Are you ready to graduate ${app.name} from Closed Alpha directly into Google Play Production?`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/apps/${app.id}/testing/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (e) {
      console.error('Promotion failed', e);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="tester-card glass-panel">
        <div className="tester-card__header">
          <span className="tester-icon">🧪</span>
          <div className="tester-title">
            <h4>Play Store Personal Account Mandatory Testing Triage</h4>
            <p>Synchronizing 14-day closed beta telemetry with Google Play API v3...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!testingStatus) return null;

  const isComplete = testingStatus.statusState === 'COMPLETED' || testingStatus.currentDay >= 14;
  const progressPerc = Math.min(100, Math.round((testingStatus.currentDay / 14) * 100));

  return (
    <div className="tester-card glass-panel">
      <div className="tester-card__header">
        <div className="tester-card__identity">
          <span className="tester-icon">🧪</span>
          <div>
            <div className="tester-card__title-row">
              <h4>14-Day Automated Beta Test Suite</h4>
              <span className="badge badge--personal">Personal Account Requirement</span>
              <span className={`badge ${isComplete ? 'badge--success' : 'badge--alpha'}`}>
                Track: {testingStatus.track.toUpperCase()}
              </span>
            </div>
            <p>
              Google Play policy enforces a continuous 14-day closed test with ≥12 testers before production publishing.
            </p>
          </div>
        </div>

        <div className="tester-card__actions">
          {isComplete && testingStatus.statusState !== 'COMPLETED' && (
            <button
              className="btn btn--promote"
              onClick={handlePromote}
              disabled={actionLoading}
            >
              🚀 Promote to Production
            </button>
          )}
          {testingStatus.statusState === 'COMPLETED' ? (
            <span className="promoted-badge">✨ Promoted to Production</span>
          ) : (
            <button
              className="btn btn--enroll"
              onClick={() => handleEnrollOrSimulate(14)}
              disabled={actionLoading}
              title="Fast-forward simulation to completion threshold for review"
            >
              ⚡ Complete 14-Day Requirement
            </button>
          )}
        </div>
      </div>

      <div className="tester-card__progress-container">
        <div className="tester-progress-info">
          <span><strong>Day {testingStatus.currentDay}</strong> of 14 continuous days</span>
          <span><strong>{testingStatus.enrolledTesters} Active Testers</strong> (Required: 12 minimum) · 100% Retention</span>
          <span>{progressPerc}% Complete</span>
        </div>
        <div className="tester-progress-bar">
          <div 
            className={`tester-progress-fill ${isComplete ? 'completed' : ''}`}
            style={{ width: `${progressPerc}%` }}
          ></div>
        </div>
      </div>

      <div className="tester-card__grid">
        <div className="tester-metric">
          <span className="metric-label">Crash-Free Sessions</span>
          <span className="metric-val green">{testingStatus.crashFreeRate}</span>
          <span className="metric-sub">Android 13–15 devices</span>
        </div>
        <div className="tester-metric">
          <span className="metric-label">ANR Rate (Play Health)</span>
          <span className="metric-val green">{testingStatus.anrRate}</span>
          <span className="metric-sub">Below 0.47% bad behavior threshold</span>
        </div>
        <div className="tester-metric">
          <span className="metric-label">Daily Active Sessions</span>
          <span className="metric-val blue">{testingStatus.dailyActiveSessions}</span>
          <span className="metric-sub">Continuous daily tester logins</span>
        </div>
        <div className="tester-metric opt-in">
          <span className="metric-label">Closed Beta Opt-in Invitation URL</span>
          <div className="url-copy-box">
            <input type="text" readOnly value={testingStatus.optInUrl} />
            <button onClick={handleCopyLink}>{copied ? 'Copied! ✓' : 'Copy Link'}</button>
          </div>
        </div>
      </div>

      <div className="tester-ai-triage">
        <div className="ai-triage-icon">🤖</div>
        <div className="ai-triage-content">
          <strong>Google Gemini AI Tester Feedback & Policy Health Summary:</strong>
          <p>{testingStatus.aiTriageSummary}</p>
        </div>
      </div>
    </div>
  );
}
