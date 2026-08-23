import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, Download, Calendar, Filter, ChevronLeft, ChevronRight, ShieldAlert, History, Eye, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
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

  // Modal inspection state
  const [selectedLog, setSelectedLog] = useState(null);
  const [showModal, setShowModal] = useState(false);

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

  const handleInspect = (log) => {
    setSelectedLog(log);
    setShowModal(true);
  };

  const totalLogs = filteredLogs.length;
  const totalPages = Math.ceil(totalLogs / rowsPerPage);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const uniqueActions = useMemo(() => [...new Set(logs.map(log => log.action))], [logs]);

  const exportCSV = () => {
    const headers = ['Timestamp', 'User Account', 'Action Executed', 'Target Module', 'Origin IP'];
    const rows = filteredLogs.map(log => [
      log.created_at,
      log.user_email || 'System',
      log.action,
      log.target_type || '',
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
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Formal chronological record of administrative actions and security events.</p>
          </div>
        </div>
        <button className="expert-btn-secondary" onClick={exportCSV}>
          <Download size={16} /> Export CSV Report
        </button>
      </div>

      {/* Filter Card */}
      <div className="expert-search-card">
        <div className="al-filters-wrapper">
          <div className="al-filter-group search">
            <label>Search Audit Logs</label>
            <div className="expert-search-input-group" style={{ height: '42px', margin: 0 }}>
              <Search size={16} className="text-muted" />
              <input
                type="text"
                placeholder="Search user, action, IP..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="expert-clean-input"
              />
            </div>
          </div>

          <div className="al-filter-group date">
            <label>Date Range Filter</label>
            <div className="al-date-flex">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="expert-clean-input border"
                style={{ padding: '0.5rem 0.75rem', height: '42px' }}
              />
              <span className="al-date-sep">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="expert-clean-input border"
                style={{ padding: '0.5rem 0.75rem', height: '42px' }}
              />
              {(dateFrom || dateTo) && (
                <button className="al-btn-clear" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="al-filter-group action">
            <label>Action Category</label>
            <select className="expert-clean-input border" style={{ padding: '0.5rem 2.5rem 0.5rem 0.75rem', height: '42px' }} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
              <option value="">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="expert-card">
        {loading ? (
          <div className="expert-loading">Loading audit records...</div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }} className="text-center">Details</th>
                    <th>Timestamp</th>
                    <th>User Account</th>
                    <th>Action Executed</th>
                    <th>Target Module</th>
                    <th>Origin IP</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan="6">
                        <div className="expert-empty">
                          <ShieldAlert size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
                          <p>No audit records found.</p>
                          <span>Try adjusting your search filters or date range.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map(log => (
                      <tr key={log.id} onClick={() => handleInspect(log)} title="Click to view details" style={{ cursor: 'pointer' }}>
                        <td className="text-center">
                          <button 
                            className="al-action-inspect-btn" 
                            onClick={(e) => { e.stopPropagation(); handleInspect(log); }}
                            title="View Log Details"
                          >
                            <Eye size={16} color="#475569" />
                          </button>
                        </td>
                        <td className="font-mono text-muted">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="text-dark font-medium">{log.user_email || 'System Daemon'}</td>
                        <td>
                          <span className="al-action-tag">{log.action}</span>
                        </td>
                        <td className="font-mono text-muted">{log.target_type || '—'}</td>
                        <td className="font-mono text-muted">{log.ip_address || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalLogs > 0 && (
              <div className="expert-pagination">
                <div className="al-rows-selector">
                  <span className="expert-page-info">Rows per page:</span>
                  <select className="al-select-small" value={rowsPerPage} onChange={e => setRowsPerPage(Number(e.target.value))}>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="expert-page-controls">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="expert-page-btn"><ChevronLeft size={16} /> Prev</button>
                  <span className="expert-page-current">{currentPage} / {totalPages || 1}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="expert-page-btn">Next <ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Audit Detail Inspection Modal */}
      <FormalModal
        show={showModal}
        onClose={() => setShowModal(false)}
        title="Audit Log Inspection"
        wide
        footer={
          <button className="expert-btn-secondary" onClick={() => setShowModal(false)}>
            Close Window
          </button>
        }
      >
        {selectedLog && (
          <div className="al-modal-content-grid">
            <div className="al-modal-meta-row">
              <div>
                <span className="al-modal-label">Timestamp</span>
                <p className="font-mono">{new Date(selectedLog.created_at).toLocaleString()}</p>
              </div>
              <div>
                <span className="al-modal-label">User Account</span>
                <p className="text-dark font-semibold">{selectedLog.user_email || 'System Daemon'}</p>
              </div>
              <div>
                <span className="al-modal-label">Action Executed</span>
                <p><span className="al-action-tag">{selectedLog.action}</span></p>
              </div>
            </div>

            {/* Conditionally render Previous State / New State or System Summary */}
            {(selectedLog.old_value || selectedLog.new_value) ? (
              <div className="al-details-grid">
                {selectedLog.old_value && (
                  <div className="al-details-box">
                    <h4>Previous State (Old Value)</h4>
                    <pre>{typeof selectedLog.old_value === 'object' ? JSON.stringify(selectedLog.old_value, null, 2) : selectedLog.old_value}</pre>
                  </div>
                )}
                {selectedLog.new_value && (
                  <div className="al-details-box">
                    <h4>New State / Payload (New Value)</h4>
                    <pre>{typeof selectedLog.new_value === 'object' ? JSON.stringify(selectedLog.new_value, null, 2) : selectedLog.new_value}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="al-details-box">
                <h4>System Event Summary</h4>
                <pre>Successfully executed action [{selectedLog.action}] on target module [{selectedLog.target_type || 'system'}] with ID [{selectedLog.target_id || 'N/A'}]. No prior data state modifications were recorded for this transaction type.</pre>
              </div>
            )}

            <div className="al-meta-info">
              <span>Target Module: <strong>{selectedLog.target_type || 'N/A'}</strong></span>
              <span>Target ID: <strong>{selectedLog.target_id || 'N/A'}</strong></span>
              <span>Origin IP: <strong>{selectedLog.ip_address || 'N/A'}</strong></span>
            </div>
            <div className="al-meta-info" style={{ marginTop: '0.5rem', background: '#F0FDFA', borderColor: '#CCFBF1', color: '#0F766E' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShieldCheck size={16} /> Verified Secure System Audit Event Record
              </span>
            </div>
          </div>
        )}
      </FormalModal>
    </div>
  );
};

export default AuditLogs;