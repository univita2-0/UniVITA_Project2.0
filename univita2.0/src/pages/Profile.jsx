// src/pages/Profile.jsx
import React, { useState, useEffect, useCallback } from 'react';
import './Profile.css';
import { Mail, Shield, Clock, Phone, Briefcase, UserCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
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
    <div className="pro-container">
      {/* Page Header */}
      <header className="pro-page-header">
        <div>
          
          <p className="pro-page-subtitle">
            Your personal identity, credentials, and secure account overview.
          </p>
        </div>
        <div className="pro-header-badge">
          <ShieldCheck size={14} />
          <span>Verified Account</span>
        </div>
      </header>

      {/* Identity Hero (Strictly Identity Only) */}
      <section className="pro-hero">
        <div className="pro-hero-accent" aria-hidden="true" />
        <div className="pro-hero-inner">
          <div className="pro-hero-identity">
            <div className="pro-avatar-wrapper">
              <div className="pro-avatar">
                {user.name ? user.name.charAt(0).toUpperCase() : '?'}
              </div>
              <span className="pro-online-dot" title="Active Authentication" />
            </div>
            <div className="pro-hero-info">
              <h2 className="pro-hero-name">{user.name || 'Unknown User'}</h2>
              <div className="pro-hero-meta">
                <span className="pro-role-pill">{getRoleLabel(user.role)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Information Cards */}
      <div className="pro-cards-grid">
        {/* Personal Information */}
        <article className="pro-info-card">
          <header className="pro-info-header">
            <div className="pro-info-icon slate">
              <UserCircle size={18} />
            </div>
            <div>
              <h3>Personal Information</h3>
              
            </div>
          </header>
          <div className="pro-info-body">
            <div className="pro-info-row">
              <span className="pro-info-label">
                <Briefcase size={14} /> Employee ID
              </span>
              <span className="pro-info-value mono">{user.employeeId || 'N/A'}</span>
            </div>
            <div className="pro-info-row">
              <span className="pro-info-label">
                <Shield size={14} /> Designation
              </span>
              <span className="pro-info-value">{getDisplayPosition()}</span>
            </div>
          </div>
        </article>

        {/* Contact Information */}
        <article className="pro-info-card">
          <header className="pro-info-header">
            <div className="pro-info-icon ">
              <Mail size={18} />
            </div>
            <div>
              <h3>Contact Information</h3>
              
            </div>
          </header>
          <div className="pro-info-body">
            <div className="pro-info-row">
              <span className="pro-info-label">
                <Mail size={14} /> Email
              </span>
              <span className="pro-info-value">{user.email || '—'}</span>
            </div>
            <div className="pro-info-row">
              <span className="pro-info-label">
                <Phone size={14} /> Phone
              </span>
              <span className="pro-info-value">
                {user.phone || 'Not registered'}
              </span>
            </div>
          </div>
        </article>

        {/* Security & Access */}
        <article className="pro-info-card">
          <header className="pro-info-header">
            <div className="pro-info-icon ">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h3>Security & Access</h3>
              
            </div>
          </header>
          <div className="pro-info-body">
            <div className="pro-info-row">
              <span className="pro-info-label">
                <Shield size={14} /> Authorization Tier
              </span>
              <span className="pro-info-value ">
                {(user.role || 'USER').toUpperCase()} LEVEL
              </span>
            </div>
            <div className="pro-info-row">
              <span className="pro-info-label">
                <Clock size={14} /> Last Authentication
              </span>
              <span className="pro-info-value">{user.lastLogin}</span>
            </div>
            <div className="pro-info-row">
              <span className="pro-info-label">Session Status</span>
              <span className="pro-status-pill ">
                <CheckCircle2 size={13} /> Encrypted & Secure
              </span>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
};

export default Profile;