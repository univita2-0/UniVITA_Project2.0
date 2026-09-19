// src/pages/PayrollMain.jsx
import React, { useState, useEffect, useCallback } from 'react';
import './Payroll.css';
import {
  ChevronLeft, ChevronRight, Search, History, CalendarDays,
  Download, Eye, DollarSign, Users, TrendingUp, Wallet, CheckCircle,
  FileText, ShieldCheck
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Philippine TRAIN Law Monthly Tax Brackets
const taxTable = [
  { min: 0, max: 20833, rate: 0, base: 0 },
  { min: 20833, max: 33332, rate: 0.15, base: 0 },
  { min: 33332, max: 66666, rate: 0.20, base: 1875 }, 
  { min: 66666, max: 166666, rate: 0.25, base: 8541.67 }, 
  { min: 166666, max: 666666, rate: 0.30, base: 33541.67 },
  { min: 666666, max: Infinity, rate: 0.35, base: 183541.67 }, 
];

const computeMonthlyTax = (taxableIncome) => {
  for (let bracket of taxTable) {
    if (taxableIncome > bracket.min && taxableIncome <= bracket.max) {
      return bracket.base + (taxableIncome - bracket.min) * bracket.rate;
    }
  }
  return 0;
};

const OT_MULTIPLIER = 1.25;

const PayrollMain = ({ setView, onChangePin, onShowHistory }) => {
  const [employees, setEmployees] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [employeeExtras, setEmployeeExtras] = useState({});
  
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [payslipEmployee, setPayslipEmployee] = useState(null);
  
  const [loading, setLoading] = useState(false);

  const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' });
  const now = new Date();
  const isFutureMonth = selectedYear > now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth > now.getMonth() + 1);

  const loadData = useCallback(async () => {
    if (isFutureMonth) return;
    setLoading(true);
    try {
      const [empRes, attRes] = await Promise.all([
        axios.get(`${API_BASE}/employees`, getAuthHeaders()),
        axios.get(`${API_BASE}/attendance-monthly?month=${selectedMonth}&year=${selectedYear}`, getAuthHeaders())
      ]);
      const activeInstructors = empRes.data.filter(u => u.role.toLowerCase() === 'instructor' && u.status === 'active');
      setEmployees(activeInstructors);

      const attMap = {};
      attRes.data.forEach(record => {
        attMap[record.employee_id] = {
          regularHours: Number(record.regular_hours || 0),
          overtimeHours: Number(record.overtime_hours || 0),
          leaveDays: Number(record.leave_days || 0),
          lateMinutes: Number(record.late_minutes || 0)
        };
      });
      setAttendanceSummary(attMap);

      const extras = {};
      activeInstructors.forEach(emp => {
        extras[emp.employee_id] = {
          transport: 0, meal: 0, housing: 0, loans: 0, other: 0, bonus: 0,
          lateMinutesOverride: null,
          sssOverride: null, philHealthOverride: null, pagIbigOverride: null
        };
      });
      setEmployeeExtras(extras);
    } catch (err) {
      console.error("Error loading payroll data:", err);
      toast.error('Failed to load payroll data.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, isFutureMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredEmployees = employees.filter(emp =>
    (emp.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (emp.employee_id || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const computePayroll = (emp) => {
    const att = attendanceSummary[emp.employee_id] || { regularHours: 0, overtimeHours: 0, leaveDays: 0, lateMinutes: 0 };
    let monthlySalary = Number(emp.monthly_salary) || 0;
    let workDays = Number(emp.work_days_per_month) || 22;
    
    const hourlyRate = workDays > 0 ? (monthlySalary / workDays / 8) : 0;
    const regularHours = Number(att.regularHours);
    const baseEarnings = regularHours * hourlyRate; 

    const overtimeHours = Number(att.overtimeHours);
    const overtimePay = overtimeHours * hourlyRate * OT_MULTIPLIER;
    const extras = employeeExtras[emp.employee_id] || {};

    let lateMinutes = (extras.lateMinutesOverride != null) ? extras.lateMinutesOverride : Number(att.lateMinutes);
    if (isNaN(lateMinutes)) lateMinutes = 0;
    const lateDeduction = (lateMinutes / 60) * hourlyRate;

    const allowances = (Number(extras.transport) || 0) + (Number(extras.meal) || 0) + (Number(extras.housing) || 0);
    const bonusPay = Number(extras.bonus) || 0;
    
    const grossPay = baseEarnings + overtimePay + allowances + bonusPay;
    const baseForStatutory = monthlySalary > 0 ? monthlySalary : baseEarnings;

    const sssCredit = Math.min(baseForStatutory, 35000); 
    let sss = (extras.sssOverride != null) ? Number(extras.sssOverride) : (sssCredit * 0.05); 
    let philHealth = (extras.philHealthOverride != null) ? Number(extras.philHealthOverride) : (baseForStatutory * 0.025); 
    let pagIbig = (extras.pagIbigOverride != null) ? Number(extras.pagIbigOverride) : (baseForStatutory * 0.02); 

    const taxableIncome = Math.max(0, (baseEarnings + overtimePay - lateDeduction) - sss - philHealth - pagIbig);
    const tax = computeMonthlyTax(taxableIncome);
    
    const loans = Number(extras.loans) || 0;
    const other = Number(extras.other) || 0;
    
    const totalDeductions = tax + sss + philHealth + pagIbig + loans + other + lateDeduction;
    const netPay = Math.max(0, grossPay - totalDeductions);

    return {
      regularHours, overtimeHours, overtimePay, allowances, bonusPay, grossPay, baseEarnings,
      sss, philHealth, pagIbig, loans, other, tax, netPay, totalDeductions,
      monthlySalary, hourlyRate, workDays, lateMinutes, lateDeduction,
    };
  };

  const handleFinalize = async (emp) => {
    if (!emp.id) return toast.error('Employee ID missing.');
    const calc = computePayroll(emp);
    const monthYear = `${monthName} ${selectedYear}`;
    
    const payload = {
      user_id: emp.id, month_year: monthYear, salary_rate: calc.hourlyRate,
      total_hours: calc.regularHours, overtime_hours: calc.overtimeHours,
      overtime_pay: calc.overtimePay, transport_allowance: employeeExtras[emp.employee_id]?.transport || 0,
      meal_allowance: employeeExtras[emp.employee_id]?.meal || 0, housing_allowance: employeeExtras[emp.employee_id]?.housing || 0,
      sss_deduction: calc.sss, philhealth_deduction: calc.philHealth, pagibig_deduction: calc.pagIbig,
      loan_deduction: calc.loans, other_deduction: calc.other, gross_pay: calc.grossPay,
      tax_deduction: calc.tax, net_pay: calc.netPay, total_earnings: calc.netPay, status: 'paid'
    };
    
    try {
      const res = await axios.post(`${API_BASE}/payroll/finalize`, payload, getAuthHeaders());
      if (res.data.success) {
        toast.success(`Payroll finalized for ${emp.full_name}`);
        loadData();
      } else {
        toast.error(res.data.error || 'Failed to finalize.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Server error during finalization.');
    }
  };

  const handleMonthlyPayroll = async () => {
    setIsProcessing(true);
    try {
      const response = await axios.post(`${API_BASE}/payroll/run-monthly`, { month: selectedMonth, year: selectedYear }, getAuthHeaders());
      if (response.data.success) {
        toast.success(`Processed: ${response.data.processed} finalized. ${response.data.skipped > 0 ? `(${response.data.skipped} skipped).` : ''}`);
        setShowMonthlyModal(false);
        loadData();
      } else {
        toast.error('Failed to process monthly payroll.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Server error');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateExtras = (empId, field, value) => {
    let cleanValue = String(value).replace(/[^0-9.]/g, '');
    const parts = cleanValue.split('.');
    if (parts.length > 2) {
      cleanValue = parts[0] + '.' + parts.slice(1).join('');
    }
    const numericValue = cleanValue === '' ? null : Math.max(0, parseFloat(cleanValue) || 0);
    
    setEmployeeExtras(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: numericValue }
    }));
  };

  const openPayslip = (emp) => {
    setPayslipEmployee(emp);
    setShowPayslipModal(true);
  };

  const printPayslip = (emp) => {
    const calc = computePayroll(emp);
    const extras = employeeExtras[emp.employee_id] || {};
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    
    printWindow.document.write(`
      <html><head><title>Payslip - ${emp.full_name}</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #0F172A; background: #FFF; }
        .brand { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #E2E8F0; padding-bottom: 20px; }
        .brand h1 { margin: 0; font-size: 28px; color: #0F172A; letter-spacing: -0.5px; }
        .brand p { margin: 5px 0 0 0; color: #64748B; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
        
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; background: #F8FAFC; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0; }
        .header-col h4 { margin: 0 0 5px 0; color: #64748B; font-size: 12px; text-transform: uppercase; }
        .header-col p { margin: 0; font-size: 16px; font-weight: 600; color: #0F172A; }
        
        .grid { display: flex; flex-wrap: wrap; gap: 30px; margin-bottom: 30px; }
        .box { flex: 1 1 300px; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; }
        .box-title { background: #F8FAFC; padding: 15px; margin: 0; font-size: 14px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #E2E8F0; }
        
        table { width: 100%; border-collapse: collapse; }
        td { padding: 12px 15px; border-bottom: 1px solid #F1F5F9; font-size: 14px; color: #334155; }
        .right { text-align: right; font-weight: 600; color: #0F172A; }
        tr:last-child td { border-bottom: none; }
        
        .subtotal { background: #F8FAFC; font-weight: bold; }
        .net-pay-box { background: #0F172A; color: white; padding: 25px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
        .net-pay-box h2 { margin: 0; font-size: 16px; font-weight: 500; color: #94A3B8; text-transform: uppercase; }
        .net-pay-box .amount { margin: 0; font-size: 32px; font-weight: bold; color: #10B981; }
        
        @media print { body { padding: 0; } button { display: none; } .box { break-inside: avoid; } }
      </style></head><body>
      
      <div class="brand">
        <h1>HCT ACADEMY</h1>
        <p>Official Payslip Document</p>
      </div>

      <div class="header">
        <div class="header-col">
          <h4>Employee Name</h4>
          <p>${emp.full_name}</p>
        </div>
        <div class="header-col">
          <h4>Employee ID</h4>
          <p>${emp.employee_id}</p>
        </div>
        <div class="header-col">
          <h4>Pay Period</h4>
          <p>${monthName} ${selectedYear}</p>
        </div>
      </div>
      
      <div class="grid">
        <div class="box">
          <h4 class="box-title">Earnings & Allowances</h4>
          <table>
            <tr><td>Hourly Rate</td><td class="right">₱${calc.hourlyRate.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Base Pay (${calc.regularHours} hrs)</td><td class="right">₱${calc.baseEarnings.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Overtime Pay (${calc.overtimeHours} hrs)</td><td class="right">₱${calc.overtimePay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Transport Allowance</td><td class="right">₱${(Number(extras.transport)||0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Meal Allowance</td><td class="right">₱${(Number(extras.meal)||0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Housing Allowance</td><td class="right">₱${(Number(extras.housing)||0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>13th Month / Bonus</td><td class="right">₱${calc.bonusPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr class="subtotal"><td>Gross Earnings</td><td class="right">₱${calc.grossPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
          </table>
        </div>
        <div class="box">
          <h4 class="box-title">Taxes & Deductions</h4>
          <table>
            <tr><td>Withholding Tax</td><td class="right">₱${calc.tax.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Late Deductions (${calc.lateMinutes} mins)</td><td class="right" style="color: #EF4444;">-₱${calc.lateDeduction.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>SSS Contribution</td><td class="right">₱${calc.sss.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>PhilHealth</td><td class="right">₱${calc.philHealth.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Pag-IBIG</td><td class="right">₱${calc.pagIbig.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Loans / Advances</td><td class="right">₱${calc.loans.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Other Deductions</td><td class="right">₱${calc.other.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr class="subtotal"><td>Total Deductions</td><td class="right" style="color: #EF4444;">-₱${calc.totalDeductions.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
          </table>
        </div>
      </div>

      <div class="net-pay-box">
        <h2>Total Net Pay</h2>
        <div class="amount">₱${calc.netPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</div>
      </div>
      
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const exportToCSV = () => {
    if (filteredEmployees.length === 0) return toast.warning("No data to export.");
    const headers = [
      "Full Name","Employee ID","Regular Hours","Overtime Hours","Late Minutes","Late Deduction",
      "Base Earnings","Overtime Pay","Allowances", "13th Month / Bonus", "Gross Pay",
      "SSS","PhilHealth","Pag-IBIG","Loans","Other Deductions","Tax","Net Pay"
    ];
    const rows = filteredEmployees.map(emp => {
      const calc = computePayroll(emp);
      return [
        emp.full_name, emp.employee_id, calc.regularHours, calc.overtimeHours, calc.lateMinutes, calc.lateDeduction,
        calc.baseEarnings, calc.overtimePay, calc.allowances, calc.bonusPay, calc.grossPay, 
        calc.sss, calc.philHealth, calc.pagIbig, calc.loans, calc.other, calc.tax, calc.netPay
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Payroll_Export_${monthName}_${selectedYear}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    toast.info('CSV export downloaded.');
  };

  const summary = !isFutureMonth ? filteredEmployees.reduce((acc, emp) => {
    const calc = computePayroll(emp);
    acc.totalGross += calc.grossPay;
    acc.totalTax += calc.tax;
    acc.totalNet += calc.netPay;
    return acc;
  }, { totalEmployees: filteredEmployees.length, totalGross: 0, totalTax: 0, totalNet: 0 }) : { totalEmployees: 0, totalGross: 0, totalTax: 0, totalNet: 0 };

  const isAllowanceEligible = (emp) => {
    const type = emp.contract_type || emp.employment_type || '';
    return ['Full-time', 'Regular', 'Provisionary'].includes(type);
  };

  // Bulletproof Inline Styles to fix responsiveness and modal layout hierarchy
  const modalStyles = {
    container: { display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', boxSizing: 'border-box' },
    grid: { display: 'flex', flexWrap: 'wrap', gap: '20px', width: '100%', alignItems: 'stretch' },
    card: { flex: '1 1 300px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    header: { background: '#F8FAFC', padding: '16px 20px', borderBottom: '1px solid #E2E8F0', fontWeight: 'bold', color: '#334155', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' },
    body: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' },
    rowNoBorder: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px' },
    label: { color: '#475569', fontSize: '14px', fontWeight: 500, flex: '1 1 auto', paddingRight: '10px' },
    value: { color: '#0F172A', fontSize: '14px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' },
    divider: { height: '1px', background: '#E2E8F0', margin: '8px 0' },
    subtitle: { fontSize: '12px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', margin: '4px 0' },
    input: { width: '30%', minWidth: '80px', maxWidth: '120px', padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', textAlign: 'right', fontSize: '14px', fontWeight: 600, color: '#0F172A', outline: 'none' },
    banner: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: '24px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', gap: '10px' },
    bannerLabel: { fontSize: '16px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' },
    bannerAmount: { fontSize: '32px', fontWeight: 800, color: '#10B981', whiteSpace: 'nowrap' },
    footerBtns: { display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%', paddingTop: '16px' },
    btnCancel: { padding: '10px 20px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontWeight: 600, cursor: 'pointer', outline: 'none' },
    btnPrimary: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#0F172A', color: '#FFFFFF', fontWeight: 600, cursor: 'pointer', outline: 'none' }
  };

  return (
    <div className="pm-container">
      {/* Month Navigation */}
      <div className="pm-date-nav">
        <button className="pm-nav-btn" onClick={() => {
          if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(selectedYear - 1); }
          else { setSelectedMonth(selectedMonth - 1); }
        }}><ChevronLeft size={20}/></button>
        
        <div className="pm-date-display">
          <CalendarDays size={18} className="pm-date-icon" />
          <span>{monthName} {selectedYear}</span>
        </div>
        
        <button className="pm-nav-btn" onClick={() => {
          if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(selectedYear + 1); }
          else { setSelectedMonth(selectedMonth + 1); }
        }}><ChevronRight size={20}/></button>
      </div>

      {isFutureMonth ? (
        <div className="pm-empty-state">
          <CalendarDays size={48} className="pm-empty-icon" />
          <h3>Future Period</h3>
          <p>Payroll data is not available for future dates. Please select the current or a past month.</p>
        </div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="pm-metrics-grid">
            <div className="pm-metric-card">
              <div className="pm-metric-icon neutral"><Users size={22} /></div>
              <div className="pm-metric-data">
                <label>Eligible Employees</label>
                <h3>{summary.totalEmployees}</h3>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon primary"><Wallet size={22} /></div>
              <div className="pm-metric-data">
                <label>Total Gross Pay</label>
                <h3>₱{summary.totalGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon danger"><TrendingUp size={22} /></div>
              <div className="pm-metric-data">
                <label>Total Tax Withheld</label>
                <h3>₱{summary.totalTax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon success"><DollarSign size={22} /></div>
              <div className="pm-metric-data">
                <label>Total Net Pay</label>
                <h3 className="text-success">₱{summary.totalNet.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
          </div>

          <div className="pm-card">
            {/* Toolbar */}
            <div className="pm-toolbar">
              <div className="pm-toolbar-title">
                <h3>Payroll Roster</h3>
              </div>
              <div className="pm-toolbar-actions">
                <div className="pm-search-box">
                  <Search size={16} />
                  <input type="text" placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <button className="btn-pm-primary" onClick={() => setShowMonthlyModal(true)}>
                  <CalendarDays size={16} /> Run Monthly
                </button>
                <button className="btn-pm-outline" onClick={exportToCSV}>
                  <Download size={16} /> Export
                </button>
                <button className="btn-pm-outline" onClick={onShowHistory}>
                  <History size={16} /> Logs
                </button>
              </div>
            </div>

            {/* Main Table - Kept strictly 5 columns */}
            <div className="pm-table-wrapper">
              {loading ? (
                <div className="pm-empty-state">
                  <ShieldCheck size={32} className="pm-empty-icon animate-pulse" />
                  <p>Calculating Payroll Logic...</p>
                </div>
              ) : (
                <table className="pm-table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Full Name</th>
                      <th>Hours Logged</th>
                      <th className="text-right">Est. Net Pay</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.length === 0 ? (
                      <tr><td colSpan="5"><div className="pm-empty-state"><p>No matching employees found.</p></div></td></tr>
                    ) : (
                      filteredEmployees.map(emp => {
                        const calc = computePayroll(emp);
                        return (
                          <tr key={emp.employee_id}>
                            <td><span className="pm-mono-text">{emp.employee_id}</span></td>
                            <td><strong>{emp.full_name}</strong></td>
                            <td><span className="pm-badge">{calc.regularHours} hrs</span></td>
                            <td className="text-right"><strong>₱{calc.netPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></td>
                            <td className="text-right">
                              <div className="pm-action-group">
                                <button className="btn-icon-neutral" onClick={() => openPayslip(emp)} title="Edit Payslip">
                                  <Eye size={16} />
                                </button>
                                <button className="btn-pm-success-sm" onClick={() => handleFinalize(emp)}>
                                  <CheckCircle size={14} /> Finalize
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Monthly Run Modal */}
      <FormalModal 
        show={showMonthlyModal} 
        onClose={() => setShowMonthlyModal(false)} 
        title="Process Monthly Batch" 
        footer={
          <>
            <button className="btn-pm-cancel" onClick={() => setShowMonthlyModal(false)}>Cancel</button>
            <button className="btn-pm-primary" onClick={handleMonthlyPayroll} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Run Batch Payroll'}
            </button>
          </>
        }
      >
        <p className="pm-modal-desc">Calculate and finalize base pay for all active instructors for the selected period using verified attendance logs.</p>
        <div className="pm-form-row">
          <div className="pm-form-group">
            <label>Month</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="pm-input">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('default', { month: 'long' })}</option>
              ))}
            </select>
          </div>
          <div className="pm-form-group">
            <label>Year</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="pm-input">
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </FormalModal>

      {/* Payslip Editor Modal (Bulletproof Inline Responsive Styling & Buttons) */}
      <FormalModal 
        show={showPayslipModal && !!payslipEmployee} 
        onClose={() => { setShowPayslipModal(false); setPayslipEmployee(null); }} 
        title="Payslip Breakdown & Adjustments" 
        wide={true}
        footer={
          <div style={modalStyles.footerBtns}>
            <button style={modalStyles.btnCancel} onClick={() => { setShowPayslipModal(false); setPayslipEmployee(null); }}>Close</button>
            <button style={modalStyles.btnPrimary} onClick={() => printPayslip(payslipEmployee)}>Print / Export</button>
          </div>
        }
      >
        {payslipEmployee && (() => {
          const emp = payslipEmployee;
          const calc = computePayroll(emp);
          const extras = employeeExtras[emp.employee_id] || {};
          const eligible = isAllowanceEligible(emp);
          
          return (
            <div style={modalStyles.container}>
              <div style={modalStyles.grid}>
                
                {/* EARNINGS PANE */}
                <div style={modalStyles.card}>
                  <div style={modalStyles.header}>Earnings & Allowances</div>
                  <div style={modalStyles.body}>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Hourly Rate</span>
                      <strong style={modalStyles.value}>₱{calc.hourlyRate.toLocaleString('en-PH', { minimumFractionDigits: 2 })}/hr</strong>
                    </div>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Base Pay ({calc.regularHours} hrs)</span>
                      <strong style={modalStyles.value}>₱{calc.baseEarnings.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Overtime Pay ({calc.overtimeHours} hrs)</span>
                      <strong style={modalStyles.value}>₱{calc.overtimePay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    
                    <div style={modalStyles.divider}></div>
                    <div style={modalStyles.subtitle}>
                      Allowances & Bonuses {!eligible && <span style={{color: '#EF4444', textTransform: 'none', fontWeight: 500}}>(Allowances Not Eligible)</span>}
                    </div>
                    
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>13th Month / Bonus</span>
                      <input type="text" value={extras.bonus || ''} onChange={e => updateExtras(emp.employee_id, 'bonus', e.target.value)} style={modalStyles.input} placeholder="0.00" />
                    </div>

                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Transport</span>
                      {eligible ? <input type="text" value={extras.transport || ''} onChange={e => updateExtras(emp.employee_id, 'transport', e.target.value)} style={modalStyles.input} placeholder="0.00" /> : <strong style={modalStyles.value}>₱0.00</strong>}
                    </div>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Meal</span>
                      {eligible ? <input type="text" value={extras.meal || ''} onChange={e => updateExtras(emp.employee_id, 'meal', e.target.value)} style={modalStyles.input} placeholder="0.00" /> : <strong style={modalStyles.value}>₱0.00</strong>}
                    </div>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Housing</span>
                      {eligible ? <input type="text" value={extras.housing || ''} onChange={e => updateExtras(emp.employee_id, 'housing', e.target.value)} style={modalStyles.input} placeholder="0.00" /> : <strong style={modalStyles.value}>₱0.00</strong>}
                    </div>
                    
                    <div style={{ ...modalStyles.rowNoBorder, marginTop: 'auto', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                      <span style={{ ...modalStyles.label, fontWeight: 800, color: '#0F172A' }}>Gross Earnings</span>
                      <strong style={{ ...modalStyles.value, fontWeight: 800, fontSize: '15px' }}>₱{calc.grossPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                </div>

                {/* DEDUCTIONS PANE */}
                <div style={modalStyles.card}>
                  <div style={modalStyles.header}>Taxes & Deductions</div>
                  <div style={modalStyles.body}>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Withholding Tax</span>
                      <strong style={modalStyles.value}>₱{calc.tax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Late Deductions ({calc.lateMinutes} mins)</span>
                      <strong style={{...modalStyles.value, color: '#EF4444'}}>-₱{calc.lateDeduction.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    
                    <div style={modalStyles.divider}></div>
                    <div style={modalStyles.subtitle}>Statutory & Custom</div>

                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>SSS Contribution</span>
                      <input type="text" value={extras.sssOverride != null ? extras.sssOverride : calc.sss.toFixed(2)} onChange={e => updateExtras(emp.employee_id, 'sssOverride', e.target.value)} style={modalStyles.input} />
                    </div>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>PhilHealth</span>
                      <input type="text" value={extras.philHealthOverride != null ? extras.philHealthOverride : calc.philHealth.toFixed(2)} onChange={e => updateExtras(emp.employee_id, 'philHealthOverride', e.target.value)} style={modalStyles.input} />
                    </div>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Pag-IBIG</span>
                      <input type="text" value={extras.pagIbigOverride != null ? extras.pagIbigOverride : calc.pagIbig.toFixed(2)} onChange={e => updateExtras(emp.employee_id, 'pagIbigOverride', e.target.value)} style={modalStyles.input} />
                    </div>
                    
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Loans / Advances</span>
                      <input type="text" value={extras.loans || ''} onChange={e => updateExtras(emp.employee_id, 'loans', e.target.value)} style={modalStyles.input} placeholder="0.00" />
                    </div>
                    <div style={modalStyles.row}>
                      <span style={modalStyles.label}>Other Deductions</span>
                      <input type="text" value={extras.other || ''} onChange={e => updateExtras(emp.employee_id, 'other', e.target.value)} style={modalStyles.input} placeholder="0.00" />
                    </div>

                    <div style={{ ...modalStyles.rowNoBorder, marginTop: 'auto', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                      <span style={{ ...modalStyles.label, fontWeight: 800, color: '#0F172A' }}>Total Deductions</span>
                      <strong style={{ ...modalStyles.value, fontWeight: 800, fontSize: '15px', color: '#EF4444' }}>-₱{calc.totalDeductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                </div>

              </div>

              {/* NET PAY BANNER */}
              <div style={modalStyles.banner}>
                <span style={modalStyles.bannerLabel}>TOTAL NET PAY</span>
                <span style={modalStyles.bannerAmount}>₱{calc.netPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          );
        })()}
      </FormalModal>
    </div>
  );
};

export default PayrollMain;