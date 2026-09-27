import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, Download, ChevronLeft, ChevronRight, ShieldAlert, Eye, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import './AuditLogs.css';
import { API_BASE } from '../api';


const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Human-friendly action labels
const formatActionLabel = (action = '') => {
  const map = {
    BATCH_APPROVED_LEAVE: 'Batch Approved Leaves',
    BATCH_REJECTED_LEAVE: 'Batch Rejected Leaves',
    APPROVE_LEAVE: 'Approved Leave Request',
    REJECT_LEAVE: 'Rejected Leave Request',
    SUBMIT_LEAVE: 'Submitted Leave Request',
    CANCEL_LEAVE: 'Cancelled Leave Request',
    APPROVE_CORRECTION: 'Approved Attendance Correction',
    REJECT_CORRECTION: 'Rejected Attendance Correction',
    CANCEL_CORRECTION: 'Cancelled Correction Request',
    APPROVE_APPEAL: 'Approved Attendance Appeal',
    REJECT_APPEAL: 'Rejected Attendance Appeal',
    SUBMIT_APPEAL: 'Submitted Attendance Appeal',
    CANCEL_APPEAL: 'Cancelled Attendance Appeal',
    APPROVE_OVERTIME: 'Approved Overtime Request',
    REJECT_OVERTIME: 'Rejected Overtime Request',
    SUBMIT_OVERTIME: 'Submitted Overtime Request',
    CANCEL_OVERTIME: 'Cancelled Overtime Request',
    CLOCK_IN: 'Clocked In',
    CLOCK_OUT: 'Clocked Out',
    LOGIN: 'Account Sign In',
    ADMIN_RESET_PASSWORD: 'Reset User Password',
    CREATE_EMPLOYEE: 'Created Employee Account',
    UPDATE_EMPLOYEE: 'Updated Employee Profile',
    DELETE_EMPLOYEE: 'Deleted Employee Account',
    TOGGLE_EMPLOYEE_STATUS: 'Changed Employee Status',
    CREATE_SCHEDULE: 'Created Work Schedule',
    UPDATE_SCHEDULE: 'Updated Schedule',
    DELETE_SCHEDULE: 'Deleted Schedule',
    BULK_CREATE_SCHEDULES: 'Bulk Created Schedules',
    CREATE_ALERT: 'Broadcasted Alert',
    FINALIZE_PAYROLL: 'Finalized Payroll',
    RUN_MONTHLY_PAYROLL: 'Processed Monthly Payroll',
  };
  return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Color coding for action tags
const getActionBadgeClass = (action = '') => {
  const act = action.toUpperCase();
  if (act.includes('APPROVE') || act.includes('PRESENT') || act.includes('FINALIZE')) return 'badge-success';
  if (act.includes('REJECT') || act.includes('DELETE') || act.includes('CANCEL')) return 'badge-danger';
  if (act.includes('CREATE') || act.includes('SUBMIT')) return 'badge-primary';
  if (act.includes('UPDATE') || act.includes('EDIT')) return 'badge-warning';
  return 'badge-neutral';
};

// Plain English event summaries for the Inspection Modal
const getFriendlySummary = (log) => {
  if (!log) return '';
  const { action, target_type, target_id, user_email } = log;
  const actor = user_email || 'An administrator';

  switch (action) {
    case 'BATCH_REJECTED_LEAVE':
      return `${actor} rejected a batch of leave applications (${target_id || 'ID unspecified'}).`;
    case 'BATCH_APPROVED_LEAVE':
      return `${actor} approved a batch of leave applications (${target_id || 'ID unspecified'}).`;
    case 'APPROVE_LEAVE':
      return `${actor} approved leave request #${target_id || ''}.`;
    case 'REJECT_LEAVE':
      return `${actor} rejected leave request #${target_id || ''}.`;
    case 'CANCEL_LEAVE':
      return `${actor} cancelled leave request #${target_id || ''}.`;
    case 'SUBMIT_LEAVE':
      return `${actor} submitted a new leave application.`;
    case 'APPROVE_CORRECTION':
      return `${actor} approved attendance correction #${target_id || ''}.`;
    case 'REJECT_CORRECTION':
      return `${actor} rejected attendance correction #${target_id || ''}.`;
    case 'CANCEL_CORRECTION':
      return `${actor} cancelled attendance correction #${target_id || ''}.`;
    case 'APPROVE_APPEAL':
      return `${actor} approved attendance appeal #${target_id || ''}.`;
    case 'REJECT_APPEAL':
      return `${actor} rejected attendance appeal #${target_id || ''}.`;
    case 'CANCEL_APPEAL':
      return `${actor} cancelled attendance appeal #${target_id || ''}.`;
    case 'SUBMIT_APPEAL':
      return `${actor} submitted an attendance appeal.`;
    case 'APPROVE_OVERTIME':
      return `${actor} approved overtime request #${target_id || ''}.`;
    case 'REJECT_OVERTIME':
      return `${actor} rejected overtime request #${target_id || ''}.`;
    case 'CANCEL_OVERTIME':
      return `${actor} cancelled overtime request #${target_id || ''}.`;
    case 'SUBMIT_OVERTIME':
      return `${actor} submitted an overtime request.`;
    case 'LOGIN':
      return `${actor} logged into the system.`;
    case 'CLOCK_IN':
      return `${actor} clocked in for a scheduled shift.`;
    case 'CLOCK_OUT':
      return `${actor} clocked out from a scheduled shift.`;
    case 'CREATE_SCHEDULE':
      return `${actor} created a new schedule shift.`;
    case 'UPDATE_SCHEDULE':
      return `${actor} updated schedule shift #${target_id || ''}.`;
    case 'DELETE_SCHEDULE':
      return `${actor} removed schedule shift #${target_id || ''}.`;
    case 'CREATE_EMPLOYEE':
      return `${actor} registered a new employee record.`;
    case 'UPDATE_EMPLOYEE':
      return `${actor} updated information for employee #${target_id || ''}.`;
    case 'DELETE_EMPLOYEE':
      return `${actor} deleted employee account #${target_id || ''}.`;
    default:
      return `${actor} performed [${formatActionLabel(action)}] on ${(target_type || 'record').replace(/_/g, ' ')} (${target_id ? `ID: ${target_id}` : 'System'}).`;
  }
};

// Formats date to Philippine Standard Time
const formatPHT = (dateStr) => {
  if (!dateStr) return '—';
  const cleanStr = String(dateStr).replace(' ', 'T');
  const d = new Date(cleanStr);
  if (isNaN(d.getTime())) return dateStr;
  
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('');

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
    const headers = ['Timestamp (PHT)', 'User Account', 'Action Executed', 'Target Module', 'Target ID', 'Origin IP', 'Summary'];
    const rows = filteredLogs.map(log => [
      formatPHT(log.created_at),
      log.user_email || 'System',
      formatActionLabel(log.action),
      log.target_type || '',
      log.target_id || '',
      (log.ip_address || '').split(',')[0].trim(),
      getFriendlySummary(log)
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
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
            <select
              className="expert-clean-input border"
              style={{ padding: '0.5rem 2.5rem 0.5rem 0.75rem', height: '42px' }}
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
            >
              <option value="">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{formatActionLabel(action)}</option>
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
                    <th className="al-col-view">View</th>
                    <th style={{ width: '220px', whiteSpace: 'nowrap' }}>Date & Time (PHT)</th>
                    <th>User / Administrator</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan="4">
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
                        <td className="al-col-view">
                          <button 
                            className="al-action-inspect-btn" 
                            onClick={(e) => { e.stopPropagation(); handleInspect(log); }}
                            title="View Details"
                          >
                            <Eye size={15} color="#475569" />
                          </button>
                        </td>
                        <td className="font-mono text-muted" style={{ whiteSpace: 'nowrap' }}>
                          {formatPHT(log.created_at)}
                        </td>
                        <td className="text-dark font-medium">
                          {log.user_email || 'System'}
                        </td>
                        <td>
                          <span className={`al-action-badge ${getActionBadgeClass(log.action)}`}>
                            {formatActionLabel(log.action)}
                          </span>
                        </td>
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
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="expert-page-btn">
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span className="expert-page-current">{currentPage} / {totalPages || 1}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="expert-page-btn">
                    Next <ChevronRight size={16} />
                  </button>
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
                <span className="al-modal-label">Timestamp (PHT)</span>
                <p className="font-mono text-dark font-medium">{formatPHT(selectedLog.created_at)}</p>
              </div>
              <div>
                <span className="al-modal-label">User Account</span>
                <p className="text-dark font-semibold">{selectedLog.user_email || 'System'}</p>
              </div>
              <div>
                <span className="al-modal-label">Action Executed</span>
                <p>
                  <span className={`al-action-badge ${getActionBadgeClass(selectedLog.action)}`}>
                    {formatActionLabel(selectedLog.action)}
                  </span>
                </p>
              </div>
            </div>

            {/* Plain English Activity Summary */}
            <div className="al-details-box">
              <h4>Activity Summary</h4>
              <div className="al-summary-box">
                {getFriendlySummary(selectedLog)}
              </div>
            </div>

            {/* Conditionally render State Comparison if payload exists */}
            {(selectedLog.old_value || selectedLog.new_value) && (
              <div className="al-details-grid">
                {selectedLog.old_value && (
                  <div className="al-details-box">
                    <h4>Previous State</h4>
                    <pre className="al-code-box">
                      {typeof selectedLog.old_value === 'object' ? JSON.stringify(selectedLog.old_value, null, 2) : selectedLog.old_value}
                    </pre>
                  </div>
                )}
                {selectedLog.new_value && (
                  <div className="al-details-box">
                    <h4>New State / Changes</h4>
                    <pre className="al-code-box">
                      {typeof selectedLog.new_value === 'object' ? JSON.stringify(selectedLog.new_value, null, 2) : selectedLog.new_value}
                    </pre>
                  </div>
                )}
              </div>
            )}

            <div className="al-meta-info">
              <span>Target Module: <strong>{(selectedLog.target_type || 'System').replace(/_/g, ' ')}</strong></span>
              <span>Target ID: <strong>{selectedLog.target_id || 'N/A'}</strong></span>
              <span>Origin IP: <strong>{(selectedLog.ip_address || 'N/A').split(',')[0].trim()}</strong></span>
            </div>
            
            <div className="al-meta-info" style={{ marginTop: '0.25rem', background: '#F0FDFA', borderColor: '#CCFBF1', color: '#0F766E' }}>
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