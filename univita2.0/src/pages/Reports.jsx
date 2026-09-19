import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './Reports.css';
import {
  Download, Users, Calendar, DollarSign, PieChart,
  Clock, FileText, TrendingUp, AlertCircle, CheckCircle, XCircle, ClipboardList, BarChart3, Building
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
        setError(err.message || 'Failed to load data');
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
      ...e, regular_hours: Number(e.regular_hours) || 0, overtime_hours: Number(e.overtime_hours) || 0, leave_days: Number(e.leave_days) || 0,
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

      setRequestsData({ leaves: filterByMonth(leaves, 'start_date'), overtime: filterByMonth(allOt, 'date'), appeals: filterByMonth(allAppeals, 'date') });
    } catch (error) { console.error("Error fetching requests data", error); }
  };

  const handleExport = () => window.print();

  // ---------- CHART THEMES ----------
  const chartColors = ['#0F172A', '#64748B', '#0D9488', '#DC2626', '#F59E0B'];
  const tooltipStyle = { borderRadius: '6px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', fontSize: '0.85rem', fontFamily: 'Inter' };

  // ---------- SCREEN RENDERERS ----------
  const renderAttendanceReport = () => {
    const totalReg = attendanceData.reduce((s, e) => s + e.regular_hours, 0);
    const totalOT = attendanceData.reduce((s, e) => s + e.overtime_hours, 0);
    const totalLeave = attendanceData.reduce((s, e) => s + e.leave_days, 0);
    const hoursBreakdown = [{ name: 'Regular Hours', value: totalReg }, { name: 'Overtime Hours', value: totalOT }];
    const topEmployees = [...attendanceData].sort((a, b) => (b.regular_hours + b.overtime_hours) - (a.regular_hours + a.overtime_hours)).slice(0, 10).map(e => ({ name: e.full_name?.split(' ')[0] || e.employee_id, 'Regular': Number(e.regular_hours.toFixed(1)), 'Overtime': Number(e.overtime_hours.toFixed(1)) }));

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Total Regular Hrs" value={totalReg.toFixed(1)} icon={<Clock size={18} />} />
          <StatBox label="Total Overtime Hrs" value={totalOT.toFixed(1)} icon={<TrendingUp size={18} />} />
          <StatBox label="Total Leave Days" value={totalLeave} icon={<FileText size={18} />} />
          <StatBox label="Employees Tracked" value={attendanceData.length} icon={<Users size={18} />} />
        </div>
        <div className="formal-rep-chart-grid">
          <div className="formal-rep-card">
            <div className="formal-rep-card-header"><h3>Hours Distribution</h3></div>
            <div className="formal-rep-card-body">
              {totalReg === 0 && totalOT === 0 ? <div className="formal-rep-empty">No data available.</div> : (
                <ResponsiveContainer width="100%" height={280}>
                  <RPieChart>
                    <Pie data={hoursBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label>
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
            <div className="formal-rep-card-header"><h3>Most Active Personnel (Top 10)</h3></div>
            <div className="formal-rep-card-body">
              {topEmployees.length === 0 ? <div className="formal-rep-empty">No attendance data available.</div> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topEmployees} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
                    <Bar dataKey="Regular" stackId="a" fill="#0F172A" maxBarSize={35} />
                    <Bar dataKey="Overtime" stackId="a" fill="#64748B" radius={[4, 4, 0, 0]} maxBarSize={35} />
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
    const chart = payrollData.slice(0, 10).map(p => ({ name: p.full_name?.split(' ')[0] || 'Emp', Gross: p.gross_pay, Net: p.net_pay }));
    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Employees Paid" value={payrollData.length} icon={<Users size={18} />} />
          <StatBox label="Total Gross Pay" value={`₱${grossSum.toLocaleString()}`} icon={<DollarSign size={18} />} />
          <StatBox label="Total Net Pay" value={`₱${netSum.toLocaleString()}`} icon={<DollarSign size={18} />} />
          <StatBox label="Avg Net Pay" value={`₱${(payrollData.length ? netSum / payrollData.length : 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`} icon={<TrendingUp size={18} />} />
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Payroll Disbursement Summary (Top 10)</h3></div>
          <div className="formal-rep-card-body">
            {payrollData.length === 0 ? <div className="formal-rep-empty">No payroll data available for this month.</div> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chart} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₱${Number(v).toLocaleString()}`} cursor={{ fill: '#F8FAFC' }} contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px', fontSize: '0.85rem' }} />
                  <Bar dataKey="Gross" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={35} />
                  <Bar dataKey="Net" fill="#0F172A" radius={[4, 4, 0, 0]} maxBarSize={35} />
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
    const pieData = [{ name: 'Approved', value: visitorStats.approved }, { name: 'Rejected', value: visitorStats.rejected }, { name: 'Pending', value: visitorStats.pending }];
    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Approved" value={visitorStats.approved} icon={<CheckCircle size={18} />} />
          <StatBox label="Rejected" value={visitorStats.rejected} icon={<XCircle size={18} />} />
          <StatBox label="Pending" value={visitorStats.pending} icon={<AlertCircle size={18} />} />
          <StatBox label="Total Requests" value={total} icon={<PieChart size={18} />} />
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Visitor Request Status Distribution</h3></div>
          <div className="formal-rep-card-body" style={{ display: 'flex', justifyContent: 'center' }}>
            {total === 0 ? <div className="formal-rep-empty">No visitor data available for this month.</div> : (
              <ResponsiveContainer width="50%" height={300}>
                <RPieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} label>
                    <Cell fill="#0F172A" />
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
    const uniq = new Set(scheduleData.map(s => s.employee_id)).size;
    const upcoming = scheduleData.filter(s => new Date(s.schedule_date) >= new Date()).length;
    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Total Schedules" value={total} icon={<Calendar size={18} />} />
          <StatBox label="Unique Employees" value={uniq} icon={<Users size={18} />} />
          <StatBox label="Upcoming" value={upcoming} icon={<Clock size={18} />} />
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Schedule Overview Matrix</h3></div>
          <div className="formal-rep-card-body p-0">
            {scheduleData.length === 0 ? <div className="formal-rep-empty m-4">No schedule data available for this month.</div> : (
              <div className="formal-rep-table-wrapper">
                <table className="formal-rep-table">
                  <thead><tr><th>Date</th><th>Employee</th><th>Course</th><th>Location</th></tr></thead>
                  <tbody>{scheduleData.slice(0,10).map((s,i)=> <tr key={i}><td>{s.schedule_date}</td><td className="fw-600 text-dark">{s.full_name}</td><td>{s.course}</td><td>{s.place}</td></tr>)}</tbody>
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
      ...requestsData.leaves.filter(x => x.status?.toLowerCase() === 'pending').map(x => ({ id: `L-${x.ids?.[0]}`, type: 'Leave', date: x.start_date, name: x.full_name, reason: x.reason })),
      ...requestsData.overtime.filter(x => x.status?.toLowerCase() === 'pending').map(x => ({ id: `O-${x.id}`, type: 'Overtime', date: x.date, name: x.full_name, reason: x.reason })),
      ...requestsData.appeals.filter(x => x.status?.toLowerCase() === 'pending').map(x => ({ id: `A-${x.id}`, type: 'Appeal', date: x.date, name: x.full_name, reason: x.reason }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Total Leave Req." value={requestsData.leaves.length} icon={<Calendar size={18} />} />
          <StatBox label="Total Overtime Req." value={requestsData.overtime.length} icon={<Clock size={18} />} />
          <StatBox label="Total Appeals" value={requestsData.appeals.length} icon={<AlertCircle size={18} />} />
          <StatBox label="Overall Pending" value={totalPending} icon={<FileText size={18} />} />
        </div>
        <div className="formal-rep-chart-grid">
          <div className="formal-rep-card">
            <div className="formal-rep-card-header"><h3>Request Resolution Overview</h3></div>
            <div className="formal-rep-card-body">
              {chartData.every(d => d.Pending === 0 && d.Approved === 0 && d.Rejected === 0) ? <div className="formal-rep-empty">No requests data available.</div> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
                    <Bar dataKey="Pending" stackId="a" fill="#64748B" maxBarSize={35} />
                    <Bar dataKey="Approved" stackId="a" fill="#0F172A" maxBarSize={35} />
                    <Bar dataKey="Rejected" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} maxBarSize={35} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="formal-rep-card">
            <div className="formal-rep-card-header"><h3>Action Required: Recent Pending</h3></div>
            <div className="formal-rep-card-body p-0">
              {recentPending.length === 0 ? <div className="formal-rep-empty m-4">No pending requests.</div> : (
                <div className="formal-rep-table-wrapper" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="formal-rep-table">
                    <thead><tr><th>Type</th><th>Employee</th><th>Date</th></tr></thead>
                    <tbody>
                      {recentPending.map(req => (
                        <tr key={req.id}>
                          <td><span className="formal-rep-badge">{req.type}</span></td>
                          <td className="fw-600 text-dark">{req.name}</td>
                          <td className="text-muted">{req.date?.split('T')[0]}</td>
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

  // ---------- PRINTABLE EXPORT STRUCTURES ----------
  const PrintableHeader = ({ title }) => (
    <div className="formal-print-header">
      <div className="print-brand-title">HCT ACADEMY</div>
      <div className="print-brand-sub">Healthcare Training Center</div>
      <div className="print-brand-contact">123 Healthcare Avenue, Pasay City, Metro Manila | Tel: (02) 8123-4567</div>
      <div className="print-divider"></div>
      <h2 className="print-doc-title">OFFICIAL {title}</h2>
      <p className="print-doc-meta">Reporting Period: {availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
    </div>
  );

  const PrintableFooter = () => {
    const dateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'full', timeStyle: 'short' });
    return (
      <div className="formal-print-footer">
        <div className="print-signatures">
          <div><span className="sig-line"></span><span className="sig-title">Prepared By (HR)</span></div>
          <div><span className="sig-line"></span><span className="sig-title">Reviewed By (Manager)</span></div>
          <div><span className="sig-line"></span><span className="sig-title">Approved By (Director)</span></div>
        </div>
        <div className="print-confidential">CONFIDENTIAL - SYSTEM GENERATED DOCUMENT</div>
        <div className="print-generated">Generated on {dateStr} via UniVITA Analytics</div>
      </div>
    );
  };

  const renderPrintableAttendance = () => (
    <div className="print-only">
      <PrintableHeader title="ATTENDANCE REPORT" />
      <table className="formal-print-table">
        <thead><tr><th>Sr.</th><th>Employee ID</th><th>Instructor Name</th><th>Regular Hrs</th><th>Overtime Hrs</th><th>Leave Days</th></tr></thead>
        <tbody>{attendanceData.map((emp,i)=><tr key={i}><td>{i+1}</td><td>{emp.employee_id}</td><td>{emp.full_name}</td><td>{emp.regular_hours.toFixed(1)}</td><td>{emp.overtime_hours.toFixed(1)}</td><td>{emp.leave_days}</td></tr>)}</tbody>
      </table>
      <PrintableFooter />
    </div>
  );

  const renderPrintablePayroll = () => (
    <div className="print-only">
      <PrintableHeader title="PAYROLL DISBURSEMENT REPORT" />
      <table className="formal-print-table">
        <thead><tr><th>Sr.</th><th>Employee ID</th><th>Employee Name</th><th>Gross Earnings</th><th>Taxes & Deductions</th><th>Net Pay</th></tr></thead>
        <tbody>{payrollData.map((p,i)=><tr key={i}><td>{i+1}</td><td>{p.employee_id||p.user_id}</td><td>{p.full_name}</td><td>₱{Number(p.gross_pay).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td>₱{Number(p.tax_deduction).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td style={{fontWeight:'bold'}}>₱{Number(p.net_pay).toLocaleString(undefined, {minimumFractionDigits:2})}</td></tr>)}</tbody>
      </table>
      <PrintableFooter />
    </div>
  );

  const renderPrintableVisitor = () => (
    <div className="print-only">
      <PrintableHeader title="VISITOR LOG REPORT" />
      <table className="formal-print-table">
        <thead><tr><th>Sr.</th><th>Visitor Name</th><th>Visit Date</th><th>Declared Reason</th><th>Status</th></tr></thead>
        <tbody>{visitorList.map((v,i)=><tr key={i}><td>{i+1}</td><td>{v.first_name} {v.last_name}</td><td>{v.visit_date}</td><td>{v.reason}</td><td>{v.status}</td></tr>)}</tbody>
      </table>
      <PrintableFooter />
    </div>
  );

  const renderPrintableSchedule = () => (
    <div className="print-only">
      <PrintableHeader title="SCHEDULE DEPLOYMENT REPORT" />
      <table className="formal-print-table">
        <thead><tr><th>Sr.</th><th>Date</th><th>Instructor Name</th><th>Assigned Course</th><th>Location</th><th>Time Log</th></tr></thead>
        <tbody>{scheduleData.map((s,i)=><tr key={i}><td>{i+1}</td><td>{s.schedule_date}</td><td>{s.full_name}</td><td>{s.course}</td><td>{s.place}</td><td>{s.start_time?.substring(0,5)} - {s.end_time?.substring(0,5)}</td></tr>)}</tbody>
      </table>
      <PrintableFooter />
    </div>
  );

  const renderPrintableRequests = () => {
    const allReqs = [
      ...requestsData.leaves.map(x => ({ type: 'Leave', date: x.start_date, name: x.full_name, status: x.status })),
      ...requestsData.overtime.map(x => ({ type: 'Overtime', date: x.date, name: x.full_name, status: x.status })),
      ...requestsData.appeals.map(x => ({ type: 'Appeal', date: x.date, name: x.full_name, status: x.status }))
    ].sort((a,b) => new Date(b.date) - new Date(a.date));
    return (
      <div className="print-only">
        <PrintableHeader title="EMPLOYEE REQUESTS REPORT" />
        <table className="formal-print-table">
          <thead><tr><th>Sr.</th><th>Request Type</th><th>Employee Name</th><th>Filed Date</th><th>Current Status</th></tr></thead>
          <tbody>{allReqs.slice(0,50).map((r,i)=><tr key={i}><td>{i+1}</td><td>{r.type}</td><td>{r.name}</td><td>{r.date?.split('T')[0]}</td><td style={{textTransform:'uppercase', fontWeight:'bold', color: r.status==='Approved'?'#059669':r.status==='Rejected'?'#DC2626':'#64748B'}}>{r.status}</td></tr>)}</tbody>
        </table>
        <PrintableFooter />
      </div>
    );
  };

  return (
    <div className="formal-rep-container">
      {/* Top Header */}
      <div className="formal-rep-header">
        <div className="formal-rep-title-block">
        
          <div>
            
            <p>Internal reporting matrices and printable data logs across all system modules.</p>
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
            <Download size={16} /> Print / Export List
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="formal-rep-tabs">
        {[
          { id:'attendance', label:'Attendance Metrics', icon: <Clock size={16} /> },
          { id:'payroll', label:'Payroll Disbursement', icon: <DollarSign size={16} /> },
          { id:'visitor', label:'Visitor Tracking', icon: <Users size={16} /> },
          { id:'scheduling', label:'Schedule Logistics', icon: <Calendar size={16} /> },
          { id:'requests', label:'HR Requests', icon: <ClipboardList size={16} /> }
        ].map(tab => (
          <button key={tab.id} className={`formal-rep-tab-btn ${selectedReport === tab.id ? 'active' : ''}`} onClick={() => setSelectedReport(tab.id)}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Analytics Content */}
      <div className="formal-rep-content screen-only">
        {loading ? <div className="formal-rep-loading"><span className="formal-rep-spinner"></span> Gathering Analytics...</div> :
         error ? <div className="formal-rep-error"><AlertCircle size={20} /> {error}</div> :
         <>
           {selectedReport==='attendance' && renderAttendanceReport()}
           {selectedReport==='payroll' && renderPayrollReport()}
           {selectedReport==='visitor' && renderVisitorReport()}
           {selectedReport==='scheduling' && renderScheduleReport()}
           {selectedReport==='requests' && renderRequestsReport()}
         </>
        }
      </div>

      {/* Hidden Print Views */}
      {selectedReport==='attendance' && renderPrintableAttendance()}
      {selectedReport==='payroll' && renderPrintablePayroll()}
      {selectedReport==='visitor' && renderPrintableVisitor()}
      {selectedReport==='scheduling' && renderPrintableSchedule()}
      {selectedReport==='requests' && renderPrintableRequests()}
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