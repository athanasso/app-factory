import { useState, useEffect } from 'react';

export default function PlayConsoleBrowserCard({ app }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/play-console/browser/status');
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      setMsg({ success: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [app?.id]);

  const handleConnect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('http://localhost:3001/api/play-console/browser/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      setMsg({ success: true, summary: 'Chrome Play Console session ready' });
      await refresh();
    } catch (e) {
      setMsg({ success: false, error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleFill = async () => {
    if (!app?.id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`http://localhost:3001/api/apps/${app.id}/play-console/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fill failed');
      setMsg(data);
    } catch (e) {
      setMsg({ success: false, error: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="tester-card glass-panel">
        <div className="tester-card__header">
          <span className="tester-icon">🌐</span>
          <div className="tester-title">
            <h4>Play Console Chrome Fill</h4>
            <p>Checking Chrome profile session…</p>
          </div>
        </div>
      </div>
    );
  }

  const ready = Boolean(status?.ready);
  const lastFill = app?.playConsoleBrowserFill;

  return (
    <div className="tester-card glass-panel">
      <div className="tester-card__header">
        <div className="tester-card__identity">
          <span className="tester-icon">🌐</span>
          <div>
            <div className="tester-card__title-row">
              <h4>Play Console Chrome Fill</h4>
              <span className={`badge ${ready ? 'badge--success' : 'badge--alpha'}`}>
                {ready ? 'Session ready' : 'Needs Connect'}
              </span>
              {status?.usingShortsMachineProfile && (
                <span className="badge badge--personal">ShortsMachine profile</span>
              )}
            </div>
            <p>
              Fills API-impossible App content (privacy URL, ads, IARC rating, data safety) via a
              dedicated Chrome profile — same pattern as ShortsMachine YouTube uploads.
            </p>
          </div>
        </div>
      </div>

      <div className="tester-card__body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9ca3af)' }}>
          Profile: <code style={{ fontSize: '0.8rem' }}>{status?.chromeProfile || '—'}</code>
        </div>

        {lastFill && (
          <div style={{ fontSize: '0.85rem' }}>
            Last fill: {lastFill.success ? '✔' : '⚠'}{' '}
            {lastFill.at ? new Date(lastFill.at).toLocaleString() : ''}
            {lastFill.steps
              ? ` · ${Object.entries(lastFill.steps)
                  .map(([k, v]) => `${k}:${v ? 'ok' : 'fail'}`)
                  .join(', ')}`
              : ''}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn btn--secondary" disabled={busy} onClick={handleConnect}>
            {busy ? 'Working…' : ready ? 'Re-connect Chrome' : 'Connect Chrome'}
          </button>
          <button className="btn btn--primary" disabled={busy || !app?.id} onClick={handleFill}>
            {busy ? 'Filling…' : `Fill App Content${app?.name ? ` · ${app.name}` : ''}`}
          </button>
        </div>

        {msg && (
          <div
            style={{
              fontSize: '0.85rem',
              padding: '0.6rem 0.75rem',
              borderRadius: 8,
              background: msg.success === false ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            }}
          >
            {msg.error || msg.summary || JSON.stringify(msg.steps || msg)}
          </div>
        )}
      </div>
    </div>
  );
}
