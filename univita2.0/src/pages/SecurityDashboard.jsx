// src/pages/SecurityDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  UserCheck, Calendar, MapPin, Zap, ChevronRight,
  Users, ShieldCheck, CheckCircle, AlertCircle, Bell, X
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
  const [systemAlerts, setSystemAlerts] = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());
  const [activeTab, setActiveTab] = useState('visitors'); // 'visitors' or 'alerts'
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    setError(null);
    try {
      // 1. Fetch Visitors
      const res = await axios.get(`${API_BASE}/visitor-requests`, {
        params: { date: today, status: 'APPROVED' },
        ...getAuthHeaders()
      });
      const allApprovedToday = res.data || [];
      
      // Filter out returned and no-shows to only show ACTIVE/PENDING visitors
      const currentVisitors = allApprovedToday.filter(
        visitor => visitor.returned !== 1 && visitor.no_show !== 1
      );
      setTodayVisitors(currentVisitors);

      // 2. Fetch BLE Tags (Check Batteries)
      const tagsRes = await axios.get(`${API_BASE}/ble-tags`, getAuthHeaders());
      const activeBleTags = tagsRes.data.filter(t => t.current_status === 'IN USE').length;
      
      // 3. Fetch Scanners (Check Heartbeat)
      const scannersRes = await axios.get(`${API_BASE}/scanners`, getAuthHeaders());

      setStats({
        approvedToday: allApprovedToday.length, 
        totalVisitorsToday: allApprovedToday.length,
        activeBleTags
      });

      // --- EVALUATE HEALTH ALERTS ---
      const newAlerts = [];
      const now = new Date();

      // Check Tag Batteries (< 2600mV is low for CR2032)
      tagsRes.data.forEach(tag => {
        if (tag.battery_level > 0 && tag.battery_level < 2600) {
          newAlerts.push({
            id: `batt_${tag.ble_id}`,
            type: 'battery',
            title: `Low Battery: ${tag.label || tag.ble_id}`,
            message: `Tag battery is critically low (${tag.battery_level}mV). Please replace CR2032 coin cell.`
          });
        }
      });

      // Check Scanner Heartbeats (> 5 minutes = Offline)
      scannersRes.data.forEach(scanner => {
        if (scanner.last_ping) {
          const lastPing = new Date(scanner.last_ping);
          const diffMinutes = (now - lastPing) / 60000;
          if (diffMinutes > 5) {
            newAlerts.push({
              id: `scan_${scanner.scanner_id}`,
              type: 'offline',
              title: `Scanner Offline: ${scanner.assigned_room}`,
              message: `Scanner ${scanner.scanner_id} has not reported in ${Math.round(diffMinutes)} minutes. Check power and Wi-Fi.`
            });
          }
        }
      });

      setSystemAlerts(newAlerts);
    } catch (err) {
      console.error('Security Dashboard error:', err);
      setError('Failed to load security data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = (alertId) => {
    setDismissedAlerts(prev => {
      const newSet = new Set(prev);
      newSet.add(alertId);
      return newSet;
    });
  };

  const handleNavigate = (view) => {
    if (setView) setView(view);
  };

  if (loading && todayVisitors.length === 0) {
    return (
      <div className="expert-loading">
        <ShieldCheck size={48} className="text-muted" style={{ marginBottom: '1rem', animation: 'pulse 2s infinite' }} />
        <p>Loading Security Dashboard Data...</p>
      </div>
    );
  }

  if (error && todayVisitors.length === 0) {
    return (
      <div className="expert-empty">
        <AlertCircle size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
        <p>{error}</p>
        <button onClick={loadDashboardData} className="expert-btn-secondary" style={{ marginTop: '1rem' }}>Retry Connection</button>
      </div>
    );
  }

  const visibleAlerts = systemAlerts.filter(alert => !dismissedAlerts.has(alert.id));

  return (
    <div className="expert-container">
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            <p className="expert-subtitle">Track live visitor movements, monitor BLE tags, and review daily campus entry logs.</p>
          </div>
        </div>
      </div>

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
          <span>Total Daily Visitors: <strong>{stats.totalVisitorsToday}</strong></span>
        </div>
      </section>

      <section className="expert-stats-grid grid-3">
        <div className="expert-stat-card" onClick={() => handleNavigate('manage-request')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Calendar size={20} /></div>
            <span className="expert-stat-label">Scheduled Today</span>
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

      <section className="expert-dashboard-panels">
        <div className="expert-panel flex-2">
          {/* Tab Navigation */}
          <div className="expert-panel-header" style={{ padding: 0 }}>
            <div style={{ display: 'flex', width: '100%' }}>
              <button 
                onClick={() => setActiveTab('visitors')}
                style={{ flex: 1, padding: '1.25rem', background: activeTab === 'visitors' ? '#FFFFFF' : '#F8FAFC', border: 'none', borderBottom: activeTab === 'visitors' ? '2px solid #0F172A' : '1px solid #E2E8F0', cursor: 'pointer', fontWeight: 700, color: activeTab === 'visitors' ? '#0F172A' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <UserCheck size={18} /> Current Visitors
              </button>
              <button 
                onClick={() => setActiveTab('alerts')}
                style={{ flex: 1, padding: '1.25rem', background: activeTab === 'alerts' ? '#FFFFFF' : '#F8FAFC', border: 'none', borderBottom: activeTab === 'alerts' ? '2px solid #DC2626' : '1px solid #E2E8F0', cursor: 'pointer', fontWeight: 700, color: activeTab === 'alerts' ? '#DC2626' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <Bell size={18} /> System Alerts 
                {visibleAlerts.length > 0 && (
                  <span style={{ background: '#DC2626', color: '#FFF', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>{visibleAlerts.length}</span>
                )}
              </button>
            </div>
          </div>

          <div className="expert-task-list">
            {activeTab === 'visitors' ? (
              todayVisitors.length === 0 ? (
                <div className="expert-empty-state">
                  <CheckCircle size={28} className="text-muted" />
                  <p>No current visitors on campus.</p>
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
                    <button className="expert-btn-outline-small" onClick={() => handleNavigate('track-visitor')}>Track</button>
                  </div>
                ))
              )
            ) : (
              visibleAlerts.length === 0 ? (
                <div className="expert-empty-state">
                  <CheckCircle size={28} style={{ color: '#059669' }} />
                  <p>All scanners are online and tag batteries are healthy.</p>
                </div>
              ) : (
                visibleAlerts.map(alert => (
                  <div key={alert.id} className="expert-task-item" style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
                    <div className="expert-task-info">
                      <AlertCircle size={18} color="#DC2626" />
                      <div>
                        <p className="expert-task-text" style={{ color: '#991B1B' }}>
                          <strong>{alert.title}</strong>
                        </p>
                        <p className="expert-task-subtext" style={{ color: '#B91C1C' }}>{alert.message}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => dismissAlert(alert.id)}
                      style={{ background: '#FFF', border: '1px solid #FECACA', color: '#DC2626', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      <X size={14} /> Dismiss
                    </button>
                  </div>
                ))
              )
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