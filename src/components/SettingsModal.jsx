import { useState, useEffect } from 'react';

export default function SettingsModal({ onClose, getEngineSettings, updateEngineSettings }) {
  const [settings, setSettings] = useState({
    playConsoleServiceAccount: 'service-account.json',
    serviceAccountEmail: '',
    projectsRoot: '',
    aiProvider: 'Gemini Pro 1.5',
    autoGenerateScreenshots: true,
    autoTranslateLocales: 49,
    autoSubmitInReview: false,
    telemetryPollingMinutes: 30
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('google-play');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    async function load() {
      if (getEngineSettings) {
        const current = await getEngineSettings();
        if (current) setSettings((prev) => ({ ...prev, ...current }));
      }
      setIsLoading(false);
    }
    load();
  }, [getEngineSettings]);

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    if (updateEngineSettings) {
      await updateEngineSettings(settings);
    }
    setIsSaving(false);
    setToast('Settings successfully updated and applied across active engine pipelines!');
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-title__icon">⚙️</span>
            <div>
              <h3>Engine & Deployment Configuration</h3>
              <p>Manage API credentials, Play Store automated telemetry, and AI generator preferences</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {toast && (
          <div className="modal-toast success">
            <span>✅</span> {toast}
          </div>
        )}

        <div className="modal-body with-sidebar">
          <div className="modal-nav">
            <button
              className={`modal-nav__item ${activeTab === 'google-play' ? 'active' : ''}`}
              onClick={() => setActiveTab('google-play')}
            >
              📱 Google Play Console
            </button>
            <button
              className={`modal-nav__item ${activeTab === 'build-engine' ? 'active' : ''}`}
              onClick={() => setActiveTab('build-engine')}
            >
              🔨 Build & SDK Root
            </button>
            <button
              className={`modal-nav__item ${activeTab === 'ai-pipeline' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai-pipeline')}
            >
              🤖 AI Automation & ASO
            </button>
          </div>

          <div className="modal-tab-content">
            {isLoading ? (
              <div className="modal-loading">Loading engine parameters...</div>
            ) : activeTab === 'google-play' ? (
              <div className="settings-section">
                <div className="status-banner verified">
                  <span className="status-dot green"></span>
                  <div>
                    <strong>Connected to Google Play Developer API v3</strong>
                    <p>Live telemetry is active for <code>{settings.serviceAccountEmail}</code></p>
                  </div>
                </div>

                <div className="form-group">
                  <label>Service Account JSON File Path</label>
                  <input
                    type="text"
                    value={settings.playConsoleServiceAccount}
                    onChange={(e) => handleChange('playConsoleServiceAccount', e.target.value)}
                  />
                  <span className="form-hint">Absolute file path to your Google Cloud OAuth 2.0 / Service Account JSON credentials.</span>
                </div>

                <div className="form-group">
                  <label>Service Account IAM Email</label>
                  <input
                    type="text"
                    value={settings.serviceAccountEmail}
                    readOnly
                    className="readonly-input"
                  />
                </div>

                <div className="form-group">
                  <label>Developer Account Classification (Play API v3 Detected)</label>
                  <select
                    value={settings.accountType || 'Personal'}
                    onChange={(e) => handleChange('accountType', e.target.value)}
                  >
                    <option value="Personal">Personal Account (Mandatory 14-Day / 12-Tester Closed Beta)</option>
                    <option value="Organization">Organization / Business Account (Instant Production Access)</option>
                  </select>
                  <span className="form-hint">
                    {settings.accountType === 'Personal' 
                      ? '⚠️ Google Play requires Personal developer accounts created after Nov 2023 to run a 14-day closed beta with at least 12 testers. App Factory enables Automated Beta Triage when Personal is selected.' 
                      : '🏢 Organization accounts bypass the mandatory 14-day closed beta test and can deploy directly to production tracks.'}
                  </span>
                </div>

                <div className="form-group">
                  <label>Telemetry Synchronization Interval (Minutes)</label>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    value={settings.telemetryPollingMinutes}
                    onChange={(e) => handleChange('telemetryPollingMinutes', parseInt(e.target.value, 10) || 30)}
                  />
                  <span className="form-hint">How often the background worker queries live store reviews, rating scores, and organic install events.</span>
                </div>
              </div>
            ) : activeTab === 'build-engine' ? (
              <div className="settings-section">
                <div className="form-group">
                  <label>Published Applications Projects Root</label>
                  <input
                    type="text"
                    value={settings.projectsRoot}
                    onChange={(e) => handleChange('projectsRoot', e.target.value)}
                  />
                  <span className="form-hint">Directory where your React Native projects are located for asset compilation and disk icon discovery.</span>
                </div>

                <div className="form-group">
                  <label>Default Release Keystore Configuration</label>
                  <div className="readonly-box">
                    <code>Keystore Type: JKS | Alias: my-key-alias | Sign Algorithm: SHA256withRSA</code>
                  </div>
                  <span className="form-hint">Automated release AAB/APK signer for Google Play Console submissions.</span>
                </div>
              </div>
            ) : (
              <div className="settings-section">
                <div className="form-group">
                  <label>Primary AI LLM Engine Provider</label>
                  <select
                    value={settings.aiProvider}
                    onChange={(e) => handleChange('aiProvider', e.target.value)}
                  >
                    <option value="Gemini Pro 1.5">Google Gemini Pro 1.5 (Recommended for ASO & Vision)</option>
                    <option value="Gemini 1.5 Flash">Google Gemini 1.5 Flash (Ultra High Speed)</option>
                    <option value="GPT-4o">OpenAI GPT-4o (Fallback Engine)</option>
                  </select>
                </div>

                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.autoGenerateScreenshots}
                      onChange={(e) => handleChange('autoGenerateScreenshots', e.target.checked)}
                    />
                    <span>Automatically generate tablet & phone promotional screenshots via AI vision models</span>
                  </label>
                </div>

                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={settings.autoSubmitInReview}
                      onChange={(e) => handleChange('autoSubmitInReview', e.target.checked)}
                    />
                    <span>Auto-submit build releases directly to Google Play production review track upon completion</span>
                  </label>
                </div>

                <div className="form-group">
                  <label>ASO Localization Targets (Languages Count)</label>
                  <input
                    type="number"
                    min="1"
                    max="53"
                    value={settings.autoTranslateLocales}
                    onChange={(e) => handleChange('autoTranslateLocales', parseInt(e.target.value, 10) || 49)}
                  />
                  <span className="form-hint">Number of locales to synthesize for App Store Optimization (up to 53 Play Store regions).</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? 'Saving Configurations...' : '💾 Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
