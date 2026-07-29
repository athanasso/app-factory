import { useState, useEffect } from 'react';

export default function AdRevenueModal({ onClose, selectedApp = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMonetization = async () => {
      setLoading(true);
      try {
        const endpoint = selectedApp
          ? `http://localhost:3001/api/apps/${selectedApp.id}/monetization`
          : `http://localhost:3001/api/monetization/all`;
        const res = await fetch(endpoint);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          setError('Failed to query monetization backend');
        }
      } catch (e) {
        setError('Error reaching backend server');
      } finally {
        setLoading(false);
      }
    };
    fetchMonetization();
  }, [selectedApp]);

  const overview = selectedApp
    ? (data?.metrics ? {
        totalAdMobRevenue: data.metrics.admobMetrics?.revenue || 0,
        totalPlayStoreRevenue: data.metrics.iapMetrics?.revenue || 0,
        totalImpressions: data.metrics.admobMetrics?.impressions || 0,
        totalIapSkus: data.metrics.iapMetrics?.iapCount || 0,
        totalSubSkus: data.metrics.iapMetrics?.subscriptionCount || 0,
        averageEcpm: data.metrics.admobMetrics?.eCPM || '$0.00',
        monitoredMonth: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        apps: [{
          appId: selectedApp.id,
          appName: selectedApp.name,
          packageName: selectedApp.packageName,
          icon: selectedApp.icon,
          iconUrl: selectedApp.iconUrl,
          admobRevenue: data.metrics.admobMetrics?.revenue || 0,
          playStoreRevenue: data.metrics.iapMetrics?.revenue || 0,
          impressions: data.metrics.admobMetrics?.impressions || 0,
          eCPM: data.metrics.admobMetrics?.eCPM || '$0.00',
          iapCount: data.metrics.iapMetrics?.iapCount || 0,
          subscriptionCount: data.metrics.iapMetrics?.subscriptionCount || 0,
          skuDetails: data.metrics.iapMetrics?.skuDetails || [],
          platform: data.metrics.iapMetrics?.platform || 'Google Play Console',
          isLive: data.metrics.isVerifiedLive
        }]
      } : null)
    : (data ? {
        ...data,
        totalPlayStoreRevenue: data.apps?.reduce((sum, a) => sum + (a.playStoreRevenue || 0), 0) || 0
      } : null);

  const skuCatalogRows = overview?.apps?.flatMap(app => {
    if (app.skuDetails && app.skuDetails.length > 0) {
      return app.skuDetails.map(sku => ({
        ...sku,
        appName: app.appName,
        packageName: app.packageName,
        isEmpty: false
      }));
    } else {
      return [{
        sku: '—',
        appName: app.appName,
        packageName: app.packageName,
        type: 'none',
        price: null,
        durationLabel: '',
        status: 'No SKUs Configured',
        isEmpty: true
      }];
    }
  }) || [];

  const totalVerifiedSkus = overview?.apps?.reduce((sum, a) => sum + (a.iapCount || 0) + (a.subscriptionCount || 0), 0) || 0;
  const totalMonitoredRevenue = ((overview?.totalAdMobRevenue || 0) + (overview?.totalPlayStoreRevenue || 0));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content analytics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-title__icon">💰</span>
            <div>
              <h3>{selectedApp ? `${selectedApp.name} · Ad Revenue & IAP` : 'Ad Revenue & Play Store Analytics'}</h3>
              <p>Google AdMob Network Reports & Google Play Console Direct Billing Catalog</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '16px' }}>
            <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }}></div>
            <span style={{ color: 'var(--text-muted, #6b7280)', fontSize: '0.85rem' }}>Querying Google Play Console & AdMob...</span>
          </div>
        ) : error || !overview ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ef4444' }}>⚠️ {error || 'No data available'}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Check backend connection on port 3001.</span>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="analytics-overview-cards">
              <div className="a-card">
                <div className="a-card__icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>💰</div>
                <div className="a-card__info">
                  <span className="a-card__label">Total Tracked Revenue</span>
                  <span className="a-card__value" style={{ color: totalMonitoredRevenue > 0 ? '#10b981' : '#f59e0b' }}>
                    ${totalMonitoredRevenue.toFixed(2)}
                    <small style={{ color: 'var(--text-muted)' }}> AdMob + IAP</small>
                  </span>
                </div>
              </div>

              <div className="a-card">
                <div className="a-card__icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>📊</div>
                <div className="a-card__info">
                  <span className="a-card__label">AdMob Network</span>
                  <span className="a-card__value">
                    ${(overview.totalAdMobRevenue || 0).toFixed(2)}
                    <small> eCPM {overview.averageEcpm || '$0.00'}</small>
                  </span>
                </div>
              </div>

              <div className="a-card">
                <div className="a-card__icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>🛒</div>
                <div className="a-card__info">
                  <span className="a-card__label">Play Store Catalog</span>
                  <span className="a-card__value">
                    {totalVerifiedSkus} <small>Verified SKUs</small>
                  </span>
                </div>
              </div>

              <div className="a-card">
                <div className="a-card__icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>🔄</div>
                <div className="a-card__info">
                  <span className="a-card__label">Active Subscriptions</span>
                  <span className="a-card__value">
                    {overview.totalSubSkus || 0} <small>Auto-renew Plans</small>
                  </span>
                </div>
              </div>
            </div>

            {/* Connection Status & Guidance Box */}
            <div style={{
              margin: '0 24px',
              padding: '14px 18px',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '10px',
              fontSize: '0.78rem',
              color: '#93c5fd',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              lineHeight: 1.5
            }}>
              <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>ℹ️</span>
              <div>
                <strong style={{ color: '#ffffff' }}>Why is my generated Play Store and AdMob Revenue showing $0.00?</strong>
                <div style={{ marginTop: '4px', color: '#d1d5db' }}>
                  • <strong>Google Play Store Sales:</strong> Google Play Developer API v3 returns product catalog SKUs and prices (shown in Tab 2 below). Live transaction dollar earnings require downloading Google Play's automated CSV reports from Google Cloud Storage. Set <code style={{ color: '#a78bfa' }}>googlePlay.reportBucket</code> in <code style={{ color: '#a78bfa' }}>data/credentials/monetization.json</code> (from Play Console → Download Reports → Financial Reports) and grant your Service Account the <strong>Storage Object Viewer</strong> role in GCP IAM.<br/>
                  • <strong>AdMob Revenue:</strong> Service accounts (<code style={{ color: '#a78bfa' }}>*.iam.gserviceaccount.com</code>) cannot accept emailed invites in AdMob. Authorize your service account via Google Workspace Domain Delegation or Desktop OAuth to sync ad earnings.
                </div>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="analytics-table-controls" style={{ marginTop: '12px' }}>
              <div className="category-chips">
                <button
                  className={`chip ${activeTab === 'overview' ? 'chip--active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                >
                  📊 Per-App Revenue Status ({overview.apps?.length || 0} Apps)
                </button>
                <button
                  className={`chip ${activeTab === 'skus' ? 'chip--active' : ''}`}
                  onClick={() => setActiveTab('skus')}
                >
                  🛒 Play Store SKU Catalog ({overview.apps?.length || 0} Packages)
                </button>
              </div>
            </div>

            {/* Tab 1: Per-app table */}
            {activeTab === 'overview' && (
              <div className="analytics-table-container">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Application</th>
                      <th>Package Name</th>
                      <th style={{ textAlign: 'right' }}>AdMob Revenue</th>
                      <th style={{ textAlign: 'right' }}>Play Store Sales</th>
                      <th style={{ textAlign: 'right' }}>eCPM</th>
                      <th style={{ textAlign: 'right' }}>IAP SKUs</th>
                      <th style={{ textAlign: 'right' }}>Sub Plans</th>
                      <th style={{ textAlign: 'center' }}>Sync Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.apps?.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No applications found.
                        </td>
                      </tr>
                    ) : (
                      overview.apps?.map((app, idx) => (
                        <tr key={app.appId || idx} className="table-row">
                          <td className="cell-app">
                            <div className="table-app-icon" style={app.iconUrl ? { padding: 0, overflow: 'hidden', background: 'transparent' } : {}}>
                              {app.iconUrl ? (
                                <img src={app.iconUrl} alt={app.appName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                app.icon || '📱'
                              )}
                            </div>
                            <div className="table-app-name">
                              <strong>{app.appName}</strong>
                            </div>
                          </td>
                          <td className="cell-package"><code>{app.packageName}</code></td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>${(app.admobRevenue || 0).toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>${(app.playStoreRevenue || 0).toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#60a5fa' }}>{app.eCPM || '$0.00'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#a78bfa' }}>{app.iapCount || 0}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#34d399' }}>{app.subscriptionCount || 0}</td>
                          <td style={{ textAlign: 'center' }}>
                            {app.isLive ? (
                              <span className="badge badge--approved" style={{ fontSize: '0.7rem' }}>Live Catalog</span>
                            ) : (
                              <span className="badge badge--draft" style={{ fontSize: '0.7rem' }}>Pending</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 2: SKU Catalog */}
            {activeTab === 'skus' && (
              <div className="analytics-table-container">
                {skuCatalogRows.length > 0 ? (
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>SKU Product ID</th>
                        <th>Application Package</th>
                        <th>Billing Type</th>
                        <th style={{ textAlign: 'right' }}>Verified Price</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skuCatalogRows.map((sku, idx) => (
                        <tr key={idx} className="table-row">
                          <td style={{ fontFamily: 'monospace', color: sku.isEmpty ? 'var(--text-muted)' : '#a78bfa' }}>
                            {sku.sku}
                          </td>
                          <td>
                            <strong>{sku.appName}</strong>
                            <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {sku.packageName}
                            </span>
                          </td>
                          <td>
                            {sku.isEmpty ? (
                              <span className="badge badge--draft" style={{ fontSize: '0.7rem' }}>None</span>
                            ) : (
                              <span className={`badge ${sku.type === 'subscription' ? 'badge--approved' : 'badge--in-review'}`} style={{ fontSize: '0.7rem' }}>
                                {sku.type === 'subscription' ? 'Subscription Plan' : 'One-time IAP'}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: sku.isEmpty ? 'var(--text-muted)' : '#34d399' }}>
                            {sku.isEmpty ? '—' : (sku.price != null ? `$${sku.price.toFixed(2)}${sku.durationLabel || ''}` : 'See Play Console')}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${sku.isEmpty ? 'badge--draft' : 'badge--approved'}`} style={{ fontSize: '0.7rem' }}>
                              {sku.status || 'Active'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>No Applications Found</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="modal-footer">
          <span className="footer-hint">
            {overview ? `${overview.monitoredMonth || 'Current Month'} · ${overview.apps?.length || 0} apps monitored` : 'Google Play Console & AdMob'}
          </span>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
