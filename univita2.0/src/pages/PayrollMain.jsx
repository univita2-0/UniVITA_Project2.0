// src/pages/PayrollMain.jsx
import React, { useState, useEffect, useCallback } from 'react';
import './PayrollMain.css';
import {
  ChevronLeft, ChevronRight, Search, History, CalendarDays,
  Download, Eye, DollarSign, Users, TrendingUp, Wallet, CheckCircle,
  ShieldCheck, X, Lock, FileText
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const getPayrollAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('payroll_token')}` }
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

const PayrollMain = ({ setView, onLock, onChangePin, onShowHistory }) => {
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

  useEffect(() => {
    toast.success('Access granted.', { toastId: 'payroll-main-success' });
  }, []);
  
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

  const handleLockModule = () => {
    localStorage.removeItem('payroll_token'); 
    if (onLock) {
      onLock();
    } else if (setView) {
      setView('payroll');
    } else {
      window.location.href = '/payroll';
    }
  };

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
    const leaveDays = Number(att.leaveDays);
    const paidLeaveHours = leaveDays * 8; 
    const baseEarnings = (regularHours + paidLeaveHours) * hourlyRate; 

    const overtimeHours = Number(att.overtimeHours);
    const overtimePay = overtimeHours * hourlyRate * OT_MULTIPLIER;
    const extras = employeeExtras[emp.employee_id] || {};

    let lateMinutes = (extras.lateMinutesOverride != null) ? extras.lateMinutesOverride : Number(att.lateMinutes);
    if (isNaN(lateMinutes)) lateMinutes = 0;
    const lateDeduction = (lateMinutes / 60) * hourlyRate;

    const allowances = (Number(extras.transport) || 0) + (Number(extras.meal) || 0) + (Number(extras.housing) || 0);
    const bonusPay = Number(extras.bonus) || 0;
    
    const grossPay = baseEarnings + overtimePay + allowances + bonusPay;
    
    const netBaseForStatutory = Math.max(0, (monthlySalary > 0 ? monthlySalary : baseEarnings) - lateDeduction);

    const sssCredit = Math.min(netBaseForStatutory, 35000); 
    let sss = (extras.sssOverride != null) ? Number(extras.sssOverride) : (sssCredit * 0.05); 
    let philHealth = (extras.philHealthOverride != null) ? Number(extras.philHealthOverride) : (netBaseForStatutory * 0.025); 
    let pagIbig = (extras.pagIbigOverride != null) ? Number(extras.pagIbigOverride) : (netBaseForStatutory * 0.02); 

    const taxableIncome = Math.max(0, (baseEarnings + overtimePay + allowances + bonusPay - lateDeduction) - sss - philHealth - pagIbig);
    const tax = computeMonthlyTax(taxableIncome);
    
    const loans = Number(extras.loans) || 0;
    const other = Number(extras.other) || 0;
    
    const totalDeductions = tax + sss + philHealth + pagIbig + loans + other + lateDeduction;
    const netPay = Math.max(0, grossPay - totalDeductions);

    return {
      regularHours, leaveDays, paidLeaveHours, overtimeHours, overtimePay, allowances, bonusPay, grossPay, baseEarnings,
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
      total_hours: calc.regularHours + calc.paidLeaveHours, overtime_hours: calc.overtimeHours,
      overtime_pay: calc.overtimePay, transport_allowance: employeeExtras[emp.employee_id]?.transport || 0,
      meal_allowance: employeeExtras[emp.employee_id]?.meal || 0, housing_allowance: employeeExtras[emp.employee_id]?.housing || 0,
      sss_deduction: calc.sss, philhealth_deduction: calc.philHealth, pagibig_deduction: calc.pagIbig,
      loan_deduction: calc.loans, other_deduction: calc.other, gross_pay: calc.grossPay,
      tax_deduction: calc.tax, net_pay: calc.netPay, total_earnings: calc.netPay, status: 'paid'
    };
    
    try {
      const res = await axios.post(`${API_BASE}/payroll/finalize`, payload, getPayrollAuthHeaders());
      if (res.data.success) {
        toast.success(`Payroll finalized for ${emp.full_name}`);
        loadData();
      } else {
        toast.error(res.data.message || res.data.error || 'Failed to finalize.');
      }
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error('Payroll session expired. Please re-enter your PIN.');
        handleLockModule(); 
      } else {
        toast.error(err.response?.data?.message || err.response?.data?.error || 'Server error during finalization.');
      }
    }
  };

  const handleMonthlyPayroll = async () => {
    setIsProcessing(true);
    try {
      const response = await axios.post(
        `${API_BASE}/payroll/run-monthly`, 
        { month: selectedMonth, year: selectedYear }, 
        getPayrollAuthHeaders()
      );
      
      if (response.data.success) {
        toast.success(`Processed: ${response.data.processed} finalized. ${response.data.skipped > 0 ? `(${response.data.skipped} skipped).` : ''}`);
        setShowMonthlyModal(false);
        loadData();
      } else {
        toast.error('Failed to process monthly payroll.');
      }
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error('Payroll session expired. Please re-enter your PIN.');
        setShowMonthlyModal(false); 
        handleLockModule();         
      } else {
        toast.error(err.response?.data?.message || err.response?.data?.error || 'Server error');
      }
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
            <tr><td>Base Pay (${calc.regularHours}h logged + ${calc.paidLeaveHours}h leave)</td><td class="right">₱${calc.baseEarnings.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
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
      "Full Name","Employee ID","Regular Hours","Paid Leave Hours", "Overtime Hours","Late Minutes","Late Deduction",
      "Base Earnings","Overtime Pay","Allowances", "13th Month / Bonus", "Gross Pay",
      "SSS","PhilHealth","Pag-IBIG","Loans","Other Deductions","Tax","Net Pay"
    ];
    const rows = filteredEmployees.map(emp => {
      const calc = computePayroll(emp);
      return [
        emp.full_name, emp.employee_id, calc.regularHours, calc.paidLeaveHours, calc.overtimeHours, calc.lateMinutes, calc.lateDeduction,
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

  const exportRemittance = () => {
    if (filteredEmployees.length === 0) return toast.warning("No data to export.");
    
    const headers = [
      "Employee ID", "Full Name", 
      "SSS Number", "SSS Deduction", 
      "PhilHealth PIN", "PhilHealth Deduction", 
      "Pag-IBIG MID", "Pag-IBIG Deduction", 
      "TIN", "Withholding Tax"
    ];

    const rows = filteredEmployees.map(emp => {
      const calc = computePayroll(emp);
      let sssNo = 'Not Provided', phicNo = 'Not Provided', hdmfNo = 'Not Provided', tinNo = 'Not Provided';
      
      if (emp.additional_info) {
        try {
          const info = typeof emp.additional_info === 'string' ? JSON.parse(emp.additional_info) : emp.additional_info;
          sssNo = info.sss || info.sss_no || info.sss_number || 'Not Provided';
          phicNo = info.philhealth || info.philhealth_no || info.philhealth_pin || 'Not Provided';
          hdmfNo = info.pagibig || info.pagibig_no || info.pagibig_mid || 'Not Provided';
          tinNo = info.tin || info.tin_no || info.taxpayer_id || 'Not Provided';
        } catch(e) {
          console.warn(`Failed to parse statutory IDs for ${emp.employee_id}`);
        }
      }

      return [
        `"${emp.employee_id}"`,
        `"${emp.full_name}"`,
        `="${sssNo}"`, calc.sss.toFixed(2),
        `="${phicNo}"`, calc.philHealth.toFixed(2),
        `="${hdmfNo}"`, calc.pagIbig.toFixed(2),
        `="${tinNo}"`, calc.tax.toFixed(2)
      ].join(',');
    });

    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Govt_Remittance_${monthName}_${selectedYear}.csv`);
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
    toast.info('Statutory Remittance CSV generated successfully.');
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

  return (
    <div className="pm-container">
      
      {/* Top Header Bar with Date Nav and Lock Button */}
      <div className="pm-top-bar">
        <div className="pm-date-navigator">
          <button className="pm-nav-arrow" onClick={() => {
            if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(selectedYear - 1); }
            else { setSelectedMonth(selectedMonth - 1); }
          }}>
            <ChevronLeft size={18}/>
          </button>
          
          <div className="pm-current-date">
            <CalendarDays size={16} />
            <span>{monthName} {selectedYear}</span>
          </div>
          
          <button className="pm-nav-arrow" onClick={() => {
            if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(selectedYear + 1); }
            else { setSelectedMonth(selectedMonth + 1); }
          }}>
            <ChevronRight size={18}/>
          </button>
        </div>

        <button className="pm-btn-lock" onClick={handleLockModule} title="Lock Payroll Module">
          <Lock size={15} /> Lock Access
        </button>
      </div>

      {isFutureMonth ? (
        <div className="pm-empty-state">
          <CalendarDays size={40} className="pm-empty-icon" />
          <h3>Future Period</h3>
          <p>Payroll data is not available for future dates. Please select the current or a past month.</p>
        </div>
      ) : (
        <>
          {/* Horizontal 4-Column Metrics Grid */}
          <div className="pm-metrics-grid">
            <div className="pm-metric-card">
              <div className="pm-metric-icon"><Users size={20} /></div>
              <div className="pm-metric-data">
                <span className="pm-metric-label">Eligible Instructors</span>
                <span className="pm-metric-value">{summary.totalEmployees}</span>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon"><Wallet size={20} /></div>
              <div className="pm-metric-data">
                <span className="pm-metric-label">Total Gross Pay</span>
                <span className="pm-metric-value">₱{summary.totalGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon"><TrendingUp size={20} /></div>
              <div className="pm-metric-data">
                <span className="pm-metric-label">Tax Withheld</span>
                <span className="pm-metric-value">₱{summary.totalTax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon"><DollarSign size={20} /></div>
              <div className="pm-metric-data">
                <span className="pm-metric-label">Total Net Pay</span>
                <span className="pm-metric-value text-success">₱{summary.totalNet.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Main Roster Container */}
          <div className="pm-roster-container">
            <div className="pm-toolbar">
              <div className="pm-search-box">
                <Search size={16} />
                <input type="text" placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <div className="pm-toolbar-actions">
                <button className="pm-btn-outline" onClick={onShowHistory}>
                  <History size={15} /> Logs
                </button>
                <button className="pm-btn-outline" onClick={exportToCSV}>
                  <Download size={15} /> Payroll CSV
                </button>
                <button className="pm-btn-outline" onClick={exportRemittance} title="Export SSS, PhilHealth, Pag-IBIG spreadsheet">
                  <FileText size={15} /> Govt Remittance
                </button>
                <button className="pm-btn-primary" onClick={() => setShowMonthlyModal(true)}>
                  <CalendarDays size={15} /> Run Batch
                </button>
              </div>
            </div>

            <div className="pm-table-wrapper">
              {loading ? (
                <div className="pm-empty-state">
                  <ShieldCheck size={32} className="pm-empty-icon animate-pulse" />
                  <p>Calculating Payroll Data...</p>
                </div>
              ) : (
                <table className="pm-table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Employee Name</th>
                      <th>Position</th>
                      <th>Type</th>
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
                            <td>
                              <span className="pm-emp-id">{emp.employee_id}</span>
                            </td>
                            <td>
                              <span className="pm-emp-name">{emp.full_name}</span>
                            </td>
                            <td>
                              <span className="pm-text-regular">{emp.position_level || emp.position || 'N/A'}</span>
                            </td>
                            <td>
                              <span className="pm-badge-neutral">
                                {emp.employment_type || emp.contract_type || 'Full-time'}
                              </span>
                            </td>
                            <td className="text-right">
                              <div className="pm-action-group">
                                <button className="pm-icon-btn" onClick={() => openPayslip(emp)} title="Review Payslip">
                                  <Eye size={16} />
                                </button>
                                <button className="pm-btn-success" onClick={() => handleFinalize(emp)}>
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

      {/* Monthly Batch Modal */}
      {showMonthlyModal && (
        <div className="pm-modal-backdrop" onClick={() => setShowMonthlyModal(false)}>
          <div className="pm-modal-card small" onClick={e => e.stopPropagation()}>
            <div className="pm-modal-header">
              <h3>Process Monthly Batch</h3>
              <button className="pm-modal-close" onClick={() => setShowMonthlyModal(false)}><X size={18}/></button>
            </div>
            <div className="pm-modal-body">
              <p className="pm-modal-desc">Calculate and finalize base pay for all active instructors using the recorded attendance logs.</p>
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
            </div>
            <div className="pm-modal-footer">
              <button className="pm-btn-outline" onClick={() => setShowMonthlyModal(false)}>Cancel</button>
              <button className="pm-btn-primary" onClick={handleMonthlyPayroll} disabled={isProcessing}>
                {isProcessing ? 'Processing...' : 'Run Batch Payroll'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Formal Payslip Modal */}
      {showPayslipModal && payslipEmployee && (() => {
        const emp = payslipEmployee;
        const calc = computePayroll(emp);
        const extras = employeeExtras[emp.employee_id] || {};
        const eligible = isAllowanceEligible(emp);
        
        return (
          <div className="pm-modal-backdrop" onClick={() => { setShowPayslipModal(false); setPayslipEmployee(null); }}>
            <div className="pm-modal-card wide" onClick={e => e.stopPropagation()}>
              
              <div className="pm-modal-header">
                <div>
                  <h3>Payslip Breakdown</h3>
                  <span className="pm-modal-subtitle">{emp.full_name} ({emp.employee_id}) • {monthName} {selectedYear}</span>
                </div>
                <button className="pm-modal-close" onClick={() => { setShowPayslipModal(false); setPayslipEmployee(null); }}><X size={18}/></button>
              </div>
              
              <div className="pm-modal-body bg-gray">
                
                <div className="pm-formal-payslip">
                  
                  {/* Earnings Section */}
                  <div className="pm-formal-section">
                    <div className="pm-formal-section-header">
                      <h4>Earnings & Allowances</h4>
                    </div>
                    <div className="pm-formal-list">
                      <div className="pm-formal-row">
                        <span className="pm-formal-label">Hourly Rate</span>
                        <span className="pm-formal-value">₱{calc.hourlyRate.toLocaleString('en-PH', { minimumFractionDigits: 2 })}/hr</span>
                      </div>
                      <div className="pm-formal-row">
                        <span className="pm-formal-label">Base Pay ({calc.regularHours}h logged + {calc.paidLeaveHours}h leave)</span>
                        <span className="pm-formal-value">₱{calc.baseEarnings.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="pm-formal-row">
                        <span className="pm-formal-label">Overtime Pay ({calc.overtimeHours} hrs)</span>
                        <span className="pm-formal-value">₱{calc.overtimePay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      
                      <div className="pm-formal-divider"></div>
                      
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">13th Month / Bonus</span>
                        <input type="text" value={extras.bonus || ''} onChange={e => updateExtras(emp.employee_id, 'bonus', e.target.value)} className="pm-formal-input" placeholder="0.00" />
                      </div>
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">Transport Allowance {!eligible && <span className="text-danger">(Ineligible)</span>}</span>
                        {eligible ? <input type="text" value={extras.transport || ''} onChange={e => updateExtras(emp.employee_id, 'transport', e.target.value)} className="pm-formal-input" placeholder="0.00" /> : <span className="pm-formal-value">₱0.00</span>}
                      </div>
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">Meal Allowance</span>
                        {eligible ? <input type="text" value={extras.meal || ''} onChange={e => updateExtras(emp.employee_id, 'meal', e.target.value)} className="pm-formal-input" placeholder="0.00" /> : <span className="pm-formal-value">₱0.00</span>}
                      </div>
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">Housing Allowance</span>
                        {eligible ? <input type="text" value={extras.housing || ''} onChange={e => updateExtras(emp.employee_id, 'housing', e.target.value)} className="pm-formal-input" placeholder="0.00" /> : <span className="pm-formal-value">₱0.00</span>}
                      </div>
                    </div>
                    <div className="pm-formal-footer">
                      <span>Gross Earnings</span>
                      <strong>₱{calc.grossPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>

                  {/* Deductions Section */}
                  <div className="pm-formal-section mt-4">
                    <div className="pm-formal-section-header danger">
                      <h4>Taxes & Deductions</h4>
                    </div>
                    <div className="pm-formal-list">
                      <div className="pm-formal-row">
                        <span className="pm-formal-label">Withholding Tax</span>
                        <span className="pm-formal-value">₱{calc.tax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="pm-formal-row">
                        <span className="pm-formal-label">Late Deductions ({calc.lateMinutes} mins)</span>
                        <span className="pm-formal-value text-danger">-₱{calc.lateDeduction.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      
                      <div className="pm-formal-divider"></div>
                      
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">SSS Contribution</span>
                        <input type="text" value={extras.sssOverride != null ? extras.sssOverride : calc.sss.toFixed(2)} onChange={e => updateExtras(emp.employee_id, 'sssOverride', e.target.value)} className="pm-formal-input" />
                      </div>
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">PhilHealth</span>
                        <input type="text" value={extras.philHealthOverride != null ? extras.philHealthOverride : calc.philHealth.toFixed(2)} onChange={e => updateExtras(emp.employee_id, 'philHealthOverride', e.target.value)} className="pm-formal-input" />
                      </div>
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">Pag-IBIG</span>
                        <input type="text" value={extras.pagIbigOverride != null ? extras.pagIbigOverride : calc.pagIbig.toFixed(2)} onChange={e => updateExtras(emp.employee_id, 'pagIbigOverride', e.target.value)} className="pm-formal-input" />
                      </div>
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">Loans / Advances</span>
                        <input type="text" value={extras.loans || ''} onChange={e => updateExtras(emp.employee_id, 'loans', e.target.value)} className="pm-formal-input" placeholder="0.00" />
                      </div>
                      <div className="pm-formal-row input-row">
                        <span className="pm-formal-label">Other Deductions</span>
                        <input type="text" value={extras.other || ''} onChange={e => updateExtras(emp.employee_id, 'other', e.target.value)} className="pm-formal-input" placeholder="0.00" />
                      </div>
                    </div>
                    <div className="pm-formal-footer danger">
                      <span>Total Deductions</span>
                      <strong>-₱{calc.totalDeductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>

                </div>

                {/* Net Pay Banner */}
                <div className="pm-net-banner">
                  <span className="pm-net-label">Total Net Pay</span>
                  <span className="pm-net-amount">₱{calc.netPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="pm-modal-footer">
                <button className="pm-btn-outline" onClick={() => { setShowPayslipModal(false); setPayslipEmployee(null); }}>Close</button>
                <button className="pm-btn-primary" onClick={() => printPayslip(payslipEmployee)}>Print / Export PDF</button>
              </div>
              
            </div>
          </div>
        );
      })()}
      
    </div>
  );
};

export default PayrollMain;