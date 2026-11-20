import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Users, Activity, Clock3, AlertCircle, CheckCircle2, Server,
  UserRoundMinus, UserRoundCheck, RefreshCw, ShieldCheck,
  ChevronLeft, ChevronRight, ArrowUpRight, CalendarDays,
  ClipboardList, TrendingUp, CircleDot, Inbox
} from 'lucide-react';
import { API_BASE, fetchRecentActivity, fetchC12WebRecovery } from '../api';
import './AdminDashboard.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Keep report queries aligned with the server's Philippine calendar date.
const getTodayDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const toDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const matched = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (matched) return matched[1];
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(parsed);
};

const getClockLabel = (value) => {
  if (!value) return 'Recently';
  const safe = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? value.replace(' ', 'T') + '+08:00'
    : value;
  const parsed = new Date(safe);
  return Number.isNaN(parsed.getTime()) ? 'Recently' : parsed.toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit'
  });
};

const REQUEST_META = {
  visits: { label: 'Visitor requests', description: 'New appointments awaiting review', icon: UserRoundCheck },
  leaves: { label: 'Leave requests', description: 'Employee leave decisions', icon: CalendarDays },
  overtime: { label: 'Overtime requests', description: 'Additional work-hour submissions', icon: Clock3 },
  appeals: { label: 'Attendance appeals', description: 'Attendance records requiring review', icon: ClipboardList },
  corrections: { label: 'Correction requests', description: 'Timekeeping correction submissions', icon: CircleDot }
};

const AttendanceOverview = ({ stats, recoveryRecords }) => {
  const classified = stats.present + stats.late + stats.absent;
  const percent = classified > 0 ? Math.round(((stats.present + stats.late) / classified) * 100) : null;
  const segments = [
    { label: 'Present', value: stats.present, color: 'present' },
    { label: 'Late', value: stats.late, color: 'late' },
    { label: 'Absent / Missed', value: stats.absent, color: 'absent' }
  ];

  return (
    <div className="uv-overview-attendance">
      <div className="uv-attendance-heading">
        <div>
          <span className="uv-overline">TODAY'S ATTENDANCE</span>
          <div className="uv-attendance-headline">
            <span className="uv-attendance-rate">{percent === null ? '—' : `${percent}%`}</span>
            <span className="uv-attendance-rate-label">Recorded attendance rate</span>
          </div>
        </div>
        <div className="uv-attendance-total"><strong>{stats.total}</strong><span>Scheduled records</span></div>
      </div>
      {classified > 0 ? (
        <div className="uv-attendance-track" role="img" aria-label={`Present ${stats.present}, late ${stats.late}, absent ${stats.absent}`}>
          {segments.filter(s => s.value > 0).map(s => (
            <span key={s.label} className={`uv-attendance-segment uv-${s.color}`} style={{ width: `${(s.value / classified) * 100}%` }} />
          ))}
        </div>
      ) : (
        <div className="uv-attendance-empty">No classified attendance records for today.</div>
      )}
      <div className="uv-attendance-legend">
        {segments.map(s => (
          <div key={s.label} className="uv-legend-item">
            <span className={`uv-legend-dot uv-${s.color}`} />
            <span className="uv-legend-label">{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
        <div className="uv-legend-item uv-missing-clockout-row">
          <span className="uv-legend-dot uv-missing-clockout-dot" />
          <span className="uv-legend-label">Missing Clock-Out <small>(last 7 days)</small></span>
          <strong>{Array.isArray(recoveryRecords) ? recoveryRecords.filter(r => r.status === 'MISSING_CLOCK_OUT').length : '—'}</strong>
        </div>
      </div>
      <p className="uv-attendance-footnote">Rate is calculated from classified present, late, and absent records. Other statuses are excluded.</p>
    </div>
  );
};

const AdminDashboard = ({ setView }) => {
  const [stats, setStats] = useState({
    totalEmployees: 0, onLeaveCount: 0, todayVisitors: 0, systemStatus: 'Operational'
  });
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, late: 0, absent: 0, total: 0 });
  const [pendingTasks, setPendingTasks] = useState([]);
  const [c12Monitor, setC12Monitor] = useState(null);
  // Attendance alerts are handled by Pending requests; no duplicate dashboard inbox.

  const [recentActivities, setRecentActivities] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const ITEMS_PER_PAGE = 5;

  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const today = getTodayDate();
      const weekStart = new Date(new Date(`${today}T12:00:00+08:00`).getTime() - 6 * 86400000).toISOString().slice(0,10);
      fetchC12WebRecovery(weekStart, today).then(result => {
        if (result?.success) setC12Monitor(result.data || []);
      }).catch(() => setC12Monitor(null));
      const [employeesRes, leaveRes, appointmentsHistoryRes, appointmentsPendingRes,
        overtimeRes, appealsRes, correctionsRes, attendanceReportRes, activityRes] = await Promise.allSettled([
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
      const responseArray = (res) => res.status === 'fulfilled' && Array.isArray(res.value?.data) ? res.value.data : [];
      const allEmployees = responseArray(employeesRes);
      const allLeaves = responseArray(leaveRes);
      const allAppointments = responseArray(appointmentsHistoryRes);
      const attData = responseArray(attendanceReportRes);
      const activeLeavesToday = allLeaves.filter(leave => {
        if (String(leave.status || '').toLowerCase() !== 'approved') return false;
        const start = toDateKey(leave.start_date || leave.request_date);
        const end = toDateKey(leave.end_date || leave.start_date || leave.request_date);
        return start && start <= today && end >= today;
      });
      const attendanceCounts = { present: 0, late: 0, absent: 0, total: attData.length };
      attData.forEach(item => {
        const status = String(item.status || '').toLowerCase();
        if (status === 'present' || status === 'completed') attendanceCounts.present += 1;
        else if (status === 'late') attendanceCounts.late += 1;
        else if (['absent', 'missed schedule', 'missing clock-out', 'missed'].includes(status)) attendanceCounts.absent += 1;
      });
      setAttendanceStats(attendanceCounts);

      const pendingCounts = [
        { id: 'visits', title: 'Visitor Request', count: responseArray(appointmentsPendingRes).length, route: 'manage-request' },
        { id: 'leaves', title: 'Leave Request', count: allLeaves.filter(l => String(l.status || '').toLowerCase() === 'pending').length, route: 'leave-management' },
        { id: 'overtime', title: 'Overtime Request', count: responseArray(overtimeRes).length, route: 'overtime-requests' },
        { id: 'appeals', title: 'Attendance Appeal', count: responseArray(appealsRes).length, route: 'attendance-appeals' },
        { id: 'corrections', title: 'Correction Request', count: responseArray(correctionsRes).length, route: 'attendance-correction' }
      ];
      setPendingTasks(pendingCounts.filter(task => task.count > 0));

      let systemStatus = 'Operational';
      try { await axios.get(`${API_BASE}/events`, { ...getAuthHeaders(), timeout: 3000 }); }
      catch { systemStatus = 'Degraded'; }
      setStats({
        totalEmployees: allEmployees.filter(emp => emp.status === 'active').length,
        onLeaveCount: activeLeavesToday.length,
        todayVisitors: allAppointments.filter(app => toDateKey(app.visit_date) === today && app.status === 'APPROVED').length,
        systemStatus
      });

      let activities = [];
      if (activityRes.status === 'fulfilled' && activityRes.value?.success && Array.isArray(activityRes.value?.data)) {
        activities = activityRes.value.data;
      } else {
        try {
          const response = await axios.get(`${API_BASE}/activity/recent?limit=50`, getAuthHeaders());
          activities = response.data?.activities || response.data?.data || [];
        } catch (activityError) {
          console.warn('Recent activity retrieval failed:', activityError);
        }
      }
      setRecentActivities(Array.isArray(activities) ? activities : []);
      setCurrentPage(1);
      setLastUpdated(new Date());
    } catch (loadError) {
      console.error('Admin Dashboard load error:', loadError);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  const today = getTodayDate();
  const todayActivities = recentActivities.filter(act => toDateKey(act.occurred_at || act.created_at || act.timestamp) === today);
  const totalPages = Math.max(1, Math.ceil(todayActivities.length / ITEMS_PER_PAGE));
  const displayedActivities = todayActivities.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const pendingTotal = pendingTasks.reduce((count, task) => count + task.count, 0);
  const dateLabel = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  }).format(new Date());

  const formatActionText = (act) => {
    const value = act.title || act.type || 'Action recorded';
    return String(value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  };

  if (loading) return (
    <main className="uv-overview uv-overview-state" aria-busy="true">
      <RefreshCw size={24} className="uv-spin" aria-hidden="true" />
      <h2>Loading overview</h2><p>Retrieving your administrative dashboard data.</p>
    </main>
  );

  if (error) return (
    <main className="uv-overview uv-overview-state" role="alert">
      <AlertCircle size={26} aria-hidden="true" />
      <h2>Unable to load overview</h2><p>{error}</p>
      <button className="uv-button uv-button-primary" onClick={() => loadDashboardData()}>Retry connection</button>
    </main>
  );

  return (
    <main className="uv-overview">
      <section className="uv-overview-health" aria-label="System health">
        <div className="uv-health-date"><CalendarDays size={15} /><span>{dateLabel}</span></div>
        <div className="uv-health-right">
          <span className="uv-health-item"><ShieldCheck size={15} /> Security protocol active</span>
          <span className={`uv-health-item uv-health-status ${stats.systemStatus === 'Operational' ? 'uv-operational' : 'uv-degraded'}`}>
            <span className="uv-status-dot" /> System {stats.systemStatus}
          </span>
          <span className="uv-health-sync"><Clock3 size={14} /> Updated {lastUpdated ? getClockLabel(lastUpdated) : '—'}</span>
        </div>
      </section>

      <section className="uv-overview-stats" aria-label="Key metrics">
        {[
          { title: 'Active personnel', value: stats.totalEmployees, note: 'Currently active staff accounts', icon: Users, route: 'employee-management' },
          { title: "Today's visitors", value: stats.todayVisitors, note: 'Approved visits scheduled today', icon: UserRoundCheck, route: 'manage-request' },
          { title: 'On leave today', value: stats.onLeaveCount, note: 'Approved leave records for today', icon: UserRoundMinus, route: 'leave-management' }
        ].map(metric => {
          const Icon = metric.icon;
          return (
            <button type="button" className="uv-metric" key={metric.title} onClick={() => setView(metric.route)}>
              <span className="uv-metric-header"><span>{metric.title}</span><span className="uv-metric-icon"><Icon size={18} /></span></span>
              <strong className="uv-metric-value">{metric.value.toLocaleString('en-PH')}</strong>
              <span className="uv-metric-bottom"><span>{metric.note}</span><ArrowUpRight size={16} /></span>
            </button>
          );
        })}
      </section>

      <section className="uv-overview-workgrid" aria-label="Daily operations">
        <article className="uv-overview-card uv-request-card">
          <header className="uv-card-header">
            <div><h2>Pending requests</h2></div>
            <span className="uv-queue-count" aria-label={`${pendingTotal} pending items`}>{pendingTotal} pending</span>
          </header>
          <div className="uv-requests-list">
            {pendingTasks.length === 0 ? (
              <div className="uv-overview-empty"><CheckCircle2 size={25} /><strong>All caught up</strong><span>No pending requests requiring review.</span></div>
            ) : pendingTasks.map(task => {
              const meta = REQUEST_META[task.id];
              const Icon = meta.icon;
              return (
                <div className="uv-request-row" key={task.id}>
                  <span className="uv-request-icon"><Icon size={17} /></span>
                  <div className="uv-request-content"><strong>{meta.label}</strong><span>{meta.description}</span></div>
                  <span className="uv-request-count">{task.count}</span>
                  <button type="button" className="uv-button uv-button-compact" onClick={() => setView(task.route)} aria-label={`Review ${meta.label}`}>
                    Review <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </article>
        <article className="uv-overview-card uv-attendance-card">
          <header className="uv-card-header">
            <div><h2>Attendance overview</h2></div>
            <TrendingUp size={18} className="uv-card-header-icon" />
          </header>
          <AttendanceOverview stats={attendanceStats} recoveryRecords={c12Monitor} />
        </article>
      </section>

      <section className="uv-overview-card uv-activity-card" aria-label="Recent activity">
        <header className="uv-card-header uv-activity-header">
          <div><h2>Recent activity</h2><p>Latest recorded events today</p></div>
          
        </header>
        <div className="uv-activity-list">
          {displayedActivities.length === 0 ? (
            <div className="uv-overview-empty"><Inbox size={26} /><strong>No activity yet</strong><span>No activity has been recorded today.</span></div>
          ) : displayedActivities.map((act, index) => {
            const name = act.actor || act.user_name || act.employee_name || 'System User';
            const eventTime = act.occurred_at || act.created_at || act.timestamp;
            return (
              <div className="uv-activity-row" key={act.id || act._id || index}>
                <div className="uv-activity-avatar" aria-hidden="true">{String(name).charAt(0).toUpperCase()}</div>
                <div className="uv-activity-main">
                  <strong>{name}</strong>
                </div>
                <span className="uv-activity-type">{formatActionText(act)}</span>
                <time className="uv-activity-time" dateTime={eventTime || undefined}>{getClockLabel(eventTime)}</time>
              </div>
            );
          })}
        </div>
        <footer className="uv-activity-footer">
          <span>{todayActivities.length === 0 ? '0 events' : `${(currentPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(currentPage * ITEMS_PER_PAGE, todayActivities.length)} of ${todayActivities.length} events`}</span>
          <div className="uv-pagination-controls">
            <button type="button" aria-label="Previous activity page" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}><ChevronLeft size={16}/></button>
            <span>Page {currentPage} of {totalPages}</span>
            <button type="button" aria-label="Next activity page" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}><ChevronRight size={16}/></button>
          </div>
        </footer>
      </section>
    </main>
  );
};

export default AdminDashboard;
