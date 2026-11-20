import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, Download, ChevronLeft, ChevronRight, Eye, Activity, User, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-toastify';
import FormalModal from '../components/FormalModal';
import './AuditLogs.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const formatActionLabel = (action = '') => {
  const map = {
    BATCH_APPROVED_LEAVE: 'Batch Approved Leaves',
    APPROVE_LEAVE: 'Approved Leave Request',
    REJECT_LEAVE: 'Rejected Leave Request',
    SUBMIT_LEAVE_BATCH: 'Submitted Leave Request(s)',
    CANCEL_LEAVE: 'Cancelled Leave Request',
    APPROVE_OVERTIME: 'Approved Overtime',
    REJECT_OVERTIME: 'Rejected Overtime',
    SUBMIT_OVERTIME: 'Submitted Overtime',
    CLOCK_IN: 'Clocked In',
    CLOCK_OUT: 'Clocked Out',
    MANUAL_UPDATE_ATTENDANCE: 'Manual Attendance Update',
    SUBMIT_CORRECTION: 'Submitted Correction',
    APPROVE_CORRECTION: 'Approved Correction',
    REJECT_CORRECTION: 'Rejected Correction',
    SUBMIT_APPEAL: 'Submitted Appeal',
    APPROVE_APPEAL: 'Approved Appeal',
    REJECT_APPEAL: 'Rejected Appeal',
    LOGIN: 'Logged In',
    ADMIN_RESET_PASSWORD: 'Reset Password',
    UPDATE_USER_ROLE: 'Changed User Role',
    SUSPICIOUS_LOCATION: 'Suspicious GPS Flag',
    CREATE_EMPLOYEE: 'Created Employee',
    UPDATE_EMPLOYEE: 'Updated Employee',
    DELETE_EMPLOYEE: 'Deleted Employee',
    TOGGLE_EMPLOYEE_STATUS: 'Changed Status',
    CREATE_SCHEDULE: 'Created Schedule',
    UPDATE_SCHEDULE: 'Updated Schedule',
    DELETE_SCHEDULE: 'Deleted Schedule',
    CREATE_ALERT: 'Sent Emergency Alert',
    UPDATE_SYSTEM_CONFIG: 'Updated System Config',
    FINALIZE_PAYROLL: 'Finalized Payroll',
    RUN_MONTHLY_PAYROLL: 'Ran Monthly Payroll',
    APPROVE_APPOINTMENT: 'Approved Visitor',
    REJECT_APPOINTMENT: 'Rejected Visitor',
    VISITOR_ARRIVE: 'Visitor Checked In',
    VISITOR_RETURN: 'Visitor Checked Out'
  };
  return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const getActionBadgeClass = (action = '') => {
  const act = action.toUpperCase();
  if (act.includes('APPROVE') || act.includes('PRESENT') || act.includes('FINALIZE') || act.includes('CREATE')) return 'badge-success';
  if (act.includes('REJECT') || act.includes('DELETE') || act.includes('CANCEL') || act.includes('SUSPICIOUS')) return 'badge-danger';
  if (act.includes('LOGIN') || act.includes('CLOCK') || act.includes('SUBMIT')) return 'badge-primary';
  if (act.includes('UPDATE') || act.includes('EDIT')) return 'badge-warning';
  return 'badge-neutral';
};

const getFriendlySummary = (log) => {
  if (!log) return '';
  const actor = log.user_email ? log.user_email.split('@')[0] : 'System';
  const target = (log.target_type || 'record').replace(/_/g, ' ');
  
  switch (log.action) {
    case 'LOGIN': return `${actor} logged into the system.`;
    case 'CLOCK_IN': return `${actor} clocked in for their shift.`;
    case 'CLOCK_OUT': return `${actor} clocked out from their shift.`;
    case 'SUSPICIOUS_LOCATION': return `A suspicious GPS location was flagged for a shift.`;
    default:
      if (log.action.includes('APPROVE')) return `${actor} approved a ${target} (ID: ${log.target_id || 'N/A'}).`;
      if (log.action.includes('REJECT')) return `${actor} rejected a ${target} (ID: ${log.target_id || 'N/A'}).`;
      if (log.action.includes('CREATE')) return `${actor} created a new ${target}.`;
      if (log.action.includes('UPDATE')) return `${actor} updated a ${target}.`;
      if (log.action.includes('DELETE')) return `${actor} deleted a ${target}.`;
      return `${actor} performed ${formatActionLabel(log.action).toLowerCase()} on ${target}.`;
  }
};

const formatPHT = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).replace(' ', 'T'));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};

// Helper to format values cleanly
const formatValue = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'string') {
    return val.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  return String(val);
};

// Ignore these technical fields
const IGNORED_DIFF_KEYS = ['password', 'updated_at', 'created_at', 'user_agent', 'ip_address', 'id', 'password_last_changed', 'additional_info'];

// Sub-component to render the change list cleanly
const ChangesList = ({ oldRaw, newRaw }) => {
  const [showAll, setShowAll] = useState(false);

  let oldData = {}, newData = {};
  try { oldData = typeof oldRaw === 'string' ? JSON.parse(oldRaw) : (oldRaw || {}); } catch(e){}
  try { newData = typeof newRaw === 'string' ? JSON.parse(newRaw) : (newRaw || {}); } catch(e){}

  // Only look at keys that actually exist in the newData and aren't ignored
  const allKeys = Object.keys(newData).filter(k => !IGNORED_DIFF_KEYS.includes(k));
  
  const changes = allKeys.filter(key => {
    const oldVal = formatValue(oldData[key]);
    const newVal = formatValue(newData[key]);

    // Skip if both are empty
    if (!oldVal && !newVal) return false;
    // Skip if they are exactly the same
    if (oldVal === newVal) return false;

    return true;
  });

  if (changes.length === 0) {
    return <p className="al-no-changes">No major field changes were recorded for this action.</p>;
  }

  const visibleChanges = showAll ? changes : changes.slice(0, 3);

  return (
    <div className="al-diff-list">
      {visibleChanges.map(key => {
        const oldVal = formatValue(oldData[key]);
        const newVal = formatValue(newData[key]);
        
        return (
          <div key={key} className="al-diff-item">
            <span className="al-diff-label">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
            <div className="al-diff-flow">
              <span className={`al-val ${!oldVal ? 'empty' : 'old'}`}>{oldVal || '(Empty)'}</span>
              <span className="al-arrow">→</span>
              <span className={`al-val ${!newVal ? 'empty' : 'new'}`}>{newVal || '(Empty)'}</span>
            </div>
          </div>
        );
      })}
      
      {changes.length > 3 && (
        <button className="al-show-more-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? (
            <><ChevronUp size={14} /> Show less</>
          ) : (
            <><ChevronDown size={14} /> Show {changes.length - 3} more change(s)</>
          )}
        </button>
      )}
    </div>
  );
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
  const [showTechDetails, setShowTechDetails] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/audit-logs`, getAuthHeaders());
      setLogs(res.data);
      setFilteredLogs(res.data);
    } catch (err) {
      toast.error('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = [...logs];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.user_email?.toLowerCase().includes(term) ||
        log.action?.toLowerCase().includes(term) ||
        log.target_type?.toLowerCase().includes(term)
      );
    }
    if (dateFrom) filtered = filtered.filter(log => log.created_at >= dateFrom);
    if (dateTo) {
      const end = new Date(dateTo); end.setDate(end.getDate() + 1);
      filtered = filtered.filter(log => log.created_at < end.toISOString().split('T')[0]);
    }
    if (actionFilter) filtered = filtered.filter(log => log.action === actionFilter);
    
    setFilteredLogs(filtered);
    setCurrentPage(1);
  }, [searchTerm, dateFrom, dateTo, actionFilter, logs]);

  const handleInspect = (log) => {
    setSelectedLog(log);
    setShowTechDetails(false);
    setShowModal(true);
  };

  const totalLogs = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / rowsPerPage));
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const uniqueActions = useMemo(() => [...new Set(logs.map(log => log.action))], [logs]);

  const exportCSV = () => {
    const headers = ['Date (PHT)', 'User', 'Action', 'Summary'];
    const rows = filteredLogs.map(log => [
      formatPHT(log.created_at), log.user_email || 'System', formatActionLabel(log.action), getFriendlySummary(log)
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="expert-container uv-admin-audit">
      <div className="expert-header">
        <div>
          
        
          <p className="expert-subtitle">A simple, chronological record of system activity.</p>
        </div>
        <button className="expert-btn-secondary" onClick={exportCSV}>
          <Download size={16} /> Export Report
        </button>
      </div>

      <div className="uv-admin-metadata"><span><strong>{logs.length}</strong> total activity records</span><span><strong>{filteredLogs.length}</strong> matches current filters</span></div>
      <div className="expert-search-card">
        <div className="al-filters-wrapper">
          <div className="al-filter-group search">
            <Search size={16} className="text-muted" />
            <input
              type="text"
              placeholder="Search by user or action..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="expert-clean-input"
            />
          </div>

          <div className="al-date-flex">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="expert-clean-input border" />
            <span className="al-date-sep">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="expert-clean-input border" />
          </div>

          <select className="expert-clean-input border" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
            <option value="">All Actions</option>
            {uniqueActions.map(action => <option key={action} value={action}>{formatActionLabel(action)}</option>)}
          </select>
        </div>
      </div>

      <div className="expert-card">
        {loading ? (
          <div className="expert-loading">Loading records...</div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
                <thead>
                  <tr>
                    <th style={{ width: '160px' }}>Date & Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th className="text-right">View</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="expert-empty">No records found.</td>
                    </tr>
                  ) : (
                    paginatedLogs.map(log => (
                      <tr key={log.id}>
                        <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
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
                        <td className="text-right">
                          <button type="button" className="al-icon-btn" title="View details" aria-label={`View audit entry ${log.id}`} onClick={event => { event.stopPropagation(); handleInspect(log); }}><Eye size={16} /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalLogs > 0 && (
              <div className="expert-pagination">
                <span className="expert-page-info">Page {currentPage} of {totalPages}</span>
                <div className="expert-page-controls">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="expert-page-btn">
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="expert-page-btn">
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <FormalModal show={showModal} onClose={() => setShowModal(false)} title="Activity Details" footer={<button className="expert-btn-secondary" onClick={() => setShowModal(false)}>Close</button>}>
        {selectedLog && (
          <div className="al-simple-modal">
            
            <div className="al-simple-hero">
             
              <div>
                <h3 className="al-hero-title">{formatActionLabel(selectedLog.action)}</h3>
                <p className="al-hero-desc">{getFriendlySummary(selectedLog)}</p>
              </div>
            </div>

            <div className="al-simple-meta">
              <div className="al-meta-item">
                <User size={14} className="text-muted" />
                <span>{selectedLog.user_email || 'System'}</span>
              </div>
              <div className="al-meta-item">
                <Clock size={14} className="text-muted" />
                <span>{formatPHT(selectedLog.created_at)}</span>
              </div>
            </div>

            {(selectedLog.old_value || selectedLog.new_value) && (
              <div className="al-simple-changes">
                <h4>Changes Made</h4>
                <ChangesList oldRaw={selectedLog.old_value} newRaw={selectedLog.new_value} />
              </div>
            )}

            <div className="al-tech-section">
              <button className="al-tech-toggle" onClick={() => setShowTechDetails(!showTechDetails)}>
                {showTechDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />} 
                {showTechDetails ? 'Hide Technical Details' : 'Show Technical Details'}
              </button>
              
              {showTechDetails && (
                <div className="al-tech-box">
                  <div><strong>IP Address:</strong> {(selectedLog.ip_address || 'N/A').split(',')[0].trim()}</div>
                  <div><strong>Browser/Device:</strong> {selectedLog.user_agent || 'N/A'}</div>
                  <div><strong>Record Type:</strong> {selectedLog.target_type || 'System'}</div>
                  <div><strong>Record ID:</strong> {selectedLog.target_id || 'N/A'}</div>
                </div>
              )}
            </div>

          </div>
        )}
      </FormalModal>
    </div>
  );
};

export default AuditLogs;