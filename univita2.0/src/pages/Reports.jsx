// src/pages/Reports.jsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './Reports.css';
import {
  Download, Users, Calendar, DollarSign, PieChart,
  Clock, FileText, TrendingUp, AlertCircle, CheckCircle, XCircle
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
  const [pendingAppeals, setPendingAppeals] = useState([]);
  const [historyAppeals, setHistoryAppeals] = useState([]);

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
          case 'appeals': await fetchAppealsData(); break;
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

  const fetchAppealsData = async () => {
    const [pendingRes, historyRes] = await Promise.all([
      axios.get(`${API_BASE}/attendance-appeals/pending`, getAuthHeaders()),
      axios.get(`${API_BASE}/attendance-appeals/history`, getAuthHeaders())
    ]);
    setPendingAppeals(pendingRes.data || []);
    setHistoryAppeals(historyRes.data || []);
  };

  const handleExport = () => window.print();

  // ---------- Screen renderers ----------
  const renderAttendanceReport = () => {
    const totalReg = attendanceData.reduce((s, e) => s + e.regular_hours, 0);
    const totalLeave = attendanceData.reduce((s, e) => s + e.leave_days, 0);
    const chart = attendanceData.map(e => ({
      name: e.full_name?.split(' ')[0] || e.employee_id,
      'Regular Hours': e.regular_hours,
    }));
    return (
      <div className="screen-only">
        <div className="rep-stats-row">
          <StatBox label="Total Regular Hrs" value={totalReg.toFixed(1)} icon={<Clock size={20} />} />
          <StatBox label="Total Leave Days" value={totalLeave} icon={<FileText size={20} />} />
          <StatBox label="Employees" value={attendanceData.length} icon={<Users size={20} />} />
        </div>
        <div className="rep-chart-card">
          <h3 className="rep-chart-title">Hours per Employee</h3>
          {attendanceData.length === 0 ? <div className="rep-empty-state">No data available</div> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="Regular Hours" fill="#0D9488" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          )}
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
          {payrollData.length === 0 ? <div className="rep-empty-state">No data available</div> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chart} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip formatter={(v) => `₱${Number(v).toLocaleString()}`} cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px' }} />
                <Bar dataKey="Gross" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="Net" fill="#0D9488" radius={[4, 4, 0, 0]} maxBarSize={40} />
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
          {total === 0 ? <div className="rep-empty-state">No data available</div> : (
            <ResponsiveContainer width="100%" height={300}>
              <RPieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} label>
                  {pieData.map((_, i) => <Cell key={i} fill={['#10B981','#EF4444','#F59E0B'][i]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
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
          {scheduleData.length === 0 ? <div className="rep-empty-state">No data available</div> : (
            <div className="rep-table-wrapper">
              <table className="rep-table">
                <thead><tr><th>Date</th><th>Employee</th><th>Course</th><th>Location</th></tr></thead>
                <tbody>{scheduleData.slice(0,20).map((s,i)=> <tr key={i}><td>{s.schedule_date}</td><td className="font-medium">{s.full_name}</td><td>{s.course}</td><td>{s.place}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAppealsReport = () => {
    const pendingCount = pendingAppeals.length;
    const approvedCount = historyAppeals.filter(a => a.status === 'approved').length;
    const rejectedCount = historyAppeals.filter(a => a.status === 'rejected').length;
    const totalProcessed = approvedCount + rejectedCount;
    const pieData = [
      { name: 'Pending', value: pendingCount },
      { name: 'Approved', value: approvedCount },
      { name: 'Rejected', value: rejectedCount }
    ];
    return (
      <div className="screen-only">
        <div className="rep-stats-row">
          <StatBox label="Pending Appeals" value={pendingCount} icon={<AlertCircle size={20} />} />
          <StatBox label="Approved" value={approvedCount} icon={<CheckCircle size={20} />} />
          <StatBox label="Rejected" value={rejectedCount} icon={<XCircle size={20} />} />
          <StatBox label="Total Processed" value={totalProcessed} icon={<FileText size={20} />} />
        </div>
        
        <div className="rep-grid-2">
          <div className="rep-chart-card">
            <h3 className="rep-chart-title">Appeal Status Overview</h3>
            {pendingCount + approvedCount + rejectedCount === 0 ? <div className="rep-empty-state">No appeals data</div> : (
              <ResponsiveContainer width="100%" height={250}>
                <RPieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label>
                    {pieData.map((_, i) => <Cell key={i} fill={['#F59E0B', '#10B981', '#EF4444'][i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Legend iconType="circle" />
                </RPieChart>
              </ResponsiveContainer>
            )}
          </div>
          
          <div className="rep-chart-card">
            <h3 className="rep-chart-title">Recent Pending Appeals</h3>
            {pendingAppeals.length === 0 ? <div className="rep-empty-state">No pending appeals</div> : (
              <div className="rep-table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                <table className="rep-table">
                  <thead><tr><th>Date</th><th>Employee</th><th>Reason</th></tr></thead>
                  <tbody>{pendingAppeals.slice(0, 10).map(a => <tr key={a.id}><td>{a.date}</td><td className="font-medium">{a.full_name}</td><td><span title={a.reason}>{a.reason.substring(0, 30)}...</span></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---------- Printable reports (unchanged but integrated) ----------
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
        <thead><tr><th>Sr.</th><th>ID</th><th>Name</th><th>Regular Hrs</th><th>Leave Days</th></tr></thead>
        <tbody>{attendanceData.map((emp,i)=><tr key={i}><td>{i+1}</td><td>{emp.employee_id}</td><td>{emp.full_name}</td><td>{emp.regular_hours.toFixed(1)}</td><td>{emp.leave_days}</td></tr>)}</tbody>
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

  const renderPrintableAppeals = () => (
    <div className="print-only printable-report">
      <PrintableHeader />
      <h2 className="print-report-title">ATTENDANCE APPEALS REPORT</h2>
      <p className="print-subtitle">{availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
      <table className="formal-table">
        <thead><tr><th>Sr.</th><th>Employee</th><th>Date</th><th>Reason</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody>{[...pendingAppeals, ...historyAppeals].slice(0,50).map((a,i)=><tr key={i}><td>{i+1}</td><td>{a.full_name} ({a.employee_id})</td><td>{a.date}</td><td>{a.reason}</td><td className={a.status}>{a.status.toUpperCase()}</td><td>{a.admin_remarks||'—'}</td></tr>)}</tbody>
      </table>
      <div className="signatures"><div>Prepared: HR</div><div>Reviewed: HR Manager</div></div>
    </div>
  );

  return (
    <div className="rep-container">
      <div className="rep-header-bar">
        <h2 className="rep-main-title">Reports & Analytics</h2>
        <div className="rep-header-actions">
          <div className="rep-month-selector">
            <Calendar size={16} className="rep-select-icon" />
            <select className="rep-modern-select" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {availableMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <button className="btn-rep-export" onClick={handleExport}>
            <Download size={16} /> 
            <span>Export / Print</span>
          </button>
        </div>
      </div>

      <div className="rep-nav-grid">
        {[
          { id:'attendance', title:'Attendance', desc:'Monthly summary & hours', icon: <Clock size={20} /> },
          { id:'payroll', title:'Payroll', desc:'Pay cycles & deductions', icon: <DollarSign size={20} /> },
          { id:'visitor', title:'Visitor Tracking', desc:'Approval distributions', icon: <Users size={20} /> },
          { id:'scheduling', title:'Schedules', desc:'Upcoming distributions', icon: <Calendar size={20} /> },
          { id:'appeals', title:'Appeals', desc:'Dispute resolutions', icon: <AlertCircle size={20} /> }
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

      <div className="rep-content-area screen-only">
        {loading ? <div className="rep-loading-state">Gathering analytics data...</div> :
         error ? <div className="rep-error-state">Error: {error}</div> :
         <>
           <div className="rep-content-header">
             <h3 className="rep-content-title">
               {selectedReport==='attendance'&&'Attendance Analytics'}
               {selectedReport==='payroll'&&'Payroll Analytics'}
               {selectedReport==='visitor'&&'Visitor Tracking Analytics'}
               {selectedReport==='scheduling'&&'Schedule Analytics'}
               {selectedReport==='appeals'&&'Attendance Appeals Analytics'}
             </h3>
             <p className="rep-content-subtitle">Data for {availableMonths.find(m=>m.value===selectedMonth)?.label}</p>
           </div>
           {selectedReport==='attendance' && renderAttendanceReport()}
           {selectedReport==='payroll' && renderPayrollReport()}
           {selectedReport==='visitor' && renderVisitorReport()}
           {selectedReport==='scheduling' && renderScheduleReport()}
           {selectedReport==='appeals' && renderAppealsReport()}
         </>
        }
      </div>

      {selectedReport==='attendance' && renderPrintableAttendance()}
      {selectedReport==='payroll' && renderPrintablePayroll()}
      {selectedReport==='visitor' && renderPrintableVisitor()}
      {selectedReport==='scheduling' && renderPrintableSchedule()}
      {selectedReport==='appeals' && renderPrintableAppeals()}
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