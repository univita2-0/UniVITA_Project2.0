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

// ==========================================
// PHILIPPINE STATUTORY COMPLIANCE UTILITIES
// ==========================================

// 1. TRAIN Law Monthly Tax Brackets
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

// 2. SSS Employee Share (4.5% based on MSC Stepped Table)
const computeSSS = (monthlySalary) => {
  if (monthlySalary <= 0) return 0;
  const mscTable = [
    { min: 0, max: 4249.99, msc: 4000 }, { min: 4250, max: 4749.99, msc: 4500 },
    { min: 4750, max: 5249.99, msc: 5000 }, { min: 5250, max: 5749.99, msc: 5500 },
    { min: 5750, max: 6249.99, msc: 6000 }, { min: 6250, max: 6749.99, msc: 6500 },
    { min: 6750, max: 7249.99, msc: 7000 }, { min: 7250, max: 7749.99, msc: 7500 },
    { min: 7750, max: 8249.99, msc: 8000 }, { min: 8250, max: 8749.99, msc: 8500 },
    { min: 8750, max: 9249.99, msc: 9000 }, { min: 9250, max: 9749.99, msc: 9500 },
    { min: 9750, max: 10249.99, msc: 10000 }, { min: 10250, max: 10749.99, msc: 10500 },
    { min: 10750, max: 11249.99, msc: 11000 }, { min: 11250, max: 11749.99, msc: 11500 },
    { min: 11750, max: 12249.99, msc: 12000 }, { min: 12250, max: 12749.99, msc: 12500 },
    { min: 12750, max: 13249.99, msc: 13000 }, { min: 13250, max: 13749.99, msc: 13500 },
    { min: 13750, max: 14249.99, msc: 14000 }, { min: 14250, max: 14749.99, msc: 14500 },
    { min: 14750, max: 15249.99, msc: 15000 }, { min: 15250, max: 15749.99, msc: 15500 },
    { min: 15750, max: 16249.99, msc: 16000 }, { min: 16250, max: 16749.99, msc: 16500 },
    { min: 16750, max: 17249.99, msc: 17000 }, { min: 17250, max: 17749.99, msc: 17500 },
    { min: 17750, max: 18249.99, msc: 18000 }, { min: 18250, max: 18749.99, msc: 18500 },
    { min: 18750, max: 19249.99, msc: 19000 }, { min: 19250, max: 19749.99, msc: 19500 },
    { min: 19750, max: 20249.99, msc: 20000 }, { min: 20250, max: 20749.99, msc: 20500 },
    { min: 20750, max: 21249.99, msc: 21000 }, { min: 21250, max: 21749.99, msc: 21500 },
    { min: 21750, max: 22249.99, msc: 22000 }, { min: 22250, max: 22749.99, msc: 22500 },
    { min: 22750, max: 23249.99, msc: 23000 }, { min: 23250, max: 23749.99, msc: 23500 },
    { min: 23750, max: 24249.99, msc: 24000 }, { min: 24250, max: 24749.99, msc: 24500 },
    { min: 24750, max: 25249.99, msc: 25000 }, { min: 25250, max: 25749.99, msc: 25500 },
    { min: 25750, max: 26249.99, msc: 26000 }, { min: 26250, max: 26749.99, msc: 26500 },
    { min: 26750, max: 27249.99, msc: 27000 }, { min: 27250, max: 27749.99, msc: 27500 },
    { min: 27750, max: 28249.99, msc: 28000 }, { min: 28250, max: 28749.99, msc: 28500 },
    { min: 28750, max: 29249.99, msc: 29000 }, { min: 29250, max: 29749.99, msc: 29500 },
    { min: 29750, max: 30249.99, msc: 30000 }, { min: 30250, max: 30749.99, msc: 30500 },
    { min: 30750, max: 31249.99, msc: 31000 }, { min: 31250, max: 31749.99, msc: 31500 },
    { min: 31750, max: 32249.99, msc: 32000 }, { min: 32250, max: 32749.99, msc: 32500 },
    { min: 32750, max: 33249.99, msc: 33000 }, { min: 33250, max: 33749.99, msc: 33500 },
    { min: 33750, max: 34249.99, msc: 34000 }, { min: 34250, max: 34749.99, msc: 34500 },
    { min: 34750, max: Infinity, msc: 35000 }
  ];
  let msc = 5000;
  if (monthlySalary < 5000) msc = 5000;
  else if (monthlySalary >= 34750) msc = 35000;
  else {
    const bracket = mscTable.find(b => monthlySalary >= b.min && monthlySalary <= b.max);
    if (bracket) msc = bracket.msc;
  }
  return msc * 0.045;
};

// 3. PhilHealth Employee Share (2.5% with 10k Floor and 100k Ceiling)
const computePhilHealth = (monthlySalary) => {
  if (monthlySalary <= 0) return 0;
  let base = monthlySalary;
  if (base < 10000) base = 10000;
  if (base > 100000) base = 100000;
  return (base * 0.05) / 2;
};

// 4. Pag-IBIG Employee Share (2% capped at 5,000 Max Fund Salary)
const computePagIbig = (monthlySalary) => {
  if (monthlySalary <= 0) return 0;
  let base = monthlySalary;
  if (base > 5000) base = 5000;
  return base * 0.02;
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
    
    // Determine base for statutory deductions (Basic + Allowances - Late)
    const netBaseForStatutory = Math.max(0, (monthlySalary > 0 ? monthlySalary : baseEarnings) - lateDeduction);

    // ✅ APPLY EXACT PHILIPPINE STATUTORY CALCULATIONS
    let sss = (extras.sssOverride != null) ? Number(extras.sssOverride) : computeSSS(netBaseForStatutory); 
    let philHealth = (extras.philHealthOverride != null) ? Number(extras.philHealthOverride) : computePhilHealth(netBaseForStatutory); 
    let pagIbig = (extras.pagIbigOverride != null) ? Number(extras.pagIbigOverride) : computePagIbig(netBaseForStatutory); 

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
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    
    printWindow.document.write(`
      <html><head><title>Payslip - ${emp.full_name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        @page { 
          size: A4 portrait; 
          margin: 15mm; 
        }

        body { 
          font-family: 'Inter', Arial, sans-serif; 
          padding: 0; 
          color: #000; 
          background: #FFF; 
          font-size: 11px; /* Reduced from 13px */
          line-height: 1.3;
          -webkit-print-color-adjust: exact;
        }
        
        /* Header Section */
        .header { 
          text-align: center; 
          border-bottom: 2px solid #000; 
          padding-bottom: 10px; 
          margin-bottom: 15px; 
          page-break-inside: avoid;
        }
        .header h1 { margin: 0 0 2px 0; font-size: 18px; font-weight: 800; letter-spacing: 1px; }
        .header p { margin: 0; font-size: 10px; color: #333; }
        .header h2 { margin: 10px 0 0 0; font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }

        /* Employee Info Grid */
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5px 30px;
          margin-bottom: 15px;
          padding: 10px;
          border: 1px solid #000;
          page-break-inside: avoid;
        }
        .info-row { display: flex; justify-content: space-between; }
        .info-label { font-weight: 600; color: #555; text-transform: uppercase; font-size: 9px; }
        .info-value { font-weight: 600; text-align: right; }

        /* Table Layout */
        .payslip-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          border: 1px solid #000;
          page-break-inside: avoid; /* Prevents table from splitting across pages */
        }
        .payslip-table th, .payslip-table td {
          padding: 4px 8px; /* Reduced padding */
          border-bottom: 1px solid #ccc;
        }
        .payslip-table th {
          background: #F8FAFC;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #000;
        }
        .payslip-table tr:last-child td { border-bottom: none; }
        
        .amount { text-align: right; font-family: 'Courier New', Courier, monospace; font-weight: 600; }
        .deduction-amount { text-align: right; font-family: 'Courier New', Courier, monospace; }
        
        .section-header td {
          background: #F1F5F9;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          border-bottom: 2px solid #000;
        }

        /* Summary Section */
        .summary-container {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 20px;
          page-break-inside: avoid; /* Prevents summary from splitting */
        }
        .summary-box {
          width: 300px;
          border: 2px solid #000;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 10px;
          border-bottom: 1px solid #ccc;
        }
        .summary-row:last-child {
          border-bottom: none;
          background: #F8FAFC;
          font-weight: 800;
          font-size: 13px;
        }
        .summary-label { text-transform: uppercase; font-size: 10px; font-weight: 600; }
        .summary-value { font-family: 'Courier New', Courier, monospace; font-weight: 600; }

        /* Signatures */
        .signature-section {
          display: flex;
          justify-content: space-between;
          margin-top: 30px; /* Reduced from 60px */
          page-break-inside: avoid; /* Keeps signatures together */
        }
        .sig-block {
          width: 200px;
          text-align: center;
        }
        .sig-line {
          border-bottom: 1px solid #000;
          height: 25px;
          margin-bottom: 4px;
        }
        .sig-name { font-weight: 700; font-size: 10px; text-transform: uppercase; }
        .sig-title { font-size: 9px; color: #555; }

        .footer-note {
          margin-top: 20px;
          text-align: center;
          font-size: 8px;
          color: #666;
          border-top: 1px solid #ccc;
          padding-top: 8px;
          page-break-inside: avoid;
        }

        /* Force everything to stay on 1 page if possible */
        .page-wrapper {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        
        @media print { 
          .payslip-table, .summary-container, .signature-section { page-break-inside: avoid; }
        }
      </style></head><body>
      
      <div class="page-wrapper">
        <div class="header">
          <h1>HCT ACADEMY</h1>
          <p>Healthcare Training Center & Clinical Simulation Laboratories</p>
          <p>HCT Academy 611 Shaw Blvd 1550, Pasig, Metro Manila</p>
          <h2>EMPLOYEE PAYSLIP</h2>
        </div>

        <div class="info-grid">
          <div class="info-row">
            <span class="info-label">Employee Name:</span>
            <span class="info-value">${emp.full_name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Pay Period:</span>
            <span class="info-value">${monthName} ${selectedYear}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Employee ID:</span>
            <span class="info-value">${emp.employee_id}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Pay Date:</span>
            <span class="info-value">${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
        
        <table class="payslip-table">
          <thead>
            <tr>
              <th style="width: 60%;">Earnings</th>
              <th style="width: 40%;" class="amount">Amount (PHP)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Pay (${calc.regularHours}h logged + ${calc.paidLeaveHours}h leave)</td>
              <td class="amount">${calc.baseEarnings.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>Overtime Pay (${calc.overtimeHours} hrs)</td>
              <td class="amount">${calc.overtimePay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>Transport Allowance</td>
              <td class="amount">${(Number(extras.transport)||0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>Meal Allowance</td>
              <td class="amount">${(Number(extras.meal)||0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>Housing Allowance</td>
              <td class="amount">${(Number(extras.housing)||0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>13th Month / Bonus</td>
              <td class="amount">${calc.bonusPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr class="section-header">
              <td>Total Gross Earnings</td>
              <td class="amount">${calc.grossPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
          </tbody>
        </table>

        <table class="payslip-table">
          <thead>
            <tr>
              <th style="width: 60%;">Deductions</th>
              <th style="width: 40%;" class="deduction-amount">Amount (PHP)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Withholding Tax</td>
              <td class="deduction-amount">${calc.tax.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>SSS Contribution (Employee Share)</td>
              <td class="deduction-amount">${calc.sss.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>PhilHealth (Employee Share)</td>
              <td class="deduction-amount">${calc.philHealth.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>Pag-IBIG Contribution (Employee Share)</td>
              <td class="deduction-amount">${calc.pagIbig.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>Late / Undertime Deductions (${calc.lateMinutes} mins)</td>
              <td class="deduction-amount">${calc.lateDeduction.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>Loans / Advances</td>
              <td class="deduction-amount">${calc.loans.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>Other Deductions</td>
              <td class="deduction-amount">${calc.other.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr class="section-header">
              <td>Total Deductions</td>
              <td class="deduction-amount">${calc.totalDeductions.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
            </tr>
          </tbody>
        </table>

        <div class="summary-container">
          <div class="summary-box">
            <div class="summary-row">
              <span class="summary-label">Gross Pay</span>
              <span class="summary-value">₱${calc.grossPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Total Deductions</span>
              <span class="summary-value">-₱${calc.totalDeductions.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Net Take-Home Pay</span>
              <span class="summary-value">₱${calc.netPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</span>
            </div>
          </div>
        </div>

        <div class="signature-section">
          <div class="sig-block">
            <div class="sig-line"></div>
            <div class="sig-name">${emp.full_name}</div>
            <div class="sig-title">Employee Signature</div>
          </div>
          <div class="sig-block">
            <div class="sig-line"></div>
            <div class="sig-name">HR DEPARTMENT</div>
            <div class="sig-title">Authorized Representative</div>
          </div>
        </div>

        <div class="footer-note">
          <strong>CONFIDENTIAL</strong> - This document contains privileged payroll information intended solely for the named employee. <br/>
          Unauthorized distribution or reproduction is strictly prohibited under the Data Privacy Act of 2012 (RA 10173).
        </div>
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