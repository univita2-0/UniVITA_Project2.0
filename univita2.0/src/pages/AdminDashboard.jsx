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
      // Fetch all pending operational requests across the system in parallel
      const [
        employeesRes,
        leaveRes,
        appointmentsHistoryRes,
        appointmentsPendingRes,
        overtimeRes,
        appealsRes,
        correctionsRes,
        scheduleReqRes
      ] = await Promise.allSettled([
        axios.get(`${API_BASE}/employees`, getAuthHeaders()),
        axios.get(`${API_BASE}/leave-requests/all`, getAuthHeaders()),
        axios.get(`${API_BASE}/appointments/history`, getAuthHeaders()),
        axios.get(`${API_BASE}/appointments/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/overtime-requests/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance/corrections/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/schedule-requests/pending`, getAuthHeaders())
      ]);

      // Calculate Employee & System Stats
      const allEmployees = employeesRes.status === 'fulfilled' ? employeesRes.value.data || [] : [];
      const totalActive = allEmployees.filter(emp => emp.status === 'active').length;

      const today = getTodayDate();
      const allAppointments = appointmentsHistoryRes.status === 'fulfilled' ? appointmentsHistoryRes.value.data || [] : [];
      const todaysApproved = allAppointments.filter(
        app => app.visit_date === today && app.status === 'APPROVED'
      );
      const visitorCount = todaysApproved.length;

      // Compile Pending Counts
      const allLeaves = leaveRes.status === 'fulfilled' ? leaveRes.value.data || [] : [];
      const pendingLeavesCount = allLeaves.filter(leave => leave.status === 'Pending').length;

      const pendingVisitorsCount = appointmentsPendingRes.status === 'fulfilled' ? (appointmentsPendingRes.value.data || []).length : 0;
      const pendingOvertimeCount = overtimeRes.status === 'fulfilled' ? (overtimeRes.value.data || []).length : 0;
      const pendingAppealsCount = appealsRes.status === 'fulfilled' ? (appealsRes.value.data || []).length : 0;
      const pendingCorrectionsCount = correctionsRes.status === 'fulfilled' ? (correctionsRes.value.data || []).length : 0;
      const pendingScheduleRequestsCount = scheduleReqRes.status === 'fulfilled' ? (scheduleReqRes.value.data || []).length : 0;

      let systemStatus = 'Operational';
      try {
        await axios.get(`${API_BASE}/events`, { timeout: 3000 });
      } catch (healthErr) {
        systemStatus = 'Degraded';
      }

      setStats({
        totalEmployees: totalActive,
        pendingLeaves: pendingLeavesCount,
        todayVisitors: visitorCount,
        systemStatus
      });

      // Construct Grouped Summary Array with all pending categories
      const summary = [];
      if (pendingVisitorsCount > 0) {
        summary.push({ id: 'visits', title: 'Visitor Request', count: pendingVisitorsCount, route: 'manage-request', icon: Users });
      }
      if (pendingLeavesCount > 0) {
        summary.push({ id: 'leaves', title: 'Leave Request', count: pendingLeavesCount, route: 'leave-management', icon: FileText });
      }
      if (pendingOvertimeCount > 0) {
        summary.push({ id: 'overtime', title: 'Overtime Request', count: pendingOvertimeCount, route: 'overtime-requests', icon: Clock });
      }
      if (pendingAppealsCount > 0) {
        summary.push({ id: 'appeals', title: 'Attendance Appeal', count: pendingAppealsCount, route: 'attendance-appeals', icon: AlertCircle });
      }
      if (pendingCorrectionsCount > 0) {
        summary.push({ id: 'corrections', title: 'Correction Request', count: pendingCorrectionsCount, route: 'attendance-correction', icon: FileText });
      }
      if (pendingScheduleRequestsCount > 0) {
        summary.push({ id: 'schedule', title: 'Schedule Request', count: pendingScheduleRequestsCount, route: 'schedule', icon: Calendar });
      }

      setPendingTasks(summary);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError('Failed to load dashboard data. Please refresh.');
    } finally {
      setLoading(false);
    }
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
              <AlertCircle size={18} className="text-muted" />
              <span>Pending Requests Summary</span>
            </div>
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
                    <task.icon size={18} className="text-muted" />
                    <div>
                      <p className="expert-task-text">
                        <strong>{task.title}</strong> - {task.count} pending request{task.count > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <button className="expert-btn-outline-small" onClick={() => setView(task.route)}>
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