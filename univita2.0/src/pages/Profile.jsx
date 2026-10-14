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
      <div className="pro-layout-grid">
        
        {/* Left Column: Identity Anchor */}
        <div className="pro-identity-pane">
          <div className="pro-avatar-wrapper">
            <div className="pro-avatar">
              {user.name ? user.name.charAt(0).toUpperCase() : '?'}
            </div>
            <div className="pro-status-dot" title="Active Authentication"></div>
          </div>
          
          <h2 className="pro-user-name">{user.name}</h2>
          <span className="pro-role-badge">{getRoleLabel(user.role)}</span>

          <div className="pro-contact-block">
            <div className="pro-contact-row">
              <Mail size={15} className="pro-contact-icon" />
              <span>{user.email}</span>
            </div>
            <div className="pro-contact-row">
              <Phone size={15} className="pro-contact-icon" />
              <span>{user.phone || 'No phone registered'}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Specifications */}
        <div className="pro-details-pane">
          
          {/* Section 1: Administrative Profile */}
          <div className="pro-detail-card">
            <div className="pro-card-header">
              
              <h3>Administrative Profile</h3>
            </div>
            <div className="pro-card-body">
              <div className="pro-data-row">
                <span className="pro-label">Personnel Identifier</span>
                <span className="pro-value mono">{user.employeeId || 'N/A'}</span>
              </div>
              <div className="pro-data-row">
                <span className="pro-label">Assigned Designation</span>
                <span className="pro-value uppercase">{getDisplayPosition()}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Security & System Access */}
          <div className="pro-detail-card">
            <div className="pro-card-header">
              <div className="pro-header-icon teal">
                <ShieldCheck size={18} />
              </div>
              <h3>Security & Authentication</h3>
            </div>
            <div className="pro-card-body">
              <div className="pro-data-row">
                <span className="pro-label">Authorization Tier</span>
                <span className="pro-value highlight uppercase">{user.role} LEVEL</span>
              </div>
              <div className="pro-data-row">
                <span className="pro-label">Last Authentication</span>
                <span className="pro-value">{user.lastLogin}</span>
              </div>
              <div className="pro-data-row">
                <span className="pro-label">Session Status</span>
                <div className="pro-value-badge success">
                  <CheckCircle2 size={14} />
                  <span>Secured & Encrypted</span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Profile;