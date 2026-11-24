import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Save, RefreshCw, ShieldCheck, RotateCcw, AlertTriangle, CheckCircle2, MapPin, BellRing } from 'lucide-react';
import './SystemConfig.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const DEFAULT_CONFIG = Object.freeze({
  password_expiry_days: 365,
  otp_expiry_minutes: 5,
  geofence_default_radius: 200,
  max_login_attempts: 5,
  loiter_threshold_minutes: 30
});

const FIELDS = [
  { key: 'password_expiry_days', label: 'Password Expiry (Days)', min: 0, max: 1095, hint: '0 disables automatic expiry; maximum 1095 days.' },
  { key: 'otp_expiry_minutes', label: 'OTP Expiry (Minutes)', min: 1, max: 15, hint: 'Email verification codes expire after 1–15 minutes.' },
  { key: 'max_login_attempts', label: 'Max Login Attempts', min: 1, max: 10, hint: 'Failed password attempts before a 15-minute lockout.' },
  { key: 'geofence_default_radius', label: 'Default Radius for New Locations (Meters)', min: 50, max: 2000, hint: 'Used when creating locations without an explicit radius.' },
  { key: 'loiter_threshold_minutes', label: 'Loitering Alert Threshold (Minutes)', min: 1, max: 180, hint: 'Visitor monitoring threshold, from 1 to 180 minutes.' }
];

const validateConfig = values => {
  const errors = {};
  const parsed = {};
  for (const field of FIELDS) {
    const value = String(values[field.key] ?? '').trim();
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      errors[field.key] = 'Enter a whole number.';
      continue;
    }
    const number = Number(value);
    if (number < field.min || number > field.max) {
      errors[field.key] = `Allowed range: ${field.min}–${field.max}.`;
    } else {
      parsed[field.key] = number;
    }
  }
  return { errors, parsed };
};

const normalizeLoaded = raw => {
  const config = {};
  for (const field of FIELDS) {
    // A missing or corrupt saved field must not silently become a default.
    if (raw?.[field.key] === null || raw?.[field.key] === undefined) {
      throw new Error(`The server did not return ${field.label}.`);
    }
    config[field.key] = raw[field.key];
  }
  const { errors, parsed } = validateConfig(config);
  if (Object.keys(errors).length) throw new Error('The server returned configuration values outside the supported ranges. Contact the administrator.');
  return parsed;
};

const sameConfig = (a, b) => FIELDS.every(f => String(a?.[f.key]) === String(b?.[f.key]));

const SystemConfig = () => {
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [savedConfig, setSavedConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const requestSeq = useRef(0);

  const { errors, parsed } = useMemo(() => validateConfig(config), [config]);
  const dirty = savedConfig !== null && !sameConfig(config, savedConfig);
  const hasErrors = Object.keys(errors).length > 0;

  const fetchConfig = async () => {
    const request = ++requestSeq.current;
    setLoading(true);
    setLoadError('');
    try {
      // One endpoint returns the same five settings as the atomic PUT.
      const response = await axios.get(`${API_BASE}/system-config`, getAuthHeaders());
      const values = normalizeLoaded(response.data);
      if (request !== requestSeq.current) return;
      setConfig(values);
      setSavedConfig(values);
    } catch (err) {
      if (request !== requestSeq.current) return;
      setSavedConfig(null);
      setLoadError(err.response?.data?.message || err.message || 'Unable to load configuration.');
      toast.error('Could not load current system configuration.');
    } finally {
      if (request === requestSeq.current) setLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleSave = async () => {
    if (saving || loading || !savedConfig || !dirty) return;
    if (hasErrors) {
      toast.error('Correct the highlighted fields before saving.');
      return;
    }
    if (parsed.password_expiry_days === 0 && savedConfig.password_expiry_days !== 0) {
      if (!window.confirm('Disable automatic password expiration for all users?')) return;
    }
    if (parsed.max_login_attempts < Number(savedConfig.max_login_attempts)) {
      if (!window.confirm('Reducing allowed login attempts can lock users out sooner. Continue?')) return;
    }

    setSaving(true);
    try {
      // The updated backend commits both tables in one transaction.
      const result = await axios.put(`${API_BASE}/system-config`, parsed, getAuthHeaders());
      if (result.data?.success !== true) throw new Error('The server did not confirm that configuration was saved.');
      // Reload authoritative values; do not claim success if verification fails.
      const verified = await axios.get(`${API_BASE}/system-config`, getAuthHeaders());
      const values = normalizeLoaded(verified.data);
      if (!sameConfig(values, parsed)) {
        throw new Error('Saved configuration differs from the submitted values. Reload and verify.');
      }
      setConfig(values);
      setSavedConfig(values);
      setLastSavedAt(new Date());
      toast.success('System configuration saved and verified.');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Unable to save configuration. Refresh to confirm current values.');
      // Disable further saves until the server state is reloaded after uncertainty.
      setSavedConfig(null);
      setLoadError('Save could not be verified. Reload configuration before trying again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (saving || loading || !savedConfig) return;
    if (!window.confirm('Load default values into the form? Changes are not applied until you save.')) return;
    setConfig({ ...DEFAULT_CONFIG });
    toast.info('Default values loaded locally. Save to apply them.');
  };

  const handleDiscard = () => {
    if (saving || loading) return;
    if (dirty && !window.confirm('Discard all unsaved configuration changes?')) return;
    fetchConfig();
  };

  const updateField = (key, value) => setConfig(old => ({ ...old, [key]: value }));

  const renderField = key => {
    const field = FIELDS.find(f => f.key === key);
    return (
      <div className="set-form-group" key={key}>
        <label htmlFor={`sc-${key}`}>{field.label}</label>
        <input
          id={`sc-${key}`}
          type="number"
          inputMode="numeric"
          step="1"
          min={field.min}
          max={field.max}
          className={`expert-clean-input border${errors[key] ? ' sc-invalid' : ''}`}
          value={config[key]}
          onChange={e => updateField(key, e.target.value)}
          aria-invalid={!!errors[key]}
          aria-describedby={`sc-hint-${key}${errors[key] ? ` sc-error-${key}` : ''}`}
          disabled={saving}
        />
        <span className="set-hint" id={`sc-hint-${key}`}>{field.hint}</span>
        {errors[key] && <span className="sc-field-error" id={`sc-error-${key}`} role="alert">{errors[key]}</span>}
      </div>
    );
  };

  return (
    <div className="expert-container uv-admin-config">
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            
            <p className="expert-subtitle">Manage global authentication, location, and visitor monitoring policies.</p>
          </div>
        </div>
        {lastSavedAt && !loadError && <span className="sc-saved-at"><CheckCircle2 size={15} /> Verified {lastSavedAt.toLocaleTimeString()}</span>}
      </div>

      {loading ? (
        <div className="expert-card sc-state" role="status"><RefreshCw size={20} className="sc-spin" /> Loading system configuration...</div>
      ) : loadError ? (
        <div className="expert-card sc-state sc-state-error" role="alert">
          <AlertTriangle size={22} />
          <div><strong>Configuration unavailable</strong><p>{loadError}</p></div>
          <button className="expert-btn-secondary" onClick={fetchConfig}><RefreshCw size={16} /> Retry / Reload</button>
        </div>
      ) : (
        <div className="expert-card sc-main-card">
          <div className="sc-section">
            <h3 className="sc-section-title"> Authentication &amp; Account Security</h3>
            <div className="sc-form-grid">{['password_expiry_days','otp_expiry_minutes','max_login_attempts'].map(renderField)}</div>
          </div>
          <div className="sc-section">
            <h3 className="sc-section-title">Location &amp; Attendance Verification</h3>
            <div className="sc-form-grid">{renderField('geofence_default_radius')}</div>
          </div>
          <div className="sc-section">
            <h3 className="sc-section-title"> Visitor Monitoring &amp; Safety</h3>
            <div className="sc-form-grid">{renderField('loiter_threshold_minutes')}</div>
          </div>
          <div className="sc-actions">
            <span className="sc-edit-state" role="status">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
            <button type="button" className="expert-btn-secondary" onClick={handleResetDefaults} disabled={saving}><RotateCcw size={16} /> Reset Defaults</button>
            <button type="button" className="expert-btn-secondary" onClick={handleDiscard} disabled={saving || !dirty}><RefreshCw size={16} /> Discard Changes</button>
            <button type="button" className="expert-btn-primary" onClick={handleSave} disabled={saving || !dirty || hasErrors}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemConfig;
