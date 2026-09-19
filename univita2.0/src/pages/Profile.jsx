// src/pages/Profile.jsx
import React, { useState, useEffect, useCallback } from 'react';
import './Profile.css';
import { Mail, Shield, Clock, Phone, Briefcase, UserCircle, CheckCircle } from 'lucide-react';
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
    lastLogin: localStorage.getItem('last_login') || 'Today'
  });

  const fetchUserDetails = useCallback(async () => {
    if (!user.id) return;
    try {
      const res = await axios.get(`${API_BASE}/employees/${user.id}`, getAuthHeaders());
      const data = res.data;
      setUser(prev => ({
        ...prev,
        name: data.full_name || prev.name,
        email: data.email || prev.email,
        phone: data.phone_number || '',
        position: data.position_level || data.position || '',
      }));
    } catch (err) {
      console.error('Failed to load user details', err);
    }
  }, [user.id]);

  useEffect(() => {
    fetchUserDetails();
  }, [fetchUserDetails]);

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'System Administrator',
      hr_admin: 'HR Administrator',
      security: 'Security Personnel',
      instructor: 'Instructor'
    };
    return labels[role] || role;
  };

  const getDisplayPosition = () => {
    if (user.role === 'hr_admin') return 'HR ADMINISTRATOR';
    if (user.role === 'security') return 'SECURITY PERSONNEL';
    if (user.role === 'admin') return 'SYSTEM ADMINISTRATOR';
    return user.position || 'Not assigned';
  };

  return (
    <div className="modern-pro-container">
      {/* Hero Banner Header */}
      <div className="modern-pro-hero">
        <div className="modern-pro-hero-left">
          <div className="modern-pro-avatar">
            <span>{user.name ? user.name.charAt(0).toUpperCase() : '?'}</span>
          </div>
          <div className="modern-pro-hero-meta">
            <h2>{user.name}</h2>
            <div className="modern-pro-badges">
              <span className="modern-pro-pill role">
                <Shield size={13} /> {getRoleLabel(user.role)}
              </span>
              <span className="modern-pro-pill id">
                ID: {user.employeeId || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resizable Fluid Grid Layout */}
      <div className="modern-pro-grid">
        {/* Primary Details Card */}
        <div className="modern-pro-card">
          <div className="modern-pro-card-header">
            <h3>Account & Personal Information</h3>
          </div>
          <div className="modern-pro-card-body">
            <div className="modern-pro-field-grid">
              <div className="modern-pro-field">
                <div className="field-icon"><Mail size={18} /></div>
                <div className="field-content">
                  <label>Email Address</label>
                  <span className="field-value">{user.email}</span>
                </div>
              </div>

              <div className="modern-pro-field">
                <div className="field-icon"><Phone size={18} /></div>
                <div className="field-content">
                  <label>Contact Number</label>
                  <span className="field-value">{user.phone || 'Not provided'}</span>
                </div>
              </div>

              <div className="modern-pro-field">
                <div className="field-icon"><Briefcase size={18} /></div>
                <div className="field-content">
                  <label>Official Position / Authorization</label>
                  <span className="field-value uppercase">{getDisplayPosition()}</span>
                </div>
              </div>

              <div className="modern-pro-field">
                <div className="field-icon"><UserCircle size={18} /></div>
                <div className="field-content">
                  <label>Personnel Identifier</label>
                  <span className="field-value">{user.employeeId || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Access & Status Card */}
        <div className="modern-pro-card">
          <div className="modern-pro-card-header">
            <h3>System Access & Status</h3>
          </div>
          <div className="modern-pro-card-body">
            <div className="modern-pro-field-grid">
              <div className="modern-pro-field">
                <div className="field-icon"><Clock size={18} /></div>
                <div className="field-content">
                  <label>Last Authentication</label>
                  <span className="field-value">{user.lastLogin}</span>
                </div>
              </div>

              <div className="modern-pro-field">
                <div className="field-icon"><Shield size={18} /></div>
                <div className="field-content">
                  <label>Security Clearance</label>
                  <span className="field-value uppercase">{user.role} tier</span>
                </div>
              </div>
            </div>

            <div className="modern-pro-notice-box">
              <CheckCircle size={16} />
              <span>Your account is active, verified, and secured under enterprise encryption standards.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;