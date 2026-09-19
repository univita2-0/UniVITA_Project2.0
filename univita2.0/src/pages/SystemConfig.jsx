// src/pages/SystemConfig.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Save, RefreshCw, ShieldCheck, RotateCcw, AlertTriangle } from 'lucide-react';
import './SystemConfig.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const DEFAULT_CONFIG = {
  password_expiry_days: 365,
  otp_expiry_minutes: 5,
  geofence_default_radius: 200,
  max_login_attempts: 5
};

const SystemConfig = () => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/system-config`, getAuthHeaders());
      setConfig({
        password_expiry_days: res.data.password_expiry_days ?? 365,
        otp_expiry_minutes: res.data.otp_expiry_minutes ?? 5,
        geofence_default_radius: res.data.geofence_default_radius ?? 200,
        max_login_attempts: res.data.max_login_attempts ?? 5
      });
    } catch (err) {
      console.error('Failed to fetch config', err);
      toast.error('Failed to load system configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // ---- Strict Validation Flow ----
    const pwdExpiry = parseInt(config.password_expiry_days, 10);
    const otpExpiry = parseInt(config.otp_expiry_minutes, 10);
    const radius = parseInt(config.geofence_default_radius, 10);
    const maxAttempts = parseInt(config.max_login_attempts, 10);

    if (isNaN(pwdExpiry) || pwdExpiry < 0 || pwdExpiry > 1095) {
      return toast.error('Password expiry must be between 0 (disabled) and 1095 days (3 years).');
    }
    if (isNaN(otpExpiry) || otpExpiry < 1 || otpExpiry > 60) {
      return toast.error('OTP expiry must be between 1 and 60 minutes.');
    }
    if (isNaN(radius) || radius < 50 || radius > 2000) {
      return toast.error('Geofence radius must be between 50 and 2000 meters to account for GPS drift.');
    }
    if (isNaN(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      return toast.error('Max login attempts must be between 1 and 10.');
    }

    setSaving(true);
    try {
      const payload = {
        password_expiry_days: pwdExpiry,
        otp_expiry_minutes: otpExpiry,
        geofence_default_radius: radius,
        max_login_attempts: maxAttempts
      };
      const res = await axios.put(`${API_BASE}/system-config`, payload, getAuthHeaders());
      toast.success(res.data.message || 'System configuration successfully updated.');
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to save configuration.';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    toast.info('Loaded default settings. Click "Save Configuration" to apply.');
  };

  if (loading) return <div className="expert-loading">Loading system parameters...</div>;

  return (
    <div className="expert-container">
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            
            <p className="expert-subtitle">Manage global security policies, authentication timeouts, and geofence parameters.</p>
          </div>
        </div>
      </div>

      <div className="expert-card" style={{ padding: '2rem' }}>
        <div className="set-card-header">
          <ShieldCheck size={20} className="set-icon-accent" />
          <h3>Global Security & Geofence Policies</h3>
        </div>
        
        <div className="sc-form-grid">
          <div className="set-form-group">
            <label>Password Expiry (Days)</label>
            <input
              type="number"
              className="expert-clean-input border"
              value={config.password_expiry_days}
              onChange={e => setConfig({ ...config, password_expiry_days: e.target.value })}
              min="0"
              max="1095"
            />
            <span className="set-hint">Set to 0 to disable expiration (Max 1095 days).</span>
          </div>

          <div className="set-form-group">
            <label>OTP Expiry (Minutes)</label>
            <input
              type="number"
              className="expert-clean-input border"
              value={config.otp_expiry_minutes}
              onChange={e => setConfig({ ...config, otp_expiry_minutes: e.target.value })}
              min="1"
              max="60"
            />
            <span className="set-hint">Time allowed before a login verification code expires (1–60 mins).</span>
          </div>

          <div className="set-form-group">
            <label>Default Geofence Radius (Meters)</label>
            <input
              type="number"
              className="expert-clean-input border"
              value={config.geofence_default_radius}
              onChange={e => setConfig({ ...config, geofence_default_radius: e.target.value })}
              min="50"
              max="2000"
            />
            <span className="set-hint">Allowed distance threshold for GPS attendance clock-ins (50–2000m).</span>
          </div>

          <div className="set-form-group">
            <label>Max Login Attempts</label>
            <input
              type="number"
              className="expert-clean-input border"
              value={config.max_login_attempts}
              onChange={e => setConfig({ ...config, max_login_attempts: e.target.value })}
              min="1"
              max="10"
            />
            <span className="set-hint">Failed attempts before automated IP/account security lockout (1–10).</span>
          </div>
        </div>

        <div className="sc-actions">
          <button className="expert-btn-secondary" onClick={handleResetDefaults} disabled={saving} title="Reset to standard defaults">
            <RotateCcw size={16} /> <span>Reset Defaults</span>
          </button>
          <button className="expert-btn-secondary" onClick={fetchConfig} disabled={saving}>
            <RefreshCw size={16} /> <span>Discard Changes</span>
          </button>
          <button className="expert-btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} /> <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemConfig;