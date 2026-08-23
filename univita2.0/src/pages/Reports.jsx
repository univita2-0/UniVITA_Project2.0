import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './Reports.css';
import {
  Download, Users, Calendar, DollarSign, PieChart,
  Clock, FileText, TrendingUp, AlertCircle, CheckCircle, XCircle, ClipboardList
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
  
  // Unified Requests State
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
    const res = await axios.get(`${API_BASE}/attendance-monthly`, {
      params: { month, year },
      ...getAuthHeaders()
    });
    const data = res.data || [];
    setAttendanceData(data.map(e => ({
      ...e,
      regular_hours: Number(e.regular_hours) || 0,
      overtime_hours: Number(e.overtime_hours) || 0,
      leave_days: Number(e.leave_days) || 0,
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

      const filterByMonth = (items, dateField) => items.filter(item => {
        if (!item[dateField]) return false;
        return item[dateField].startsWith(selectedMonth);
      });

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

  // ---------- Screen renderers ----------
  const renderAttendanceReport = () => {
    const totalReg = attendanceData.reduce((s, e) => s + e.regular_hours, 0);
    const totalOT = attendanceData.reduce((s, e) => s + e.overtime_hours, 0);
    const totalLeave = attendanceData.reduce((s, e) => s + e.leave_days, 0);
    
    // Aggregate overall hours for the pie chart
    const hoursBreakdown = [
      { name: 'Regular Hours', value: totalReg },
      { name: 'Overtime Hours', value: totalOT }
    ];

    // Filter strictly to the Top 10 to avoid X-axis crowding
    const topEmployees = [...attendanceData]
      .sort((a, b) => (b.regular_hours + b.overtime_hours) - (a.regular_hours + a.overtime_hours))
      .slice(0, 10)
      .map(e => ({
        name: e.full_name?.split(' ')[0] || e.employee_id,
        'Regular': Number(e.regular_hours.toFixed(1)),
        'Overtime': Number(e.overtime_hours.toFixed(1))
      }));

    return (
      <div className="screen-only">
        <div className="rep-stats-row">
          <StatBox label="Total Regular Hrs" value={totalReg.toFixed(1)} icon={<Clock size={20} />} />
          <StatBox label="Total Overtime Hrs" value={totalOT.toFixed(1)} icon={<TrendingUp size={20} />} />
          <StatBox label="Total Leave Days" value={totalLeave} icon={<FileText size={20} />} />
          <StatBox label="Employees Tracked" value={attendanceData.length} icon={<Users size={20} />} />
        </div>

        <div className="rep-grid-2">
          <div className="rep-chart-card">
            <h3 className="rep-chart-title">Hours Distribution</h3>
            {totalReg === 0 && totalOT === 0 ? <div className="rep-empty-state">No hours logged for this month.</div> : (
              <ResponsiveContainer width="100%" height={300}>
                <RPieChart>
                  <Pie data={hoursBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} label>
                    <Cell fill="#0D9488" />
                    <Cell fill="#F59E0B" />
                  </Pie>
                  <Tooltip formatter={(value) => `${Number(value).toFixed(1)} Hrs`} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} />
                  <Legend iconType="circle" />
                </RPieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rep-chart-card">
            <h3 className="rep-chart-title">Most Active Employees (Top 10)</h3>
            {topEmployees.length === 0 ? <div className="rep-empty-state">No attendance data available.</div> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topEmployees} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Regular" stackId="a" fill="#0D9488" maxBarSize={40} />
                  <Bar dataKey="Overtime" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
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
      Gross: p.gross_pay,
      Net: p.net_pay
    }));
    return (
      <div className="screen-only">
        <div className="rep-stats-row">
          <StatBox label="Employees Paid" value={payrollData.length} icon={<Users size={20} />} />
          <StatBox label="Total Gross Pay" value={`₱${grossSum.toLocaleString()}`} icon={<DollarSign size={20} />} />
          <StatBox label="Total Net Pay" value={`₱${netSum.toLocaleString()}`} icon={<DollarSign size={20} />} />
          <StatBox label="Avg Net Pay" value={`₱${(payrollData.length ? netSum / payrollData.length : 0).toLocaleString()}`} icon={<TrendingUp size={20} />} />
        </div>
        <div className="rep-chart-card">
          <h3 className="rep-chart-title">Payroll Summary (Top 10)</h3>
          {payrollData.length === 0 ? <div className="rep-empty-state">No payroll data available for this month.</div> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chart} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip formatter={(v) => `₱${Number(v).toLocaleString()}`} cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px' }} />
                <Bar dataKey="Gross" fill="#94A3B8" radius={[6, 6, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Net" fill="#0F172A" radius={[6, 6, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  };

  const renderVisitorReport = () => {
    const total = visitorStats.approved + visitorStats.rejected + visitorStats.pending;
    const pieData = [
      { name: 'Approved', value: visitorStats.approved },
      { name: 'Rejected', value: visitorStats.rejected },
      { name: 'Pending', value: visitorStats.pending }
    ];
    return (
      <div className="screen-only">
        <div className="rep-stats-row">
          <StatBox label="Approved" value={visitorStats.approved} icon={<CheckCircle size={20} />} />
          <StatBox label="Rejected" value={visitorStats.rejected} icon={<XCircle size={20} />} />
          <StatBox label="Pending" value={visitorStats.pending} icon={<AlertCircle size={20} />} />
          <StatBox label="Total Requests" value={total} icon={<PieChart size={20} />} />
        </div>
        <div className="rep-chart-card">
          <h3 className="rep-chart-title">Visitor Request Status Distribution</h3>
          {total === 0 ? <div className="rep-empty-state">No visitor data available for this month.</div> : (
            <ResponsiveContainer width="100%" height={300}>
              <RPieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} label>
                  {pieData.map((_, i) => <Cell key={i} fill={['#059669','#DC2626','#D97706'][i]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} />
                <Legend iconType="circle" />
              </RPieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  };

  const renderScheduleReport = () => {
    const total = scheduleData.length;
    const uniq = new Set(scheduleData.map(s => s.employee_id)).size;
    const upcoming = scheduleData.filter(s => new Date(s.schedule_date) >= new Date()).length;
    return (
      <div className="screen-only">
        <div className="rep-stats-row">
          <StatBox label="Total Schedules" value={total} icon={<Calendar size={20} />} />
          <StatBox label="Unique Employees" value={uniq} icon={<Users size={20} />} />
          <StatBox label="Upcoming" value={upcoming} icon={<Clock size={20} />} />
        </div>
        <div className="rep-chart-card">
          <h3 className="rep-chart-title">Schedule Overview Matrix</h3>
          {scheduleData.length === 0 ? <div className="rep-empty-state">No schedule data available for this month.</div> : (
            <div className="rep-table-wrapper">
              <table className="rep-table">
                <thead><tr><th>Date</th><th>Employee</th><th>Course</th><th>Location</th></tr></thead>
                <tbody>{scheduleData.slice(0,20).map((s,i)=> <tr key={i}><td>{s.schedule_date}</td><td className="font-semibold text-dark">{s.full_name}</td><td>{s.course}</td><td>{s.place}</td></tr>)}</tbody>
              </table>
            </div>
          )}
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
      <div className="screen-only">
        <div className="rep-stats-row">
          <StatBox label="Total Leave Req." value={requestsData.leaves.length} icon={<Calendar size={20} />} />
          <StatBox label="Total Overtime Req." value={requestsData.overtime.length} icon={<Clock size={20} />} />
          <StatBox label="Total Appeals" value={requestsData.appeals.length} icon={<AlertCircle size={20} />} />
          <StatBox label="Overall Pending" value={totalPending} icon={<FileText size={20} />} />
        </div>
        
        <div className="rep-grid-2">
          <div className="rep-chart-card">
            <h3 className="rep-chart-title">Request Resolution Overview</h3>
            {chartData.every(d => d.Pending === 0 && d.Approved === 0 && d.Rejected === 0) ? <div className="rep-empty-state">No requests data available.</div> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Pending" stackId="a" fill="#D97706" maxBarSize={40} />
                  <Bar dataKey="Approved" stackId="a" fill="#059669" maxBarSize={40} />
                  <Bar dataKey="Rejected" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          
          <div className="rep-chart-card">
            <h3 className="rep-chart-title">Action Required: Recent Pending</h3>
            {recentPending.length === 0 ? <div className="rep-empty-state">No pending requests at this time.</div> : (
              <div className="rep-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="rep-table">
                  <thead><tr><th>Type</th><th>Employee</th><th>Date</th></tr></thead>
                  <tbody>
                    {recentPending.map(req => (
                      <tr key={req.id}>
                        <td><span className="expert-chip default">{req.type}</span></td>
                        <td className="font-semibold text-dark">{req.name}</td>
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
    );
  };

  // ---------- Printable reports ----------
  const PrintableHeader = () => (
    <div className="company-header">
      <h1>HCT ACADEMY</h1>
      <p>123 Healthcare Avenue, Pasay City, Metro Manila</p>
      <p>Phone: (02) 8123-4567 | Email: info@hct.ph</p>
    </div>
  );

  const renderPrintableAttendance = () => (
    <div className="print-only printable-report">
      <PrintableHeader />
      <h2 className="print-report-title">ATTENDANCE REPORT</h2>
      <p className="print-subtitle">{availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
      <table className="formal-table">
        <thead><tr><th>Sr.</th><th>ID</th><th>Name</th><th>Regular Hrs</th><th>Overtime Hrs</th><th>Leave Days</th></tr></thead>
        <tbody>{attendanceData.map((emp,i)=><tr key={i}><td>{i+1}</td><td>{emp.employee_id}</td><td>{emp.full_name}</td><td>{emp.regular_hours.toFixed(1)}</td><td>{emp.overtime_hours.toFixed(1)}</td><td>{emp.leave_days}</td></tr>)}</tbody>
      </table>
      <div className="signatures"><div>Prepared: HR</div><div>Reviewed: HR Manager</div><div>Approved: Head Admin</div></div>
    </div>
  );

  const renderPrintablePayroll = () => (
    <div className="print-only printable-report">
      <PrintableHeader />
      <h2 className="print-report-title">PAYROLL REPORT</h2>
      <p className="print-subtitle">{availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
      <table className="formal-table">
        <thead><tr><th>Sr.</th><th>ID</th><th>Name</th><th>Gross</th><th>Tax</th><th>Net</th></tr></thead>
        <tbody>{payrollData.map((p,i)=><tr key={i}><td>{i+1}</td><td>{p.employee_id||p.user_id}</td><td>{p.full_name}</td><td>₱{Number(p.gross_pay).toLocaleString()}</td><td>₱{Number(p.tax_deduction).toLocaleString()}</td><td>₱{Number(p.net_pay).toLocaleString()}</td></tr>)}</tbody>
      </table>
      <div className="signatures"><div>Prepared: HR</div><div>Reviewed: Finance</div><div>Approved: Director</div></div>
    </div>
  );

  const renderPrintableVisitor = () => (
    <div className="print-only printable-report">
      <PrintableHeader />
      <h2 className="print-report-title">VISITOR REPORT</h2>
      <p className="print-subtitle">{availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
      <table className="formal-table">
        <thead><tr><th>Sr.</th><th>Name</th><th>Date</th><th>Reason</th><th>Status</th></tr></thead>
        <tbody>{visitorList.map((v,i)=><tr key={i}><td>{i+1}</td><td>{v.first_name} {v.last_name}</td><td>{v.visit_date}</td><td>{v.reason}</td><td>{v.status}</td></tr>)}</tbody>
      </table>
      <div className="signatures"><div>Prepared: Security</div><div>Reviewed: Facility Manager</div></div>
    </div>
  );

  const renderPrintableSchedule = () => (
    <div className="print-only printable-report">
      <PrintableHeader />
      <h2 className="print-report-title">SCHEDULE REPORT</h2>
      <p className="print-subtitle">{availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
      <table className="formal-table">
        <thead><tr><th>Sr.</th><th>Date</th><th>Instructor</th><th>Course</th><th>Location</th><th>Start</th><th>End</th></tr></thead>
        <tbody>{scheduleData.map((s,i)=><tr key={i}><td>{i+1}</td><td>{s.schedule_date}</td><td>{s.full_name}</td><td>{s.course}</td><td>{s.place}</td><td>{s.start_time?.substring(0,5)}</td><td>{s.end_time?.substring(0,5)}</td></tr>)}</tbody>
      </table>
      <div className="signatures"><div>Prepared: HR</div><div>Approved: Academics</div></div>
    </div>
  );

  const renderPrintableRequests = () => {
    const allReqs = [
      ...requestsData.leaves.map(x => ({ type: 'Leave', date: x.start_date, name: x.full_name, status: x.status })),
      ...requestsData.overtime.map(x => ({ type: 'Overtime', date: x.date, name: x.full_name, status: x.status })),
      ...requestsData.appeals.map(x => ({ type: 'Appeal', date: x.date, name: x.full_name, status: x.status }))
    ].sort((a,b) => new Date(b.date) - new Date(a.date));

    return (
      <div className="print-only printable-report">
        <PrintableHeader />
        <h2 className="print-report-title">EMPLOYEE REQUESTS REPORT</h2>
        <p className="print-subtitle">{availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
        <table className="formal-table">
          <thead><tr><th>Sr.</th><th>Type</th><th>Employee</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>{allReqs.slice(0,50).map((r,i)=><tr key={i}><td>{i+1}</td><td>{r.type}</td><td>{r.name}</td><td>{r.date?.split('T')[0]}</td><td>{r.status}</td></tr>)}</tbody>
        </table>
        <div className="signatures"><div>Prepared: HR</div><div>Reviewed: HR Manager</div></div>
      </div>
    );
  };

  return (
    <div className="expert-container">
      {/* Header */}
      <div className="expert-header" style={{ marginBottom: '2rem' }}>
        <div className="expert-title-group">
          <div className="expert-icon-wrapper bg-indigo"><PieChart size={24} color="#6366F1" /></div>
          <div>
            <h2 className="expert-title">Reports & Analytics</h2>
            <p className="expert-subtitle">Generate insights and printable records across all modules.</p>
          </div>
        </div>
        
        <div className="rep-header-actions">
          <div className="rep-month-selector">
            <Calendar size={16} className="rep-select-icon" />
            <select className="rep-modern-select" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {availableMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <button className="expert-btn-primary" onClick={handleExport}>
            <Download size={16} /> Export / Print
          </button>
        </div>
      </div>

      {/* Navigation Grid */}
      <div className="rep-nav-grid">
        {[
          { id:'attendance', title:'Attendance', desc:'Hours & leaves overview', icon: <Clock size={20} /> },
          { id:'payroll', title:'Payroll', desc:'Pay cycles & deductions', icon: <DollarSign size={20} /> },
          { id:'visitor', title:'Visitor Tracking', desc:'Approval distributions', icon: <Users size={20} /> },
          { id:'scheduling', title:'Schedules', desc:'Upcoming distributions', icon: <Calendar size={20} /> },
          { id:'requests', title:'Employee Requests', desc:'Leaves, Overtime & Appeals', icon: <ClipboardList size={20} /> }
        ].map(r => (
          <div key={r.id} className={`rep-nav-card ${selectedReport===r.id?'active':''}`} onClick={()=>setSelectedReport(r.id)}>
            <div className="rep-nav-icon">{r.icon}</div>
            <div>
              <div className="rep-nav-title">{r.title}</div>
              <div className="rep-nav-desc">{r.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Content Area */}
      <div className="rep-content-area screen-only expert-card">
        {loading ? <div className="expert-loading">Gathering analytics data...</div> :
         error ? <div className="rep-error-state">Error: {error}</div> :
         <>
           <div className="rep-content-header">
             <h3 className="rep-content-title">
               {selectedReport==='attendance'&&'Attendance Analytics'}
               {selectedReport==='payroll'&&'Payroll Analytics'}
               {selectedReport==='visitor'&&'Visitor Tracking Analytics'}
               {selectedReport==='scheduling'&&'Schedule Analytics'}
               {selectedReport==='requests'&&'Employee Requests Analytics'}
             </h3>
             <p className="rep-content-subtitle">Data overview for {availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
           </div>
           {selectedReport==='attendance' && renderAttendanceReport()}
           {selectedReport==='payroll' && renderPayrollReport()}
           {selectedReport==='visitor' && renderVisitorReport()}
           {selectedReport==='scheduling' && renderScheduleReport()}
           {selectedReport==='requests' && renderRequestsReport()}
         </>
        }
      </div>

      {selectedReport==='attendance' && renderPrintableAttendance()}
      {selectedReport==='payroll' && renderPrintablePayroll()}
      {selectedReport==='visitor' && renderPrintableVisitor()}
      {selectedReport==='scheduling' && renderPrintableSchedule()}
      {selectedReport==='requests' && renderPrintableRequests()}
    </div>
  );
};

const StatBox = ({ label, value, icon }) => (
  <div className="rep-stat-box">
    <div className="rep-stat-icon">{icon}</div>
    <div className="rep-stat-info">
      <div className="rep-stat-label">{label}</div>
      <div className="rep-stat-value">{value}</div>
    </div>
  </div>
);

export default Reports;