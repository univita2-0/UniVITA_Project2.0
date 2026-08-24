// src/pages/SecurityDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  UserCheck, Calendar, Clock, MapPin, Zap, ChevronRight,
  Users, ShieldCheck, CheckCircle, AlertCircle
} from 'lucide-react';
import { API_BASE } from '../api';
import './Dashboard.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const SecurityDashboard = ({ setView }) => {
  const [stats, setStats] = useState({
    approvedToday: 0,
    totalVisitorsToday: 0,
    activeBleTags: 0
  });
  const [todayVisitors, setTodayVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/visitor-requests`, {
        params: { date: today, status: 'APPROVED' },
        ...getAuthHeaders()
      });
      const approvedVisitors = res.data || [];
      setTodayVisitors(approvedVisitors);

      const bleRes = await axios.get(`${API_BASE}/ble-tags/in-use`, getAuthHeaders());
      const activeBleTags = bleRes.data.length;

      setStats({
        approvedToday: approvedVisitors.length,
        totalVisitorsToday: approvedVisitors.length,
        activeBleTags
      });
    } catch (err) {
      console.error('Security Dashboard error:', err);
      setError('Failed to load security data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (view) => {
    if (setView) setView(view);
  };

  if (loading) {
    return (
      <div className="expert-loading">
        <ShieldCheck size={48} className="text-muted" style={{ marginBottom: '1rem', animation: 'pulse 2s infinite' }} />
        <p>Loading Security Dashboard Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="expert-empty">
        <AlertCircle size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
        <p>{error}</p>
        <button onClick={loadDashboardData} className="expert-btn-secondary" style={{ marginTop: '1rem' }}>Retry Connection</button>
      </div>
    );
  }

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Track live visitor movements, monitor BLE tags, and review daily campus entry logs.</p>
          </div>
        </div>
      </div>

      {/* System Health Banner */}
      <section className="expert-banner">
        <div className="expert-banner-item">
          <ShieldCheck size={18} className="text-muted" />
          <span>Security Protocol: <strong>Active</strong></span>
        </div>
        <div className="expert-banner-item">
          <MapPin size={18} className="text-muted" />
          <span>Active BLE Tags: <strong>{stats.activeBleTags}</strong></span>
        </div>
        <div className="expert-banner-item">
          <Users size={18} className="text-muted" />
          <span>Visitors Today: <strong>{stats.totalVisitorsToday}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="expert-stats-grid grid-3">
        <div className="expert-stat-card" onClick={() => handleNavigate('manage-request')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Calendar size={20} /></div>
            <span className="expert-stat-label">Approved Today</span>
          </div>
          <div className="expert-stat-value">{stats.approvedToday}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('visitor-history')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Users size={20} /></div>
            <span className="expert-stat-label">Total Visitors</span>
          </div>
          <div className="expert-stat-value">{stats.totalVisitorsToday}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('ble-tags')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><MapPin size={20} /></div>
            <span className="expert-stat-label">Active BLE Tags</span>
          </div>
          <div className="expert-stat-value">{stats.activeBleTags}</div>
        </div>
      </section>

      {/* Middle Section: Today's Visitors & Quick Actions */}
      <section className="expert-dashboard-panels">
        <div className="expert-panel flex-2">
          <div className="expert-panel-header">
            <div className="expert-ph-title">
              <UserCheck size={18} className="text-muted" />
              <span>Today's Approved Visitors</span>
            </div>
          </div>
          <div className="expert-task-list">
            {todayVisitors.length === 0 ? (
              <div className="expert-empty-state">
                <CheckCircle size={28} className="text-muted" />
                <p>No approved visitors scheduled for today.</p>
              </div>
            ) : (
              todayVisitors.map(visitor => (
                <div key={visitor.id} className="expert-task-item">
                  <div className="expert-task-info">
                    <UserCheck size={18} className="text-muted" />
                    <div>
                      <p className="expert-task-text">
                        <strong>{visitor.first_name} {visitor.last_name}</strong>
                      </p>
                      <p className="expert-task-subtext">
                        {visitor.visit_time ? visitor.visit_time.substring(0,5) : 'No time'}
                        {visitor.reason && ` · ${visitor.reason.substring(0,40)}${visitor.reason.length > 40 ? '…' : ''}`}
                      </p>
                    </div>
                  </div>
                  <button className="expert-btn-outline-small" onClick={() => handleNavigate('track-visitor')}>
                    Track
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="expert-panel flex-1">
          <div className="expert-panel-header">
            <div className="expert-ph-title">
              <Zap size={18} className="text-muted" />
              <span>Security Shortcuts</span>
            </div>
          </div>
          <div className="expert-action-list">
            <button className="expert-action-btn" onClick={() => handleNavigate('track-visitor')}>
              <span>Live Visitor Tracking</span>
              <ChevronRight size={16} />
            </button>
            <button className="expert-action-btn" onClick={() => handleNavigate('completed-visits')}>
              <span>View Visitor History</span>
              <ChevronRight size={16} />
            </button>
            <button className="expert-action-btn" onClick={() => handleNavigate('manage-ble')}>
              <span>Manage BLE Tags</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SecurityDashboard;