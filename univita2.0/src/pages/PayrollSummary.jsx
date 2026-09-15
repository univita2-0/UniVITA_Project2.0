// src/pages/PayrollSummary.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Calendar, Lock, Key, X } from 'lucide-react';
import './PayrollSummary.css';
import { API_BASE } from '../api';

const PayrollSummary = () => {
  const [payrollData, setPayrollData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const token = localStorage.getItem('auth_token');
  const userEmail = localStorage.getItem('user_email') || '';

  // Helper for authenticated requests
  const authHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!pin || pin.length < 4) {
      setPinError('Please enter a valid PIN (4-6 digits).');
      return;
    }
    setPinLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/payroll/unlock`, {
        email: userEmail,
        pin: pin
      }, authHeaders());
      if (res.data.success) {
        setUnlocked(true);
        setShowPinModal(false);
        fetchPayroll();
      } else {
        setPinError(res.data.message || 'Incorrect PIN.');
      }
    } catch (err) {
      setPinError(err.response?.data?.message || 'Failed to verify PIN.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleClose = () => {
    // Navigate back to dashboard
    window.location.href = '/dashboard';
  };

  const fetchPayroll = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/payroll/history`, authHeaders());
      setPayrollData(res.data);
    } catch (err) {
      console.error('Failed to fetch payroll', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlocked) fetchPayroll();
  }, [unlocked]);

  useEffect(() => {
    let filtered = [...payrollData];
    if (selectedMonth) {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const [year, month] = selectedMonth.split('-');
      const monthName = monthNames[parseInt(month) - 1];
      filtered = filtered.filter(p => p.month_year === `${monthName} ${year}`);
    }
    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredData(filtered);
  }, [payrollData, selectedMonth, searchTerm]);

  const exportCSV = () => {
    const headers = ['Employee', 'Month/Year', 'Gross Pay', 'Tax', 'SSS', 'PhilHealth', 'PagIBIG', 'Loan', 'Other Ded.', 'Net Pay', 'Status'];
    const rows = filteredData.map(p => [
      p.full_name,
      p.month_year,
      p.gross_pay,
      p.tax_deduction,
      p.sss_deduction || 0,
      p.philhealth_deduction || 0,
      p.pagibig_deduction || 0,
      p.loan_deduction || 0,
      p.other_deduction || 0,
      p.net_pay,
      p.status
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_summary_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const availableMonths = [...new Set(payrollData.map(p => {
    const [month, year] = p.month_year?.split(' ') || [];
    if (month && year) {
      const monthIndex = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(month.slice(0,3));
      if (monthIndex !== -1) return `${year}-${String(monthIndex+1).padStart(2,'0')}`;
    }
    return null;
  }).filter(Boolean))].sort().reverse();

  if (!unlocked) {
    return (
      <div className="payroll-summary-container">
        <div className="pin-overlay">
          <div className="pin-modal">
            <button className="pin-close-btn" onClick={handleClose}>
              <X size={20} />
            </button>
            <div className="pin-header">
              <Lock size={24} />
              <h2>Payroll Access</h2>
              <p>Enter your security PIN to view the payroll summary.</p>
            </div>
            <form onSubmit={handleUnlock}>
              <div className="pin-input-group">
                <Key size={18} />
                <input
                  type="password"
                  maxLength="6"
                  pattern="\d*"
                  placeholder="Enter PIN"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              {pinError && <div className="pin-error">{pinError}</div>}
              <button type="submit" className="btn-unlock" disabled={pinLoading}>
                {pinLoading ? 'Verifying...' : 'Unlock'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="payroll-summary-container">
      <div className="summary-header">
        
        <button className="btn-export" onClick={exportCSV}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="summary-controls">
        <div className="filter-group">
          <Calendar size={16} />
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
            {availableMonths.map(month => (
              <option key={month} value={month}>
                {new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search employee..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner">Loading payroll data...</div>
      ) : (
        <div className="summary-table-wrapper">
          <table className="summary-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Month/Year</th>
                <th>Gross Pay</th>
                <th>Tax</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr><td colSpan="7" className="empty-row">No payroll records found.</td></tr>
              ) : (
                filteredData.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.full_name || '—'}</strong>
                      {p.employee_id && (
                        <>
                          <br/>
                          <span className="emp-id">{p.employee_id}</span>
                        </>
                      )}
                    </td>
                    <td>{p.month_year || '—'}</td>
                    <td>₱{parseFloat(p.gross_pay || 0).toLocaleString()}</td>
                    <td>₱{parseFloat(p.tax_deduction || 0).toLocaleString()}</td>
                    <td>₱{(
                      (parseFloat(p.sss_deduction||0)) +
                      (parseFloat(p.philhealth_deduction||0)) +
                      (parseFloat(p.pagibig_deduction||0)) +
                      (parseFloat(p.loan_deduction||0)) +
                      (parseFloat(p.other_deduction||0))
                    ).toLocaleString()}</td>
                    <td className="net-pay">₱{parseFloat(p.net_pay || 0).toLocaleString()}</td>
                    <td><span className={`status-badge ${p.status}`}>{p.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PayrollSummary;