import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, Edit3, X, AlertCircle, Search, ChevronLeft, ChevronRight, ShieldAlert, Tag } from 'lucide-react';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';
import FormalModal from '../components/FormalModal';
import './ManageReasons.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const ManageReasons = () => {
  const currentUserRole = getUserRole();
  const isAdmin = currentUserRole === 'admin';
  const canWrite = isAdmin;

  const [reasons, setReasons] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fetchLoading, setFetchLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showAddModal, setShowAddModal] = useState(false);
  const [newReason, setNewReason] = useState('');

  const [showEditModal, setShowEditModal] = useState(false);
  const [editReasonId, setEditReasonId] = useState(null);
  const [editReasonText, setEditReasonText] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const fetchReasons = async () => {
    setFetchLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/visit-reasons`, getAuthHeaders());
      const sorted = res.data.sort((a, b) => b.id - a.id);
      setReasons(sorted);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load visit reasons');
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => { fetchReasons(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!canWrite) return toast.error('Permission denied.');
    if (!newReason.trim()) return toast.warning('Please enter a valid reason.');

    setProcessing(true);
    try {
      await axios.post(`${API_BASE}/visit-reasons`, { reason_text: newReason.trim() }, getAuthHeaders());
      toast.success('Reason added successfully.');
      setNewReason('');
      setShowAddModal(false);
      fetchReasons();
    } catch (err) {
      toast.error('Failed to add reason.');
    } finally {
      setProcessing(false);
    }
  };

  const openEditModal = (id, text) => {
    if (!canWrite) return;
    setEditReasonId(id);
    setEditReasonText(text);
    setShowEditModal(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!canWrite) return toast.error('Permission denied.');
    if (!editReasonText.trim()) return toast.warning('Reason cannot be empty.');

    setProcessing(true);
    try {
      await axios.put(`${API_BASE}/visit-reasons/${editReasonId}`, { reason_text: editReasonText.trim() }, getAuthHeaders());
      toast.success('Reason updated successfully.');
      setShowEditModal(false);
      setEditReasonId(null);
      setEditReasonText('');
      fetchReasons();
    } catch (err) {
      toast.error('Failed to update reason.');
    } finally {
      setProcessing(false);
    }
  };

  const openDeleteModal = (id) => {
    if (!canWrite) return;
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!canWrite) return toast.error('Permission denied.');

    setProcessing(true);
    try {
      await axios.delete(`${API_BASE}/visit-reasons/${deleteTargetId}`, getAuthHeaders());
      toast.success('Reason deleted successfully.');
      setShowDeleteConfirm(false);
      setDeleteTargetId(null);
      fetchReasons();
    } catch (err) {
      toast.error('Failed to delete reason.');
    } finally {
      setProcessing(false);
    }
  };

  const filteredReasons = reasons.filter(r =>
    !searchQuery || r.reason_text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredReasons.length / itemsPerPage);
  const currentReasons = filteredReasons.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="mr-container">
      <div className="mr-header">
        <div>
          
          <p className="mr-subtitle">Manage standardized appointment purposes used on visitor request forms.</p>
        </div>
      </div>

      {!canWrite && (
        <div className="mr-readonly-banner">
          <ShieldAlert size={16} />
          <span>Read-only view. Visit reasons are managed by System Administrators.</span>
        </div>
      )}

      <div className="mr-overview" aria-label="Visit reason summary">
        <div><span>REGISTERED REASONS</span><strong>{reasons.length}</strong><small>Available visit purposes</small></div>
        <div><span>FILTERED RESULTS</span><strong>{filteredReasons.length}</strong><small>Matching current search</small></div>
      </div>

      <div className="mr-card">
        {/* Unified Toolbar */}
        <div className="mr-toolbar">
          <div className="mr-search-wrapper">
            <Search size={16} className="mr-search-icon" />
            <input
              type="text"
              placeholder="Search existing reasons..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="mr-input"
            />
            {searchQuery && <button type="button" className="mr-clear-button" aria-label="Clear search" onClick={() => setSearchQuery('')}><X size={14} /></button>}
          </div>
          
          <div className="mr-toolbar-actions">
            <div className="mr-stats-badge">
              Total: <strong>{reasons.length}</strong>
            </div>
            {canWrite && (
              <button className="mr-btn-primary" onClick={() => setShowAddModal(true)}>
                <Plus size={16} /> Add Reason
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="mr-table-wrapper">
          {fetchLoading ? (
            <div className="mr-loading">Loading visit reasons...</div>
          ) : filteredReasons.length === 0 ? (
            <div className="mr-empty">
              <AlertCircle size={32} className="text-muted" />
              <h4>No visit reasons found</h4>
              <p>
                {searchQuery
                  ? "Try adjusting your search criteria."
                  : "Click 'Add Reason' to configure options for visitors."}
              </p>
            </div>
          ) : (
            <table className="mr-table">
              <thead>
                <tr>
                  <th>Reason Title</th>
                  {canWrite && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {currentReasons.map((reason) => (
                  <tr key={reason.id}>
                    <td>
                      <div className="mr-reason-cell">
                       
                        <span className="mr-reason-text">{reason.reason_text}</span>
                      </div>
                    </td>
                    {canWrite && (
                      <td className="text-right">
                        <div className="mr-action-group">
                          <button className="mr-btn-icon" onClick={() => openEditModal(reason.id, reason.reason_text)} title="Edit">
                            <Edit3 size={16} />
                          </button>
                          <button className="mr-btn-icon danger" onClick={() => openDeleteModal(reason.id)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mr-pagination">
            <span className="mr-page-info">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredReasons.length)} of {filteredReasons.length} entries
            </span>
            <div className="mr-page-controls">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="mr-page-btn">
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="mr-page-current">{currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="mr-page-btn">
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {canWrite && (
        <>
          <FormalModal
            show={showAddModal}
            onClose={() => setShowAddModal(false)}
            title="Add Visit Reason"
            footer={
              <>
                <button className="mr-btn-secondary" onClick={() => setShowAddModal(false)} disabled={processing}>Cancel</button>
                <button className="mr-btn-primary" onClick={handleAdd} disabled={processing}>
                  {processing ? 'Saving...' : 'Save Reason'}
                </button>
              </>
            }
          >
            <div className="mr-form-group">
              <label>Reason Title <span className="mr-req-star">*</span></label>
              <input
                type="text"
                placeholder="e.g., Facility Tour, Interview, Meeting"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                disabled={processing}
                className="mr-input border"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(e); }}
              />
            </div>
          </FormalModal>

          <FormalModal
            show={showEditModal}
            onClose={() => setShowEditModal(false)}
            title="Edit Visit Reason"
            footer={
              <>
                <button className="mr-btn-secondary" onClick={() => setShowEditModal(false)} disabled={processing}>Cancel</button>
                <button className="mr-btn-primary" onClick={handleEdit} disabled={processing}>
                  {processing ? 'Updating...' : 'Save Changes'}
                </button>
              </>
            }
          >
            <div className="mr-form-group">
              <label>Reason Title <span className="mr-req-star">*</span></label>
              <input
                type="text"
                value={editReasonText}
                onChange={(e) => setEditReasonText(e.target.value)}
                disabled={processing}
                className="mr-input border"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(e); }}
              />
            </div>
          </FormalModal>

          <FormalModal
            show={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            title="Delete Visit Reason"
            footer={
              <>
                <button className="mr-btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={processing}>Cancel</button>
                <button className="mr-btn-primary bg-red" onClick={confirmDelete} disabled={processing}>
                  {processing ? 'Deleting...' : 'Confirm Deletion'}
                </button>
              </>
            }
          >
            <div className="mr-confirm-body">
              <p className="mr-confirm-title">
                Are you sure you want to permanently delete <strong>{reasons.find(r => r.id === deleteTargetId)?.reason_text}</strong>?
              </p>
              <div className="mr-confirm-note">
                <AlertCircle size={20} color="#DC2626" />
                <p>
                  Warning: This action cannot be undone. Visitors will no longer see this reason when booking appointments.
                </p>
              </div>
            </div>
          </FormalModal>
        </>
      )}
    </div>
  );
};

export default ManageReasons;