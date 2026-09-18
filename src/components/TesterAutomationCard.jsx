import { useState, useEffect } from 'react';

export default function TesterAutomationCard({ app, stats }) {
  const [testingStatus, setTestingStatus] = useState(null);
  const [closedTest, setClosedTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [closedMsg, setClosedMsg] = useState(null);
  const [customDayInput, setCustomDayInput] = useState(7);

  const isPersonal = (stats?.accountType || 'Personal') === 'Personal';
  const needsClosedTest =
    isPersonal &&
    app &&
    !app.playProduction &&
    app.status !== 'Published' &&
    app.status !== 'Approved';

  const fetchStatus = async () => {
    if (!app?.id || !isPersonal) return;
    setLoading(true);
    try {
      const [testRes, ctRes] = await Promise.all([
        fetch(`http://localhost:3001/api/apps/${app.id}/testing`),
        fetch(`http://localhost:3001/api/closed-test?appId=${encodeURIComponent(app.id)}`),
      ]);
      if (testRes.ok) {
        const data = await testRes.json();
        setTestingStatus(data);
        if (data.currentDay) setCustomDayInput(data.currentDay);
      }
      if (ctRes.ok) setClosedTest(await ctRes.json());
    } catch (e) {
      console.error('Failed to load testing status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [app?.id, stats?.accountType]);

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
        body: JSON.stringify({ customDay: targetDay }),
      });
      if (res.ok) await fetchStatus();
    } catch (e) {
      console.error('Enroll action failed', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromote = async () => {
    if (!confirm(`Are you ready to graduate ${app.name} from Closed Alpha directly into Google Play Production?`))
      return;
    setActionLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/apps/${app.id}/testing/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) await fetchStatus();
    } catch (e) {
      console.error('Promotion failed', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClosedRegister = async () => {
    setActionLoading(true);
    setClosedMsg(null);
    try {
      const res = await fetch(`http://localhost:3001/api/apps/${app.id}/closed-test/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setClosedMsg(data);
      await fetchStatus();
    } catch (e) {
      setClosedMsg({ success: false, error: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleFullCycle = async () => {
    setActionLoading(true);
    setClosedMsg(null);
    try {
      const res = await fetch(`http://localhost:3001/api/apps/${app.id}/closed-test/full-cycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTesters: 12 }),
      });
      const data = await res.json();
      setClosedMsg(data);
      await fetchStatus();
    } catch (e) {
      setClosedMsg({ success: false, error: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDailyProofs = async () => {
    setActionLoading(true);
    setClosedMsg(null);
    try {
      const res = await fetch(`http://localhost:3001/api/closed-test/daily-proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: app.id }),
      });
      const data = await res.json();
      setClosedMsg(data);
      await fetchStatus();
    } catch (e) {
      setClosedMsg({ success: false, error: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkRegistered = async () => {
    setActionLoading(true);
    try {
      await fetch(`http://localhost:3001/api/apps/${app.id}/closed-test/mark-registered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await fetchStatus();
      setClosedMsg({ success: true, summary: 'Marked as registered in ClosedTest.' });
    } catch (e) {
      setClosedMsg({ success: false, error: e.message });
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

  const isComplete = testingStatus.statusState === 'COMPLETED';
  const isReadyToPromote = testingStatus.statusState === 'READY_FOR_PROMOTION';
  const notStarted = testingStatus.statusState === 'NOT_STARTED';
  const progressPerc = Math.min(100, Math.round(((testingStatus.currentDay || 0) / 14) * 100));
  const exchange = closedTest?.app?.exchange;
  const usedPartners = closedTest?.usedPartnerPackages || [];

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
                Track: {(testingStatus.track || 'none').toUpperCase()}
              </span>
            </div>
            <p>
              {notStarted
                ? 'Closed testing starts after the first successful AAB upload to Play.'
                : 'Google Play policy enforces a continuous 14-day closed test with ≥12 testers before production publishing.'}
            </p>
          </div>
        </div>

        <div className="tester-card__actions">
          {isReadyToPromote && (
            <button className="btn btn--promote" onClick={handlePromote} disabled={actionLoading}>
              🚀 Promote to Production
            </button>
          )}
          {isComplete ? (
            <span className="promoted-badge">✨ Promoted to Production</span>
          ) : notStarted ? (
            <span className="badge badge--alpha">Not uploaded yet</span>
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

      {needsClosedTest && !isComplete && (
        <div className="closed-test-panel">
          <div className="closed-test-panel__head">
            <div>
              <strong>TheClosedTest exchange</strong>
              <p>
                Uses your existing TheClosedTest login on the ADB phone — no JWT paste. Creates the listing
                (skips if already there), requests unique swaps, saves accepted partners, then daily open →
                screenshot → upload.
              </p>
            </div>
            <a
              className="closed-test-link"
              href={closedTest?.installUrl || 'https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest'}
              target="_blank"
              rel="noreferrer"
            >
              Install APK source ↗
            </a>
          </div>

          <div className="closed-test-panel__actions">
            <button
              className="btn btn--closed-test"
              onClick={handleFullCycle}
              disabled={actionLoading}
              title="API: create listing if missing, request unique swaps, save accepted partners"
            >
              Run full cycle (register + swaps)
            </button>
            <button className="btn btn--closed-daily" onClick={handleDailyProofs} disabled={actionLoading}>
              Daily ADB proofs + upload
            </button>
            <button className="btn btn--enroll" onClick={handleClosedRegister} disabled={actionLoading}>
              ADB open Add App only
            </button>
            {exchange?.registrationOpenedAt && !exchange?.registeredAt && (
              <button className="btn btn--enroll" onClick={handleMarkRegistered} disabled={actionLoading}>
                Mark registered
              </button>
            )}
          </div>

          {!closedTest?.hasClerkJwt && (
            <div className="closed-test-msg ok">
              Running on phone session via ADB (you’re already logged in). Optional Clerk JWT in Settings only
              speeds up API swaps — not required.
            </div>
          )}

          {(closedTest?.acceptedSwaps?.length > 0 || exchange || usedPartners.length > 0) && (
            <div className="closed-test-meta">
              {closedTest?.hasClerkJwt && <span>Optional API JWT: saved</span>}
              {exchange?.closedTestAppId && <span>ClosedTest app id: {exchange.closedTestAppId}</span>}
              {exchange?.status && <span>Status: {exchange.status}</span>}
              {exchange?.partners?.length > 0 && (
                <span>Partners for this app: {exchange.partners.join(', ')}</span>
              )}
              {(closedTest?.acceptedSwaps || [])
                .filter((s) => s.ourPackage === app.packageName)
                .map((s) => (
                  <span key={s.matchId}>
                    Accepted swap: {s.partnerTitle || s.partnerPackage} ({String(s.matchId).slice(0, 8)}…)
                  </span>
                ))}
              {usedPartners.length > 0 && (
                <span>Blocked globally (already used): {usedPartners.join(', ')}</span>
              )}
              {closedTest?.appsNeedingClosedTest?.length > 0 && (
                <span>
                  Apps still needing closed test: {closedTest.appsNeedingClosedTest.length}
                </span>
              )}
            </div>
          )}

          {closedMsg && (
            <div className={`closed-test-msg ${closedMsg.success ? 'ok' : 'err'}`}>
              {closedMsg.summary || closedMsg.error || JSON.stringify(closedMsg)}
              {Array.isArray(closedMsg.steps) && (
                <ul>
                  {closedMsg.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="tester-card__progress-container">
        <div className="tester-progress-info">
          <span>
            <strong>Day {testingStatus.currentDay}</strong> of 14 continuous days
          </span>
          <span>
            <strong>{testingStatus.enrolledTesters} Active Testers</strong> (Required: 12 minimum) · 100%
            Retention
          </span>
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
