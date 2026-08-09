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
      <div className="db-state-container">
        <Clock size={32} className="db-icon-muted" />
        <p>Loading HR Dashboard Data...</p>
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
          <Users size={18} className="text-teal" />
          <span>HR Active: <strong>{stats.totalEmployees} Instructors</strong></span>
        </div>
        <div className="db-banner-item">
          <Clock size={18} className="text-blue" />
          <span>Present Today: <strong>{stats.presentToday}</strong></span>
        </div>
        <div className="db-banner-item">
          <AlertCircle size={18} className="text-amber" />
          <span>Pending Actions: <strong>{stats.pendingLeaves + stats.pendingAppeals + stats.pendingScheduleRequests}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="db-stats-grid hr-grid">
        <div className="db-stat-card border-teal" onClick={() => handleNavigate('employee-management')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-teal-light text-teal"><Users size={20} /></div>
            <span className="db-stat-label">Active Instructors</span>
          </div>
          <div className="db-stat-value">{stats.totalEmployees}</div>
        </div>

        <div className="db-stat-card border-amber" onClick={() => handleNavigate('leave-management')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-amber-light text-amber"><FileText size={20} /></div>
            <span className="db-stat-label">Pending Leaves</span>
          </div>
          <div className="db-stat-value">{stats.pendingLeaves}</div>
        </div>

        <div className="db-stat-card border-blue" onClick={() => handleNavigate('attendance-report')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-blue-light text-blue"><UserCheck size={20} /></div>
            <span className="db-stat-label">Present Today</span>
          </div>
          <div className="db-stat-value">{stats.presentToday}</div>
        </div>

        <div className="db-stat-card border-purple" onClick={() => handleNavigate('attendance-appeals')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-purple-light text-purple"><AlertCircle size={20} /></div>
            <span className="db-stat-label">Attendance Appeals</span>
          </div>
          <div className="db-stat-value">{stats.pendingAppeals}</div>
        </div>

        <div className="db-stat-card border-orange" onClick={() => handleNavigate('schedule-requests')}>
          <div className="db-stat-header">
            <div className="db-stat-icon bg-orange-light text-orange"><Calendar size={20} /></div>
            <span className="db-stat-label">Schedule Changes</span>
          </div>
          <div className="db-stat-value">{stats.pendingScheduleRequests}</div>
        </div>
      </section>

      {/* Middle Section: Tasks & Quick Actions */}
      <section className="db-middle-section">
        <div className="db-panel flex-2">
          <div className="db-panel-header">
            <div className="db-ph-title">
              <Clock size={18} className="text-teal" />
              <span>HR Tasks Requiring Action</span>
            </div>
          </div>
          <div className="db-task-list">
            {tasks.length === 0 ? (
              <div className="db-empty-state">
                <CheckCircle size={24} className="text-teal" />
                <p>No pending HR tasks require attention.</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="db-task-item">
                  <div className="db-task-info">
                    <AlertCircle size={16} className="text-amber" />
                    <div>
                      <p className="db-task-text"><strong>{task.type}</strong> – {task.title}</p>
                      <p className="db-task-subtext">{task.date?.split('T')[0] || 'Pending'}</p>
                    </div>
                  </div>
                  <button className="btn-db-small" onClick={() => handleNavigate(task.action)}>
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
              <span>HR Shortcuts</span>
            </div>
          </div>
          <div className="db-action-list">
            <button className="db-action-btn" onClick={() => handleNavigate('leave-management')}>
              <span>Manage Leave Requests</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={() => handleNavigate('attendance-appeals')}>
              <span>Review Attendance Appeals</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={() => handleNavigate('employee-management')}>
              <span>Add New Employee</span>
              <ChevronRight size={16} />
            </button>
            <button className="db-action-btn" onClick={() => handleNavigate('schedule')}>
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