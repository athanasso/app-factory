import { useState } from 'react';

const CATEGORIES = [
  'Productivity',
  'Tools & Utilities',
  'Health & Fitness',
  'Entertainment',
  'Education & Reference',
  'Travel & Local',
  'Finance & Business'
];

export default function NewAppModal({ onClose, onCreateApp, onSelectApp }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Productivity');
  const [description, setDescription] = useState('');
  const [customPackageName, setCustomPackageName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const derivedPackage = `com.athanasso.${name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'myNewApp'}`;
  const finalPackageName = customPackageName.trim() ? customPackageName.trim() : derivedPackage;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await onCreateApp({
        name: name.trim(),
        category,
        description: description.trim() || 'AI generated application concept and automated development pipeline.',
        packageName: finalPackageName
      });
      if (created && onSelectApp) {
        onSelectApp(created.id);
      }
      onClose();
    } catch (error) {
      alert('Failed to initialize application: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content new-app-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-title__icon">✨</span>
            <div>
              <h3>Create New Application</h3>
              <p>Initialize a new automated React Native build & ASO pipeline</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Application Name</label>
            <input
              type="text"
              placeholder="e.g. FocusPulse Tracker"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <span className="form-hint">This name will be displayed on the Google Play Store and initial branding.</span>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Primary Store Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="form-group flex-1">
              <label>Android Package ID (ApplicationId)</label>
              <input
                type="text"
                value={customPackageName}
                placeholder={derivedPackage}
                onChange={(e) => setCustomPackageName(e.target.value)}
              />
              <span className="form-hint">Default: <code>{derivedPackage}</code></span>
            </div>
          </div>

          <div className="form-group">
            <label>Application Concept & Specification</label>
            <textarea
              rows={4}
              placeholder="Describe the core functionality, target audience, and key features. The AI pipeline will use this to generate code, promotional text, and feature screenshots."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || isSubmitting}>
              {isSubmitting ? 'Initializing Engine...' : '🚀 Initialize App Pipeline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
