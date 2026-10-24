// src/pages/Profile.jsx
import React, { useState, useEffect, useCallback } from 'react';
import './Profile.css';
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
    if (user.role === 'hr_admin') return 'HR Administrator';
    if (user.role === 'security') return 'Security Personnel';
    if (user.role === 'admin') return 'System Administrator';
    return user.position || 'Not assigned';
  };

  return (
    <div className="pro-container">
      {/* Page Header */}
      <header className="pro-header">
        <div>
          
        </div>
        <div className="pro-status-badge">
          <span className="pro-dot"></span>
          Verified Account
        </div>
      </header>

      {/* Identity Hero */}
      <section className="pro-hero">
        <div className="pro-avatar">
          {user.name ? user.name.charAt(0).toUpperCase() : '?'}
        </div>
        <div className="pro-hero-info">
          <h2 className="pro-name">{user.name || 'Unknown User'}</h2>
          <p className="pro-role">{getRoleLabel(user.role)}</p>
        </div>
      </section>

      {/* Detailed Information Grid */}
      <div className="pro-grid">
        
        {/* Personal Information */}
        <article className="pro-card">
          <h3 className="pro-card-title">Personal Information</h3>
          <div className="pro-card-body">
            <div className="pro-row">
              <span className="pro-label">Employee ID</span>
              <span className="pro-value mono">{user.employeeId || 'N/A'}</span>
            </div>
            <div className="pro-row">
              <span className="pro-label">Designation</span>
              <span className="pro-value">{getDisplayPosition()}</span>
            </div>
          </div>
        </article>

        {/* Contact Information */}
        <article className="pro-card">
          <h3 className="pro-card-title">Contact Information</h3>
          <div className="pro-card-body">
            <div className="pro-row">
              <span className="pro-label">Email Address</span>
              <span className="pro-value">{user.email || '—'}</span>
            </div>
            <div className="pro-row">
              <span className="pro-label">Phone Number</span>
              <span className="pro-value">{user.phone || 'Not registered'}</span>
            </div>
          </div>
        </article>

        {/* Security & Access */}
        <article className="pro-card">
          <h3 className="pro-card-title">Security & Access</h3>
          <div className="pro-card-body">
            <div className="pro-row">
              <span className="pro-label">Authorization Tier</span>
              <span className="pro-value">{(user.role || 'USER').toUpperCase()} LEVEL</span>
            </div>
            <div className="pro-row">
              <span className="pro-label">Last Authentication</span>
              <span className="pro-value">{user.lastLogin}</span>
            </div>
            <div className="pro-row">
              <span className="pro-label">Session Status</span>
              <span className="pro-value text-success">Encrypted & Secure</span>
            </div>
          </div>
        </article>

      </div>
    </div>
  );
};

export default Profile;