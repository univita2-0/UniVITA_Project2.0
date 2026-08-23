import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Check, X, Search, RefreshCw, CalendarDays, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './LeaveManagement.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const LeaveManagement = () => {
  const [groups, setGroups] = useState([]);
  const [view, setView] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal States
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [remarks, setRemarks] = useState('');
  const [processing, setProcessing] = useState(false);

  // Reset pagination when search or view changes
  useEffect(() => { setCurrentPage(1); }, [searchTerm, view]);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/leave-requests/grouped`, getAuthHeaders());
      // Sort to show newest first
      const all = (res.data || []).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
      setGroups(all);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leave requests');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const openActionModal = (group, action) => {
    setSelectedGroup(group);
    setActionType(action);
    setRemarks('');
    setShowRemarksModal(true);
  };

  const handleBatchAction = async () => {
    if (!selectedGroup) return;
    setProcessing(true);
    try {
      await axios.put(
        `${API_BASE}/leave-requests/batch-status`,
        {
          ids: selectedGroup.ids,
          status: actionType,
          admin_remarks: remarks.trim() || null
        },
        getAuthHeaders()
      );
      toast.success(`${selectedGroup.request_count} leave request(s) ${actionType.toLowerCase()}.`);
      setShowRemarksModal(false);
      fetchGroups();
    } catch (err) {
      console.error(err);
      toast.error('Action failed');
    } finally {
      setProcessing(false);
    }
  };

  const formatDateOnly = (isoString) => {
    if (!isoString) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoString)) return isoString;
    return isoString.split('T')[0];
  };

  const formatDateRange = (start, end) => {
    const startStr = formatDateOnly(start);
    const endStr = formatDateOnly(end);
    if (!startStr) return '';
    if (startStr === endStr) return startStr;
    return `${startStr} – ${endStr}`;
  };

  // Filtering Logic
  const filteredGroups = groups
    .filter(group => view === 'pending' ? group.status === 'Pending' : group.status !== 'Pending')
    .filter(group =>
      !searchTerm ||
      group.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // Pagination Logic
  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const currentGroups = filteredGroups.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const pendingCount = groups.filter(g => g.status === 'Pending').length;
  const historyCount = groups.filter(g => g.status !== 'Pending').length;

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Review and manage employee leave and absence requests.</p>
          </div>
        </div>
        <button className="expert-btn-secondary" onClick={fetchGroups} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin-icon" : ""} /> Refresh Data
        </button>
      </div>

      {/* Control Panel: Tabs & Search */}
      <div className="expert-search-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="lm-controls-wrapper">
          <div className="lm-tabs">
            <button className={`lm-tab ${view === 'pending' ? 'active' : ''}`} onClick={() => setView('pending')}>
              Pending Requests <span className="lm-badge">{pendingCount}</span>
            </button>
            <button className={`lm-tab ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}>
              History <span className="lm-badge">{historyCount}</span>
            </button>
          </div>
          
          <div className="lm-search-container">
            <div className="expert-search-input-group" style={{ maxWidth: '350px', height: '40px', border: 'none', background: 'transparent' }}>
              <Search size={18} className="text-muted" />
              <input
                type="text"
                placeholder="Search name or ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="expert-clean-input"
              />
              {searchTerm && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchTerm('')} />}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="expert-card">
        {loading ? (
          <div className="expert-loading">Loading requests...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="expert-empty">
            <AlertCircle size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
            <p>No {view} leave requests found.</p>
            {searchTerm && <span>Try adjusting your search criteria.</span>}
          </div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
                <thead>
                  <tr>
                    <th>Employee Details</th>
                    <th>Leave Type</th>
                    <th>Date Range</th>
                    <th className="text-center">Duration</th>
                    <th>Reason</th>
                    {view === 'pending' ? <th className="text-right">Actions</th> : <th className="text-center">Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {currentGroups.map(group => (
                    <tr key={group.ids?.[0] || Math.random()}>
                      <td>
                        <div className="font-semibold text-dark">{group.full_name || 'Unknown'}</div>
                        <div className="text-xs text-muted font-mono">{group.employee_id || '—'}</div>
                      </td>
                      <td>
                        <span className="expert-chip default">{group.type || 'Leave'}</span>
                      </td>
                      <td className="font-medium text-dark">{formatDateRange(group.start_date, group.end_date)}</td>
                      <td className="text-center font-semibold text-muted">{group.request_count || 1} day(s)</td>
                      <td className="max-w-xs truncate" title={group.reason}>
                        {group.reason || '—'}
                      </td>
                      {view === 'pending' ? (
                        <td>
                          <div className="expert-action-group right">
                            <button className="lm-action-btn approve" onClick={() => openActionModal(group, 'Approved')}>
                              <Check size={14} /> Approve
                            </button>
                            <button className="lm-action-btn reject" onClick={() => openActionModal(group, 'Rejected')}>
                              <X size={14} /> Reject
                            </button>
                          </div>
                        </td>
                      ) : (
                        <td className="text-center">
                          <span className={`expert-chip ${group.status?.toLowerCase() === 'approved' ? 'success' : group.status?.toLowerCase() === 'rejected' ? 'danger' : 'warning'}`}>
                            {group.status || 'Pending'}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="expert-pagination">
                <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredGroups.length)} of {filteredGroups.length} entries</span>
                <div className="expert-page-controls">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="expert-page-btn"><ChevronLeft size={16} /> Prev</button>
                  <span className="expert-page-current">{currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="expert-page-btn">Next <ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Batch Action Modal */}
      <FormalModal
        show={showRemarksModal}
        onClose={() => setShowRemarksModal(false)}
        title={`${actionType} Leave Request`}
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => setShowRemarksModal(false)} disabled={processing}>Cancel</button>
            <button className={`expert-btn-primary ${actionType === 'Rejected' ? 'bg-red' : ''}`} onClick={handleBatchAction} disabled={processing}>
              {processing ? 'Processing...' : `Confirm ${actionType}`}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: '0.95rem', color: '#334155', margin: 0, lineHeight: '1.6' }}>
              You are about to <strong>{actionType.toLowerCase()}</strong> the leave request for <strong>{selectedGroup?.full_name}</strong>.
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: '4px 0 0 0' }}>
              Dates: <strong>{selectedGroup?.start_date}</strong> to <strong>{selectedGroup?.end_date}</strong> ({selectedGroup?.request_count} days)
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Administrator Remarks (Optional)</label>
            <textarea
              rows="3"
              className="expert-clean-input border"
              placeholder="Add any comments (visible to the employee)..."
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              disabled={processing}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>
      </FormalModal>
    </div>
  );
};

export default LeaveManagement;