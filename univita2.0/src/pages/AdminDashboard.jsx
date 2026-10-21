import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users, Activity, FileText, Clock, AlertCircle,
  CheckCircle, Server, UserMinus, PieChart,
  RefreshCw, ShieldCheck, UserCheck, ChevronLeft, ChevronRight
} from 'lucide-react';
import { API_BASE, fetchRecentActivity } from '../api';
import './Dashboard.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

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

const AdminDashboard = ({ setView }) => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    onLeaveCount: 0,
    todayVisitors: 0,
    systemStatus: 'Operational'
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
      const today = getTodayDate();

      const [
        employeesRes,
        leaveRes,
        appointmentsHistoryRes,
        appointmentsPendingRes,
        overtimeRes,
        appealsRes,
        correctionsRes,
        attendanceReportRes,
        activityRes
      ] = await Promise.allSettled([
        axios.get(`${API_BASE}/employees`, getAuthHeaders()),
        axios.get(`${API_BASE}/leave-requests/all`, getAuthHeaders()),
        axios.get(`${API_BASE}/appointments/history`, getAuthHeaders()),
        axios.get(`${API_BASE}/appointments/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/overtime-requests/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance/corrections/pending`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance-report?date=${today}`, getAuthHeaders()),
        fetchRecentActivity(50)
      ]);

      const allEmployees = employeesRes.status === 'fulfilled' ? employeesRes.value.data || [] : [];
      const totalActive = allEmployees.filter(emp => emp.status === 'active').length;

      const allLeaves = leaveRes.status === 'fulfilled' ? leaveRes.value.data || [] : [];
      const activeLeavesToday = allLeaves.filter(leave => {
        if (leave.status !== 'Approved' && leave.status !== 'APPROVED') return false;
        const start = leave.start_date ? leave.start_date.split('T')[0] : null;
        const end = leave.end_date ? leave.end_date.split('T')[0] : (start || today);
        return start && start <= today && end >= today;
      });
      const onLeaveCount = activeLeavesToday.length;

      const allAppointments = appointmentsHistoryRes.status === 'fulfilled' ? appointmentsHistoryRes.value.data || [] : [];
      const todaysApproved = allAppointments.filter(
        app => app.visit_date === today && app.status === 'APPROVED'
      );
      const visitorCount = todaysApproved.length;

      // Attendance Breakdown (Sync with attendance status rules)
      const attData = attendanceReportRes.status === 'fulfilled' ? attendanceReportRes.value.data || [] : [];
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

      const pendingLeavesCount = allLeaves.filter(l => (l.status || '').toLowerCase() === 'pending').length;
      const pendingVisitorsCount = appointmentsPendingRes.status === 'fulfilled' ? (appointmentsPendingRes.value.data || []).length : 0;
      const pendingOvertimeCount = overtimeRes.status === 'fulfilled' ? (overtimeRes.value.data || []).length : 0;
      const pendingAppealsCount = appealsRes.status === 'fulfilled' ? (appealsRes.value.data || []).length : 0;
      const pendingCorrectionsCount = correctionsRes.status === 'fulfilled' ? (correctionsRes.value.data || []).length : 0;

      let systemStatus = 'Operational';
      try {
        await axios.get(`${API_BASE}/events`, { ...getAuthHeaders(), timeout: 3000 });
      } catch (healthErr) {
        systemStatus = 'Degraded';
      }

      setStats({
        totalEmployees: totalActive,
        onLeaveCount,
        todayVisitors: visitorCount,
        systemStatus
      });

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

      setPendingTasks(summary);

      let activities = [];
      if (activityRes.status === 'fulfilled' && activityRes.value?.success && Array.isArray(activityRes.value?.data)) {
        activities = activityRes.value.data;
      } else {
        try {
          const directAct = await axios.get(`${API_BASE}/activity/recent?limit=50`, getAuthHeaders());
          activities = directAct.data?.activities || directAct.data?.data || [];
        } catch (actErr) {
          console.warn('Direct activity fetch error:', actErr);
        }
      }
      setRecentActivities(activities);
      setCurrentPage(1);

    } catch (err) {
      console.error('Admin Dashboard load error:', err);
      setError('Failed to load dashboard telemetry. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const formatActionText = (act) => {
    if (act.type) {
      return act.type.replace(/_/g, ' ').toUpperCase();
    }
    if (act.title) {
      return act.title.toUpperCase();
    }
    return 'ACTION RECORDED';
  };

  const todayActivities = recentActivities.filter(act => isToday(act.occurred_at || act.created_at || act.timestamp));

  const totalPages = Math.ceil(todayActivities.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const displayedActivities = todayActivities.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="expert-loading">
        <Server size={44} className="text-muted" style={{ marginBottom: '1rem', animation: 'pulse 2s infinite' }} />
        <p>Loading System Telemetry...</p>
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

  return (
    <div className="expert-container">
      {/* System Health Banner */}
      <section className="expert-banner">
        <div className="expert-banner-item">
          <ShieldCheck size={16}  />
          <span>Security Protocol: <strong>Active</strong></span>
        </div>
        <div className="expert-banner-item">
          <Server size={16}  />
          <span>System Status: <strong>{stats.systemStatus}</strong></span>
        </div>
        <div className="expert-banner-item">
          <Clock size={16} className="text-muted" />
          <span>Last Synchronized: <strong>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
        </div>
      </section>

      {/* Key Metrics Grid */}
      <section className="expert-stats-grid grid-3">
        <div className="expert-stat-card" onClick={() => setView('employee-management')}>
          <div className="expert-stat-header">
            <Users size={18} className="text-muted" />
            <span className="expert-stat-label">Active Personnel</span>
          </div>
          <div className="expert-stat-value">{stats.totalEmployees}</div>
        </div>

        <div className="expert-stat-card" onClick={() => setView('manage-request')}>
          <div className="expert-stat-header">
            <UserCheck size={18} className="text-muted" />
            <span className="expert-stat-label">Today's Visitors</span>
          </div>
          <div className="expert-stat-value">{stats.todayVisitors}</div>
        </div>

        <div className="expert-stat-card" onClick={() => setView('leave-management')}>
          <div className="expert-stat-header">
            <UserMinus size={18} className="text-muted" />
            <span className="expert-stat-label">On Leave Instructors</span>
          </div>
          <div className="expert-stat-value">{stats.onLeaveCount}</div>
        </div>
      </section>

      {/* Middle Section: Pending Requests + Attendance Breakdown Pie Chart */}
      <section className="expert-dashboard-panels">
        {/* Pending Requests Summary */}
        <div className="expert-panel flex-2">
          <div className="expert-panel-header">
            <div className="expert-ph-title">
              
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
                  <button className="expert-btn-outline-small" onClick={() => setView(task.route)}>
                    Review
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Attendance Breakdown (Pie Chart Card) */}
        <div className="expert-panel flex-1">
          <div className="expert-panel-header">
            <div className="expert-ph-title">
              
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
            
            <span>Recent Activity</span>
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

export default AdminDashboard;