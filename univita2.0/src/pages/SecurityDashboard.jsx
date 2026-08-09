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
      <div className="db-state-container">
        <Clock size={32} className="db-icon-muted" />
        <p>Loading Security Dashboard Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="db-state-container error">
        <AlertCircle size={32} />
        <p>{error}</p>
        <button onClick={loadDashboardData} className="btn-db-outline">Retry Connection</button>
      </div>
    );
  }

  return (
    <div className="db-container">
      {/* System Health Banner */}
      <section className="db-banner">
        <div className="db-banner-item">
          <ShieldCheck size={18} className="text-teal" />
          <span>Security Protocol: <strong>Active</strong></span>
        </div>
        <div className="db-banner-item">
          <MapPin size={18} className="text-blue" />
          <span>Active BLE Tags: <strong>{stats.activeBleTags}</strong></span>
        </div>
        <div className="db-banner-item">
          <Users size={18} className="text-amber" />
          <span>Visitors Today: <strong>{stats.totalVisitorsToday}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="db-stats-grid security-grid">
        <div className="db-stat-card border-blue" onClick={() => handleNavigate('manage-request')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-blue-light text-blue"><Calendar size={20} /></div>
            <span className="db-stat-label">Approved Today</span>
          </div>
          <div className="db-stat-value">{stats.approvedToday}</div>
        </div>

        <div className="db-stat-card border-amber" onClick={() => handleNavigate('visitor-history')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-amber-light text-amber"><Users size={20} /></div>
            <span className="db-stat-label">Total Visitors</span>
          </div>
          <div className="db-stat-value">{stats.totalVisitorsToday}</div>
        </div>

        <div className="db-stat-card border-purple" onClick={() => handleNavigate('ble-tags')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-purple-light text-purple"><MapPin size={20} /></div>
            <span className="db-stat-label">Active BLE Tags</span>
          </div>
          <div className="db-stat-value">{stats.activeBleTags}</div>
        </div>
      </section>

      {/* Middle Section: Today's Visitors & Quick Actions */}
      <section className="db-middle-section">
        <div className="db-panel flex-2">
          <div className="db-panel-header">
            <div className="db-ph-title">
              <UserCheck size={18} className="text-teal" />
              <span>Today's Approved Visitors</span>
            </div>
          </div>
          <div className="db-task-list">
            {todayVisitors.length === 0 ? (
              <div className="db-empty-state">
                <CheckCircle size={24} className="text-teal" />
                <p>No approved visitors scheduled for today.</p>
              </div>
            ) : (
              todayVisitors.map(visitor => (
                <div key={visitor.id} className="db-task-item">
                  <div className="db-task-info">
                    <UserCheck size={16} className="text-teal" />
                    <div>
                      <p className="db-task-text">
                        <strong>{visitor.first_name} {visitor.last_name}</strong>
                      </p>
                      <p className="db-task-subtext">
                        {visitor.visit_time ? visitor.visit_time.substring(0,5) : 'No time'}
                        {visitor.reason && ` · ${visitor.reason.substring(0,40)}${visitor.reason.length > 40 ? '…' : ''}`}
                      </p>
                    </div>
                  </div>
                  <button className="btn-db-small" onClick={() => handleNavigate('track-visitor')}>
                    Track
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="db-panel flex-1">
          <div className="db-panel-header">
            <div className="db-ph-title">
              <Zap size={18} className="text-orange" />
              <span>Security Shortcuts</span>
            </div>
          </div>
          <div className="db-action-list">
            <button className="db-action-btn" onClick={() => handleNavigate('track-visitor')}>
              <span>Live Visitor Tracking</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={() => handleNavigate('completed-visits')}>
              <span>View Visitor History</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={() => handleNavigate('manage-ble')}>
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