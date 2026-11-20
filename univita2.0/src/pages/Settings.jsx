// src/pages/Settings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { User, Lock, Eye, EyeOff, ShieldCheck, Check } from 'lucide-react';
import './Settings.css';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,15}$/;

// Real Email Validation (Matches backend logic)
const DISPOSABLE_EMAIL_DOMAINS = new Set(['mailinator.com','tempmail.com','temp-mail.org','guerrillamail.com','yopmail.com','10minutemail.com','trashmail.com']);
const FAKE_EMAIL_LOCAL_PARTS = new Set(['test','dummy','fake','sample','demo','admin','user','guest','asdf','qwerty','abc','xyz','123','1234','temp']);
const RESERVED_TEST_DOMAINS = new Set(['example.com','example.net','example.org','test.com','test.net','test.org','localhost']);

const isRealEmail = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) return { ok: false, reason: 'Please enter a valid email address.' };
  const [local, domain] = email.split('@');
  if (!domain) return { ok: false, reason: 'Email domain is missing.' };
  if (RESERVED_TEST_DOMAINS.has(domain)) return { ok: false, reason: `"${domain}" is a test domain.` };
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return { ok: false, reason: 'Disposable email domains are not allowed.' };
  if (FAKE_EMAIL_LOCAL_PARTS.has(local)) return { ok: false, reason: `"${local}" is a placeholder local-part.` };
  return { ok: true };
};

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

  const hasLength = passwordData.newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(passwordData.newPassword);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(passwordData.newPassword);
  const passwordsMatch = passwordData.newPassword.length > 0 && passwordData.newPassword === passwordData.confirmPassword;

  const [pinData, setPinData] = useState({
    currentPin: '',
    newPin: '',
    confirmPin: '',
  });
  const [showPinChange, setShowPinChange] = useState(false);
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);

  // FIX: Standardized role key
  const userRole = getUserRole();
  const canChangePin = userRole === 'hr_admin';

  const fetchUserData = useCallback(async (userId) => {
    try {
      const res = await axios.get(`${API_BASE}/employees`, getAuthHeaders());
      const employees = res.data;
      const currentEmp = employees.find(e => e.id.toString() === userId.toString());
      if (currentEmp) {
        const freshUser = {
          id: currentEmp.id,
          full_name: currentEmp.full_name,
          email: currentEmp.email,
          role: currentEmp.role,
          employee_id: currentEmp.employee_id
        };
        setUser(freshUser);
        setProfileData({
          full_name: currentEmp.full_name || '',
          email: currentEmp.email || '',
          phone: currentEmp.phone_number || '',
        });
      }
    } catch (err) {
      console.error('Failed to fetch latest user data', err);
    }
  }, []);

  useEffect(() => {
    const userId = localStorage.getItem('user_id');
    if (userId) {
      const storedUser = {
        id: userId,
        full_name: localStorage.getItem('user_name'),
        email: localStorage.getItem('user_email'),
        role: localStorage.getItem('role'),
        employee_id: localStorage.getItem('employee_id')
      };
      setUser(storedUser);
      setProfileData({
        full_name: storedUser.full_name || '',
        email: storedUser.email || '',
        phone: '',
      });
      fetchUserData(userId);
    }
  }, [fetchUserData]);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!profileData.full_name.trim() || !profileData.email.trim()) {
      return toast.warning('Full name and email are required fields.');
    }
    
    // FIX: Use advanced email validation
    const emailCheck = isRealEmail(profileData.email);
    if (!emailCheck.ok) {
      return toast.warning(emailCheck.reason);
    }

    if (profileData.phone.trim() && !PHONE_REGEX.test(profileData.phone.trim())) {
      return toast.warning('Please enter a valid phone number.');
    }

    setLoadingProfile(true);
    try {
      await axios.put(`${API_BASE}/employees/${user.id}`, {
        full_name: profileData.full_name.trim(),
        email: profileData.email.trim().toLowerCase(),
        phone_number: profileData.phone.trim() || null,
      }, getAuthHeaders());

      localStorage.setItem('user_name', profileData.full_name.trim());
      localStorage.setItem('user_email', profileData.email.trim().toLowerCase());

      setUser(prev => ({
        ...prev,
        full_name: profileData.full_name.trim(),
        email: profileData.email.trim().toLowerCase()
      }));

      toast.success('Profile information updated successfully.');
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
    if (!hasLength || !hasUppercase || !hasSpecial) {
      return toast.warning('New password does not meet all security complexity requirements.');
    }
    if (passwordData.currentPassword === passwordData.newPassword) {
      return toast.warning('New password must differ from your current password.');
    }
    if (!passwordsMatch) {
      return toast.warning('New passwords do not match.');
    }

    setLoadingPassword(true);
    try {
      const res = await axios.put(`${API_BASE}/users/${user.id}/update-password`, {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      }, getAuthHeaders());

      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success(res.data.message || 'Password changed successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Incorrect current password.');
    } finally {
      setLoadingPassword(false);
    }
  };

  const handlePinChange = async (e) => {
    e.preventDefault();
    if (!pinData.currentPin || !pinData.newPin || !pinData.confirmPin) {
      return toast.warning('Current PIN or password, new PIN, and confirmation are required.');
    }
    if (!/^\d{4,6}$/.test(pinData.newPin)) {
      return toast.warning('New PIN must be strictly 4 to 6 numeric digits.');
    }
    if (pinData.currentPin === pinData.newPin) {
      return toast.warning('New PIN must differ from your current PIN.');
    }
    if (pinData.newPin !== pinData.confirmPin) {
      return toast.warning('New PINs do not match.');
    }

    setLoadingPin(true);
    try {
      const res = await axios.put(`${API_BASE}/users/update-pin`, {
        email: user.email,
        currentPin: pinData.currentPin,
        newPin: pinData.newPin,
      }, getAuthHeaders());

      setPinData({ currentPin: '', newPin: '', confirmPin: '' });
      setShowPinChange(false);
      toast.success(res.data.message || 'Security PIN changed successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'PIN update failed.');
    } finally {
      setLoadingPin(false);
    }
  };

  if (!user) return <div className="stx-loading">Loading settings...</div>;

  return (
    <div className="stx-container">
      <div className="stx-header">
        <div>
          
          <p>Manage your profile details, password, and authorized security settings.</p>
        </div>
      </div>

      <div className="stx-layout">
        <aside className="stx-sidebar">
          <nav className="stx-nav" aria-label="Settings sections">
            <button
              className={`stx-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
              aria-current={activeTab === 'profile' ? 'page' : undefined}
            >
              <User size={18} /> Profile Information
            </button>
            <button
              className={`stx-nav-item ${activeTab === 'password' ? 'active' : ''}`}
              onClick={() => setActiveTab('password')}
              aria-current={activeTab === 'password' ? 'page' : undefined}
            >
              <Lock size={18} /> Account Password
            </button>
            {canChangePin && (
              <button
                className={`stx-nav-item ${activeTab === 'pin' ? 'active' : ''}`}
                onClick={() => setActiveTab('pin')}
                aria-current={activeTab === 'pin' ? 'page' : undefined}
              >
                <ShieldCheck size={18} /> Payroll Security PIN
              </button>
            )}
          </nav>
        </aside>

        <main className="stx-main">
          {activeTab === 'profile' && (
            <section className="stx-section">
              <div className="stx-section-header">
                <h3>Profile Information</h3>
                <p>Update your basic profile details and contact information.</p>
              </div>

              <form onSubmit={handleProfileUpdate} className="stx-form">
                <div className="stx-form-group">
                  <label>Full Name <span className="stx-required">*</span></label>
                  <input
                    type="text"
                    className="stx-input"
                    value={profileData.full_name}
                    onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div className="stx-form-row">
                  <div className="stx-form-group">
                    <label>Email Address <span className="stx-required">*</span></label>
                    <input
                      type="email"
                      className="stx-input"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                  <div className="stx-form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      className="stx-input"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      placeholder="e.g. +63 912 345 6789"
                    />
                  </div>
                </div>

                <div className="stx-actions">
                  <button type="submit" className="stx-btn-primary" disabled={loadingProfile}>
                    {loadingProfile ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeTab === 'password' && (
            <section className="stx-section">
              <div className="stx-section-header">
                <h3>Account Password</h3>
                <p>Ensure your account is using a long, random password to stay secure.</p>
              </div>

              <form onSubmit={handlePasswordChange} className="stx-form">
                <div className="stx-form-group">
                  <label>Current Password <span className="stx-required">*</span></label>
                  <div className="stx-input-wrapper">
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      className="stx-input"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      required
                    />
                    <button type="button" className="stx-eye-btn" onClick={() => setShowCurrent(!showCurrent)} aria-label="Toggle visibility">
                      {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="stx-divider"></div>

                <div className="stx-form-row align-start">
                  <div className="stx-form-group">
                    <label>New Password <span className="stx-required">*</span></label>
                    <div className="stx-input-wrapper">
                      <input
                        type={showNew ? 'text' : 'password'}
                        className="stx-input"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        required
                      />
                      <button type="button" className="stx-eye-btn" onClick={() => setShowNew(!showNew)} aria-label="Toggle visibility">
                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    <div className="stx-checklist">
                      <div className={`stx-check-item ${hasLength ? 'pass' : ''}`}>
                        {hasLength ? <Check size={14} /> : <span className="dot" />} At least 8 characters
                      </div>
                      <div className={`stx-check-item ${hasUppercase ? 'pass' : ''}`}>
                        {hasUppercase ? <Check size={14} /> : <span className="dot" />} At least 1 uppercase letter
                      </div>
                      <div className={`stx-check-item ${hasSpecial ? 'pass' : ''}`}>
                        {hasSpecial ? <Check size={14} /> : <span className="dot" />} At least 1 special character
                      </div>
                    </div>
                  </div>

                  <div className="stx-form-group">
                    <label>Confirm New Password <span className="stx-required">*</span></label>
                    <div className="stx-input-wrapper">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        className="stx-input"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        required
                      />
                      <button type="button" className="stx-eye-btn" onClick={() => setShowConfirm(!showConfirm)} aria-label="Toggle visibility">
                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {passwordData.confirmPassword.length > 0 && (
                      <span className={`stx-match-text ${passwordsMatch ? 'match' : 'error'}`}>
                        {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="stx-actions">
                  <button
                    type="submit"
                    className="stx-btn-primary"
                    disabled={loadingPassword || !hasLength || !hasUppercase || !hasSpecial || !passwordsMatch}
                  >
                    {loadingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeTab === 'pin' && canChangePin && (
            <section className="stx-section">
              <div className="stx-section-header">
                <div className="stx-header-title-row">
                  <h3>Payroll Security PIN</h3>
                </div>
                <p>Your 4 to 6 digit numerical PIN is required to access sensitive payroll modules and records.</p>
              </div>

              {!showPinChange ? (
                <div className="stx-actions stx-actions-top">
                  <button type="button" className="stx-btn-secondary" onClick={() => setShowPinChange(true)}>
                    Set or Change Security PIN
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePinChange} className="stx-form stx-pin-form">
                  <div className="stx-pin-form-intro">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <div>
                      <strong>Secure your payroll access</strong>
                      <span>Your account password is only needed when setting up your first PIN.</span>
                    </div>
                  </div>
                  <div className="stx-form-group stx-current-credential">
                    <label htmlFor="payroll-current-credential">
                      Current PIN or Account Password <span className="stx-required">*</span>
                    </label>
                    <div className="stx-input-wrapper">
                      <input
                        id="payroll-current-credential"
                        type={showCurrentPin ? 'text' : 'password'}
                        className="stx-input"
                        value={pinData.currentPin}
                        onChange={(e) => setPinData({ ...pinData, currentPin: e.target.value })}
                        aria-describedby="payroll-credential-help"
                        autoComplete="off"
                        required
                      />
                      <button
                        type="button"
                        className="stx-eye-btn"
                        onClick={() => setShowCurrentPin(!showCurrentPin)}
                        aria-label={showCurrentPin ? 'Hide current credential' : 'Show current credential'}
                      >
                        {showCurrentPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="stx-hint stx-credential-help" id="payroll-credential-help">
                      Enter your existing PIN. If this is your first time setting a PIN,
                      enter your account password instead.
                    </p>
                  </div>

                  <div className="stx-divider"></div>

                  <div className="stx-form-row">
                    <div className="stx-form-group">
                      <label htmlFor="payroll-new-pin">New PIN <span className="stx-required">*</span></label>
                      <div className="stx-input-wrapper">
                        <input
                          id="payroll-new-pin"
                          type={showNewPin ? 'text' : 'password'}
                          className="stx-input"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength="6"
                          value={pinData.newPin}
                          onChange={(e) => setPinData({ ...pinData, newPin: e.target.value.replace(/\D/g, '') })}
                          required
                        />
                        <button type="button" className="stx-eye-btn" onClick={() => setShowNewPin(!showNewPin)} aria-label="Toggle visibility">
                          {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <span className="stx-hint">Numeric digits only (4-6 digits).</span>
                    </div>

                    <div className="stx-form-group">
                      <label htmlFor="payroll-confirm-pin">Confirm New PIN <span className="stx-required">*</span></label>
                      <input
                        id="payroll-confirm-pin"
                        inputMode="numeric"
                        autoComplete="off"
                        type="password"
                        className="stx-input"
                        maxLength="6"
                        value={pinData.confirmPin}
                        onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, '') })}
                        required
                      />
                    </div>
                  </div>

                  <div className="stx-actions split">
                    <button
                      type="button"
                      className="stx-btn-secondary"
                      onClick={() => {
                        setShowPinChange(false);
                        setPinData({ currentPin: '', newPin: '', confirmPin: '' });
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="stx-btn-primary" disabled={loadingPin}>
                      {loadingPin ? 'Saving...' : 'Save New PIN'}
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default Settings;
