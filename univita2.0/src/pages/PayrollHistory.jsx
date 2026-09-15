import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Printer, Filter } from 'lucide-react';
import { toast } from 'react-toastify';
import './PayrollHistory.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const PayrollHistory = ({ setView }) => {
  const [history, setHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('All');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${API_BASE}/payroll/history`, getAuthHeaders());
        setHistory(res.data);
      } catch (err) {
        console.error("Error fetching payroll history:", err);
        toast.error('Failed to load payroll history');
      }
    };
    fetchHistory();
  }, []);

  const uniqueMonths = ['All', ...new Set(history.map(item => item.month_year))];

  const filteredHistory = history.filter(item => {
    const matchesName = (item.full_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMonth = selectedMonth === 'All' || item.month_year === selectedMonth;
    return matchesName && matchesMonth;
  });

  // Safe number formatting for currency
  const formatPHP = (num) => {
    const value = parseFloat(num);
    if (isNaN(value)) return '0.00';
    return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Safe formatting for total hours
  const formatHours = (hours) => {
    const value = parseFloat(hours);
    if (isNaN(value)) return '0.00';
    return value.toFixed(2);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="payroll-history-container">
      <div className="history-card">
        <div className="history-actions-row">
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="history-search"
              placeholder="Search by instructor name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="right-actions">
            <div className="filter-wrapper">
              <Filter size={16} className="filter-icon" />
              <select
                className="month-filter-dropdown"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {uniqueMonths.map((month, index) => (
                  <option key={index} value={month}>{month}</option>
                ))}
              </select>
            </div>
            <button className="print-btn" onClick={handlePrint}>
              <Printer size={18} />
              <span>Print Report</span>
            </button>
          </div>
        </div>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Instructor</th>
                <th>Hourly Rate (₱)</th>
                <th>Total Hours</th>
                <th>Gross Pay</th>
                <th>Tax (10%)</th>
                <th>Net Pay</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length > 0 ? (
                filteredHistory.map((record) => (
                  <tr key={record.id}>
                    <td className="font-medium">{record.month_year}</td>
                    <td className="font-semibold">{record.full_name}</td>
                    <td>₱{formatPHP(record.salary_rate)}</td>
                    <td>{formatHours(record.total_hours)} hrs</td>
                    <td>₱{formatPHP(record.gross_pay)}</td>
                    <td className="tax-text">-₱{formatPHP(record.tax_deduction)}</td>
                    <td className="net-pay-text">₱{formatPHP(record.net_pay)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="status-pill paid">
                        {record.status?.toUpperCase() || 'PAID'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="empty-state">
                    No finalized records found for this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PayrollHistory;