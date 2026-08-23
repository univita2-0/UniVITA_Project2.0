// src/pages/SystemConfig.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Save, RefreshCw, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import './SystemConfig.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const SystemConfig = () => {
  const [config, setConfig] = useState({
    password_expiry_days: 365,
    otp_expiry_minutes: 5,
    geofence_default_radius: 200,
    max_login_attempts: 5
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API_BASE}/system-config`, getAuthHeaders());
      setConfig(res.data);
    } catch (err) {
      console.error('Failed to fetch config', err);
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_BASE}/system-config`, config, getAuthHeaders());
      toast.success('Configuration saved successfully.');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to save configuration.';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="expert-loading">Loading system parameters...</div>;

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Manage global security policies and core platform parameters.</p>
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="expert-card" style={{ padding: '2rem' }}>
        <div className="set-card-header">
          <ShieldCheck size={20} className="set-icon-accent" />
          <h3>Global Security Policies</h3>
        </div>
        
        <div className="sc-form-grid">
          <div className="set-form-group">
            <label>Password Expiry (Days)</label>
            <input
              type="number"
              className="expert-clean-input border"
              value={config.password_expiry_days}
              onChange={e => setConfig({ ...config, password_expiry_days: parseInt(e.target.value) || 0 })}
              min="0"
            />
            <span className="set-hint">Set to 0 to disable expiration.</span>
          </div>

          <div className="set-form-group">
            <label>OTP Expiry (Minutes)</label>
            <input
              type="number"
              className="expert-clean-input border"
              value={config.otp_expiry_minutes}
              onChange={e => setConfig({ ...config, otp_expiry_minutes: parseInt(e.target.value) || 1 })}
              min="1"
            />
            <span className="set-hint">Time allowed before a verification code expires.</span>
          </div>

          <div className="set-form-group">
            <label>Default Geofence Radius (Meters)</label>
            <input
              type="number"
              className="expert-clean-input border"
              value={config.geofence_default_radius}
              onChange={e => setConfig({ ...config, geofence_default_radius: parseInt(e.target.value) || 50 })}
              min="50"
            />
            <span className="set-hint">Minimum radius is 50 meters.</span>
          </div>

          <div className="set-form-group">
            <label>Max Login Attempts</label>
            <input
              type="number"
              className="expert-clean-input border"
              value={config.max_login_attempts}
              onChange={e => setConfig({ ...config, max_login_attempts: parseInt(e.target.value) || 3 })}
              min="1"
            />
            <span className="set-hint">Accounts lock after this many failed attempts.</span>
          </div>
        </div>

        <div className="sc-actions">
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