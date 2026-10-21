import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, FileText, Clock, AlertCircle, ChevronRight,
  CheckCircle, UserMinus, UserCheck, ShieldCheck, PieChart,
  Activity, RefreshCw, ChevronLeft, UserX, CalendarOff
} from 'lucide-react';
import { API_BASE, fetchRecentActivity } from '../api';
import './Dashboard.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const isToday = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth() === today.getMonth() &&
         d.getDate() === today.getDate();
};

const AttendancePieChart = ({ present, late, absent, total }) => {
  const sum = present + late + absent;

  if (!total || total === 0 || sum === 0) {
    return (
      <div className="expert-empty-chart">
        <PieChart size={32} className="text-muted" />
        <p>No attendance recorded today</p>
      </div>
    );
  }

  const pPct = Math.round((present / sum) * 100);
  const lPct = Math.round((late / sum) * 100);
  const aPct = Math.max(0, 100 - pPct - lPct);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const presentStroke = (present / sum) * circumference;
  const lateStroke = (late / sum) * circumference;
  const absentStroke = (absent / sum) * circumference;

  const presentOffset = 0;
  const lateOffset = -presentStroke;
  const absentOffset = -(presentStroke + lateStroke);

  return (
    <div className="expert-pie-container">
      <div className="expert-pie-graphic">
        <svg viewBox="0 0 100 100" className="expert-donut-svg">
          <circle cx="50" cy="50" r={radius} className="donut-bg" />
          {present > 0 && (
            <circle
              cx="50" cy="50" r={radius}
              className="donut-segment donut-present"
              strokeDasharray={`${presentStroke} ${circumference}`}
              strokeDashoffset={presentOffset}
            />
          )}
          {late > 0 && (
            <circle
              cx="50" cy="50" r={radius}
              className="donut-segment donut-late"
              strokeDasharray={`${lateStroke} ${circumference}`}
              strokeDashoffset={lateOffset}
            />
          )}
          {absent > 0 && (
            <circle
              cx="50" cy="50" r={radius}
              className="donut-segment donut-absent"
              strokeDasharray={`${absentStroke} ${circumference}`}
              strokeDashoffset={absentOffset}
            />
          )}
        </svg>
        <div className="expert-donut-center">
          <span className="expert-donut-total">{total}</span>
          <span className="expert-donut-sub">Total</span>
        </div>
      </div>

      <div className="expert-pie-legend">
        <div className="legend-item">
          <div className="legend-indicator bg-present" />
          <div className="legend-label">
            <span className="legend-title">Present</span>
            <span className="legend-val">{present} ({pPct}%)</span>
          </div>
        </div>

        <div className="legend-item">
          <div className="legend-indicator bg-late" />
          <div className="legend-label">
            <span className="legend-title">Late</span>
            <span className="legend-val">{late} ({lPct}%)</span>
          </div>
        </div>

        <div className="legend-item">
          <div className="legend-indicator bg-absent" />
          <div className="legend-label">
            <span className="legend-title">Absent / Missed</span>
            <span className="legend-val">{absent} ({aPct}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const HRDashboard = ({ setView }) => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    onLeaveToday: 0,
    absentToday: 0,
    lateToday: 0,
    pendingLeaves: 0,
    pendingAppeals: 0,
    pendingOvertime: 0,
    pendingCorrections: 0
  });

  const [attendanceStats, setAttendanceStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    total: 0
  });

  const [pendingTasks, setPendingTasks] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0];

      const [
        empRes, 
        leaveRes, 
        attRes, 
        appealsRes, 
        overtimeRes, 
        correctionsRes,
        activityRes
      ] = await Promise.allSettled([
        axios.get(`${API_BASE}/employees`, getAuthHeaders()),
        axios.get(`${API_BASE}/leave-requests/all`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance-report?date=${today}`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/overtime-requests/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance/corrections/pending`, getAuthHeaders()),
        fetchRecentActivity(50)
      ]);

      const activeInstructors = empRes.status === 'fulfilled' 
        ? (empRes.value.data || []).filter(u => u.role === 'instructor' && u.status === 'active') 
        : [];
      const totalEmployees = activeInstructors.length;

      const allLeaves = leaveRes.status === 'fulfilled' ? leaveRes.value.data || [] : [];
      const pendingLeavesList = allLeaves.filter(l => l.status === 'Pending');
      const pendingLeaves = pendingLeavesList.length;

      // Calculate On Leave Today
      const activeLeavesToday = allLeaves.filter(leave => {
        if (leave.status !== 'Approved' && leave.status !== 'APPROVED') return false;
        const start = leave.start_date ? leave.start_date.split('T')[0] : null;
        const end = leave.end_date ? leave.end_date.split('T')[0] : (start || today);
        return start && start <= today && end >= today;
      });
      const onLeaveToday = activeLeavesToday.length;

      // Process Attendance Breakdown
      const attData = attRes.status === 'fulfilled' ? attRes.value.data || [] : [];
      let presentCount = 0;
      let lateCount = 0;
      let absentCount = 0;

      attData.forEach(item => {
        const status = (item.status || '').toLowerCase();
        if (status === 'present' || status === 'completed') {
          presentCount++;
        } else if (status === 'late') {
          lateCount++;
        } else if (
          status === 'absent' || 
          status === 'missed schedule' || 
          status === 'missing clock-out' || 
          status === 'missed'
        ) {
          absentCount++;
        }
      });

      setAttendanceStats({
        present: presentCount,
        late: lateCount,
        absent: absentCount,
        total: attData.length
      });

      const pendingAppealsList = appealsRes.status === 'fulfilled' ? appealsRes.value.data || [] : [];
      const pendingAppeals = pendingAppealsList.length;

      const pendingOvertimeList = overtimeRes.status === 'fulfilled' ? overtimeRes.value.data || [] : [];
      const pendingOvertime = pendingOvertimeList.length;

      const pendingCorrectionsList = correctionsRes.status === 'fulfilled' ? correctionsRes.value.data || [] : [];
      const pendingCorrections = pendingCorrectionsList.length;

      setStats({
        totalEmployees,
        onLeaveToday,
        absentToday: absentCount,
        lateToday: lateCount,
        pendingLeaves,
        pendingAppeals,
        pendingOvertime,
        pendingCorrections
      });

      const summary = [];
      if (pendingLeaves > 0) {
        summary.push({ id: 'leaves', title: 'Leave Request', count: pendingLeaves, route: 'leave-management' });
      }
      if (pendingOvertime > 0) {
        summary.push({ id: 'overtime', title: 'Overtime Request', count: pendingOvertime, route: 'overtime-requests' });
      }
      if (pendingAppeals > 0) {
        summary.push({ id: 'appeals', title: 'Attendance Appeal', count: pendingAppeals, route: 'attendance-appeals' });
      }
      if (pendingCorrections > 0) {
        summary.push({ id: 'corrections', title: 'Correction Request', count: pendingCorrections, route: 'attendance-correction' });
      }

      setPendingTasks(summary);

      // Parse Recent Activity
      let activities = [];
      if (activityRes.status === 'fulfilled' && activityRes.value?.success && Array.isArray(activityRes.value?.data)) {
        activities = activityRes.value.data;
      }

      // 🟢 FIX: Filter out Visitor and Login activities for the HR Dashboard
      const excludedActivityTypes = [
        'LOGIN',
        'VISITOR_REQUEST', 'VISITOR_CHECK_IN', 'VISITOR_RETURN', 'VISITOR_NO_SHOW',
        'UPDATE_VISITOR_DESTINATION', 'VISITOR_ARRIVE', 'APPROVE_APPOINTMENT',
        'REJECT_APPOINTMENT', 'RESCHEDULE_APPOINTMENT', 'CREATE_VISIT_REASON',
        'UPDATE_VISIT_REASON', 'DELETE_VISIT_REASON'
      ];

      activities = activities.filter(act => {
        const typeStr = (act.type || act.action || act.title || '').toUpperCase();
        return !excludedActivityTypes.some(ex => typeStr.includes(ex));
      });

      setRecentActivities(activities);
      setCurrentPage(1);

    } catch (err) {
      console.error('HR Dashboard error:', err);
      setError('Failed to load HR dashboard metrics. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const formatActionText = (act) => {
    if (act.type) return act.type.replace(/_/g, ' ').toUpperCase();
    if (act.title) return act.title.toUpperCase();
    return 'ACTION RECORDED';
  };

  const handleNavigate = (view) => {
    if (setView) setView(view);
  };

  const todayActivities = recentActivities.filter(act => isToday(act.occurred_at || act.created_at || act.timestamp));
  const totalPages = Math.ceil(todayActivities.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const displayedActivities = todayActivities.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="expert-loading">
        <Users size={44} className="text-muted" style={{ marginBottom: '1rem', animation: 'pulse 2s infinite' }} />
        <p>Loading HR Telemetry...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="expert-empty">
        <AlertCircle size={44} className="text-muted" style={{ marginBottom: '1rem' }} />
        <p>{error}</p>
        <button onClick={loadDashboardData} className="expert-btn-secondary" style={{ marginTop: '1rem' }}>Retry Connection</button>
      </div>
    );
  }

  const totalPendingActions = stats.pendingLeaves + stats.pendingAppeals + stats.pendingOvertime + stats.pendingCorrections;

  return (
    <div className="expert-container">
      {/* System Health Banner */}
      <section className="expert-banner">
        <div className="expert-banner-item">
          <Users size={16} color="#0D9488" />
          <span>Active Instructors: <strong>{stats.totalEmployees}</strong></span>
        </div>
        <div className="expert-banner-item">
          <UserCheck size={16} color="#0EA5E9" />
          <span>Present Today: <strong>{attendanceStats.present + attendanceStats.late}</strong></span>
        </div>
        <div className="expert-banner-item">
          <AlertCircle size={16} className="text-muted" />
          <span>Total Pending Actions: <strong>{totalPendingActions}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid (8 Cards) */}
      <section className="expert-stats-grid grid-4">
        <div className="expert-stat-card" onClick={() => handleNavigate('employee-management')}>
          <div className="expert-stat-header">
            <Users size={18} className="text-muted" />
            <span className="expert-stat-label">Total Instructors</span>
          </div>
          <div className="expert-stat-value">{stats.totalEmployees}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('leave-management')}>
          <div className="expert-stat-header">
            <CalendarOff size={18} className="text-muted" />
            <span className="expert-stat-label">On Leave Today</span>
          </div>
          <div className="expert-stat-value">{stats.onLeaveToday}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('attendance')}>
          <div className="expert-stat-header">
            <UserX size={18} className="text-muted" />
            <span className="expert-stat-label">Absent Today</span>
          </div>
          <div className="expert-stat-value">{stats.absentToday}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('attendance')}>
          <div className="expert-stat-header">
            <Clock size={18} className="text-muted" />
            <span className="expert-stat-label">Late Today</span>
          </div>
          <div className="expert-stat-value">{stats.lateToday}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('leave-management')}>
          <div className="expert-stat-header">
            <FileText size={18} className="text-muted" />
            <span className="expert-stat-label">Pending Leaves</span>
          </div>
          <div className="expert-stat-value">{stats.pendingLeaves}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('overtime-requests')}>
          <div className="expert-stat-header">
            <Clock size={18} className="text-muted" />
            <span className="expert-stat-label">Pending Overtime</span>
          </div>
          <div className="expert-stat-value">{stats.pendingOvertime}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('attendance-correction')}>
          <div className="expert-stat-header">
            <FileText size={18} className="text-muted" />
            <span className="expert-stat-label">Pending Corrections</span>
          </div>
          <div className="expert-stat-value">{stats.pendingCorrections}</div>
        </div>

        <div className="expert-stat-card" onClick={() => handleNavigate('attendance-appeals')}>
          <div className="expert-stat-header">
            <AlertCircle size={18} className="text-muted" />
            <span className="expert-stat-label">Pending Appeals</span>
          </div>
          <div className="expert-stat-value">{stats.pendingAppeals}</div>
        </div>
      </section>

      {/* Middle Section: Pending Requests & Attendance Breakdown */}
      <section className="expert-dashboard-panels">
        
        <div className="expert-panel flex-2">
          <div className="expert-panel-header">
            <div className="expert-ph-title">
              <Clock size={18} />
              <span>Pending Requests</span>
            </div>
          </div>
          <div className="expert-task-list">
            {pendingTasks.length === 0 ? (
              <div className="expert-empty-state">
                <CheckCircle size={28} className="text-muted" />
                <p>No pending system requests requiring review.</p>
              </div>
            ) : (
              pendingTasks.map(task => (
                <div key={task.id} className="expert-task-item">
                  <div className="expert-task-info">
                    <div>
                      <p className="expert-task-text">
                        <strong>{task.title}</strong> - {task.count} pending request{task.count > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <button className="expert-btn-outline-small" onClick={() => handleNavigate(task.route)}>
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
              <PieChart size={18} />
              <span>Today's Attendance Breakdown</span>
            </div>
          </div>
          <div className="expert-panel-body expert-att-body">
            <AttendancePieChart
              present={attendanceStats.present}
              late={attendanceStats.late}
              absent={attendanceStats.absent}
              total={attendanceStats.total}
            />
          </div>
        </div>
        
      </section>

      {/* Recent Activities Section */}
      <section className="expert-panel full-width" style={{ marginTop: '1rem' }}>
        <div className="expert-panel-header">
          <div className="expert-ph-title">
            <Activity size={18} />
            <span>Recent HR Activity</span>
          </div>
          <button className="expert-btn-text" onClick={loadDashboardData}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
        <div className="expert-activity-list">
          {displayedActivities.length === 0 ? (
            <div className="expert-empty-state">
              <Activity size={28} className="text-muted" />
              <p>No activity recorded today.</p>
            </div>
          ) : (
            displayedActivities.map((act, index) => {
              const actionLabel = formatActionText(act);

              return (
                <div key={act.id || act._id || index} className="expert-activity-item">
                  <div className="expert-act-avatar">
                    {(act.actor || act.user_name || act.employee_name || 'S').charAt(0).toUpperCase()}
                  </div>
                  <div className="expert-act-details">
                    <div className="expert-act-top">
                      <span className="expert-act-actor">{act.actor || act.user_name || act.employee_name || 'System User'}</span>
                      {act.description && <span className="expert-act-desc" style={{ marginLeft: '8px', opacity: 0.8 }}>- {act.description}</span>}
                    </div>
                    <div className="expert-act-time">
                      {act.occurred_at || act.created_at || act.timestamp ? new Date(act.occurred_at || act.created_at || act.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit'
                      }) : 'Recently'}
                    </div>
                  </div>
                  
                  <span className="expert-act-simple-text">
                    {actionLabel}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {todayActivities.length > ITEMS_PER_PAGE && (
          <div className="expert-pagination">
            <button
              className="expert-btn-outline-small"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            >
              <ChevronLeft size={14} style={{ marginRight: '2px' }} /> Previous
            </button>
            <span className="expert-pagination-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="expert-btn-outline-small"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            >
              Next <ChevronRight size={14} style={{ marginLeft: '2px' }} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default HRDashboard;