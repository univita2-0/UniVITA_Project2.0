// src/pages/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  ShieldCheck, Users, Activity, FileText, Bell, Zap,
  Clock, AlertCircle, ChevronRight, Calendar, CheckCircle
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
      <div className="db-state-container">
        <Clock size={32} className="db-icon-muted" />
        <p>Loading System Dashboard Data...</p>
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
          <Activity size={18} className="text-blue" />
          <span>System Status: <strong>{stats.systemStatus}</strong></span>
        </div>
        <div className="db-banner-item">
          <Clock size={18} className="text-amber" />
          <span>Last Updated: <strong>{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="db-stats-grid admin-grid">
        <div className="db-stat-card border-teal" onClick={() => setView('employee-management')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-teal-light text-teal"><Users size={20} /></div>
            <span className="db-stat-label">Active Personnel</span>
          </div>
          <div className="db-stat-value">{stats.totalEmployees}</div>
        </div>

        <div className="db-stat-card border-blue" onClick={() => setView('manage-request')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-blue-light text-blue"><Calendar size={20} /></div>
            <span className="db-stat-label">Today's Visitors</span>
          </div>
          <div className="db-stat-value">{stats.todayVisitors}</div>
        </div>

        <div className="db-stat-card border-amber" onClick={() => setView('leave-management')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-amber-light text-amber"><Bell size={20} /></div>
            <span className="db-stat-label">Pending Leaves</span>
          </div>
          <div className="db-stat-value">{stats.pendingLeaves}</div>
        </div>
      </section>

      {/* Middle Section: Tasks & Quick Actions */}
      <section className="db-middle-section">
        <div className="db-panel flex-2">
          <div className="db-panel-header">
            <div className="db-ph-title">
              <Clock size={18} className="text-teal" />
              <span>Recent Pending Requests</span>
            </div>
            {stats.pendingLeaves > 5 && (
              <button className="btn-db-text" onClick={() => setView('leave-management')}>
                View All <ChevronRight size={14} />
              </button>
            )}
          </div>
          <div className="db-task-list">
            {pendingTasks.length === 0 ? (
              <div className="db-empty-state">
                <CheckCircle size={24} className="text-teal" />
                <p>No pending system requests.</p>
              </div>
            ) : (
              pendingTasks.map(task => (
                <div key={task.id} className="db-task-item">
                  <div className="db-task-info">
                    <AlertCircle size={16} className="text-amber" />
                    <div>
                      <p className="db-task-text">
                        <strong>{task.full_name || `ID: ${task.user_id}`}</strong> requested <strong>{task.type}</strong>
                      </p>
                      <p className="db-task-subtext">{formatDate(task.request_date)}</p>
                    </div>
                  </div>
                  <button className="btn-db-small" onClick={() => setView('leave-management')}>
                    Review
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
              <span>System Shortcuts</span>
            </div>
          </div>
          <div className="db-action-list">
            <button className="db-action-btn" onClick={() => setView('manage-request')}>
              <span>Approve Visitor Entries</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={() => setView('attendance-report')}>
              <span>View Today's Attendance</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={() => setView('employee-management')}>
              <span>Add New Employee</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={onShowPayrollHistory}>
              <span>Payroll Access Logs</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={() => setView('reports')}>
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