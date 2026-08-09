// src/pages/AuditLogs.jsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, Download, Calendar, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'react-toastify';
import './AuditLogs.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/audit-logs`, getAuthHeaders());
      setLogs(res.data);
      setFilteredLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
      if (err.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
      } else if (err.response?.status === 403) {
        toast.error('Access denied. Admin privileges required.');
      } else {
        toast.error('Failed to load audit logs.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = [...logs];
    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.target_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ip_address?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (dateFrom) {
      filtered = filtered.filter(log => log.created_at >= dateFrom);
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      const endDateStr = endDate.toISOString().split('T')[0];
      filtered = filtered.filter(log => log.created_at < endDateStr);
    }
    if (actionFilter) {
      filtered = filtered.filter(log => log.action === actionFilter);
    }
    setFilteredLogs(filtered);
    setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo, actionFilter, logs]);

  const formatChanges = (oldVal, newVal) => {
    if (!oldVal && !newVal) return '—';
    if (oldVal && !newVal) return `Removed: ${JSON.stringify(oldVal).substring(0, 60)}`;
    if (!oldVal && newVal) return `Added: ${JSON.stringify(newVal).substring(0, 60)}`;
    return `Changed: ${JSON.stringify(oldVal).substring(0, 40)} → ${JSON.stringify(newVal).substring(0, 40)}`;
  };

  const totalLogs = filteredLogs.length;
  const totalPages = Math.ceil(totalLogs / rowsPerPage);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const uniqueActions = useMemo(() => [...new Set(logs.map(log => log.action))], [logs]);

  const exportCSV = () => {
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Changes', 'IP Address'];
    const rows = filteredLogs.map(log => [
      log.created_at,
      log.user_email || 'System',
      log.action,
      log.target_type || '',
      formatChanges(log.old_value, log.new_value).replace(/[➕🗑️✏️]/g, '').trim(),
      log.ip_address || ''
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.info('CSV export started');
  };

  return (
    <div className="al-container">
      <div className="al-header">
        <div>
          <h2 className="al-title">Audit Logs</h2>
          <p className="al-subtitle">Complete history of system actions and data changes.</p>
        </div>
        <button className="btn-al-export" onClick={exportCSV}>
          <Download size={16} /> 
          <span>Export CSV</span>
        </button>
      </div>

      {/* Modern Filter Card */}
      <div className="al-filters-card">
        <div className="al-filters-wrapper">
          <div className="al-filter-group search">
            <label>Search Logs</label>
            <div className="al-input-wrapper">
              <Search size={16} className="al-input-icon" />
              <input
                type="text"
                placeholder="Search user, action, IP..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="al-input pl-icon"
              />
            </div>
          </div>

          <div className="al-filter-group date">
            <label>Date Range</label>
            <div className="al-date-flex">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="al-input"
              />
              <span className="al-date-sep">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="al-input"
              />
              {(dateFrom || dateTo) && (
                <button className="al-btn-clear" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="al-filter-group action">
            <label>Action Type</label>
            <select className="al-select" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
              <option value="">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Area */}
      {loading ? (
        <div className="al-loading-state">Loading audit logs...</div>
      ) : (
        <div className="al-card">
          <div className="al-table-wrapper">
            <table className="al-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Changes</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.length === 0 ? (
                  <tr className="al-empty-row">
                    <td colSpan="6">No audit records found matching your filters.</td>
                  </tr>
                ) : (
                  paginatedLogs.map(log => (
                    <tr key={log.id}>
                      <td className="al-timestamp">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="al-user">{log.user_email || 'System'}</td>
                      <td>
                        <span className="al-action-tag">{log.action}</span>
                      </td>
                      <td className="al-resource">{log.target_type || '—'}</td>
                      <td className="al-changes" title={formatChanges(log.old_value, log.new_value)}>
                        {formatChanges(log.old_value, log.new_value)}
                      </td>
                      <td className="al-ip">{log.ip_address || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalLogs > 0 && (
            <div className="al-pagination-bar">
              <div className="al-rows-selector">
                <span>Rows per page:</span>
                <select className="al-select-small" value={rowsPerPage} onChange={e => setRowsPerPage(Number(e.target.value))}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              
              <div className="al-pagination-controls">
                <button 
                  className="al-page-btn" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="al-page-indicator">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <button 
                  className="al-page-btn" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditLogs;