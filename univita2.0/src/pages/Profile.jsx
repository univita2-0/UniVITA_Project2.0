// src/pages/Profile.jsx
import React, { useState, useEffect, useCallback } from 'react';
import './Profile.css';
import {
  Mail, Shield, Clock, Key, Phone, Briefcase, X, AlertCircle, CheckCircle, UserCircle
} from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const Profile = () => {
  const [user, setUser] = useState({
    id: localStorage.getItem('user_id') || '',
    name: localStorage.getItem('user_name') || '',
    email: localStorage.getItem('user_email') || '',
    role: localStorage.getItem('user_role') || '',
    employeeId: localStorage.getItem('employee_id') || '',
    phone: '',
    position: '',
    daysSinceChange: 0,
    lastLogin: localStorage.getItem('last_login') || 'Today'
  });
  
  // Password change modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const calculateDaysPassed = (dateString) => {
    if (!dateString) return 0;
    const lastChanged = new Date(dateString);
    const today = new Date();
    
    lastChanged.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffMs = today.getTime() - lastChanged.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  const fetchUserDetails = useCallback(async () => {
    if (!user.id) return;
    try {
      const res = await axios.get(`${API_BASE}/employees/${user.id}`, getAuthHeaders());
      const data = res.data;
      const updatedUser = {
        ...user,
        name: data.full_name || user.name,
        email: data.email || user.email,
        phone: data.phone_number || '',
        position: data.position_level || data.position || '',
        daysSinceChange: calculateDaysPassed(data.password_last_changed)
      };
      setUser(updatedUser);
    } catch (err) {
      console.error('Failed to load user details', err);
    }
  }, [user.id]);

  useEffect(() => {
    fetchUserDetails();
  }, [fetchUserDetails]);

  const daysRemaining = Math.max(0, 365 - user.daysSinceChange);
  const isExpiringSoon = daysRemaining <= 30;

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }
    if (passwordForm.newPassword.trim().length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await axios.put(`${API_BASE}/users/${user.id}/update-password`, {
        currentPassword: passwordForm.currentPassword.trim(),
        newPassword: passwordForm.newPassword.trim()
      }, getAuthHeaders());
      
      setShowPasswordModal(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage({ type: 'success', text: 'Password changed successfully. Please log in again.' });
      setTimeout(() => {
        localStorage.clear();
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Invalid current password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'System Administrator',
      hr_admin: 'HR Administrator',
      security: 'Security Personnel',
      instructor: 'Instructor'
    };
    return labels[role] || role;
  };

  return (
    <div className="expert-container">
      {message.text && (
        <div className={`pro-toast ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Profile Header Card */}
      <div className="pro-header-card expert-card">
        <div className="pro-header-content">
          <div className="pro-avatar">
            <span>{user.name ? user.name.charAt(0).toUpperCase() : '?'}</span>
          </div>
          <div className="pro-user-info">
            <h1 className="pro-name">{user.name}</h1>
            <div className="pro-role-badge">
              <Shield size={14} />
              <span>{getRoleLabel(user.role)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pro-grid">
        {/* Account Information Card */}
        <div className="expert-card">
          <div className="pro-card-header">
            <h3>Account Information</h3>
          </div>
          <div className="pro-info-list">
            <div className="pro-info-row">
              <div className="pro-info-icon"><Mail size={16} /></div>
              <div className="pro-info-data">
                <label>Email Address</label>
                <p>{user.email}</p>
              </div>
            </div>
            
            <div className="pro-info-row">
              <div className="pro-info-icon"><Phone size={16} /></div>
              <div className="pro-info-data">
                <label>Phone Number</label>
                <p>{user.phone || 'Not provided'}</p>
              </div>
            </div>

            {/* Conditionally hide the Position row if the user is an admin */}
            {user.role !== 'admin' && (
              <div className="pro-info-row">
                <div className="pro-info-icon"><Briefcase size={16} /></div>
                <div className="pro-info-data">
                  <label>Position / Title</label>
                  <p>{user.position || 'Not assigned'}</p>
                </div>
              </div>
            )}

            <div className="pro-info-row">
              <div className="pro-info-icon"><UserCircle size={16} /></div>
              <div className="pro-info-data">
                <label>Employee ID</label>
                <p>{user.employeeId}</p>
              </div>
            </div>
            
            <div className="pro-info-row">
              <div className="pro-info-icon"><Clock size={16} /></div>
              <div className="pro-info-data">
                <label>Last Login</label>
                <p>{user.lastLogin}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Security Card */}
        <div className="expert-card">
          <div className="pro-card-header">
            <h3>Authentication & Security</h3>
          </div>
          <div className="pro-security-section">
            <div className="pro-password-status">
              <div className="pro-status-text-area">
                <p className="pro-status-title">Password Expiration</p>
                <p className="pro-status-desc">
                  {isExpiringSoon
                    ? `Action required: Password expires in ${daysRemaining} days.`
                    : `Your current password is valid for ${daysRemaining} more days.`}
                </p>
              </div>
              <div className={`pro-status-dot ${isExpiringSoon ? 'warning' : 'safe'}`}></div>
            </div>
            <button className="expert-btn-primary w-100" onClick={() => { setPasswordError(''); setShowPasswordModal(true); }}>
              <Key size={16} /> <span>Change Password</span>
            </button>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="pro-modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="pro-modal" onClick={e => e.stopPropagation()}>
            <div className="pro-modal-header">
              <h2>Change Password</h2>
              <button className="pro-close-btn" onClick={() => setShowPasswordModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form className="pro-form" onSubmit={handleChangePassword}>
              {passwordError && (
                <div className="pro-error-alert">
                  <AlertCircle size={16} />
                  <span>{passwordError}</span>
                </div>
              )}
              <div className="pro-form-group">
                <label>Current Password <span className="pro-required">*</span></label>
                <input
                  type="password"
                  className="expert-clean-input border"
                  value={passwordForm.currentPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  required
                />
              </div>
              <div className="pro-form-group">
                <label>New Password <span className="pro-required">*</span></label>
                <input
                  type="password"
                  className="expert-clean-input border"
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  minLength={6}
                  required
                />
                <span className="pro-hint">Must be at least 6 characters long.</span>
              </div>
              <div className="pro-form-group">
                <label>Confirm New Password <span className="pro-required">*</span></label>
                <input
                  type="password"
                  className="expert-clean-input border"
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  required
                />
              </div>
              <div className="pro-modal-actions">
                <button type="button" className="expert-btn-secondary" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="expert-btn-primary" disabled={changingPassword}>
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;