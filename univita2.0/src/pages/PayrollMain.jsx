// src/pages/PayrollMain.jsx
import React, { useState, useEffect, useCallback } from 'react';
import './Payroll.css';
import {
  ChevronLeft, ChevronRight, Calendar, Search, History, CalendarDays,
  Download, Eye, DollarSign, Users, TrendingUp, Wallet, CheckCircle
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import PayrollHistoryModal from './PayrollHistoryModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const taxTable = [
  { min: 0, max: 20833, rate: 0, base: 0 },
  { min: 20833, max: 33332, rate: 0.15, base: 0 },
  { min: 33332, max: 66666, rate: 0.20, base: 3125 },
  { min: 66666, max: 166666, rate: 0.25, base: 13750 },
  { min: 166666, max: 666666, rate: 0.30, base: 46250 },
  { min: 666666, max: Infinity, rate: 0.35, base: 231250 },
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
          transport: 0, meal: 0, housing: 0, loans: 0, other: 0,
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
    
    // FIX: Proper hourly calculation. Gross pay comes from hours actually worked!
    const hourlyRate = workDays > 0 ? (monthlySalary / workDays / 8) : 0;
    const regularHours = Number(att.regularHours);
    const baseEarnings = regularHours * hourlyRate; // Strict Multiplier

    const overtimeHours = Number(att.overtimeHours);
    const overtimePay = overtimeHours * hourlyRate * OT_MULTIPLIER;
    const extras = employeeExtras[emp.employee_id] || {};

    let lateMinutes = (extras.lateMinutesOverride != null) ? extras.lateMinutesOverride : Number(att.lateMinutes);
    if (isNaN(lateMinutes)) lateMinutes = 0;
    const lateDeduction = (lateMinutes / 60) * hourlyRate;

    const allowances = (Number(extras.transport) || 0) + (Number(extras.meal) || 0) + (Number(extras.housing) || 0);
    
    // Base Earnings + Overtime + Allowances - Lates
    const grossPay = baseEarnings + overtimePay + allowances - lateDeduction;

    let sss = (extras.sssOverride != null) ? Number(extras.sssOverride) : Math.min(grossPay * 0.045, 1125);
    let philHealth = (extras.philHealthOverride != null) ? Number(extras.philHealthOverride) : Math.min(grossPay * 0.025, 1250);
    let pagIbig = (extras.pagIbigOverride != null) ? Number(extras.pagIbigOverride) : Math.min(grossPay * 0.02, 100);

    const taxableIncome = grossPay - sss - philHealth - pagIbig;
    const tax = computeMonthlyTax(taxableIncome);
    const loans = Number(extras.loans) || 0;
    const other = Number(extras.other) || 0;
    
    const totalDeductions = tax + sss + philHealth + pagIbig + loans + other;
    const netPay = Math.max(0, grossPay - totalDeductions); // Prevent negative nets

    return {
      regularHours, overtimeHours, overtimePay, allowances, grossPay, baseEarnings,
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
        toast.success(`Processed: ${response.data.processed} finalized. ${response.data.skipped > 0 ? `(${response.data.skipped} skipped/existed).` : ''}`);
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
    const numericValue = value === '' ? null : Math.max(0, parseFloat(value) || 0);
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
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    printWindow.document.write(`
      <html><head><title>Payslip - ${emp.full_name}</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #111827; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #E5E7EB; padding-bottom: 20px; margin-bottom: 20px; }
        .title { margin: 0; font-size: 24px; color: #0D9488; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .box { border: 1px solid #E5E7EB; padding: 15px; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: left; }
        th { background: #FAFAFA; color: #4B5563; text-transform: uppercase; font-size: 12px; }
        .right { text-align: right; }
        .net-pay { font-size: 18px; font-weight: bold; background: #ECFDF5; color: #065F46; }
        @media print { body { padding: 0; } button { display: none; } }
      </style></head><body>
      <div class="header">
        <div><h2 class="title">Official Payslip</h2><p>${monthName} ${selectedYear}</p></div>
        <div class="right"><p><strong>${emp.full_name}</strong><br>${emp.employee_id}<br>${emp.position_level || 'Instructor'}</p></div>
      </div>
      
      <div class="grid">
        <div class="box">
          <h4 style="margin-top:0">Earnings</h4>
          <table>
            <tr><td>Base Earnings (${calc.regularHours} hrs)</td><td class="right">₱${calc.baseEarnings.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Overtime (${calc.overtimeHours} hrs)</td><td class="right">₱${calc.overtimePay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Allowances</td><td class="right">₱${calc.allowances.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><th>Gross Earnings</th><th class="right">₱${calc.grossPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</th></tr>
          </table>
        </div>
        <div class="box">
          <h4 style="margin-top:0">Deductions</h4>
          <table>
            <tr><td>Tax Withheld</td><td class="right">₱${calc.tax.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>SSS / PhilHealth / HDMF</td><td class="right">₱${(calc.sss + calc.philHealth + calc.pagIbig).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Late Deductions</td><td class="right">₱${calc.lateDeduction.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><td>Loans & Other</td><td class="right">₱${(calc.loans + calc.other).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr>
            <tr><th>Total Deductions</th><th class="right">₱${calc.totalDeductions.toLocaleString('en-PH', {minimumFractionDigits: 2})}</th></tr>
          </table>
        </div>
      </div>
      <table><tr class="net-pay"><td>NET PAY</td><td class="right">₱${calc.netPay.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td></tr></table>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const exportToCSV = () => {
    if (filteredEmployees.length === 0) return toast.warning("No data to export.");
    const headers = [
      "Full Name","Employee ID","Regular Hours","Overtime Hours","Late Minutes","Late Deduction",
      "Base Earnings","Overtime Pay","Allowances", "Gross Pay","SSS","PhilHealth","Pag-IBIG",
      "Loans","Other Deductions","Tax","Net Pay"
    ];
    const rows = filteredEmployees.map(emp => {
      const calc = computePayroll(emp);
      return [
        emp.full_name, emp.employee_id, calc.regularHours, calc.overtimeHours, calc.lateMinutes, calc.lateDeduction,
        calc.baseEarnings, calc.overtimePay, calc.allowances, calc.grossPay, calc.sss, calc.philHealth, 
        calc.pagIbig, calc.loans, calc.other, calc.tax, calc.netPay
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

  const isAllowanceEligible = (emp) => emp.contract_type === 'Regular';

  return (
    <div className="pm-container">
      {/* Month Navigation */}
      <div className="pm-date-nav">
        <button className="pm-nav-btn" onClick={() => {
          if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(selectedYear - 1); }
          else { setSelectedMonth(selectedMonth - 1); }
        }}><ChevronLeft size={20}/></button>
        
        <div className="pm-date-display">
          <Calendar size={18} className="pm-date-icon" />
          <span>{monthName} {selectedYear}</span>
        </div>
        
        <button className="pm-nav-btn" onClick={() => {
          if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(selectedYear + 1); }
          else { setSelectedMonth(selectedMonth + 1); }
        }}><ChevronRight size={20}/></button>
      </div>

      {isFutureMonth ? (
        <div className="pm-empty-state">
          <CalendarDays size={40} className="pm-empty-icon" />
          <p>Future Data Not Available</p>
          <span>Please select current or past months to view payroll.</span>
        </div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="pm-metrics-grid">
            <div className="pm-metric-card">
              <div className="pm-metric-icon neutral"><Users size={20} /></div>
              <div className="pm-metric-data">
                <label>Eligible Employees</label>
                <h3>{summary.totalEmployees}</h3>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon primary"><Wallet size={20} /></div>
              <div className="pm-metric-data">
                <label>Total Gross Pay</label>
                <h3>₱{summary.totalGross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon danger"><TrendingUp size={20} /></div>
              <div className="pm-metric-data">
                <label>Total Tax Withheld</label>
                <h3>₱{summary.totalTax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</h3>
              </div>
            </div>
            <div className="pm-metric-card">
              <div className="pm-metric-icon success"><DollarSign size={20} /></div>
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
                  <input type="text" placeholder="Search by name or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
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

            {/* Main Table */}
            <div className="pm-table-wrapper">
              {loading ? (
                <div className="pm-empty-state">Calculating payroll records...</div>
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
                      <tr><td colSpan="5"><div className="pm-empty-state">No matching employees found.</div></td></tr>
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
                                <button className="btn-icon-neutral" onClick={() => openPayslip(emp)} title="View & Edit Payslip">
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
        <p className="pm-modal-desc">This action calculates and finalizes base pay for all active instructors for the selected period using verified attendance logs.</p>
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

      {/* Individual Payslip Editor Modal */}
      <FormalModal 
        show={showPayslipModal && !!payslipEmployee} 
        onClose={() => { setShowPayslipModal(false); setPayslipEmployee(null); }} 
        title="Payslip Breakdown & Adjustments" 
        wide 
        footer={
          <>
            <button className="btn-pm-cancel" onClick={() => { setShowPayslipModal(false); setPayslipEmployee(null); }}>Close</button>
            <button className="btn-pm-primary" onClick={() => printPayslip(payslipEmployee)}>Print / Export</button>
          </>
        }
      >
        {payslipEmployee && (() => {
          const emp = payslipEmployee;
          const calc = computePayroll(emp);
          const extras = employeeExtras[emp.employee_id] || {};
          const eligible = isAllowanceEligible(emp);
          
          return (
            <div className="pm-payslip-grid">
              <div className="pm-payslip-panel">
                <h4 className="pm-panel-title">Earnings</h4>
                <div className="pm-ps-row"><span>Hourly Rate</span><strong>₱{calc.hourlyRate.toLocaleString('en-PH', { minimumFractionDigits: 2 })}/hr</strong></div>
                <div className="pm-ps-row"><span>Base Earnings ({calc.regularHours} hrs)</span><strong>₱{calc.baseEarnings.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
                <div className="pm-ps-row"><span>Overtime Pay ({calc.overtimeHours} hrs)</span><strong>₱{calc.overtimePay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
                
                <h4 className="pm-panel-title mt-4">Allowances {!eligible && <small className="text-danger">(Not Eligible)</small>}</h4>
                <div className="pm-ps-row"><span>Transport</span>
                  {eligible ? <input type="number" min="0" value={extras.transport || ''} onChange={e => updateExtras(emp.employee_id, 'transport', e.target.value)} className="pm-edit-input" placeholder="0.00" /> : <span>₱0.00</span>}
                </div>
                <div className="pm-ps-row"><span>Meal</span>
                  {eligible ? <input type="number" min="0" value={extras.meal || ''} onChange={e => updateExtras(emp.employee_id, 'meal', e.target.value)} className="pm-edit-input" placeholder="0.00" /> : <span>₱0.00</span>}
                </div>
                <div className="pm-ps-row"><span>Housing</span>
                  {eligible ? <input type="number" min="0" value={extras.housing || ''} onChange={e => updateExtras(emp.employee_id, 'housing', e.target.value)} className="pm-edit-input" placeholder="0.00" /> : <span>₱0.00</span>}
                </div>
                <div className="pm-ps-row total-row mt-4"><span>Gross Pay</span><span className="text-primary">₱{calc.grossPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
              </div>

              <div className="pm-payslip-panel">
                <h4 className="pm-panel-title">Deductions</h4>
                <div className="pm-ps-row"><span>Late Deduction ({calc.lateMinutes} mins)</span><strong className="text-danger">- ₱{calc.lateDeduction.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
                <div className="pm-ps-row"><span>SSS Contribution</span>
                  <input type="number" min="0" value={extras.sssOverride != null ? extras.sssOverride : calc.sss} onChange={e => updateExtras(emp.employee_id, 'sssOverride', e.target.value)} className="pm-edit-input" />
                </div>
                <div className="pm-ps-row"><span>PhilHealth</span>
                  <input type="number" min="0" value={extras.philHealthOverride != null ? extras.philHealthOverride : calc.philHealth} onChange={e => updateExtras(emp.employee_id, 'philHealthOverride', e.target.value)} className="pm-edit-input" />
                </div>
                <div className="pm-ps-row"><span>Pag-IBIG</span>
                  <input type="number" min="0" value={extras.pagIbigOverride != null ? extras.pagIbigOverride : calc.pagIbig} onChange={e => updateExtras(emp.employee_id, 'pagIbigOverride', e.target.value)} className="pm-edit-input" />
                </div>
                <div className="pm-ps-row"><span>Loans / Advances</span>
                  <input type="number" min="0" value={extras.loans || ''} onChange={e => updateExtras(emp.employee_id, 'loans', e.target.value)} className="pm-edit-input" placeholder="0.00" />
                </div>
                <div className="pm-ps-row"><span>Other Deductions</span>
                  <input type="number" min="0" value={extras.other || ''} onChange={e => updateExtras(emp.employee_id, 'other', e.target.value)} className="pm-edit-input" placeholder="0.00" />
                </div>
                <div className="pm-ps-row"><span>Withholding Tax</span><strong className="text-danger">- ₱{calc.tax.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
                
                <div className="pm-ps-row net-row mt-4"><span>Final Net Pay</span><span className="text-success">₱{calc.netPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></div>
              </div>
            </div>
          );
        })()}
      </FormalModal>
    </div>
  );
};

export default PayrollMain;