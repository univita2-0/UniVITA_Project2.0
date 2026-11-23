import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Users, CalendarOff, Clock3, UserX, FileClock, ClipboardCheck,
  AlertCircle, RefreshCw, ArrowUpRight, Activity, ChevronLeft,
  ChevronRight, CheckCircle2, CalendarDays, TrendingUp
} from 'lucide-react';
import { API_BASE, fetchRecentActivity, fetchC12WebRecovery } from '../api';
import './RoleDashboard.css';

const headers = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
const phDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const rows = (result) => result.status === 'fulfilled' && Array.isArray(result.value?.data) ? result.value.data : [];
const isToday = (value, date) => {
  if (!value) return false;
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10) === date;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' }).format(d) === date;
};
const timeLabel = (value) => {
  if (!value) return 'Recently';
  const str = String(value);
  const match = str.match(/\b(\d{2}):(\d{2})(?::\d{2})?/);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(str) && match) {
    const hour = Number(match[1]);
    return `${String(hour % 12 || 12).padStart(2, '0')}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
};
const excluded = ['LOGIN', 'VISITOR', 'APPOINTMENT', 'VISIT_REASON', 'BLE', 'SCANNER'];

const Metric = ({ label, value, hint, onClick }) => (
  <button type="button" className="uv-role-metric" onClick={onClick}>
    <span className="uv-role-metric-head">{label}</span>
    <strong>{value}</strong>
    <span className="uv-role-metric-bottom">{hint}</span>
  </button>
);

const HRDashboard = ({ setView }) => {
  const [data, setData] = useState({ instructors: 0, leaveToday: 0, present: 0, late: 0, absent: 0, scheduled: 0, pending: [] });
  const [activities, setActivities] = useState([]);
  const [c12Monitor, setC12Monitor] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [warning, setWarning] = useState('');
  const [updated, setUpdated] = useState(null);
  const today = phDate();
  const navigate = (route) => setView?.(route);

  const load = useCallback(async (initial = false) => {
    const nowPh = phDate();
    const weekStart = new Date(new Date(`${nowPh}T12:00:00+08:00`).getTime() - 6 * 86400000).toISOString().slice(0,10);
    fetchC12WebRecovery(weekStart, nowPh).then(result => {
      if (result?.success) setC12Monitor(result.data || []);
    }).catch(() => setC12Monitor(null));
    if (initial) setLoading(true); else setRefreshing(true);
    const results = await Promise.allSettled([
      axios.get(`${API_BASE}/employees`, headers()),
      axios.get(`${API_BASE}/leave-requests/all`, headers()),
      axios.get(`${API_BASE}/attendance-report`, { ...headers(), params: { date: phDate() } }),
      axios.get(`${API_BASE}/attendance-appeals/pending`, headers()),
      axios.get(`${API_BASE}/overtime-requests/pending`, headers()),
      axios.get(`${API_BASE}/attendance/corrections/pending`, headers()),
      fetchRecentActivity(100)
    ]);
    const [emp, leave, attendance, appeals, overtime, corrections, activity] = results;
    const instructors = rows(emp).filter(u => String(u.role).toLowerCase() === 'instructor' && String(u.status).toLowerCase() === 'active').length;
    const leaves = rows(leave);
    const todayStr = phDate();
    const leaveToday = new Set(leaves.filter(l => String(l.status).toLowerCase() === 'approved' && (
      (l.request_date && String(l.request_date).slice(0, 10) === todayStr) ||
      (l.start_date && String(l.start_date).slice(0, 10) <= todayStr && String(l.end_date || l.start_date).slice(0, 10) >= todayStr)
    )).map(l => String(l.employee_id || l.user_id))).size;
    const attendanceRows = rows(attendance);
    const tally = { present: 0, late: 0, absent: 0 };
    attendanceRows.forEach(item => {
      const status = String(item.status || '').toLowerCase();
      if (['present', 'completed'].includes(status)) tally.present++;
      else if (status === 'late') tally.late++;
      else if (['absent', 'missed schedule', 'missing clock-out', 'missed'].includes(status)) tally.absent++;
    });
    const pending = [
      { id: 'leave', name: 'Leave requests', count: leaves.filter(l => String(l.status).toLowerCase() === 'pending').length, route: 'leave-management', icon: CalendarOff },
      { id: 'overtime', name: 'Overtime requests', count: rows(overtime).length, route: 'overtime-requests', icon: Clock3 },
      { id: 'correction', name: 'Attendance corrections', count: rows(corrections).length, route: 'attendance-correction', icon: FileClock },
      { id: 'appeal', name: 'Attendance appeals', count: rows(appeals).length, route: 'attendance-appeals', icon: ClipboardCheck }
    ];
    setData({ instructors, leaveToday, ...tally, scheduled: attendanceRows.length, pending });
    const activityData = activity.status === 'fulfilled' && activity.value?.success && Array.isArray(activity.value.data) ? activity.value.data : [];
    setActivities(activityData.filter(act => {
      const text = `${act.type || ''} ${act.action || ''} ${act.title || ''}`.toUpperCase();
      return !excluded.some(term => text.includes(term));
    }));
    setPage(1);
    const failures = results.filter((r, i) => i < 6 ? r.status === 'rejected' : r.status === 'rejected' || !r.value?.success).length;
    setWarning(failures ? `Some dashboard data could not be retrieved (${failures} source${failures > 1 ? 's' : ''}). Values may be incomplete.` : '');
    setUpdated(new Date());
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(true); }, [load]);
  const pendingTotal = data.pending.reduce((sum, item) => sum + item.count, 0);
  const recorded = data.present + data.late + data.absent;
  const attendanceRate = recorded ? Math.round(((data.present + data.late) / recorded) * 100) : null;
  const todayActivities = useMemo(() => activities.filter(a => isToday(a.occurred_at || a.created_at || a.timestamp, today)), [activities, today]);
  const pageCount = Math.max(1, Math.ceil(todayActivities.length / 5));
  const display = todayActivities.slice((page - 1) * 5, page * 5);

  if (loading) return <div className="uv-role-state" role="status"><RefreshCw className="uv-role-spin" size={18} /> Loading HR overview…</div>;

  return (
    <main className="uv-role-dashboard" aria-label="HR overview">
      <header className="uv-role-intro">
        <div>
         
          <p>Workforce attendance, personnel requests, and recent HR operations.</p>
        </div>
        <div className="uv-role-meta"><small>Updated {updated ? timeLabel(updated.toISOString()) : '—'}</small></div>
      </header>
      {warning && <div className="uv-role-warning" role="alert"><AlertCircle size={16} /> <span>{warning}</span></div>}

      <section className="uv-role-metrics" aria-label="HR key metrics">
        <Metric label="Active instructors" value={data.instructors} hint="View employee directory" onClick={() => navigate('employee-management')} />
        <Metric label="On leave today" value={data.leaveToday} hint="View leave requests" onClick={() => navigate('leave-management')} />
        <Metric label="Absent or missed" value={data.absent} hint="View attendance" onClick={() => navigate('attendance')} />
        <Metric label="Late attendance" value={data.late} hint="View attendance" onClick={() => navigate('attendance')} />
      </section>

      <div className="uv-role-columns">
        <section className="uv-role-card uv-role-primary" aria-labelledby="hr-pending-title">
          <header className="uv-role-card-header"><div><h2 id="hr-pending-title">Pending HR Reviews</h2><p>Requests awaiting processing</p></div><span className="uv-role-count">{pendingTotal} pending</span></header>
          <div className="uv-role-queue">
            {data.pending.map(item => (
              <div className="uv-role-queue-row" key={item.id}>
                <div className="uv-role-queue-main"><strong>{item.name}</strong><small>{item.count ? `${item.count} request${item.count === 1 ? '' : 's'} awaiting review` : 'No pending requests'}</small></div>
                <span className={`uv-role-queue-number ${item.count ? 'has-items' : ''}`}>{item.count}</span>
                <button type="button" className="uv-role-mini-button" onClick={() => navigate(item.route)}>Review <ChevronRight size={14} /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="uv-role-card" aria-labelledby="hr-attendance-title">
          <header className="uv-role-card-header"><div><h2 id="hr-attendance-title">Attendance Overview</h2><p>Today's classified attendance records</p></div></header>
          <div className="uv-role-chart">
            <div className="uv-role-chart-summary"><div><strong>{attendanceRate === null ? '—' : `${attendanceRate}%`}</strong><small>Present or late rate</small></div><div className="uv-role-chart-total"><strong>{data.scheduled}</strong><small>Shift records</small></div></div>
            <div className="uv-role-stacked" role="img" aria-label={`${data.present} present, ${data.late} late, ${data.absent} absent or missed`}>
              {recorded ? <><span style={{width:`${data.present/recorded*100}%`,background:'#0D9488'}} /><span style={{width:`${data.late/recorded*100}%`,background:'#E8A23A'}} /><span style={{width:`${data.absent/recorded*100}%`,background:'#D45A60'}} /></> : <span style={{width:'100%',background:'#E2E8F0'}} />}
            </div>
            {[['Present',data.present,'#0D9488'],['Late',data.late,'#E8A23A'],['Absent / missed',data.absent,'#D45A60']].map(([label,value,color]) => (
              <div className="uv-role-legend" key={label}><span className="uv-role-legend-dot" style={{background:color}} /><span>{label}</span><strong>{value}</strong><small>{recorded ? `${Math.round(value/recorded*100)}%` : '—'}</small></div>
            ))}
            <div className="uv-role-legend"><span className="uv-role-legend-dot" style={{background:'#D97706'}} /><span>Missing clock-out <small className="uv-role-inline-note">(last 7 days)</small></span><strong>{c12Monitor === null ? '—' : c12Monitor.filter(r => r.status === 'MISSING_CLOCK_OUT').length}</strong><small>—</small></div>
            <button className="uv-role-link" type="button" onClick={() => navigate('attendance')}>View attendance records <ChevronRight size={15}/></button>
          </div>
        </section>
      </div>

      <section className="uv-role-card uv-role-activities" aria-labelledby="hr-activity-title">
        <header className="uv-role-card-header"><div><h2 id="hr-activity-title">Today's HR Activity</h2><p>Latest relevant actions recorded today</p></div><span className="uv-role-subtle-count">{todayActivities.length} records</span></header>
        {display.length ? display.map((item,i) => (
          <div className="uv-role-activity" key={`${item.id || i}-${i}`}>
            <span className="uv-role-avatar">{String(item.actor || 'S').charAt(0).toUpperCase()}</span>
            <div className="uv-role-activity-person"><strong>{item.actor || 'System user'}</strong></div>
            <span className="uv-role-activity-label">{String(item.title || item.type || 'Action recorded').replace(/_/g,' ')}</span>
            <time>{timeLabel(item.occurred_at || item.created_at || item.timestamp)}</time>
          </div>
        )) : <div className="uv-role-empty">No HR activity recorded today.</div>}
        {todayActivities.length > 5 && <footer className="uv-role-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(p=>Math.max(1,p-1))}><ChevronLeft size={14}/> Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage(p=>Math.min(pageCount,p+1))}>Next <ChevronRight size={14}/></button></footer>}
      </section>
    </main>
  );
};

export default HRDashboard;
