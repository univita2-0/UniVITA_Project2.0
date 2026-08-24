// src/pages/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  ShieldCheck, Users, Activity, FileText, Bell, Zap,
  Clock, AlertCircle, ChevronRight, Calendar, CheckCircle, Server
} from 'lucide-react';
import { API_BASE } from '../api';
import './Dashboard.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const AdminDashboard = ({ setView, onShowPayrollHistory }) => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    pendingLeaves: 0,
    todayVisitors: 0,
    systemStatus: 'Operational'
  });
  const [pendingTasks, setPendingTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const employeesRes = await axios.get(`${API_BASE}/employees`, getAuthHeaders());
      const allEmployees = employeesRes.data || [];
      const totalActive = allEmployees.filter(emp => emp.status === 'active').length;

      const leaveRes = await axios.get(`${API_BASE}/leave-requests/all`, getAuthHeaders());
      const allLeaves = leaveRes.data || [];
      const pendingLeaves = allLeaves.filter(leave => leave.status === 'Pending');
      const pendingCount = pendingLeaves.length;
      const recentPending = [...pendingLeaves]
        .sort((a, b) => new Date(b.request_date) - new Date(a.request_date))
        .slice(0, 5);

      const today = getTodayDate();
      const appointmentsRes = await axios.get(`${API_BASE}/appointments/history`, getAuthHeaders());
      const allAppointments = appointmentsRes.data || [];
      const todaysApproved = allAppointments.filter(
        app => app.visit_date === today && app.status === 'APPROVED'
      );
      const visitorCount = todaysApproved.length;

      let systemStatus = 'Operational';
      try {
        await axios.get(`${API_BASE}/events`, { timeout: 3000 });
      } catch (healthErr) {
        systemStatus = 'Degraded';
      }

      setStats({
        totalEmployees: totalActive,
        pendingLeaves: pendingCount,
        todayVisitors: visitorCount,
        systemStatus
      });
      setPendingTasks(recentPending);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError('Failed to load dashboard data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="expert-loading">
        <Server size={48} className="text-muted" style={{ marginBottom: '1rem', animation: 'pulse 2s infinite' }} />
        <p>Loading System Telemetry...</p>
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
            
            <p className="expert-subtitle">Overview of global system health, active personnel, and pending operational requests.</p>
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
          <Activity size={18} className="text-muted" />
          <span>System Status: <strong>{stats.systemStatus}</strong></span>
        </div>
        <div className="expert-banner-item">
          <Clock size={18} className="text-muted" />
          <span>Last Synchronized: <strong>{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="expert-stats-grid grid-3">
        <div className="expert-stat-card" onClick={() => setView('employee-management')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Users size={20} /></div>
            <span className="expert-stat-label">Active Personnel</span>
          </div>
          <div className="expert-stat-value">{stats.totalEmployees}</div>
        </div>

        <div className="expert-stat-card" onClick={() => setView('manage-request')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Calendar size={20} /></div>
            <span className="expert-stat-label">Today's Visitors</span>
          </div>
          <div className="expert-stat-value">{stats.todayVisitors}</div>
        </div>

        <div className="expert-stat-card" onClick={() => setView('leave-management')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Bell size={20} /></div>
            <span className="expert-stat-label">Pending Leaves</span>
          </div>
          <div className="expert-stat-value">{stats.pendingLeaves}</div>
        </div>
      </section>

      {/* Middle Section: Tasks & Quick Actions */}
      <section className="expert-dashboard-panels">
        <div className="expert-panel flex-2">
          <div className="expert-panel-header">
            <div className="expert-ph-title">
              <Clock size={18} className="text-muted" />
              <span>Recent Pending Requests</span>
            </div>
            {stats.pendingLeaves > 5 && (
              <button className="expert-btn-text" onClick={() => setView('leave-management')}>
                View All <ChevronRight size={14} />
              </button>
            )}
          </div>
          <div className="expert-task-list">
            {pendingTasks.length === 0 ? (
              <div className="expert-empty-state">
                <CheckCircle size={28} className="text-muted" />
                <p>No pending system requests.</p>
              </div>
            ) : (
              pendingTasks.map(task => (
                <div key={task.id} className="expert-task-item">
                  <div className="expert-task-info">
                    <AlertCircle size={18} className="text-muted" />
                    <div>
                      <p className="expert-task-text">
                        <strong>{task.full_name || `ID: ${task.user_id}`}</strong> requested <strong>{task.type}</strong>
                      </p>
                      <p className="expert-task-subtext">{formatDate(task.request_date)}</p>
                    </div>
                  </div>
                  <button className="expert-btn-outline-small" onClick={() => setView('leave-management')}>
                    Review
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
              <span>System Shortcuts</span>
            </div>
          </div>
          <div className="expert-action-list">
            <button className="expert-action-btn" onClick={() => setView('manage-request')}>
              <span>Approve Visitor Entries</span>
              <ChevronRight size={16} />
            </button>
            
            <button className="expert-action-btn" onClick={() => setView('employee-management')}>
              <span>Add New Employee</span>
              <ChevronRight size={16} />
            </button>
            <button className="expert-action-btn" onClick={onShowPayrollHistory}>
              <span>Payroll Access Logs</span>
              <ChevronRight size={16} />
            </button>
            <button className="expert-action-btn" onClick={() => setView('reports')}>
              <span>Generate Compliance Report</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;