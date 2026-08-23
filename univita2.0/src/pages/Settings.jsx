// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { User, Lock, Bell, Eye, EyeOff, Key, Settings as SettingsIcon, Save, ShieldCheck } from 'lucide-react';
import './Settings.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const Settings = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [user, setUser] = useState(null);
  
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingPin, setLoadingPin] = useState(false);

  const [profileData, setProfileData] = useState({
    full_name: '',
    email: '',
    phone: '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [pinData, setPinData] = useState({
    currentPin: '',
    newPin: '',
    confirmPin: '',
  });
  const [showPinChange, setShowPinChange] = useState(false);
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);

  const [preferences, setPreferences] = useState({
    emailAlerts: true,
    emergencyAlerts: true,
    leaveUpdates: true,
    darkMode: false,
  });

  const userRole = localStorage.getItem('user_role');
  const canChangePin = userRole === 'admin' || userRole === 'hr_admin';

  useEffect(() => {
    const storedUser = {
      id: localStorage.getItem('user_id'),
      full_name: localStorage.getItem('user_name'),
      email: localStorage.getItem('user_email'),
      role: localStorage.getItem('user_role'),
      employee_id: localStorage.getItem('employee_id')
    };

    if (storedUser.id) {
      setUser(storedUser);
      setProfileData({
        full_name: storedUser.full_name || '',
        email: storedUser.email || '',
        phone: '',
      });
    }

    const savedPrefs = localStorage.getItem('user_preferences');
    if (savedPrefs) {
      setPreferences(JSON.parse(savedPrefs));
    }
  }, []);

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidPhone = (phone) => phone === '' || /^[\d\s\-\+\(\)]*$/.test(phone);
  const isValidPin = (pin) => /^\d{4,6}$/.test(pin);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!profileData.full_name.trim() || !profileData.email.trim()) {
      return toast.warning('Name and Email are required fields.');
    }
    if (!isValidEmail(profileData.email)) {
      return toast.warning('Please enter a valid email address.');
    }
    if (!isValidPhone(profileData.phone)) {
      return toast.warning('Please enter a valid phone number.');
    }

    setLoadingProfile(true);
    try {
      await axios.put(`${API_BASE}/employees/${user.id}`, {
        full_name: profileData.full_name.trim(),
        email: profileData.email.trim(),
        phone: profileData.phone.trim(),
      }, getAuthHeaders());
      
      localStorage.setItem('user_name', profileData.full_name.trim());
      localStorage.setItem('user_email', profileData.email.trim());
      toast.success('Profile updated successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Profile update failed.');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      return toast.warning('All password fields are required.');
    }
    if (passwordData.newPassword.length < 6) {
      return toast.warning('New password must be at least 6 characters.');
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      return toast.warning('New passwords do not match.');
    }

    setLoadingPassword(true);
    try {
      await axios.put(`${API_BASE}/users/${user.id}/update-password`, {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      }, getAuthHeaders());
      
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid current password.');
    } finally {
      setLoadingPassword(false);
    }
  };

  const handlePinChange = async (e) => {
    e.preventDefault();
    if (!pinData.currentPin || !pinData.newPin || !pinData.confirmPin) {
      return toast.warning('All PIN fields are required.');
    }
    if (!isValidPin(pinData.newPin)) {
      return toast.warning('New PIN must be strictly 4-6 digits.');
    }
    if (pinData.newPin !== pinData.confirmPin) {
      return toast.warning('New PINs do not match.');
    }

    setLoadingPin(true);
    try {
      await axios.put(`${API_BASE}/users/update-pin`, {
        email: user.email,
        currentPin: pinData.currentPin,
        newPin: pinData.newPin,
      }, getAuthHeaders());
      
      setPinData({ currentPin: '', newPin: '', confirmPin: '' });
      setShowPinChange(false);
      toast.success('Security PIN changed successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'PIN change failed.');
    } finally {
      setLoadingPin(false);
    }
  };

  const handlePreferenceChange = (key, value) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    localStorage.setItem('user_preferences', JSON.stringify(newPrefs));
    toast.info('Preferences updated automatically.');
  };

  if (!user) return <div className="expert-loading">Loading settings...</div>;

  return (
    <div className="expert-container">
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Manage your profile, security credentials, and personal interface preferences.</p>
          </div>
        </div>
      </div>

      <div className="set-tabs">
        <button className={`set-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <User size={16} /> <span>Profile Information</span>
        </button>
        <button className={`set-tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
          <Lock size={16} /> <span>Security & Access</span>
        </button>
        <button className={`set-tab ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')}>
          <Bell size={16} /> <span>System Preferences</span>
        </button>
      </div>

      <div className="set-content">
        {activeTab === 'profile' && (
          <div className="expert-card" style={{ padding: '2rem' }}>
            <div className="set-card-header">
              <h3>Personal Information</h3>
            </div>
            <form onSubmit={handleProfileUpdate} className="set-form">
              <div className="set-form-group">
                <label>Full Name <span className="set-required">*</span></label>
                <input
                  type="text"
                  className="expert-clean-input border"
                  value={profileData.full_name}
                  onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div className="set-form-group">
                <label>Email Address <span className="set-required">*</span></label>
                <input
                  type="email"
                  className="expert-clean-input border"
                  value={profileData.email}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  placeholder="Enter your email"
                  required
                />
              </div>
              <div className="set-form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  className="expert-clean-input border"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  placeholder="e.g. +63 912 345 6789"
                />
              </div>
              <div className="set-form-actions">
                <button type="submit" className="expert-btn-primary" disabled={loadingProfile}>
                  <Save size={16} />
                  {loadingProfile ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="set-security-layout">
            <div className="expert-card" style={{ padding: '2rem' }}>
              <div className="set-card-header">
                <ShieldCheck size={20} className="set-icon-accent" />
                <h3>Change Account Password</h3>
              </div>
              <form onSubmit={handlePasswordChange} className="set-form">
                <div className="set-form-group">
                  <label>Current Password <span className="set-required">*</span></label>
                  <div className="set-input-icon-wrapper">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      className="expert-clean-input border"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      required
                    />
                    <button type="button" className="set-eye-btn" onClick={() => setShowCurrent(!showCurrent)} tabIndex="-1">
                      {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="set-form-group">
                  <label>New Password <span className="set-required">*</span></label>
                  <div className="set-input-icon-wrapper">
                    <input
                      type={showNew ? 'text' : 'password'}
                      className="expert-clean-input border"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      minLength={6}
                      required
                    />
                    <button type="button" className="set-eye-btn" onClick={() => setShowNew(!showNew)} tabIndex="-1">
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span className="set-hint">Must be at least 6 characters long.</span>
                </div>
                <div className="set-form-group">
                  <label>Confirm New Password <span className="set-required">*</span></label>
                  <div className="set-input-icon-wrapper">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      className="expert-clean-input border"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      required
                    />
                    <button type="button" className="set-eye-btn" onClick={() => setShowConfirm(!showConfirm)} tabIndex="-1">
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="set-form-actions">
                  <button type="submit" className="expert-btn-primary" disabled={loadingPassword}>
                    <Lock size={16} />
                    {loadingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>

            {canChangePin && (
              <div className="expert-card" style={{ padding: '2rem' }}>
                <div className="set-card-header">
                  <h3>Payroll Security PIN</h3>
                </div>
                <p className="set-card-desc">Your 4-6 digit PIN is required to access sensitive payroll modules.</p>
                
                {!showPinChange ? (
                  <button className="expert-btn-secondary" onClick={() => setShowPinChange(true)}>
                    Change Security PIN
                  </button>
                ) : (
                  <form onSubmit={handlePinChange} className="set-form mt-3">
                    <div className="set-form-group">
                      <label>Current PIN <span className="set-required">*</span></label>
                      <div className="set-input-icon-wrapper">
                        <input
                          type={showCurrentPin ? 'text' : 'password'}
                          className="expert-clean-input border"
                          maxLength="6"
                          value={pinData.currentPin}
                          onChange={(e) => setPinData({ ...pinData, currentPin: e.target.value.replace(/\D/g, '') })}
                          required
                        />
                        <button type="button" className="set-eye-btn" onClick={() => setShowCurrentPin(!showCurrentPin)} tabIndex="-1">
                          {showCurrentPin ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="set-form-row">
                      <div className="set-form-group">
                        <label>New PIN <span className="set-required">*</span></label>
                        <div className="set-input-icon-wrapper">
                          <input
                            type={showNewPin ? 'text' : 'password'}
                            className="expert-clean-input border"
                            maxLength="6"
                            value={pinData.newPin}
                            onChange={(e) => setPinData({ ...pinData, newPin: e.target.value.replace(/\D/g, '') })}
                            required
                          />
                          <button type="button" className="set-eye-btn" onClick={() => setShowNewPin(!showNewPin)} tabIndex="-1">
                            {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <span className="set-hint">Numeric only (4-6 digits).</span>
                      </div>
                      <div className="set-form-group">
                        <label>Confirm PIN <span className="set-required">*</span></label>
                        <input
                          type="password"
                          className="expert-clean-input border"
                          maxLength="6"
                          value={pinData.confirmPin}
                          onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, '') })}
                          required
                        />
                      </div>
                    </div>
                    <div className="set-form-actions split">
                      <button type="button" className="expert-btn-secondary" onClick={() => { 
                        setShowPinChange(false); 
                        setPinData({ currentPin: '', newPin: '', confirmPin: '' }); 
                      }}>
                        Cancel
                      </button>
                      <button type="submit" className="expert-btn-primary" disabled={loadingPin}>
                        <Save size={16} />
                        {loadingPin ? 'Saving...' : 'Save New PIN'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'preferences' && (
          <div className="expert-card" style={{ padding: '2rem' }}>
            <div className="set-card-header">
              <h3>System Notifications & Display</h3>
            </div>
            <div className="set-preferences-list">
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
                  <p>Get real-time UI notifications for critical and warning alerts.</p>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;