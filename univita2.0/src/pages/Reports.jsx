import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './Reports.css';
import {
  Download, Users, Calendar, DollarSign, PieChart,
  Clock, FileText, TrendingUp, AlertCircle, CheckCircle, XCircle, 
  ClipboardList, ShieldCheck, Printer, Award, Info
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart as RPieChart, Pie, Cell
} from 'recharts';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const Reports = () => {
  const [selectedReport, setSelectedReport] = useState('attendance');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Data states
  const [attendanceData, setAttendanceData] = useState([]);
  const [payrollData, setPayrollData] = useState([]);
  const [visitorStats, setVisitorStats] = useState({ approved: 0, rejected: 0, pending: 0 });
  const [scheduleData, setScheduleData] = useState([]);
  const [visitorList, setVisitorList] = useState([]);
  const [requestsData, setRequestsData] = useState({ leaves: [], overtime: [], appeals: [] });

  const availableMonths = useMemo(() => {
    const months = [];
    const today = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      months.push({ value, label });
    }
    return months;
  }, []);

  const [currentYear, currentMonthNum] = selectedMonth.split('-');
  const monthLabel = availableMonths.find(m => m.value === selectedMonth)?.label || selectedMonth;
  const lastDayOfMonth = new Date(parseInt(currentYear, 10), parseInt(currentMonthNum, 10), 0).getDate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        switch (selectedReport) {
          case 'attendance': await fetchAttendanceData(); break;
          case 'payroll': await fetchPayrollData(); break;
          case 'visitor': await fetchVisitorData(); break;
          case 'scheduling': await fetchSchedulingData(); break;
          case 'requests': await fetchRequestsData(); break;
          default: break;
        }
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to load report data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedReport, selectedMonth]);

  const fetchAttendanceData = async () => {
    const [month, year] = selectedMonth.split('-');
    const res = await axios.get(`${API_BASE}/attendance-monthly`, { params: { month, year }, ...getAuthHeaders() });
    const data = res.data || [];
    setAttendanceData(data.map(e => ({
      ...e, 
      regular_hours: Number(e.regular_hours) || 0, 
      overtime_hours: Number(e.overtime_hours) || 0, 
      leave_days: Number(e.leave_days) || 0,
      scheduled_shifts: Number(e.scheduled_shifts) || Number(e.scheduled_days) || 0,
      present_shifts: Number(e.present_shifts) || Number(e.present_days) || 0,
      late_count: Number(e.late_count) || Number(e.late_days) || 0
    })));
  };

  const fetchPayrollData = async () => {
    const res = await axios.get(`${API_BASE}/payroll/history`, getAuthHeaders());
    const all = res.data || [];
    const target = new Date(selectedMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    setPayrollData(all.filter(p => p.month_year === target));
  };

  const fetchVisitorData = async () => {
    const [month, year] = selectedMonth.split('-');
    const start = `${year}-${month}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const [histRes, pendRes] = await Promise.all([
      axios.get(`${API_BASE}/appointments/history`, getAuthHeaders()),
      axios.get(`${API_BASE}/appointments/pending`, getAuthHeaders())
    ]);
    const history = histRes.data || [];
    const pending = pendRes.data || [];
    const monthHist = history.filter(v => v.visit_date >= start && v.visit_date <= end);
    const monthPend = pending.filter(v => v.visit_date >= start && v.visit_date <= end);
    setVisitorStats({
      approved: monthHist.filter(v => v.status === 'APPROVED').length,
      rejected: monthHist.filter(v => v.status === 'REJECTED').length,
      pending: monthPend.length
    });
    setVisitorList([...monthHist, ...monthPend]);
  };

  const fetchSchedulingData = async () => {
    const res = await axios.get(`${API_BASE}/schedules`, getAuthHeaders());
    const all = res.data || [];
    setScheduleData(all.filter(s => s.schedule_date && s.schedule_date.startsWith(selectedMonth)));
  };

  const fetchRequestsData = async () => {
    try {
      const [leavesRes, otAllRes, otPendRes, appHistRes, appPendRes] = await Promise.all([
        axios.get(`${API_BASE}/leave-requests/grouped`, getAuthHeaders()).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/overtime-requests/all`, getAuthHeaders()).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/overtime-requests/pending`, getAuthHeaders()).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/attendance-appeals/history`, getAuthHeaders()).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders()).catch(() => ({ data: [] }))
      ]);

      const leaves = leavesRes.data || [];
      const uniqueOtMap = new Map();
      [...(otAllRes.data || []), ...(otPendRes.data || [])].forEach(item => uniqueOtMap.set(item.id, item));
      const allOt = Array.from(uniqueOtMap.values());

      const uniqueAppealsMap = new Map();
      [...(appHistRes.data || []), ...(appPendRes.data || [])].forEach(item => uniqueAppealsMap.set(item.id, item));
      const allAppeals = Array.from(uniqueAppealsMap.values());

      const filterByMonth = (items, dateField) => items.filter(item => item[dateField] && item[dateField].startsWith(selectedMonth));

      setRequestsData({ 
        leaves: filterByMonth(leaves, 'start_date'), 
        overtime: filterByMonth(allOt, 'date'), 
        appeals: filterByMonth(allAppeals, 'date') 
      });
    } catch (error) { 
      console.error("Error fetching requests data", error); 
    }
  };

  const handleExport = () => window.print();

  // ---------- CHART THEMES ----------
  const chartColors = ['#0F172A', '#0D9488', '#64748B', '#DC2626', '#F59E0B'];
  const tooltipStyle = { borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '0.85rem', fontFamily: 'Inter' };

  // ---------- SCREEN RENDERERS ----------
  const renderAttendanceReport = () => {
    const totalReg = attendanceData.reduce((s, e) => s + e.regular_hours, 0);
    const totalOT = attendanceData.reduce((s, e) => s + e.overtime_hours, 0);
    const totalLeave = attendanceData.reduce((s, e) => s + e.leave_days, 0);
    const hoursBreakdown = [{ name: 'Regular Hours', value: totalReg }, { name: 'Overtime Hours', value: totalOT }];
    const topEmployees = [...attendanceData]
      .sort((a, b) => (b.regular_hours + b.overtime_hours) - (a.regular_hours + a.overtime_hours))
      .slice(0, 10)
      .map(e => ({ 
        name: e.full_name?.split(' ')[0] || e.employee_id, 
        'Regular': Number(e.regular_hours.toFixed(1)), 
        'Overtime': Number(e.overtime_hours.toFixed(1)) 
      }));

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Total Regular Hours" value={`${totalReg.toFixed(1)} hrs`} icon={<Clock size={18} />} />
          <StatBox label="Total Overtime Hours" value={`${totalOT.toFixed(1)} hrs`} icon={<TrendingUp size={18} />} />
          <StatBox label="Approved Leave Days" value={totalLeave} icon={<FileText size={18} />} />
          <StatBox label="Faculty Tracked" value={attendanceData.length} icon={<Users size={18} />} />
        </div>
        <div className="formal-rep-chart-grid">
          <div className="formal-rep-card">
            <div className="formal-rep-card-header"><h3>Instruction Hours Ratio</h3></div>
            <div className="formal-rep-card-body">
              {totalReg === 0 && totalOT === 0 ? <div className="formal-rep-empty">No attendance records logged for this month.</div> : (
                <ResponsiveContainer width="100%" height={280}>
                  <RPieChart>
                    <Pie data={hoursBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={4} label>
                      {hoursBreakdown.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => `${Number(value).toFixed(1)} Hrs`} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem' }} />
                  </RPieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="formal-rep-card">
            <div className="formal-rep-card-header"><h3>Rendered Hours by Faculty (Top 10)</h3></div>
            <div className="formal-rep-card-body">
              {topEmployees.length === 0 ? <div className="formal-rep-empty">No faculty hours recorded.</div> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topEmployees} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
                    <Bar dataKey="Regular" stackId="a" fill="#0F172A" maxBarSize={32} />
                    <Bar dataKey="Overtime" stackId="a" fill="#0D9488" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPayrollReport = () => {
    const grossSum = payrollData.reduce((s, p) => s + (parseFloat(p.gross_pay) || 0), 0);
    const netSum = payrollData.reduce((s, p) => s + (parseFloat(p.net_pay) || 0), 0);
    const chart = payrollData.slice(0, 10).map(p => ({ 
      name: p.full_name?.split(' ')[0] || 'Emp', 
      Gross: parseFloat(p.gross_pay) || 0, 
      Net: parseFloat(p.net_pay) || 0 
    }));

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Employees Disbursed" value={payrollData.length} icon={<Users size={18} />} />
          <StatBox label="Total Gross Earnings" value={`₱${grossSum.toLocaleString(undefined, {minimumFractionDigits: 2})}`} icon={<DollarSign size={18} />} />
          <StatBox label="Total Net Pay" value={`₱${netSum.toLocaleString(undefined, {minimumFractionDigits: 2})}`} icon={<DollarSign size={18} />} />
          <StatBox label="Average Net Salary" value={`₱${(payrollData.length ? netSum / payrollData.length : 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`} icon={<TrendingUp size={18} />} />
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Compensation Disbursement Distribution (Top 10)</h3></div>
          <div className="formal-rep-card-body">
            {payrollData.length === 0 ? <div className="formal-rep-empty">No finalized payroll batches found for this month.</div> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chart} margin={{ top: 10, right: 10, left: 15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₱${Number(v).toLocaleString(undefined, {minimumFractionDigits:2})}`} cursor={{ fill: '#F8FAFC' }} contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px', fontSize: '0.85rem' }} />
                  <Bar dataKey="Gross" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="Net" fill="#0F172A" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVisitorReport = () => {
    const total = visitorStats.approved + visitorStats.rejected + visitorStats.pending;
    const pieData = [
      { name: 'Approved Passes', value: visitorStats.approved },
      { name: 'Rejected Passes', value: visitorStats.rejected },
      { name: 'Pending Approvals', value: visitorStats.pending }
    ];

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Approved Passes" value={visitorStats.approved} icon={<CheckCircle size={18} />} />
          <StatBox label="Rejected Requests" value={visitorStats.rejected} icon={<XCircle size={18} />} />
          <StatBox label="Awaiting Approval" value={visitorStats.pending} icon={<AlertCircle size={18} />} />
          <StatBox label="Total Appointments" value={total} icon={<PieChart size={18} />} />
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Guest Pass Clearance Breakdown</h3></div>
          <div className="formal-rep-card-body" style={{ display: 'flex', justifyContent: 'center' }}>
            {total === 0 ? <div className="formal-rep-empty">No visitor access logs recorded for this month.</div> : (
              <ResponsiveContainer width="60%" height={290}>
                <RPieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={3} label>
                    <Cell fill="#059669" />
                    <Cell fill="#DC2626" />
                    <Cell fill="#64748B" />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '0.85rem' }} />
                </RPieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderScheduleReport = () => {
    const total = scheduleData.length;
    const uniq = new Set(scheduleData.map(s => s.employee_id || s.user_id)).size;
    const upcoming = scheduleData.filter(s => new Date(s.schedule_date) >= new Date()).length;

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Total Assigned Shifts" value={total} icon={<Calendar size={18} />} />
          <StatBox label="Active Instructors Assigned" value={uniq} icon={<Users size={18} />} />
          <StatBox label="Remaining Shifts in Period" value={upcoming} icon={<Clock size={18} />} />
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Instruction Deployment Log (Recent 10)</h3></div>
          <div className="formal-rep-card-body p-0">
            {scheduleData.length === 0 ? <div className="formal-rep-empty m-4">No roster schedule entries generated for this period.</div> : (
              <div className="formal-rep-table-wrapper">
                <table className="formal-rep-table">
                  <thead>
                    <tr><th>Shift Date</th><th>Faculty Member</th><th>Instructional Module</th><th>Room / Center</th><th>Shift Hours</th></tr>
                  </thead>
                  <tbody>
                    {scheduleData.slice(0, 10).map((s, i) => (
                      <tr key={i}>
                        <td className="font-mono text-muted">{s.schedule_date}</td>
                        <td className="fw-600 text-dark">{s.full_name}</td>
                        <td>{s.course}</td>
                        <td>{s.place}</td>
                        <td className="font-mono">{s.start_time?.substring(0, 5)} – {s.end_time?.substring(0, 5)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderRequestsReport = () => {
    const countStatus = (arr, status) => arr.filter(x => x.status?.toLowerCase() === status).length;
    const chartData = [
      { name: 'Leaves', Pending: countStatus(requestsData.leaves, 'pending'), Approved: countStatus(requestsData.leaves, 'approved'), Rejected: countStatus(requestsData.leaves, 'rejected') },
      { name: 'Overtime', Pending: countStatus(requestsData.overtime, 'pending'), Approved: countStatus(requestsData.overtime, 'approved'), Rejected: countStatus(requestsData.overtime, 'rejected') },
      { name: 'Appeals', Pending: countStatus(requestsData.appeals, 'pending'), Approved: countStatus(requestsData.appeals, 'approved'), Rejected: countStatus(requestsData.appeals, 'rejected') },
    ];
    const totalPending = chartData.reduce((acc, curr) => acc + curr.Pending, 0);
    const recentPending = [
      ...requestsData.leaves.filter(x => x.status?.toLowerCase() === 'pending').map(x => ({ id: `L-${x.ids?.[0] || x.id}`, type: 'Leave', date: x.start_date, name: x.full_name, reason: x.reason })),
      ...requestsData.overtime.filter(x => x.status?.toLowerCase() === 'pending').map(x => ({ id: `O-${x.id}`, type: 'Overtime', date: x.date, name: x.full_name, reason: x.reason })),
      ...requestsData.appeals.filter(x => x.status?.toLowerCase() === 'pending').map(x => ({ id: `A-${x.id}`, type: 'Appeal', date: x.date, name: x.full_name, reason: x.reason }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Leave Applications" value={requestsData.leaves.length} icon={<Calendar size={18} />} />
          <StatBox label="Overtime Claims" value={requestsData.overtime.length} icon={<Clock size={18} />} />
          <StatBox label="Attendance Appeals" value={requestsData.appeals.length} icon={<AlertCircle size={18} />} />
          <StatBox label="Pending Review" value={totalPending} icon={<FileText size={18} />} />
        </div>
        <div className="formal-rep-chart-grid">
          <div className="formal-rep-card">
            <div className="formal-rep-card-header"><h3>Workflow Resolution Breakdown</h3></div>
            <div className="formal-rep-card-body">
              {chartData.every(d => d.Pending === 0 && d.Approved === 0 && d.Rejected === 0) ? <div className="formal-rep-empty">No workflow filings found.</div> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
                    <Bar dataKey="Pending" stackId="a" fill="#64748B" maxBarSize={32} />
                    <Bar dataKey="Approved" stackId="a" fill="#0D9488" maxBarSize={32} />
                    <Bar dataKey="Rejected" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="formal-rep-card">
            <div className="formal-rep-card-header"><h3>Urgent Action: Pending Review</h3></div>
            <div className="formal-rep-card-body p-0">
              {recentPending.length === 0 ? <div className="formal-rep-empty m-4">All requests have been evaluated.</div> : (
                <div className="formal-rep-table-wrapper" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="formal-rep-table">
                    <thead><tr><th>Category</th><th>Faculty Member</th><th>Target Date</th></tr></thead>
                    <tbody>
                      {recentPending.map(req => (
                        <tr key={req.id}>
                          <td><span className="formal-rep-badge">{req.type}</span></td>
                          <td className="fw-600 text-dark">{req.name}</td>
                          <td className="font-mono text-muted">{req.date?.split('T')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // =========================================================================
  // PRINTABLE FORMAL INSTITUTIONAL EXPORT BLOCKS
  // =========================================================================
  const PrintableHeader = ({ title, reportCode, methodologyText }) => (
    <div className="formal-print-header">
      <div className="print-top-meta">
        <div>
          <h1 className="print-brand-title">HCT ACADEMY</h1>
          <p className="print-brand-sub">Healthcare Training Center & Clinical Simulation Laboratories</p>
          <p className="print-brand-contact">123 Healthcare Avenue, Pasay City, Metro Manila | ISO 9001 / ISMS Compliant</p>
        </div>
        <div className="print-audit-box">
          <div className="print-dcn">DCN: {reportCode}-{currentYear}{currentMonthNum}-{Date.now().toString().slice(-4)}</div>
          <div><strong>Period:</strong> {monthLabel} 1–{lastDayOfMonth}, {currentYear}</div>
          <div><strong>Department:</strong> Faculty & Simulation Operations</div>
          <div><strong>Generated:</strong> {new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}</div>
        </div>
      </div>

      <div className="print-divider" />
      <h2 className="print-doc-title">{title}</h2>

      {methodologyText && (
        <div className="print-methodology-box">
          <strong>METHODOLOGY & STATUTORY DTR BASIS:</strong> {methodologyText}
        </div>
      )}
    </div>
  );

  const PrintableFooter = () => (
    <div className="formal-print-footer">
      <div className="print-signatures">
        <div className="sig-block">
          <div className="sig-line" />
          <span className="sig-name">HR Compliance Officer</span>
          <span className="sig-title">Timekeeping & Records Division</span>
          <span className="sig-date">Date: ________________________</span>
        </div>
        <div className="sig-block">
          <div className="sig-line" />
          <span className="sig-name">Head of Clinical Training</span>
          <span className="sig-title">Academic & Simulation Faculty</span>
          <span className="sig-date">Date: ________________________</span>
        </div>
        <div className="sig-block">
          <div className="sig-line" />
          <span className="sig-name">Executive Vice President</span>
          <span className="sig-title">Office of the Directorate</span>
          <span className="sig-date">Date: ________________________</span>
        </div>
      </div>

      <div className="print-privacy-banner">
        <strong>CONFIDENTIAL - AUTHORIZED INTERNAL AUDIT & MANAGEMENT USE ONLY</strong><br />
        This document contains employee personal and work-related information. Retain, process, and disclose strictly in accordance with HCT Academy records retention schedules and the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).
      </div>
    </div>
  );

  return (
    <div className="formal-rep-container">
      {/* Top Header */}
      <div className="formal-rep-header">
        <div className="formal-rep-title-block">
          <div>
            <p>Comprehensive administrative intelligence, verified operational analytics, and printable institutional registers.</p>
          </div>
        </div>
        
        <div className="formal-rep-controls">
          <div className="formal-rep-input-wrapper">
            <Calendar size={16} className="formal-rep-icon" />
            <select className="formal-rep-select" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} disabled={loading}>
              {availableMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <button className="formal-rep-btn-primary" onClick={handleExport} disabled={loading}>
            <Printer size={16} /> Print Official Document
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="formal-rep-tabs">
        {[
          { id:'attendance', label:'Attendance & Timekeeping', icon: <Clock size={16} /> },
          { id:'payroll', label:'Payroll Disbursement', icon: <DollarSign size={16} /> },
          { id:'visitor', label:'Campus Visitor Tracking', icon: <Users size={16} /> },
          { id:'scheduling', label:'Instruction Logistics', icon: <Calendar size={16} /> },
          { id:'requests', label:'Workflow & HR Requests', icon: <ClipboardList size={16} /> }
        ].map(tab => (
          <button key={tab.id} className={`formal-rep-tab-btn ${selectedReport === tab.id ? 'active' : ''}`} onClick={() => setSelectedReport(tab.id)}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Screen Analytics View */}
      <div className="formal-rep-content screen-only">
        {loading ? <div className="formal-rep-loading"><span className="formal-rep-spinner"></span> Compiling Institutional Metrics...</div> :
         error ? <div className="formal-rep-error"><AlertCircle size={20} /> {error}</div> :
         <>
           {selectedReport === 'attendance' && renderAttendanceReport()}
           {selectedReport === 'payroll' && renderPayrollReport()}
           {selectedReport === 'visitor' && renderVisitorReport()}
           {selectedReport === 'scheduling' && renderScheduleReport()}
           {selectedReport === 'requests' && renderRequestsReport()}
         </>
        }
      </div>

      {/* =========================================================================
          PRINT-ONLY ENTERPRISE AUDIT REGISTERS
          ========================================================================= */}
      
      {/* 1. ATTENDANCE & TIMEKEEPING REGISTER */}
      {selectedReport === 'attendance' && (
        <div className="print-only">
          <PrintableHeader 
            title="MONTHLY FACULTY TIMEKEEPING & ATTENDANCE REGISTER"
            reportCode="REP-DTR"
            methodologyText="Compiled from Daily Time Records (DTR), biometrics, and geofence verification pursuant to DOLE Omnibus Rules Implementing the Labor Code. Expected attendance excludes approved, authorized leaves."
          />
          
          <div className="print-kpi-row">
            <div className="print-kpi-cell">Total Tracked: <strong>{attendanceData.length} Instructors</strong></div>
            <div className="print-kpi-cell">Total Rendered: <strong>{attendanceData.reduce((s, e) => s + e.regular_hours, 0).toFixed(1)} hrs</strong></div>
            <div className="print-kpi-cell">Total Overtime: <strong>{attendanceData.reduce((s, e) => s + e.overtime_hours, 0).toFixed(1)} hrs</strong></div>
            <div className="print-kpi-cell">Authorized Leaves: <strong>{attendanceData.reduce((s, e) => s + e.leave_days, 0)} days</strong></div>
          </div>

          <table className="formal-print-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>No.</th>
                <th style={{ width: '12%' }}>Employee ID</th>
                <th style={{ width: '28%' }}>Faculty Full Name</th>
                <th style={{ width: '14%' }}>Regular Hours</th>
                <th style={{ width: '14%' }}>Overtime Hours</th>
                <th style={{ width: '14%' }}>Approved Leave</th>
                <th style={{ width: '14%' }}>DTR Audit Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceData.map((emp, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td className="font-mono">{emp.employee_id}</td>
                  <td><strong>{emp.full_name}</strong></td>
                  <td className="text-right">{emp.regular_hours.toFixed(1)}h</td>
                  <td className="text-right">{emp.overtime_hours.toFixed(1)}h</td>
                  <td className="text-center">{emp.leave_days} d</td>
                  <td className="text-center">{emp.regular_hours > 0 ? 'VERIFIED' : emp.leave_days > 0 ? 'ON LEAVE' : 'NO SHIFTS'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintableFooter />
        </div>
      )}

      {/* 2. PAYROLL DISBURSEMENT REGISTER */}
      {selectedReport === 'payroll' && (
        <div className="print-only">
          <PrintableHeader 
            title="MONTHLY PAYROLL DISBURSEMENT REGISTER & COMPENSATION AUDIT"
            reportCode="REP-PAY"
            methodologyText="Authorized net compensation computations audited against verified rendered instruction hours, standard tax tables, and Philippine statutory benefit schedules (SSS, PhilHealth, Pag-IBIG)."
          />

          <div className="print-kpi-row">
            <div className="print-kpi-cell">Total Disbursed: <strong>{payrollData.length} Personnel</strong></div>
            <div className="print-kpi-cell">Gross Payroll: <strong>₱{payrollData.reduce((s, p) => s + (parseFloat(p.gross_pay) || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
            <div className="print-kpi-cell">Total Deductions: <strong>₱{payrollData.reduce((s, p) => s + (parseFloat(p.tax_deduction) || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
            <div className="print-kpi-cell">Net Disbursement: <strong>₱{payrollData.reduce((s, p) => s + (parseFloat(p.net_pay) || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
          </div>

          <table className="formal-print-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>No.</th>
                <th style={{ width: '12%' }}>Employee ID</th>
                <th style={{ width: '28%' }}>Personnel Name</th>
                <th style={{ width: '18%' }} className="text-right">Gross Earnings</th>
                <th style={{ width: '18%' }} className="text-right">Taxes & Deductions</th>
                <th style={{ width: '20%' }} className="text-right">Net Compensation</th>
              </tr>
            </thead>
            <tbody>
              {payrollData.map((p, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td className="font-mono">{p.employee_id || p.user_id}</td>
                  <td><strong>{p.full_name}</strong></td>
                  <td className="text-right">₱{Number(p.gross_pay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-right">₱{Number(p.tax_deduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-right"><strong>₱{Number(p.net_pay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintableFooter />
        </div>
      )}

      {/* 3. VISITOR TRACKING REGISTER */}
      {selectedReport === 'visitor' && (
        <div className="print-only">
          <PrintableHeader 
            title="CAMPUS VISITOR & GUEST CLEARANCE LOG"
            reportCode="REP-VIS"
            methodologyText="Physical security access logs maintained pursuant to campus safety standards. Guest passes reflect security checkpoint validation, purpose limitation, and reception desk sign-ins."
          />

          <div className="print-kpi-row">
            <div className="print-kpi-cell">Approved Entries: <strong>{visitorStats.approved}</strong></div>
            <div className="print-kpi-cell">Access Denied: <strong>{visitorStats.rejected}</strong></div>
            <div className="print-kpi-cell">Pending Approval: <strong>{visitorStats.pending}</strong></div>
            <div className="print-kpi-cell">Total Transactions: <strong>{visitorList.length}</strong></div>
          </div>

          <table className="formal-print-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>No.</th>
                <th style={{ width: '22%' }}>Visitor Full Name</th>
                <th style={{ width: '14%' }}>Scheduled Date</th>
                <th style={{ width: '38%' }}>Declared Official Purpose</th>
                <th style={{ width: '22%' }}>Security Clearance</th>
              </tr>
            </thead>
            <tbody>
              {visitorList.map((v, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td><strong>{v.first_name} {v.last_name}</strong></td>
                  <td className="font-mono">{v.visit_date}</td>
                  <td>{v.reason || 'General Inquiry / Meeting'}</td>
                  <td className="text-center">
                    <span className={`print-status-tag ${v.status === 'APPROVED' ? 'tag-success' : v.status === 'REJECTED' ? 'tag-danger' : 'tag-muted'}`}>
                      {v.status || 'PENDING'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintableFooter />
        </div>
      )}

      {/* 4. SCHEDULE ROSTER REGISTER */}
      {selectedReport === 'scheduling' && (
        <div className="print-only">
          <PrintableHeader 
            title="CLINICAL SIMULATION & INSTRUCTION SCHEDULE ROSTER"
            reportCode="REP-SCHED"
            methodologyText="Official faculty assignment matrix for clinical simulation rooms and lecture halls. Timings define shift expectations for attendance compliance and DTR validation."
          />

          <div className="print-kpi-row">
            <div className="print-kpi-cell">Total Shift Deployments: <strong>{scheduleData.length}</strong></div>
            <div className="print-kpi-cell">Assigned Faculty: <strong>{new Set(scheduleData.map(s => s.employee_id || s.user_id)).size} Instructors</strong></div>
            <div className="print-kpi-cell">Period Coverage: <strong>{monthLabel} {currentYear}</strong></div>
          </div>

          <table className="formal-print-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>No.</th>
                <th style={{ width: '14%' }}>Shift Date</th>
                <th style={{ width: '24%' }}>Faculty Member</th>
                <th style={{ width: '28%' }}>Course / Module</th>
                <th style={{ width: '16%' }}>Simulation Room</th>
                <th style={{ width: '14%' }}>Shift Hours</th>
              </tr>
            </thead>
            <tbody>
              {scheduleData.map((s, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td className="font-mono">{s.schedule_date}</td>
                  <td><strong>{s.full_name}</strong></td>
                  <td>{s.course}</td>
                  <td>{s.place}</td>
                  <td className="font-mono text-center">{s.start_time?.substring(0, 5)} – {s.end_time?.substring(0, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintableFooter />
        </div>
      )}

      {/* 5. HR REQUESTS & APPEALS REGISTER */}
      {selectedReport === 'requests' && (
        <div className="print-only">
          <PrintableHeader 
            title="HUMAN RESOURCES REQUESTS & ATTENDANCE APPEALS AUDIT"
            reportCode="REP-REQ"
            methodologyText="Formal record of employee exception requests, leave filings, overtime claim validations, and attendance correction appeals submitted through UniVITA portal workflows."
          />

          <table className="formal-print-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>No.</th>
                <th style={{ width: '15%' }}>Category</th>
                <th style={{ width: '27%' }}>Personnel Name</th>
                <th style={{ width: '16%' }}>Effective Date</th>
                <th style={{ width: '22%' }}>Stated Justification</th>
                <th style={{ width: '16%' }}>Audit Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...requestsData.leaves.map(x => ({ type: 'Leave Request', date: x.start_date, name: x.full_name, reason: x.reason, status: x.status })),
                ...requestsData.overtime.map(x => ({ type: 'Overtime Claim', date: x.date, name: x.full_name, reason: x.reason, status: x.status })),
                ...requestsData.appeals.map(x => ({ type: 'Attendance Appeal', date: x.date, name: x.full_name, reason: x.reason, status: x.status }))
              ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td><strong>{r.type}</strong></td>
                  <td>{r.name}</td>
                  <td className="font-mono">{r.date?.split('T')[0]}</td>
                  <td className="text-truncate">{r.reason || 'Official filing'}</td>
                  <td className="text-center">
                    <span className={`print-status-tag ${r.status?.toLowerCase() === 'approved' ? 'tag-success' : r.status?.toLowerCase() === 'rejected' ? 'tag-danger' : 'tag-muted'}`}>
                      {r.status || 'PENDING'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintableFooter />
        </div>
      )}

    </div>
  );
};

const StatBox = ({ label, value, icon }) => (
  <div className="formal-rep-stat-box">
    <div className="formal-rep-stat-icon">{icon}</div>
    <div className="formal-rep-stat-info">
      <span className="formal-rep-stat-label">{label}</span>
      <span className="formal-rep-stat-value">{value}</span>
    </div>
  </div>
);

export default Reports;