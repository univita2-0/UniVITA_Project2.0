// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Lock, Bell, Eye, EyeOff, Shield, Key, Settings as SettingsIcon } from 'lucide-react';
import './Settings.css';
import { API_BASE } from '../api';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Profile form
  const [profileData, setProfileData] = useState({
    full_name: '',
    email: '',
    phone: '',
  });

  // Password change
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // PIN change (only for admin/hr)
  const [pinData, setPinData] = useState({
    currentPin: '',
    newPin: '',
    confirmPin: '',
  });
  const [pinError, setPinError] = useState('');
  const [showPinChange, setShowPinChange] = useState(false);

  // Preferences (stored in localStorage)
  const [preferences, setPreferences] = useState({
    emailAlerts: true,
    emergencyAlerts: true,
    leaveUpdates: true,
    darkMode: false,
  });

  const token = localStorage.getItem('auth_token');
  const userRole = localStorage.getItem('user_role');
  const canChangePin = userRole === 'admin' || userRole === 'hr_admin';

  const authAxios = axios.create({
    baseURL: API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  // Load user data
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (storedUser.id) {
      setUser(storedUser);
      setProfileData({
        full_name: storedUser.full_name || '',
        email: storedUser.email || '',
        phone: storedUser.phone || '',
      });
    }
    // Load preferences from localStorage
    const savedPrefs = localStorage.getItem('user_preferences');
    if (savedPrefs) {
      setPreferences(JSON.parse(savedPrefs));
    }
  }, []);

  const showMessage = (text, type = 'success') => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  // Update profile
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authAxios.put(`/employees/${user.id}`, {
        full_name: profileData.full_name,
        email: profileData.email,
        phone: profileData.phone,
      });
      // Update localStorage
      const updatedUser = { ...user, full_name: profileData.full_name, email: profileData.email, phone: profileData.phone };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      showMessage('Profile updated successfully');
    } catch (err) {
      showMessage(err.response?.data?.message || 'Update failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Change password
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    if (passwordData.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authAxios.put(`/users/${user.id}/update-password`, {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showMessage('Password changed successfully');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Invalid current password');
    } finally {
      setLoading(false);
    }
  };

  // Change PIN (only for admin/hr)
  const handlePinChange = async (e) => {
    e.preventDefault();
    setPinError('');
    if (pinData.newPin.length < 4 || pinData.newPin.length > 6 || !/^\d+$/.test(pinData.newPin)) {
      setPinError('PIN must be 4-6 digits');
      return;
    }
    if (pinData.newPin !== pinData.confirmPin) {
      setPinError('PINs do not match');
      return;
    }
    setLoading(true);
    try {
      await authAxios.put('/users/update-pin', {
        email: user.email,
        currentPin: pinData.currentPin,
        newPin: pinData.newPin,
      });
      setPinData({ currentPin: '', newPin: '', confirmPin: '' });
      setShowPinChange(false);
      showMessage('PIN changed successfully');
    } catch (err) {
      setPinError(err.response?.data?.message || 'PIN change failed');
    } finally {
      setLoading(false);
    }
  };

  // Save preferences
  const handlePreferenceChange = (key, value) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    localStorage.setItem('user_preferences', JSON.stringify(newPrefs));
    showMessage('Preferences saved');
  };

  return (
    <div className="set-container">
      <div className="set-wrapper">
        <div className="set-header">
          <div>
            <h2 className="set-title">Account Settings</h2>
            <p className="set-subtitle">Manage your profile, security credentials, and system preferences.</p>
          </div>
          <div className="set-header-icon">
            <SettingsIcon size={24} color="#6B7280" />
          </div>
        </div>

        {message.text && (
          <div className={`set-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="set-tabs">
          <button className={`set-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <User size={16} /> <span>Profile</span>
          </button>
          <button className={`set-tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
            <Lock size={16} /> <span>Security</span>
          </button>
          <button className={`set-tab ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')}>
            <Bell size={16} /> <span>Preferences</span>
          </button>
        </div>

        <div className="set-content">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="set-card">
              <form onSubmit={handleProfileUpdate} className="set-form">
                <div className="set-form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    className="set-input"
                    value={profileData.full_name}
                    onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="set-form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    className="set-input"
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="set-form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    className="set-input"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  />
                </div>
                <div className="set-form-actions">
                  <button type="submit" className="btn-set-save" disabled={loading}>
                    {loading ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="set-security-section">
              <div className="set-card">
                <div className="set-card-header">
                  <Lock size={18} className="set-card-icon" />
                  <h3>Change Password</h3>
                </div>
                <form onSubmit={handlePasswordChange} className="set-form">
                  <div className="set-form-group">
                    <label>Current Password</label>
                    <div className="set-password-wrapper">
                      <input
                        type={showCurrent ? 'text' : 'password'}
                        className="set-input"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        required
                      />
                      <button type="button" className="set-eye-btn" onClick={() => setShowCurrent(!showCurrent)}>
                        {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="set-form-group">
                    <label>New Password</label>
                    <div className="set-password-wrapper">
                      <input
                        type={showNew ? 'text' : 'password'}
                        className="set-input"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        required
                      />
                      <button type="button" className="set-eye-btn" onClick={() => setShowNew(!showNew)}>
                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="set-form-group">
                    <label>Confirm New Password</label>
                    <div className="set-password-wrapper">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        className="set-input"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        required
                      />
                      <button type="button" className="set-eye-btn" onClick={() => setShowConfirm(!showConfirm)}>
                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  {passwordError && <p className="set-error-text">{passwordError}</p>}
                  <div className="set-form-actions">
                    <button type="submit" className="btn-set-save" disabled={loading}>
                      {loading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>

              {canChangePin && (
                <div className="set-card">
                  <div className="set-card-header">
                    <Key size={18} className="set-card-icon" />
                    <h3>Payroll PIN</h3>
                  </div>
                  {!showPinChange ? (
                    <button className="btn-set-outline" onClick={() => setShowPinChange(true)}>
                      Change Security PIN
                    </button>
                  ) : (
                    <form onSubmit={handlePinChange} className="set-form">
                      <div className="set-form-group">
                        <label>Current PIN</label>
                        <input
                          type="password"
                          className="set-input"
                          maxLength="6"
                          pattern="\d*"
                          value={pinData.currentPin}
                          onChange={(e) => setPinData({ ...pinData, currentPin: e.target.value })}
                          required
                        />
                      </div>
                      <div className="set-form-group">
                        <label>New PIN (4-6 digits)</label>
                        <input
                          type="password"
                          className="set-input"
                          maxLength="6"
                          pattern="\d*"
                          value={pinData.newPin}
                          onChange={(e) => setPinData({ ...pinData, newPin: e.target.value })}
                          required
                        />
                      </div>
                      <div className="set-form-group">
                        <label>Confirm New PIN</label>
                        <input
                          type="password"
                          className="set-input"
                          maxLength="6"
                          pattern="\d*"
                          value={pinData.confirmPin}
                          onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value })}
                          required
                        />
                      </div>
                      {pinError && <p className="set-error-text">{pinError}</p>}
                      <div className="set-form-actions pin-actions">
                        <button type="button" className="btn-set-cancel" onClick={() => { setShowPinChange(false); setPinError(''); setPinData({ currentPin: '', newPin: '', confirmPin: '' }); }}>
                          Cancel
                        </button>
                        <button type="submit" className="btn-set-save" disabled={loading}>
                          {loading ? 'Saving...' : 'Save New PIN'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="set-card">
              <div className="set-preferences-section">
                <div className="set-preference-item">
                  <div className="set-pref-info">
                    <h4>Email Notifications</h4>
                    <p>Receive email alerts for pending approvals and system updates.</p>
                  </div>
                  <label className="set-toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.emailAlerts}
                      onChange={(e) => handlePreferenceChange('emailAlerts', e.target.checked)}
                    />
                    <span className="set-toggle-slider"></span>
                  </label>
                </div>
                
                <div className="set-preference-item">
                  <div className="set-pref-info">
                    <h4>Emergency Alerts</h4>
                    <p>Get real-time notifications for critical and warning alerts.</p>
                  </div>
                  <label className="set-toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.emergencyAlerts}
                      onChange={(e) => handlePreferenceChange('emergencyAlerts', e.target.checked)}
                    />
                    <span className="set-toggle-slider"></span>
                  </label>
                </div>
                
                <div className="set-preference-item">
                  <div className="set-pref-info">
                    <h4>Leave Request Updates</h4>
                    <p>Get notified when leave requests are submitted or processed.</p>
                  </div>
                  <label className="set-toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.leaveUpdates}
                      onChange={(e) => handlePreferenceChange('leaveUpdates', e.target.checked)}
                    />
                    <span className="set-toggle-slider"></span>
                  </label>
                </div>
                
                <div className="set-preference-item">
                  <div className="set-pref-info">
                    <h4>Dark Mode</h4>
                    <p>Switch the system interface to a dark theme (Coming Soon).</p>
                  </div>
                  <label className="set-toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.darkMode}
                      onChange={(e) => handlePreferenceChange('darkMode', e.target.checked)}
                      disabled
                    />
                    <span className="set-toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;