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

const Metric = ({ icon: Icon, label, value, hint, onClick }) => (
  <button type="button" className="uv-role-metric" onClick={onClick}>
    <span className="uv-role-metric-head"><span>{label}</span><Icon size={18} aria-hidden="true" /></span>
    <strong>{value}</strong><span className="uv-role-metric-bottom">{hint}<ArrowUpRight size={15} aria-hidden="true" /></span>
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

  if (loading) return <div className="uv-role-state" role="status"><RefreshCw size={23} className="uv-role-spin" /> Loading HR overview…</div>;

  return (
    <main className="uv-role-dashboard" aria-label="HR overview">
      <header className="uv-role-intro">
        <div><p>Instructor workforce, attendance, and outstanding approvals in one workspace.</p></div>
        <button className="uv-role-button" type="button" disabled={refreshing} onClick={() => load()}><RefreshCw size={15} className={refreshing ? 'uv-role-spin' : ''} /> Refresh data</button>
      </header>
      <div className="uv-role-status"><span><CalendarDays size={15} /> {new Date(`${today}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span><span><CheckCircle2 size={15} /> HR operations overview</span><span>Updated {updated ? timeLabel(updated.toISOString()) : '—'}</span></div>
      {warning && <div className="uv-role-warning" role="alert"><AlertCircle size={16} /> {warning}</div>}
      <section className="uv-role-metrics" aria-label="HR key metrics">
        <Metric icon={Users} label="Active instructors" value={data.instructors} hint="Employee directory" onClick={() => navigate('employee-management')} />
        <Metric icon={CalendarOff} label="On leave today" value={data.leaveToday} hint="Approved leave" onClick={() => navigate('leave-management')} />
        <Metric icon={UserX} label="Absent / missed" value={data.absent} hint="Attendance records" onClick={() => navigate('attendance')} />
        <Metric icon={Clock3} label="Late attendance" value={data.late} hint="Attendance records" onClick={() => navigate('attendance')} />
      </section>
      <section className="uv-role-columns">
        <article className="uv-role-card">
          <header className="uv-role-card-header"><div><h2>Pending HR reviews</h2></div><span className="uv-role-count">{pendingTotal} pending</span></header>
          <div className="uv-role-queue">{data.pending.map(item => <div className="uv-role-queue-row" key={item.id}><span className="uv-role-queue-icon"><item.icon size={16} /></span><div><strong>{item.name}</strong><small>{item.count ? `${item.count} request${item.count === 1 ? '' : 's'} awaiting review` : 'No requests awaiting review'}</small></div><b>{item.count}</b><button type="button" className="uv-role-mini-button" onClick={() => navigate(item.route)}>Review <ChevronRight size={14}/></button></div>)}</div>
        </article>
        <article className="uv-role-card"><header className="uv-role-card-header"><div><h2>Attendance overview</h2></div><TrendingUp size={18} className="uv-role-accent" /></header>
          <div className="uv-role-chart"><div className="uv-role-chart-summary"><div><strong>{attendanceRate === null ? '—' : `${attendanceRate}%`}</strong><small>Present or late, among classified records</small></div><div className="uv-role-chart-total"><strong>{data.scheduled}</strong><small>Shift records</small></div></div>
            <div className="uv-role-stacked" role="img" aria-label={`${data.present} present, ${data.late} late, ${data.absent} absent or missed`}>
              {recorded ? <><span style={{width:`${data.present / recorded * 100}%`,background:'#0D9488'}}/><span style={{width:`${data.late / recorded * 100}%`,background:'#E8A23A'}}/><span style={{width:`${data.absent / recorded * 100}%`,background:'#D45A60'}}/></> : <span style={{width:'100%',background:'#E2E8F0'}}/>}
            </div>
            {[['Present',data.present,'#0D9488'],['Late',data.late,'#E8A23A'],['Absent / missed',data.absent,'#D45A60']].map(([name,value,color]) => <div className="uv-role-legend" key={name}><span className="uv-role-legend-dot" style={{background:color}}/>{name}<strong>{value}</strong><small>{recorded ? `${Math.round(value / recorded * 100)}%` : '—'}</small></div>)}
            <div className="uv-role-legend" aria-label="Missing Clock-Out cases in the last 7 days">
              <span className="uv-role-legend-dot" style={{background:'#D97706'}}/>
              <span className="uv-role-legend-name">Missing Clock-Out <small>(last 7 days)</small></span>
              <strong>{c12Monitor === null ? '—' : c12Monitor.filter(r => r.status === 'MISSING_CLOCK_OUT').length}</strong>
              <small className="uv-role-legend-placeholder" aria-hidden="true">—</small>
            </div>
            <button type="button" className="uv-role-link" onClick={() => navigate('attendance')}>Open attendance records <ArrowUpRight size={15}/></button>
          </div>
        </article>
      </section>
      <section className="uv-role-card uv-role-activities"><header className="uv-role-card-header"><div><h2>TODAY'S EVENTS</h2><p>Latest relevant actions recorded today.</p></div><Activity size={18} className="uv-role-accent"/></header>
        {display.length ? display.map((item,i) => <div className="uv-role-activity" key={`${item.id || i}-${i}`}><span className="uv-role-avatar">{String(item.actor || 'S').charAt(0).toUpperCase()}</span><div><strong>{item.actor || 'System user'}</strong></div><span className="uv-role-activity-label">{String(item.title || item.type || 'Action recorded').replace(/_/g,' ')}</span><time>{timeLabel(item.occurred_at || item.created_at || item.timestamp)}</time></div>) : <div className="uv-role-empty"><Activity size={24}/><span>No HR activity recorded today.</span></div>}
        {todayActivities.length > 5 && <footer className="uv-role-pagination"><button type="button" disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={15}/> Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page===pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>Next <ChevronRight size={15}/></button></footer>}
      </section>
    </main>
  );
};

export default HRDashboard;
