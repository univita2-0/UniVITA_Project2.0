import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, Edit3, X, AlertCircle, Search, ChevronLeft, ChevronRight, Tags } from 'lucide-react';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';
import './ManageReasons.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const ManageReasons = () => {
  const [reasons, setReasons] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fetchLoading, setFetchLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [newReason, setNewReason] = useState('');

  const [showEditModal, setShowEditModal] = useState(false);
  const [editReasonId, setEditReasonId] = useState(null);
  const [editReasonText, setEditReasonText] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  // Reset page on search
  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const fetchReasons = async () => {
    setFetchLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/visit-reasons`, getAuthHeaders());
      // Sort newest to oldest based on ID
      const sorted = res.data.sort((a, b) => b.id - a.id);
      setReasons(sorted);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load visit reasons');
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => { 
    fetchReasons(); 
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newReason.trim()) {
      toast.warning('Please enter a valid reason.');
      return;
    }
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
    setEditReasonId(id);
    setEditReasonText(text);
    setShowEditModal(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editReasonText.trim()) {
      toast.warning('Reason cannot be empty.');
      return;
    }
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
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
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

  // Instant Client-Side Filtering
  const filteredReasons = reasons.filter(r => 
    !searchQuery || r.reason_text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredReasons.length / itemsPerPage);
  const currentReasons = filteredReasons.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
           
          <div>
            
            <p className="expert-subtitle">Manage the list of official purposes for campus visits.</p>
          </div>
        </div>
        <button className="expert-btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> Add New Reason
        </button>
      </div>

      {/* Search Bar */}
      <div className="expert-search-card" style={{ padding: '12px 20px' }}>
        <div className="expert-search-row">
          <div className="expert-search-input-group" style={{ maxWidth: '500px' }}>
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search existing reasons..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="expert-clean-input" 
            />
            {searchQuery && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
          </div>
          <div className="mr-stats-badge">
            Total Active: <strong>{reasons.length}</strong>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="expert-card">
        {fetchLoading ? (
          <div className="expert-loading">Loading reasons...</div>
        ) : filteredReasons.length === 0 ? (
          <div className="expert-empty">
            <AlertCircle size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
            <p>No visit reasons found.</p>
            {searchQuery ? <span>Try adjusting your search criteria.</span> : <span>Click "Add New Reason" to configure options for visitors.</span>}
          </div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
                <thead>
                  <tr>
                    <th>Reason Title</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentReasons.map((reason) => (
                    <tr key={reason.id}>
                      <td>
                        <span className="font-semibold text-dark">{reason.reason_text}</span>
                      </td>
                      <td>
                        <div className="expert-action-group right">
                          <button className="expert-btn-icon" onClick={() => openEditModal(reason.id, reason.reason_text)} title="Edit">
                            <Edit3 size={18} color="#475569" />
                          </button>
                          <button className="expert-btn-icon danger" onClick={() => openDeleteModal(reason.id)} title="Delete">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="expert-pagination">
                <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredReasons.length)} of {filteredReasons.length} entries</span>
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

      {/* Add Reason Modal */}
      <FormalModal show={showAddModal} onClose={() => setShowAddModal(false)} title="Add Visit Reason" footer={
        <>
          <button className="expert-btn-secondary" onClick={() => setShowAddModal(false)} disabled={processing}>Cancel</button>
          <button className="expert-btn-primary" onClick={handleAdd} disabled={processing}>
            {processing ? 'Saving...' : 'Save Reason'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Reason Title <span className="text-danger">*</span></label>
          <input
            type="text"
            placeholder="e.g., Facility Tour, Interview, Meeting"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            disabled={processing}
            className="expert-clean-input border"
            autoFocus
            onKeyDown={(e) => { if(e.key === 'Enter') handleAdd(e); }}
          />
        </div>
      </FormalModal>

      {/* Edit Reason Modal */}
      <FormalModal show={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Visit Reason" footer={
        <>
          <button className="expert-btn-secondary" onClick={() => setShowEditModal(false)} disabled={processing}>Cancel</button>
          <button className="expert-btn-primary" onClick={handleEdit} disabled={processing}>
            {processing ? 'Updating...' : 'Update Reason'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Reason Title <span className="text-danger">*</span></label>
          <input
            type="text"
            value={editReasonText}
            onChange={(e) => setEditReasonText(e.target.value)}
            disabled={processing}
            className="expert-clean-input border"
            autoFocus
            onKeyDown={(e) => { if(e.key === 'Enter') handleEdit(e); }}
          />
        </div>
      </FormalModal>

      {/* Delete Confirmation Modal */}
      <FormalModal show={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Visit Reason" footer={
        <>
          <button className="expert-btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={processing}>Cancel</button>
          <button className="expert-btn-primary bg-red" onClick={confirmDelete} disabled={processing}>
            {processing ? 'Processing...' : 'Confirm Deletion'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '0.95rem', color: '#334155', margin: 0 }}>
            Are you sure you want to permanently delete <strong>{reasons.find(r => r.id === deleteTargetId)?.reason_text}</strong>?
          </p>
          <div style={{ background: '#FEF2F2', padding: '12px', borderRadius: '8px', border: '1px solid #FECACA', marginTop: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: '#DC2626', margin: 0, fontWeight: '500' }}>
              Warning: This action cannot be undone. Visitors will no longer see this reason when booking appointments.
            </p>
          </div>
        </div>
      </FormalModal>

    </div>
  );
};

export default ManageReasons;