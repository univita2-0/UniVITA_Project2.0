import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ShieldCheck, UserCheck, Radio, Users, RefreshCw, CalendarDays,
  AlertCircle, Activity, Bell, CheckCircle2, ChevronLeft, ChevronRight,
  ArrowUpRight, X, MapPin, BatteryWarning, WifiOff, ClipboardList
} from 'lucide-react';
import { API_BASE, fetchRecentActivity } from '../api';
import './RoleDashboard.css';

const headers = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
const phDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const arrayResult = r => r.status === 'fulfilled' && Array.isArray(r.value?.data) ? r.value.data : [];
const flag = v => v === true || v === 1 || v === '1';
const isToday = (value, today) => {
  if (!value) return false;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10) === today;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Manila'}).format(d) === today;
};
const timeLabel = value => {
  if (!value) return 'Recently';
  const s = String(value);
  const m = s.match(/^\d{4}-\d{2}-\d{2} (\d{2}):(\d{2})/);
  if (m) return `${String(Number(m[1])%12 || 12).padStart(2,'0')}:${m[2]} ${Number(m[1])>=12?'PM':'AM'}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Recently' : d.toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'});
};

const Metric = ({icon:Icon,label,value,hint,onClick}) => <button type="button" className="uv-role-metric" onClick={onClick}><span className="uv-role-metric-head"><span>{label}</span><Icon size={18}/></span><strong>{value}</strong><span className="uv-role-metric-bottom">{hint}<ArrowUpRight size={15}/></span></button>;

const SecurityDashboard = ({ setView }) => {
  const [data,setData] = useState({all:[], active:[], approved:0, tags:0, scanners:0, distribution:[]});
  const [alerts,setAlerts] = useState([]);
  const [dismissed,setDismissed] = useState(new Set());
  const [activities,setActivities] = useState([]);
  const [tab,setTab] = useState('visitors');
  const [page,setPage] = useState(1);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [warning,setWarning] = useState('');
  const [updated,setUpdated] = useState(null);
  const today = phDate();
  const navigate = route => setView?.(route);

  const load = useCallback(async (initial=false) => {
    if(initial) setLoading(true); else setRefreshing(true);
    const results = await Promise.allSettled([
      axios.get(`${API_BASE}/visitor-requests`, {...headers(), params:{date:phDate()}}),
      axios.get(`${API_BASE}/ble-tags`, headers()),
      axios.get(`${API_BASE}/scanners`, headers()),
      fetchRecentActivity(100)
    ]);
    const [visitorsResult,tagsResult,scannersResult,activityResult] = results;
    const all = arrayResult(visitorsResult);
    const tags = arrayResult(tagsResult);
    const scanners = arrayResult(scannersResult);
    const groups = {active:0, pending:0, completed:0, noShow:0, upcoming:0};
    const active = [];
    all.forEach(v => {
      const checkedIn = flag(v.arrived) && !flag(v.returned) && !flag(v.no_show);
      if (checkedIn) {groups.active++;active.push(v);}
      else if(flag(v.returned)) groups.completed++;
      else if(flag(v.no_show) || String(v.status).toUpperCase()==='REJECTED') groups.noShow++;
      else if(String(v.status).toUpperCase()==='PENDING') groups.pending++;
      else groups.upcoming++;
    });
    setData({all,active,approved:all.filter(v=>String(v.status).toUpperCase()==='APPROVED').length,tags:tags.filter(t=>String(t.current_status).toUpperCase()==='IN USE').length,scanners:scanners.length,distribution:[
      ['On campus',groups.active,'#0D9488'],['Pending approval',groups.pending,'#E8A23A'],['Completed',groups.completed,'#4777C7'],['No show / rejected',groups.noShow,'#D45A60'],['Expected / upcoming',groups.upcoming,'#94A3B8']
    ]});
    const incidents = [];
    tags.forEach(t=>{const battery=Number(t.battery_level);if(Number.isFinite(battery) && battery>0 && battery<2600) incidents.push({id:`battery-${t.ble_id}`,title:`Low battery · ${t.label||t.ble_id}`,detail:`Battery reading ${battery} mV. Check and recharge or replace the tag battery as appropriate.`,icon:BatteryWarning});});
    scanners.forEach(s=>{
      const last = s.last_ping ? new Date(s.last_ping) : null;
      const minutes = last && !Number.isNaN(last.getTime()) ? (Date.now()-last.getTime())/60000 : null;
      if(String(s.status).toUpperCase()==='OFFLINE' || (minutes!==null && minutes>5)) incidents.push({id:`scanner-${s.scanner_id}`,title:`Scanner offline · ${s.assigned_room||s.scanner_id}`,detail:`${s.scanner_id} · ${minutes!==null&&minutes>0?`Last heartbeat about ${Math.round(minutes)} minutes ago.`:'No current heartbeat available.'}`,icon:WifiOff});
    });
    setAlerts(incidents);
    const activityData = activityResult.status==='fulfilled' && activityResult.value?.success && Array.isArray(activityResult.value.data) ? activityResult.value.data : [];
    const keys=['VISITOR','APPOINTMENT','VISIT_REASON'];
    setActivities(activityData.filter(a=>keys.some(key=>`${a.type||''} ${a.action||''} ${a.title||''}`.toUpperCase().includes(key))));
    setPage(1);
    const fails=results.filter((r,i)=>i<3?r.status==='rejected':r.status==='rejected'||!r.value?.success).length;
    setWarning(fails?`Some security data could not be loaded (${fails} source${fails===1?'':'s'}). Displayed counts may be incomplete.`:'');
    setUpdated(new Date());setLoading(false);setRefreshing(false);
  },[]);

  useEffect(()=>{load(true);const id=setInterval(()=>load(false),30000);return()=>clearInterval(id);},[load]);
  const visibleAlerts=alerts.filter(a=>!dismissed.has(a.id));
  const todayActivities=useMemo(()=>activities.filter(a=>isToday(a.occurred_at||a.created_at||a.timestamp,today)),[activities,today]);
  const totalPages=Math.max(1,Math.ceil(todayActivities.length/5));
  const display=todayActivities.slice((page-1)*5,page*5);
  const dismissAlert=id=>setDismissed(prev=>new Set([...prev,id]));
  if(loading) return <div className="uv-role-state" role="status"><RefreshCw size={23} className="uv-role-spin"/> Loading security overview…</div>;

  return <main className="uv-role-dashboard" aria-label="Security overview">
    <header className="uv-role-intro"><div><p>Today's visitors, access activity, and BLE monitoring in one workspace.</p></div><button className="uv-role-button" type="button" disabled={refreshing} onClick={()=>load(false)}><RefreshCw size={15} className={refreshing?'uv-role-spin':''}/> Refresh data</button></header>
    <div className="uv-role-status"><span><CalendarDays size={15}/>{new Date(`${today}T12:00:00`).toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</span><span><ShieldCheck size={15}/> Visitor operations monitoring</span><span>Updated {updated?timeLabel(updated.toISOString()):'—'}</span></div>
    {warning&&<div className="uv-role-warning" role="alert"><AlertCircle size={16}/>{warning}</div>}
    <section className="uv-role-metrics uv-role-metrics-3" aria-label="Security key metrics">
      <Metric icon={UserCheck} label="Approved visits today" value={data.approved} hint="Visit schedules" onClick={()=>navigate('today-visitors')}/>
      <Metric icon={Users} label="Today's visitor requests" value={data.all.length} hint="Daily visitor list" onClick={()=>navigate('today-visitors')}/>
      <Metric icon={Radio} label="BLE tags in use" value={data.tags} hint="Tag inventory" onClick={()=>navigate('manage-ble')}/>
    </section>
    <section className="uv-role-columns">
      <article className="uv-role-card"><header className="uv-role-card-header"><div><p>Checked-in visitors and hardware alerts.</p></div><span className="uv-role-count">{data.active.length} on campus</span></header>
        <div className="uv-role-tabs" role="tablist" aria-label="Security desk views"><button type="button" role="tab" aria-selected={tab==='visitors'} className={tab==='visitors'?'active':''} onClick={()=>setTab('visitors')}><UserCheck size={15}/> Current visitors</button><button type="button" role="tab" aria-selected={tab==='alerts'} className={tab==='alerts'?'active':''} onClick={()=>setTab('alerts')}><Bell size={15}/> Hardware alerts {visibleAlerts.length>0&&<span className="uv-role-tab-badge">{visibleAlerts.length}</span>}</button></div>
        <div className="uv-role-queue uv-role-security-queue" role="tabpanel">{tab==='visitors'?(data.active.length?data.active.map(v=><div className="uv-role-queue-row" key={v.id}><span className="uv-role-queue-icon"><MapPin size={16}/></span><div><strong>{`${v.first_name||''} ${v.last_name||''}`.trim()||'Visitor'}</strong><small>{v.destination||v.reason||'Destination not assigned'} · {v.visit_time?String(v.visit_time).slice(0,5):'Time unavailable'}</small></div><button className="uv-role-mini-button" type="button" onClick={()=>navigate('track-visitor')}>Track <ChevronRight size={14}/></button></div>):<div className="uv-role-empty"><CheckCircle2 size={24}/><span>No visitors currently checked in.</span></div>):(visibleAlerts.length?visibleAlerts.map(a=><div className="uv-role-queue-row uv-role-incident" key={a.id}><span className="uv-role-queue-icon"><a.icon size={16}/></span><div><strong>{a.title}</strong><small>{a.detail}</small></div><button type="button" className="uv-role-mini-button" onClick={()=>dismissAlert(a.id)} aria-label={`Dismiss ${a.title}`}><X size={14}/> Dismiss</button></div>):<div className="uv-role-empty"><CheckCircle2 size={24}/><span>No hardware alerts detected in the loaded records.</span></div>)}</div>
      </article>
      <article className="uv-role-card"><header className="uv-role-card-header"><div><h2>Today's visit breakdown</h2></div><ClipboardList size={18} className="uv-role-accent"/></header><div className="uv-role-chart"><div className="uv-role-chart-summary"><div><strong>{data.active.length}</strong><small>Visitors on campus now</small></div><div className="uv-role-chart-total"><strong>{data.all.length}</strong><small>Total requests</small></div></div><div className="uv-role-stacked" role="img" aria-label="Distribution of today's visitor requests">{data.all.length?data.distribution.map(([name,count,color])=><span key={name} style={{width:`${count/data.all.length*100}%`,background:color}}/>):<span style={{width:'100%',background:'#E2E8F0'}}/>}</div>{data.distribution.map(([name,count,color])=><div className="uv-role-legend" key={name}><span className="uv-role-legend-dot" style={{background:color}}/>{name}<strong>{count}</strong><small>{data.all.length?`${Math.round(count/data.all.length*100)}%`:'—'}</small></div>)}<button type="button" className="uv-role-link" onClick={()=>navigate('today-visitors')}>View today's visitors <ArrowUpRight size={15}/></button></div></article>
    </section>
    <section className="uv-role-card uv-role-activities"><header className="uv-role-card-header"><div><h2>Recent visitor activity</h2><p>Latest relevant visitor and appointment events.</p></div><Activity size={18} className="uv-role-accent"/></header>{display.length?display.map((a,i)=><div className="uv-role-activity" key={`${a.id||i}-${i}`}><span className="uv-role-avatar">{String(a.actor||'V').charAt(0).toUpperCase()}</span><div><strong>{a.actor||'Visitor'}</strong><small>{a.reference||'Visitor operation'}</small></div><span className="uv-role-activity-label">{String(a.title||a.type||'Visitor event').replace(/_/g,' ')}</span><time>{timeLabel(a.occurred_at||a.created_at||a.timestamp)}</time></div>):<div className="uv-role-empty"><Activity size={24}/><span>No visitor activity recorded today.</span></div>}{todayActivities.length>5&&<footer className="uv-role-pagination"><button type="button" disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft size={15}/> Previous</button><span>Page {page} of {totalPages}</span><button type="button" disabled={page===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next <ChevronRight size={15}/></button></footer>}</section>
  </main>;
};

export default SecurityDashboard;
