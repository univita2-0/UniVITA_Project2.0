// src/pages/Profile.jsx — UniVITA authenticated web account profile
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';
import './Profile.css';

const ROLE_LABELS = {
  admin: 'System Administrator',
  hr_admin: 'HR Administrator',
  security: 'Security Personnel',
  instructor: 'Instructor'
};

const textOr = (value, fallback = 'Not available') => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const initialsFor = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map(part => part[0].toUpperCase()).join('') : 'UV';
};

const ProfileRow = ({ label, value, muted = false, children }) => (
  <div className="pro-detail-row">
    <dt>{label}</dt>
    <dd className={muted ? 'pro-detail-muted' : undefined}>{children || value}</dd>
  </div>
);

const ProfilePanel = ({ id, title, subtitle, children, className = '' }) => (
  <section className={`pro-panel ${className}`} aria-labelledby={id}>
    <div className="pro-panel-head">
      <div>
        <h3 id={id}>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
    {children}
  </section>
);

function Profile() {
  const [user, setUser] = useState(() => ({
    id: localStorage.getItem('user_id') || '',
    name: localStorage.getItem('user_name') || '',
    email: localStorage.getItem('user_email') || '',
    employeeId: localStorage.getItem('employee_id') || '',
    phone: '',
    position: '',
    role: getUserRole() || '',
    lastLogin: localStorage.getItem('last_login') || ''
  }));
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('user_id')));
  const [loadError, setLoadError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchUserDetails = useCallback(async (signal) => {
    const id = localStorage.getItem('user_id') || '';
    if (!id) {
      setLoading(false);
      setLoadError('Your account identifier is unavailable. Sign in again to retrieve your profile.');
      return;
    }

    setLoading(true);
    setLoadError('');
    try {
      const response = await axios.get(`${API_BASE}/employees/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
        ...(signal ? { signal } : {})
      });
      const payload = response.data || {};
      const data = payload.employee && typeof payload.employee === 'object'
        ? payload.employee : payload;
      if (data.success === false) throw new Error(data.message || 'Profile could not be retrieved.');
      if (signal?.aborted) return;

      setUser(prev => ({
        ...prev,
        name: textOr(data.full_name, prev.name),
        email: textOr(data.email, prev.email),
        phone: textOr(data.phone_number, ''),
        position: textOr(data.position_level || data.position, ''),
        employeeId: textOr(data.employee_id, prev.employeeId)
      }));
      setLastUpdated(new Date());
    } catch (error) {
      if (signal?.aborted || error?.code === 'ERR_CANCELED') return;
      console.error('Profile request failed:', error);
      setLoadError('Profile details could not be refreshed. Previously saved account information is shown where available.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchUserDetails(controller.signal);
    return () => controller.abort();
  }, [fetchUserDetails]);

  const roleLabel = ROLE_LABELS[user.role] || textOr(user.role);
  const hasSession = Boolean(localStorage.getItem('auth_token'));
  const designation = textOr(user.position, 'Not assigned');
  const savedSignIn = textOr(user.lastLogin);

  return (
    <main className="pro-container">
      <div className="pro-toolbar">
        <div>
          <div className="pro-eyebrow">ACCOUNT PROFILE</div>
          
        </div>
        
      </div>

      <section className="pro-profile-hero" aria-label="Profile summary">
        <div className="pro-avatar" aria-hidden="true">{initialsFor(user.name)}</div>
        <div className="pro-hero-text">
          <h2>{textOr(user.name, 'Account Profile')}</h2>
          <div className="pro-hero-subtitle">{roleLabel}</div>
          <div className="pro-hero-meta">
            <span>Employee ID: {textOr(user.employeeId)}</span>
            {user.email && <span>{user.email}</span>}
          </div>
        </div>
        <div className={`pro-session ${hasSession ? 'pro-session-active' : 'pro-session-off'}`}>
          <span className="pro-session-dot" />
          {hasSession ? 'Active session' : 'Session unavailable'}
        </div>
      </section>

      {loadError && <div className="pro-notice pro-notice-error" role="alert">{loadError}</div>}

      <div className="pro-columns">
        <div className="pro-main-column">
          <ProfilePanel id="pro-personal-heading" title="Personal Information" >
            <dl className="pro-detail-list">
              <ProfileRow label="Full name" value={textOr(user.name)} />
              <ProfileRow label="Email address" value={textOr(user.email)} />
              <ProfileRow label="Phone number" value={textOr(user.phone, 'Not registered')} />
            </dl>
          </ProfilePanel>

          <ProfilePanel id="pro-employment-heading" title="Employment Information" >
            <dl className="pro-detail-list">
              <ProfileRow label="Employee ID" value={textOr(user.employeeId)} />
              <ProfileRow label="Position / designation" value={designation} muted={!user.position} />
              <ProfileRow label="System role" value={roleLabel} />
            </dl>
          </ProfilePanel>
        </div>

        <aside className="pro-aside-column">
          <ProfilePanel id="pro-access-heading" title="Account & Access" >
            <dl className="pro-detail-list">
              <ProfileRow label="Assigned role" value={roleLabel} />
              <ProfileRow label="Session status"><span className={`pro-inline-status ${hasSession ? 'is-on' : 'is-off'}`}><span className="pro-session-dot" />{hasSession ? 'Signed in' : 'Unavailable'}</span></ProfileRow>
              <ProfileRow label="Last sign-in (saved)" value={savedSignIn} muted={!user.lastLogin} />
            </dl>
          </ProfilePanel>

          <section className="pro-info-panel" aria-label="Profile management information">
            <div className="pro-info-heading"><strong>Profile management</strong></div>
            <p>Account information shown here is read-only. Use the Settings page for supported profile or password changes. Contact an authorized administrator if your employment details are incorrect.</p>
          </section>
          <div className="pro-refresh-note" role="status">{loading ? 'Retrieving current profile information…' : lastUpdated ? `Profile retrieved at ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Showing available profile information'}</div>
        </aside>
      </div>
    </main>
  );
}

export default Profile;
