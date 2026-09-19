// src/pages/HRDashboard.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, FileText, Clock, AlertCircle, Calendar, Zap, ChevronRight,
  UserCheck, CheckCircle, Clock3, FileSpreadsheet
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
    pendingScheduleRequests: 0,
    pendingOvertime: 0,
    pendingCorrections: 0
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
      // Fetch all HR-related data in parallel
      const [
        empRes, 
        leaveRes, 
        attRes, 
        appealsRes, 
        schedReqRes, 
        overtimeRes, 
        correctionsRes
      ] = await Promise.allSettled([
        axios.get(`${API_BASE}/employees`, getAuthHeaders()),
        axios.get(`${API_BASE}/leave-requests/all`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance-report?date=${new Date().toISOString().split('T')[0]}`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/schedule-requests/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/overtime-requests/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance/corrections/pending`, getAuthHeaders())
      ]);

      const activeInstructors = empRes.status === 'fulfilled' ? (empRes.value.data || []).filter(u => u.role === 'instructor' && u.status === 'active') : [];
      const totalEmployees = activeInstructors.length;

      const allLeaves = leaveRes.status === 'fulfilled' ? leaveRes.value.data || [] : [];
      const pendingLeavesList = allLeaves.filter(l => l.status === 'Pending');
      const pendingLeaves = pendingLeavesList.length;

      const presentToday = attRes.status === 'fulfilled' ? (attRes.value.data || []).filter(a => a.status?.toLowerCase() === 'present' || a.status?.toLowerCase() === 'late').length : 0;

      const pendingAppealsList = appealsRes.status === 'fulfilled' ? appealsRes.value.data || [] : [];
      const pendingAppeals = pendingAppealsList.length;

      const pendingScheduleList = schedReqRes.status === 'fulfilled' ? schedReqRes.value.data || [] : [];
      const pendingScheduleRequests = pendingScheduleList.length;

      const pendingOvertimeList = overtimeRes.status === 'fulfilled' ? overtimeRes.value.data || [] : [];
      const pendingOvertime = pendingOvertimeList.length;

      const pendingCorrectionsList = correctionsRes.status === 'fulfilled' ? correctionsRes.value.data || [] : [];
      const pendingCorrections = pendingCorrectionsList.length;

      setStats({
        totalEmployees,
        pendingLeaves,
        presentToday,
        pendingAppeals,
        pendingScheduleRequests,
        pendingOvertime,
        pendingCorrections
      });

      // Compile tasks summary for the review list
      const taskItems = [
        ...pendingLeavesList.slice(0, 3).map(l => ({
          id: `leave-${l.id}`,
          type: 'Leave Request',
          title: `${l.full_name || l.user_id} requested ${l.type}`,
          date: l.request_date,
          action: 'leave-management'
        })),
        ...pendingAppealsList.slice(0, 3).map(a => ({
          id: `appeal-${a.id}`,
          type: 'Attendance Appeal',
          title: `${a.full_name || a.employee_id} submitted an appeal for ${a.date}`,
          date: a.date,
          action: 'attendance-appeals'
        })),
        ...pendingOvertimeList.slice(0, 3).map(ot => ({
          id: `ot-${ot.id}`,
          type: 'Overtime Request',
          title: `${ot.full_name || ot.employee_id} requested overtime (${ot.start_time} - ${ot.end_time})`,
          date: ot.date,
          action: 'overtime-requests'
        })),
        ...pendingCorrectionsList.slice(0, 3).map(c => ({
          id: `corr-${c.id}`,
          type: 'Correction Request',
          title: `${c.full_name || c.employee_id} submitted time correction for ${c.attendance_date}`,
          date: c.attendance_date,
          action: 'attendance-correction'
        })),
        ...pendingScheduleList.slice(0, 3).map(s => ({
          id: `sched-${s.id}`,
          type: 'Schedule Request',
          title: `${s.full_name} submitted a schedule change request`,
          date: s.date,
          action: 'schedule'
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

  const totalPendingActions = stats.pendingLeaves + stats.pendingAppeals + stats.pendingScheduleRequests + stats.pendingOvertime + stats.pendingCorrections;

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            <p className="expert-subtitle">Monitor staff attendance, leave applications, overtime, and personnel schedule adjustments.</p>
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
          <span>Total Pending Actions: <strong>{totalPendingActions}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="expert-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="expert-stat-card" onClick={() => handleNavigate('employee-management')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Users size={18} /></div>
            <span className="expert-stat-label">Instructors</span>
          </div>
          <div className="expert-stat-value">{stats.totalEmployees}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('leave-management')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><FileText size={18} /></div>
            <span className="expert-stat-label">Leaves</span>
          </div>
          <div className="expert-stat-value">{stats.pendingLeaves}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('overtime-requests')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Clock3 size={18} /></div>
            <span className="expert-stat-label">Overtime</span>
          </div>
          <div className="expert-stat-value">{stats.pendingOvertime}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('attendance-correction')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><FileSpreadsheet size={18} /></div>
            <span className="expert-stat-label">Corrections</span>
          </div>
          <div className="expert-stat-value">{stats.pendingCorrections}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('attendance-appeals')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><AlertCircle size={18} /></div>
            <span className="expert-stat-label">Appeals</span>
          </div>
          <div className="expert-stat-value">{stats.pendingAppeals}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('schedule')}>
          <div className="expert-stat-header">
            <div className="expert-stat-icon bg-slate text-muted"><Calendar size={18} /></div>
            <span className="expert-stat-label">Schedules</span>
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
            <button className="expert-action-btn" onClick={() => handleNavigate('overtime-requests')}>
              <span>Review Overtime Requests</span>
              <ChevronRight size={16} />
            </button>
            <button className="expert-action-btn" onClick={() => handleNavigate('attendance-correction')}>
              <span>Review Attendance Corrections</span>
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
          </div>
        </div>
      </section>
    </div>
  );
};

export default HRDashboard;