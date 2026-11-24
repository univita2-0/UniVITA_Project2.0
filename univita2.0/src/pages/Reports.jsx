import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './Reports.css';
import VisitorIncidentReports from './VisitorIncidentReports';
import {
  Download, Users, Calendar, DollarSign, PieChart,
  Clock, FileText, TrendingUp, AlertCircle, CheckCircle, XCircle,
  ClipboardList, Printer, Layers, BookOpen, ShieldAlert
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart as RPieChart, Pie, Cell
} from 'recharts';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Export untrusted text as data, not spreadsheet formulas.
const csvCell = (value) => {
  const raw = String(value ?? '');
  const escaped = /^[\s\uFEFF]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${escaped.replace(/"/g, '""')}"`;
};

const calendarDay = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
};

const Reports = () => {
  // ---- Role detection (Fix 10.12) ----
  // The JWT-derived role is the source of truth; do not grant HR access by default.
  const currentUserRole = getUserRole();
  const isAdmin = currentUserRole === 'admin';
  const isHR = currentUserRole === 'hr_admin';
  const isSecurity = currentUserRole === 'security';

  const [selectedReport, setSelectedReport] = useState(isSecurity ? 'visitor' : 'attendance');
  const [visitorSection, setVisitorSection] = useState('appointments');
  const canWrite = isHR || (isSecurity && selectedReport === 'visitor');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [programs, setPrograms] = useState([]);
  const [courses, setCourses] = useState([]);
  const [programId, setProgramId] = useState('');
  const [courseName, setCourseName] = useState('');

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
  const lastDayStr = String(lastDayOfMonth).padStart(2, '0');

  // ---- Tabs: payroll hidden for Admin ----
  const allTabs = [
    { id: 'attendance', label: 'Attendance & Timekeeping' },
    { id: 'payroll', label: 'Payroll Status & Earnings' },
    { id: 'visitor', label: 'Campus Visitor Tracking' },
    { id: 'scheduling', label: 'Instruction Logistics' },
    { id: 'requests', label: 'Workflow & HR Requests' }
  ];
  // Security gets visitor reporting only. HR handles workforce reports and payroll;
  // Admin can view operational categories, but never payroll or report exports.
  const visibleTabs = allTabs.filter(tab => {
    if (isSecurity) return tab.id === 'visitor';
    if (tab.id === 'payroll') return isHR;
    if (tab.id === 'visitor') return isAdmin;
    return isAdmin || isHR;
  });

  // Guard: if Admin somehow lands on payroll, force back to attendance
  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === selectedReport)) {
      setSelectedReport(isSecurity ? 'visitor' : 'attendance');
    }
  }, [currentUserRole, selectedReport]);

  useEffect(() => {
    const fetchFilterData = async () => {
      if (isSecurity) return;
      try {
        const [progRes, courseRes] = await Promise.all([
          axios.get(`${API_BASE}/programs`, getAuthHeaders()),
          axios.get(`${API_BASE}/courses`, getAuthHeaders())
        ]);
        setPrograms(progRes.data || []);
        setCourses(courseRes.data || []);
      } catch (err) {
        console.error('Failed to load filter data', err);
      }
    };
    fetchFilterData();
  }, [isSecurity]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        switch (selectedReport) {
          case 'attendance': await fetchAttendanceData(); break;
          case 'payroll': if (!isHR) throw new Error('Payroll report is available to HR only.'); await fetchPayrollData(); break;
          case 'visitor': if (!isAdmin && !isSecurity) throw new Error('Visitor reporting requires Admin or Security access.'); await fetchVisitorData(); break;
          case 'scheduling': await fetchSchedulingData(); break;
          case 'requests': await fetchRequestsData(); break;
          default: break;
        }
      } catch (err) {
        console.error(err);
        const backendMsg = err.response?.data?.message || err.response?.data?.error;
        setError(backendMsg || err.message || 'Failed to load report data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedReport, selectedMonth, programId, courseName]);

  const fetchAttendanceData = async () => {
    const [year, month] = selectedMonth.split('-');
    const res = await axios.get(`${API_BASE}/attendance-monthly`, {
      params: { month, year, program_id: programId, course: courseName },
      ...getAuthHeaders()
    });
    const data = res.data || [];
    setAttendanceData(data.map(e => ({
      ...e,
      regular_hours: Number(e.regular_hours) || 0,
      overtime_hours: e.overtime_hours === null || e.overtime_hours === undefined ? null : Number(e.overtime_hours),
      leave_days: e.leave_days === null || e.leave_days === undefined ? null : Number(e.leave_days),
      scheduled_shifts: Number(e.scheduled_shifts) || Number(e.scheduled_days) || 0,
      present_shifts: Number(e.present_shifts) || Number(e.present_days) || 0,
      late_count: Number(e.late_count) || Number(e.late_days) || 0
    })));
  };

  const fetchPayrollData = async () => {
    const res = await axios.get(`${API_BASE}/payroll/history`, getAuthHeaders());
    const all = Array.isArray(res.data) ? res.data : [];
    const target = new Date(selectedMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    setPayrollData(all.filter(p => p.month_year === target || String(p.month_year || '').startsWith(target + ' | ')));
  };

  const fetchVisitorData = async () => {
    const [year, month] = selectedMonth.split('-');
    const start = `${year}-${month}-01`;
    const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
    const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    const [histRes, pendRes] = await Promise.all([
      axios.get(`${API_BASE}/appointments/history`, getAuthHeaders()),
      axios.get(`${API_BASE}/appointments/pending`, getAuthHeaders())
    ]);
    const history = histRes.data || [];
    const pending = pendRes.data || [];
    const monthHist = history.filter(v => calendarDay(v.visit_date) >= start && calendarDay(v.visit_date) <= end);
    const monthPend = pending.filter(v => calendarDay(v.visit_date) >= start && calendarDay(v.visit_date) <= end);

    setVisitorStats({
      approved: monthHist.filter(v => v.status === 'APPROVED').length,
      rejected: monthHist.filter(v => v.status === 'REJECTED').length,
      pending: monthPend.length
    });
    setVisitorList([...monthHist, ...monthPend]);
  };

  const fetchSchedulingData = async () => {
    const res = await axios.get(`${API_BASE}/schedules`, getAuthHeaders());
    let all = res.data || [];
    all = all.filter(s => calendarDay(s.schedule_date).startsWith(selectedMonth));

    if (courseName) {
      all = all.filter(s => s.course === courseName);
    } else if (programId) {
      const validCourses = courses.filter(c => String(c.program_id) === String(programId)).map(c => c.name);
      all = all.filter(s => validCourses.includes(s.course));
    }
    setScheduleData(all);
  };

  const fetchRequestsData = async () => {
    // A failed source must not silently produce an authoritative-looking zero report.
    const [leavesRes, otAllRes, otPendRes, appHistRes, appPendRes] = await Promise.all([
      axios.get(`${API_BASE}/leave-requests/grouped`, getAuthHeaders()),
      axios.get(`${API_BASE}/overtime-requests/all`, getAuthHeaders()),
      axios.get(`${API_BASE}/overtime-requests/pending`, getAuthHeaders()),
      axios.get(`${API_BASE}/attendance-appeals/history`, getAuthHeaders()),
      axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders())
    ]);
    const asArray = (response, label) => {
      if (!Array.isArray(response.data)) throw new Error(`${label} returned an invalid response. Report cannot be completed.`);
      return response.data;
    };
    const leaves = asArray(leavesRes, 'Leave records');
    const uniqueOtMap = new Map();
    [...asArray(otAllRes, 'Overtime history'), ...asArray(otPendRes, 'Pending overtime')].forEach(item => uniqueOtMap.set(item.id, item));
    const uniqueAppealsMap = new Map();
    [...asArray(appHistRes, 'Appeal history'), ...asArray(appPendRes, 'Pending appeals')].forEach(item => uniqueAppealsMap.set(item.id, item));
    const filterByMonth = (items, dateField) => items.filter(item => calendarDay(item[dateField]).startsWith(selectedMonth));
    setRequestsData({
      leaves: filterByMonth(leaves, 'start_date'),
      overtime: filterByMonth(Array.from(uniqueOtMap.values()), 'date'),
      appeals: filterByMonth(Array.from(uniqueAppealsMap.values()), 'date')
    });
  };

  const handleExportCSV = () => {
    if (!canWrite || (isSecurity && selectedReport !== 'visitor') || loading || error) {
      alert('Report export is unavailable: check access rights and report load status.');
      return;
    }
    let headers = [];
    let rows = [];
    let filename = `Report_${selectedReport}_${selectedMonth}.csv`;

    if (selectedReport === 'attendance') {
      headers = ['Employee ID', 'Name', 'Regular Hours', 'Approved Overtime Hours', 'Approved Leave Days'];
      rows = attendanceData.map(e => [e.employee_id, e.full_name, e.regular_hours, e.overtime_hours == null ? 'Unavailable' : e.overtime_hours, e.leave_days == null ? 'Unavailable' : e.leave_days]);
    } else if (selectedReport === 'payroll') {
      headers = ['Employee ID', 'Name', 'Cutoff', 'Gross Pay', 'SSS', 'PhilHealth', 'Pag-IBIG', 'MBF', 'Tax', 'Net Pay'];
      rows = payrollData.map(p => [p.employee_id, p.full_name, p.month_year, p.gross_pay, p.sss_deduction, p.philhealth_deduction, p.pagibig_deduction, p.mbf_deduction || 0, p.tax_deduction, p.net_pay]);
    } else if (selectedReport === 'visitor' && isSecurity) {
      headers = ['Visitor', 'Visit Date', 'Visit Time', 'Purpose', 'Status'];
      rows = visitorList.map(v => [
        `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        calendarDay(v.visit_date),
        String(v.visit_time || '').slice(0, 5),
        v.reason || '',
        v.status || 'PENDING'
      ]);
    } else if (selectedReport === 'requests') {
      headers = ['Category', 'Name', 'Date', 'Reason', 'Status'];
      rows = [
        ...requestsData.leaves.map(x => ['Leave', x.full_name, x.start_date, x.reason, x.status]),
        ...requestsData.overtime.map(x => ['Overtime', x.full_name, x.date, x.reason, x.status]),
        ...requestsData.appeals.map(x => ['Appeal', x.full_name, x.date, x.reason, x.status])
      ];
    } else {
      return alert('CSV Export not configured for this tab yet.');
    }

    const csvContent = [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const handleExport = () => {
    if (!canWrite || (isSecurity && selectedReport !== 'visitor') || loading || error) {
      alert('Report printing is unavailable: check access rights and report load status.');
      return;
    }
    window.print();
  };

  const chartColors = ['#0F172A', '#0D9488', '#64748B', '#DC2626', '#F59E0B'];
  const tooltipStyle = { borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '0.85rem', fontFamily: 'Inter' };

  const renderAttendanceReport = () => {
    const totalReg = attendanceData.reduce((s, e) => s + e.regular_hours, 0);
    const totalOT = attendanceData.every(e => e.overtime_hours != null && Number.isFinite(e.overtime_hours))
      ? attendanceData.reduce((sum, e) => sum + e.overtime_hours, 0) : null;
    const totalLeave = attendanceData.every(e => e.leave_days !== null && Number.isFinite(e.leave_days))
      ? attendanceData.reduce((sum, e) => sum + e.leave_days, 0) : null;
    const hoursBreakdown = [{ name: 'Regular Hours', value: totalReg },
      ...(totalOT != null ? [{ name: 'Approved Overtime Hours', value: totalOT }] : [])];
    const topEmployees = [...attendanceData]
      .sort((a, b) => b.regular_hours - a.regular_hours)
      .slice(0, 10)
      .map(e => ({
        name: e.full_name?.split(' ')[0] || e.employee_id,
        Regular: Number(e.regular_hours.toFixed(1)),
        Overtime: e.overtime_hours == null ? 0 : Number(e.overtime_hours.toFixed(1))
      }));

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Total Regular Hours" value={`${totalReg.toFixed(1)} hrs`} />
          <StatBox label="Approved Overtime Hours" value={totalOT == null ? "Unavailable" : `${totalOT.toFixed(1)} hrs`} />
          <StatBox label="Approved Leave Days" value={totalLeave == null ? "Unavailable" : totalLeave.toFixed(1)} />
          <StatBox label="Faculty Tracked" value={attendanceData.length} />
        </div>
        <div className="formal-rep-chart-grid">
          <div className="formal-rep-card">
            <div className="formal-rep-card-header"><h3>Recorded Hours Within Scheduled Shifts</h3></div>
            <div className="formal-rep-card-body">
              {totalReg === 0 && (totalOT == null || totalOT === 0) ? <div className="formal-rep-empty">No regular attendance or approved overtime hours returned for this month.</div> : (
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
            <div className="formal-rep-card-header"><h3>Scheduled-Shift Hours by Faculty (Top 10)</h3></div>
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
                    <Bar dataKey="Overtime" stackId="a" fill="#0D9488" maxBarSize={32} />
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
          <StatBox label="Payroll Records" value={payrollData.length} />
          <StatBox label="Total Gross Earnings" value={`₱${grossSum.toLocaleString(undefined, {minimumFractionDigits: 2})}`} />
          <StatBox label="Total Net Pay" value={`₱${netSum.toLocaleString(undefined, {minimumFractionDigits: 2})}`} />
          <StatBox label="Average Net per Record" value={`₱${(payrollData.length ? netSum / payrollData.length : 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`} />
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Saved cutoff records</h3></div>
          <div className="formal-rep-card-body p-0">
            {payrollData.length === 0 ? <p className="formal-rep-empty">No saved payroll records.</p> : (
              <div className="formal-rep-table-wrapper">
                <table className="formal-rep-table">
                  <thead><tr><th>Employee</th><th>Payroll cutoff</th><th>Status</th><th>Gross pay</th><th>MBF</th><th>Net pay</th></tr></thead>
                  <tbody>{payrollData.map((p, i) => (
                    <tr key={p.id || `${p.user_id}-${p.month_year}-${i}`}>
                      <td><strong>{p.full_name || p.employee_id || p.user_id}</strong></td>
                      <td>{p.month_year || 'Unspecified legacy period'}</td>
                      <td>{p.status === 'paid' ? 'Paid' : 'Finalized / payment pending'}</td>
                      <td>₱{Number(p.gross_pay || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
                      <td>₱{Number(p.mbf_deduction || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
                      <td><strong>₱{Number(p.net_pay || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</strong></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Recorded Gross and Net Payroll (Top 10)</h3></div>
          <div className="formal-rep-card-body">
            {payrollData.length === 0 ? <div className="formal-rep-empty">No saved payroll records found for this month.</div> : (
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
      { name: 'Approved Appointments', value: visitorStats.approved },
      { name: 'Rejected Passes', value: visitorStats.rejected },
      { name: 'Pending Approvals', value: visitorStats.pending }
    ];

    return (
      <div className="formal-rep-screen">
        <nav className="formal-rep-visitor-subtabs" aria-label="Visitor reporting sections">
          <button type="button" className={visitorSection === 'appointments' ? 'active' : ''} onClick={() => setVisitorSection('appointments')}>Appointments</button>
          <button type="button" className={visitorSection === 'incidents' ? 'active' : ''} onClick={() => setVisitorSection('incidents')}>Incident Reports</button>
        </nav>
        {visitorSection === 'incidents' ? <VisitorIncidentReports month={selectedMonth} canExport={isSecurity} /> : (<>
        <div className="formal-rep-stats-grid">
          <StatBox label="Approved Appointments" value={visitorStats.approved} />
          <StatBox label="Rejected Requests" value={visitorStats.rejected} />
          <StatBox label="Awaiting Approval" value={visitorStats.pending} />
          <StatBox label="Total Appointments" value={total} />
        </div>
        <div className="formal-rep-card">
          <div className="formal-rep-card-header"><h3>Appointment Decision Breakdown</h3></div>
          <div className="formal-rep-card-body" style={{ display: 'flex', justifyContent: 'center' }}>
            {total === 0 ? <div className="formal-rep-empty">No visitor appointments found for this month.</div> : (
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
        </>)}
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
          <StatBox label="Total Assigned Shifts" value={total} />
          <StatBox label="Active Instructors Assigned" value={uniq} />
          <StatBox label="Remaining Shifts in Period" value={upcoming} />
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

    const today = new Date();
    const addDaysPending = (req, type) => {
      const created = new Date(req.created_at || req.submitted_at || req.date);
      const diff = Math.floor((today - created) / (1000 * 60 * 60 * 24));
      return { ...req, type, daysPending: isNaN(diff) ? 0 : diff };
    };

    const recentPending = [
      ...requestsData.leaves.filter(x => x.status?.toLowerCase() === 'pending').map(x => addDaysPending(x, 'Leave')),
      ...requestsData.overtime.filter(x => x.status?.toLowerCase() === 'pending').map(x => addDaysPending(x, 'Overtime')),
      ...requestsData.appeals.filter(x => x.status?.toLowerCase() === 'pending').map(x => addDaysPending(x, 'Appeal'))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    return (
      <div className="formal-rep-screen">
        <div className="formal-rep-stats-grid">
          <StatBox label="Leave Applications" value={requestsData.leaves.length} />
          <StatBox label="Overtime Claims" value={requestsData.overtime.length} />
          <StatBox label="Attendance Appeals" value={requestsData.appeals.length} />
          <StatBox label="Pending Review" value={totalPending} />
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
                    <thead><tr><th>Category</th><th>Faculty Member</th><th>Target Date</th><th>Days Pending</th></tr></thead>
                    <tbody>
                      {recentPending.map(req => (
                        <tr key={req.id}>
                          <td><span className="formal-rep-badge">{req.type}</span></td>
                          <td className="fw-600 text-dark">{req.full_name}</td>
                          <td className="font-mono text-muted">{req.date?.split('T')[0]}</td>
                          <td className={`font-mono ${req.daysPending > 3 ? 'text-danger fw-600' : 'text-muted'}`}>
                            {req.daysPending} days
                          </td>
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

  const PrintableHeader = ({ title, reportCode, methodologyText }) => (
    <div className="formal-print-header">
      <div className="print-top-meta">
        <div>
          <h1 className="print-brand-title">HCT ACADEMY</h1>
          <p className="print-brand-sub">Healthcare Training Center & Clinical Simulation Laboratories</p>
          <p className="print-brand-contact">HCT Academy 611 Shaw Blvd 1550, Pasig, Metro Manila | UniVITA Internal Report</p>
        </div>
        <div className="print-audit-box">
          <div className="print-dcn">DCN: {reportCode}-{currentYear}{currentMonthNum}-{Date.now().toString().slice(-4)}</div>
          <div><strong>Period:</strong> {reportCode === 'REP-PAY' ? `${monthLabel} (all saved cutoffs)` : `${monthLabel} 01–${lastDayStr}, ${currentYear}`}</div>
          <div><strong>Department:</strong> Faculty & Simulation Operations</div>
          <div><strong>Generated:</strong> {new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}</div>
        </div>
      </div>
      <div className="print-divider" />
      <h2 className="print-doc-title">{title}</h2>
      {methodologyText && (
        <div className="print-methodology-box">
          <strong>REPORT METHODOLOGY:</strong> {methodologyText}
        </div>
      )}
    </div>
  );

  const PrintableFooter = () => (
    <div className="formal-print-footer">
      <div className="print-signatures">
        <div className="sig-block">
          <div className="sig-line" />
          <span className="sig-name">HR Representative</span>
          <span className="sig-title">Name / Signature</span>
          <span className="sig-date">Date: ________________________</span>
        </div>
        <div className="sig-block">
          <div className="sig-line" />
          <span className="sig-name">Designated Supervisor</span>
          <span className="sig-title">Name / Signature</span>
          <span className="sig-date">Date: ________________________</span>
        </div>
        <div className="sig-block">
          <div className="sig-line" />
          <span className="sig-name">Authorized Signatory</span>
          <span className="sig-title">Name / Signature</span>
          <span className="sig-date">Date: ________________________</span>
        </div>
      </div>
<div className="print-privacy-banner">
        <strong>CONFIDENTIAL — AUTHORIZED INTERNAL HR AND MANAGEMENT USE ONLY</strong><br />
        This document contains employee personal and work-related information. Retain, process, and disclose strictly in accordance with HCT Academy records retention schedules and the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).
      </div>
    </div>
  );

  return (
    <div className="formal-rep-container">
      {/* Report category selector and contextual actions */}
      <div className="formal-rep-section-heading">
        <div>
          
          <p>Select a category to review the corresponding records.</p>
        </div>
        {isAdmin && <span className="formal-rep-access-note">View-only access</span>}
      </div>

      <div className="formal-rep-tabs" role="tablist" aria-label="Report category">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedReport === tab.id}
            className={`formal-rep-tab-btn ${selectedReport === tab.id ? 'active' : ''}`}
            onClick={() => setSelectedReport(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="formal-rep-toolbar" aria-label="Report filters and actions">
        <div className="formal-rep-filter-group">
          {['attendance', 'scheduling'].includes(selectedReport) && !isSecurity && (
            <>
              <label className="formal-rep-filter">
                <span>Program</span>
                <select
                  className="formal-rep-select"
                  value={programId}
                  onChange={e => { setProgramId(e.target.value); setCourseName(''); }}
                  disabled={loading}
                >
                  <option value="">All Programs</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.program_name}</option>)}
                </select>
              </label>
              <label className="formal-rep-filter">
                <span>Course</span>
                <select
                  className="formal-rep-select"
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  disabled={loading}
                >
                  <option value="">All Courses</option>
                  {courses.filter(c => !programId || String(c.program_id) === String(programId)).map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="formal-rep-filter formal-rep-filter-period">
            <span>Reporting Period</span>
            <select
              className="formal-rep-select"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              disabled={loading}
            >
              {availableMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        </div>

        {canWrite && !(selectedReport === 'visitor' && visitorSection === 'incidents') && (
          <div className="formal-rep-controls">
            <button
              type="button"
              className="formal-rep-btn-outline"
              onClick={handleExportCSV}
              disabled={loading || Boolean(error) || !(isSecurity ? selectedReport === 'visitor' : ['attendance', 'payroll', 'requests'].includes(selectedReport))}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="formal-rep-btn-primary"
              onClick={handleExport}
              disabled={loading || Boolean(error)}
            >
              Print Report
            </button>
          </div>
        )}
      </div>

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

      {/* ---- Print-only sections (all gated to HR via canWrite) ---- */}
      {canWrite && selectedReport === 'attendance' && (
        <div className="print-only">
          <PrintableHeader
            title="MONTHLY FACULTY TIMEKEEPING & ATTENDANCE REGISTER"
            reportCode="REP-DTR"
            methodologyText="Compiled from the monthly attendance source. Overtime hours represent approved requests for completed, same-day overtime intervals. Approved leave days are taken from approved leave requests. This register is an internal summary, not an individual DTR or audited certification."
          />
          <div className="print-kpi-row">
            <div className="print-kpi-cell">Total Tracked: <strong>{attendanceData.length} Instructors</strong></div>
            <div className="print-kpi-cell">Total Rendered: <strong>{attendanceData.reduce((s, e) => s + e.regular_hours, 0).toFixed(1)} hrs</strong></div>
            <div className="print-kpi-cell">Approved Overtime: <strong>{attendanceData.every(e => e.overtime_hours != null && Number.isFinite(e.overtime_hours)) ? `${attendanceData.reduce((sum, e) => sum + e.overtime_hours, 0).toFixed(1)} hrs` : "Unavailable"}</strong></div>
            <div className="print-kpi-cell">Approved Leave: <strong>{attendanceData.every(e => e.leave_days != null && Number.isFinite(e.leave_days)) ? `${attendanceData.reduce((sum, e) => sum + e.leave_days, 0).toFixed(1)} days` : "Unavailable"}</strong></div>
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
                <th style={{ width: '14%' }}>Record Verification Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceData.map((emp, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td className="font-mono">{emp.employee_id}</td>
                  <td><strong>{emp.full_name}</strong></td>
                  <td className="text-right">{emp.regular_hours.toFixed(1)}h</td>
                  <td className="text-right">{emp.overtime_hours == null ? "Unavailable" : `${emp.overtime_hours.toFixed(1)}h`}</td>
                  <td className="text-center">{emp.leave_days == null ? "Unavailable" : emp.leave_days.toFixed(1)}</td>
                  <td className="text-center">{emp.regular_hours > 0 ? 'RECORDED' : 'NO HOURS IN SOURCE'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="print-legend">Regular hours represent recorded attendance overlapping assigned schedules in the monthly source. Approved overtime is counted from completed-work requests; it is not a payroll amount. Approved leave days are counted from approved leave requests. A displayed zero may indicate an unrecorded schedule rather than confirmed absence. Record verification requires individual DTR reconciliation.</p>
          <PrintableFooter />
        </div>
      )}

      {canWrite && selectedReport === 'payroll' && (
        <div className="print-only">
          <PrintableHeader
            title="PAYROLL REGISTER — SAVED CUTOFFS & COMPENSATION REVIEW"
            reportCode="REP-PAY"
            methodologyText="Saved payroll calculations for the selected payroll month, including the 26th–10th and 11th–25th cutoffs when present. Older monthly records remain identified as legacy. Finalized records may still be awaiting payment confirmation."
          />
          <div className="print-kpi-row">
            <div className="print-kpi-cell">Payroll Records: <strong>{payrollData.length} Saved Entries</strong></div>
            <div className="print-kpi-cell">Gross Payroll: <strong>₱{payrollData.reduce((s, p) => s + (parseFloat(p.gross_pay) || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
            <div className="print-kpi-cell">Total Deductions: <strong>₱{payrollData.reduce((s, p) => s + Math.max(0, (parseFloat(p.gross_pay) || 0) - (parseFloat(p.net_pay) || 0)), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
            <div className="print-kpi-cell">Total Net Payroll: <strong>₱{payrollData.reduce((s, p) => s + (parseFloat(p.net_pay) || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
          </div>
          <table className="formal-print-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>No.</th>
                <th style={{ width: '12%' }}>Employee ID</th>
                <th style={{ width: '18%' }}>Personnel Name</th>
                <th style={{ width: '15%' }}>Pay Period / Cutoff</th>
                <th className="text-right">Gross Earnings</th>
                <th style={{ width: '12%' }} className="text-right">SSS</th>
                <th style={{ width: '12%' }} className="text-right">PhilHealth</th>
                <th className="text-right">Pag-IBIG</th>
                <th className="text-right">MBF</th>
                <th className="text-right">Tax</th>
                <th style={{ width: '12%' }} className="text-right">Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {payrollData.map((p, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}</td>
                  <td className="font-mono">{p.employee_id || p.user_id}</td>
                  <td><strong>{p.full_name}</strong></td>
                  <td className="font-mono">{p.month_year || 'Legacy period'}</td>
                  <td className="text-right">₱{Number(p.gross_pay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-right text-danger">₱{Number(p.sss_deduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-right text-danger">₱{Number(p.philhealth_deduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-right text-danger">₱{Number(p.pagibig_deduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-right text-danger">₱{Number(p.mbf_deduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-right text-danger">₱{Number(p.tax_deduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-right"><strong>₱{Number(p.net_pay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <PrintableFooter />
        </div>
      )}

      {isSecurity && selectedReport === 'visitor' && visitorSection === 'appointments' && (
        <div className="print-only">
          <PrintableHeader
            title="CAMPUS VISITOR & GUEST CLEARANCE LOG"
            reportCode="REP-VIS"
            methodologyText="Appointment approval statuses for the selected month; approval does not mean physical check-in."
          />
          <div className="print-kpi-row">
            <div className="print-kpi-cell">Approved Entries: <strong>{visitorStats.approved}</strong></div>
            <div className="print-kpi-cell">Rejected Requests: <strong>{visitorStats.rejected}</strong></div>
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

      {canWrite && selectedReport === 'scheduling' && (
        <div className="print-only">
          <PrintableHeader
            title="CLINICAL SIMULATION & INSTRUCTION SCHEDULE ROSTER"
            reportCode="REP-SCHED"
            methodologyText="Faculty assignment matrix for clinical simulation rooms and lecture halls. Timings define shift expectations for attendance compliance and DTR validation."
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

      {canWrite && selectedReport === 'requests' && (
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
                ...requestsData.overtime.map(x => ({ type: 'Overtime Request', date: x.date, name: x.full_name, reason: x.reason, status: x.status })),
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

const StatBox = ({ label, value }) => (
  <div className="formal-rep-stat-box">
    <div className="formal-rep-stat-info">
      <span className="formal-rep-stat-label">{label}</span>
      <span className="formal-rep-stat-value">{value}</span>
    </div>
  </div>
);

export default Reports;