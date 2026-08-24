// src/pages/HRDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, FileText, Clock, AlertCircle, Calendar, Zap, ChevronRight,
  UserCheck, CheckCircle
} from 'lucide-react';
import { API_BASE } from '../api';
import './Dashboard.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const HRDashboard = ({ setView }) => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    pendingLeaves: 0,
    presentToday: 0,
    pendingAppeals: 0,
    pendingScheduleRequests: 0
  });
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const empRes = await axios.get(`${API_BASE}/employees`, getAuthHeaders());
      const activeInstructors = empRes.data.filter(u => u.role === 'instructor' && u.status === 'active');
      const totalEmployees = activeInstructors.length;

      const leaveRes = await axios.get(`${API_BASE}/leave-requests/all`, getAuthHeaders());
      const pendingLeavesList = leaveRes.data.filter(l => l.status === 'Pending');
      const pendingLeaves = pendingLeavesList.length;
      const recentLeaves = pendingLeavesList.slice(0, 5);

      const today = new Date().toISOString().split('T')[0];
      const attRes = await axios.get(`${API_BASE}/attendance-report?date=${today}`, getAuthHeaders());
      const presentToday = attRes.data.filter(a => a.status === 'Present' || a.status === 'present').length;

      const appealsRes = await axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders());
      const pendingAppeals = appealsRes.data.length;
      const recentAppeals = appealsRes.data.slice(0, 3);

      const schedReqRes = await axios.get(`${API_BASE}/schedule-requests/pending`, getAuthHeaders());
      const pendingScheduleRequests = schedReqRes.data.length;

      setStats({
        totalEmployees,
        pendingLeaves,
        presentToday,
        pendingAppeals,
        pendingScheduleRequests
      });

      const taskItems = [
        ...recentLeaves.map(l => ({
          id: `leave-${l.id}`,
          type: 'Leave Request',
          title: `${l.full_name || l.user_id} requested ${l.type}`,
          date: l.request_date,
          action: 'leave-management'
        })),
        ...recentAppeals.map(a => ({
          id: `appeal-${a.id}`,
          type: 'Attendance Appeal',
          title: `${a.full_name} submitted an appeal for ${a.date}`,
          date: a.date,
          action: 'attendance-appeals'
        }))
      ];
      setTasks(taskItems);
    } catch (err) {
      console.error('HR Dashboard error:', err);
      setError('Failed to load dashboard data. Please refresh.');
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
        <Users size={48} className="text-muted" style={{ marginBottom: '1rem', animation: 'pulse 2s infinite' }} />
        <p>Loading HR Dashboard Data...</p>
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
            
            <p className="expert-subtitle">Monitor staff attendance, leave applications, and personnel schedule adjustments.</p>
          </div>
        </div>
      </div>

      {/* System Health Banner */}
      <section className="expert-banner">
        <div className="expert-banner-item">
          <Users size={18} className="text-muted" />
          <span>HR Active: <strong>{stats.totalEmployees} Instructors</strong></span>
        </div>
        <div className="expert-banner-item">
          <Clock size={18} className="text-muted" />
          <span>Present Today: <strong>{stats.presentToday}</strong></span>
        </div>
        <div className="expert-banner-item">
          <AlertCircle size={18} className="text-muted" />
          <span>Pending Actions: <strong>{stats.pendingLeaves + stats.pendingAppeals + stats.pendingScheduleRequests}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="expert-stats-grid grid-5">
        <div className="expert-stat-card" onClick={() => handleNavigate('employee-management')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Users size={20} /></div>
            <span className="expert-stat-label">Active Instructors</span>
          </div>
          <div className="expert-stat-value">{stats.totalEmployees}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('leave-management')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><FileText size={20} /></div>
            <span className="expert-stat-label">Pending Leaves</span>
          </div>
          <div className="expert-stat-value">{stats.pendingLeaves}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('attendance-report')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><UserCheck size={20} /></div>
            <span className="expert-stat-label">Present Today</span>
          </div>
          <div className="expert-stat-value">{stats.presentToday}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('attendance-appeals')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><AlertCircle size={20} /></div>
            <span className="expert-stat-label">Appeals</span>
          </div>
          <div className="expert-stat-value">{stats.pendingAppeals}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('schedule-requests')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Calendar size={20} /></div>
            <span className="expert-stat-label">Schedule Changes</span>
          </div>
          <div className="expert-stat-value">{stats.pendingScheduleRequests}</div>
        </div>
      </section>

      {/* Middle Section: Tasks & Quick Actions */}
      <section className="expert-dashboard-panels">
        <div className="expert-panel flex-2">
          <div className="expert-panel-header">
            <div className="expert-ph-title">
              <Clock size={18} className="text-muted" />
              <span>HR Tasks Requiring Action</span>
            </div>
          </div>
          <div className="expert-task-list">
            {tasks.length === 0 ? (
              <div className="expert-empty-state">
                <CheckCircle size={28} className="text-muted" />
                <p>No pending HR tasks require attention.</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="expert-task-item">
                  <div className="expert-task-info">
                    <AlertCircle size={18} className="text-muted" />
                    <div>
                      <p className="expert-task-text"><strong>{task.type}</strong> – {task.title}</p>
                      <p className="expert-task-subtext">{task.date?.split('T')[0] || 'Pending'}</p>
                    </div>
                  </div>
                  <button className="expert-btn-outline-small" onClick={() => handleNavigate(task.action)}>
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
              <span>HR Shortcuts</span>
            </div>
          </div>
          <div className="expert-action-list">
            <button className="expert-action-btn" onClick={() => handleNavigate('leave-management')}>
              <span>Manage Leave Requests</span>
              <ChevronRight size={16} />
            </button>
            <button className="expert-action-btn" onClick={() => handleNavigate('attendance-appeals')}>
              <span>Review Attendance Appeals</span>
              <ChevronRight size={16} />
            </button>
            <button className="expert-action-btn" onClick={() => handleNavigate('employee-management')}>
              <span>Add New Employee</span>
              <ChevronRight size={16} />
            </button>
            <button className="expert-action-btn" onClick={() => handleNavigate('schedule')}>
              <span>Manage Schedules</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HRDashboard;