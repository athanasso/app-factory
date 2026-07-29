import { useState } from 'react';
import AdRevenueModal from './AdRevenueModal';

export default function StatsPanel({ stats }) {
  const [showAdModal, setShowAdModal] = useState(false);

  const formatCurrency = (val) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const formatNumber = (val) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val.toString();
  };

  return (
    <>
      {showAdModal && <AdRevenueModal onClose={() => setShowAdModal(false)} />}
      <div className="overview-stats">
        <div className="overview-stat overview-stat--revenue">
          <div className="overview-stat__label">Monthly Revenue (MRR)</div>
          <div className="overview-stat__value overview-stat__value--revenue">
            {formatCurrency(stats.mrr)}
          </div>
          <div className="overview-stat__sub">
            Operating cost: {formatCurrency(stats.operatingCost)}/mo
          </div>
        </div>

        <div
          className="overview-stat overview-stat--ad-revenue"
          onClick={() => setShowAdModal(true)}
          title="Click to open Ad Revenue & Google Play IAP Analytics"
          style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
        >
          <div className="overview-stat__label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Ad & IAP Revenue</span>
            <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 600 }}>Open Report →</span>
          </div>
          <div className="overview-stat__value" style={{ color: '#f59e0b' }}>
            {formatCurrency(stats.mrr || 0)}
          </div>
          <div className="overview-stat__sub">
            AdMob & Google Play billing sync
          </div>
        </div>

        <div className="overview-stat overview-stat--apps">
          <div className="overview-stat__label">Apps Published</div>
          <div className="overview-stat__value overview-stat__value--apps">{stats.publishedApps}</div>
          <div className="overview-stat__sub">{stats.totalApps} total · {stats.inProgress} building</div>
        </div>

        <div className="overview-stat overview-stat--downloads">
          <div className="overview-stat__label">Total Downloads</div>
          <div className="overview-stat__value overview-stat__value--downloads">
            {formatNumber(stats.totalDownloads)}
          </div>
          <div className="overview-stat__sub">Organic via ASO & Localization</div>
        </div>

        <div className="overview-stat overview-stat--rating">
          <div className="overview-stat__label">Average Rating</div>
          <div className="overview-stat__value overview-stat__value--rating" style={stats.avgRating === 0 ? { fontSize: '1.4rem', marginTop: '4px' } : {}}>
            {stats.avgRating > 0 ? `★ ${stats.avgRating.toFixed(1)}` : 'Unrated'}
          </div>
          <div className="overview-stat__sub">
            {stats.avgRating > 0 ? `Across ${stats.publishedApps} live apps` : `Live on Google Play (${stats.publishedApps} apps)`}
          </div>
        </div>
      </div>
    </>
  );
}
