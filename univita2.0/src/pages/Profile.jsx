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
    <div className="up-container">
      <div className="up-wrapper">
        
        {/* Unified Profile Card */}
        <div className="up-card">
          
          {/* Left Sidebar: Identity Anchor */}
          <div className="up-sidebar">
            <div className="up-avatar">
              {user.name ? user.name.charAt(0).toUpperCase() : '?'}
            </div>
            <h2 className="up-name">{user.name}</h2>
            <p className="up-role-text"></p>
            
           

            <div className="up-status-indicator">
              <CheckCircle size={16} className="up-success-icon" />
              <span>Account is active & secured</span>
            </div>
          </div>

          {/* Right Main: Details List */}
          <div className="up-main-content">
            
            <div className="up-section">
              <h3 className="up-section-title">Personal Information</h3>
              <div className="up-list">
                
                <div className="up-list-item">
                  <div className="up-item-label">
                    <Mail size={16} />
                    <span>Email Address</span>
                  </div>
                  <div className="up-item-value">{user.email}</div>
                </div>

                <div className="up-list-item">
                  <div className="up-item-label">
                    <Phone size={16} />
                    <span>Contact Number</span>
                  </div>
                  <div className="up-item-value">{user.phone || 'Not provided'}</div>
                </div>

                <div className="up-list-item">
                  <div className="up-item-label">
                    <Briefcase size={16} />
                    <span>Official Position</span>
                  </div>
                  <div className="up-item-value uppercase">{getDisplayPosition()}</div>
                </div>

                <div className="up-list-item">
                  <div className="up-item-label">
                    <UserCircle size={16} />
                    <span>Personnel Identifier</span>
                  </div>
                  <div className="up-item-value">{user.employeeId || 'N/A'}</div>
                </div>

              </div>
            </div>

            <div className="up-divider"></div>

            <div className="up-section">
              <h3 className="up-section-title">System Access</h3>
              <div className="up-list">
                
                <div className="up-list-item">
                  <div className="up-item-label">
                    <Clock size={16} />
                    <span>Last Authentication</span>
                  </div>
                  <div className="up-item-value">{user.lastLogin}</div>
                </div>

                <div className="up-list-item">
                  <div className="up-item-label">
                    <Shield size={16} />
                    <span>Security Clearance</span>
                  </div>
                  <div className="up-item-value uppercase">{user.role} tier</div>
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