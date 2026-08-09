// src/pages/Profile.jsx
import React, { useState, useEffect } from 'react';
import './Profile.css';
import {
  Mail, Shield, Clock, Key, Phone, Briefcase, Edit2, X, AlertCircle, CheckCircle, UserCircle
} from 'lucide-react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: ''
  });

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const token = localStorage.getItem('auth_token');
  const authAxios = axios.create({
    baseURL: API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  useEffect(() => {
    fetchUserDetails();
  }, []);

  const fetchUserDetails = async () => {
    if (!user.id) return;
    try {
      const res = await authAxios.get(`/api/employees/${user.id}`);
      const data = res.data;
      const updatedUser = {
        ...user,
        name: data.full_name || user.name,
        email: data.email || user.email,
        phone: data.phone || '',
        position: data.position_level || data.position || '',
        daysSinceChange: data.password_last_changed
          ? Math.floor((Date.now() - new Date(data.password_last_changed).getTime()) / (1000 * 60 * 60 * 24))
          : 0
      };
      setUser(updatedUser);
      setEditForm({
        full_name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone
      });
    } catch (err) {
      console.error('Failed to load user details', err);
    }
  };

  const daysRemaining = Math.max(0, 365 - user.daysSinceChange);
  const isExpiringSoon = daysRemaining <= 30;

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authAxios.put(`/api/employees/${user.id}`, {
        full_name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone
      });
      localStorage.setItem('user_name', editForm.full_name);
      localStorage.setItem('user_email', editForm.email);
      setUser(prev => ({
        ...prev,
        name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone
      }));
      setMessage({ type: 'success', text: 'Profile updated successfully' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      setEditMode(false);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Update failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('All fields are required.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (passwordForm.newPassword.trim().length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    setChangingPassword(true);
    try {
      await authAxios.put(`/api/users/${user.id}/update-password`, {
        currentPassword: passwordForm.currentPassword.trim(),
        newPassword: passwordForm.newPassword.trim()
      });
      setShowPasswordModal(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage({ type: 'success', text: 'Password changed successfully. Please log in again.' });
      setTimeout(() => {
        localStorage.clear();
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Failed to update password.');
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
    <div className="pro-container">
      {message.text && (
        <div className={`pro-toast ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Profile Header Card */}
      <div className="pro-header-card">
        <div className="pro-header-content">
          <div className="pro-avatar">
            <span>{user.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="pro-user-info">
            <h1 className="pro-name">{user.name}</h1>
            <div className="pro-role-badge">
              <Shield size={14} />
              <span>{getRoleLabel(user.role)}</span>
            </div>
          </div>
        </div>
        <button className="btn-pro-outline" onClick={() => setEditMode(true)}>
          <Edit2 size={16} /> <span>Edit Profile</span>
        </button>
      </div>

      <div className="pro-grid">
        {/* Account Information Card */}
        <div className="pro-card">
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
            <div className="pro-info-row">
              <div className="pro-info-icon"><Briefcase size={16} /></div>
              <div className="pro-info-data">
                <label>Position / Title</label>
                <p>{user.position || 'Not assigned'}</p>
              </div>
            </div>
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
        <div className="pro-card">
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
            <button className="btn-pro-primary w-100" onClick={() => setShowPasswordModal(true)}>
              <Key size={16} /> <span>Change Password</span>
            </button>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {editMode && (
        <div className="pro-modal-overlay" onClick={() => setEditMode(false)}>
          <div className="pro-modal" onClick={e => e.stopPropagation()}>
            <div className="pro-modal-header">
              <h2>Edit Profile</h2>
              <button className="pro-close-btn" onClick={() => setEditMode(false)}>
                <X size={20} />
              </button>
            </div>
            <form className="pro-form" onSubmit={handleEditSubmit}>
              <div className="pro-form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  className="pro-input"
                  value={editForm.full_name}
                  onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="pro-form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  className="pro-input"
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="pro-form-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  className="pro-input"
                  value={editForm.phone}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div className="pro-modal-actions">
                <button type="button" className="btn-pro-cancel" onClick={() => setEditMode(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-pro-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <label>Current Password</label>
                <input
                  type="password"
                  className="pro-input"
                  value={passwordForm.currentPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  required
                />
              </div>
              <div className="pro-form-group">
                <label>New Password</label>
                <input
                  type="password"
                  className="pro-input"
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  required
                />
              </div>
              <div className="pro-form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  className="pro-input"
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  required
                />
              </div>
              <div className="pro-modal-actions">
                <button type="button" className="btn-pro-cancel" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-pro-primary" disabled={changingPassword}>
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