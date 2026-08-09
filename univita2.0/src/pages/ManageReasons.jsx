// src/pages/ManageReasons.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, Edit2, Check, X, AlertCircle, FileText } from 'lucide-react';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';
import './ManageReasons.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const ManageReasons = () => {
  const [reasons, setReasons] = useState([]);
  const [newReason, setNewReason] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  const fetchReasons = async () => {
    setFetchLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/visit-reasons`, getAuthHeaders());
      setReasons(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load reasons');
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => { fetchReasons(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newReason.trim()) {
      toast.warning('Please enter a reason');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/visit-reasons`, { reason_text: newReason.trim() }, getAuthHeaders());
      toast.success('Reason added successfully');
      setNewReason('');
      fetchReasons();
    } catch (err) {
      toast.error('Failed to add reason');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      await axios.delete(`${API_BASE}/visit-reasons/${deleteTargetId}`, getAuthHeaders());
      toast.success('Reason deleted');
      setShowDeleteConfirm(false);
      fetchReasons();
    } catch (err) {
      toast.error('Failed to delete reason');
    }
  };

  const startEdit = (id, text) => {
    setEditingId(id);
    setEditValue(text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (id) => {
    if (!editValue.trim()) {
      toast.warning('Reason cannot be empty');
      return;
    }
    try {
      await axios.put(`${API_BASE}/visit-reasons/${id}`, { reason_text: editValue.trim() }, getAuthHeaders());
      toast.success('Reason updated');
      setEditingId(null);
      fetchReasons();
    } catch (err) {
      toast.error('Failed to update reason');
    }
  };

  return (
    <div className="mr-container">
      <div className="mr-header">
        <div>
          <h2 className="mr-title">Visit Reasons</h2>
          <p className="mr-subtitle">Manage appointment reasons available for visitors to select during booking.</p>
        </div>
        <div className="mr-header-icon">
          <FileText size={24} color="#6B7280" />
        </div>
      </div>

      <div className="mr-card">
        {/* Toolbar / Add Form */}
        <div className="mr-card-toolbar">
          <form onSubmit={handleAdd} className="mr-add-form">
            <div className="mr-input-wrapper">
              <input
                id="newReason"
                type="text"
                placeholder="Add new reason (e.g., Facility Tour, Interview)"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="mr-input"
              />
            </div>
            <button type="submit" className="btn-mr-primary" disabled={loading}>
              <Plus size={16} /> <span>{loading ? 'Adding...' : 'Add Reason'}</span>
            </button>
          </form>
          <div className="mr-stats-badge">
            Total Active: <strong>{reasons.length}</strong>
          </div>
        </div>

        {/* Table Area */}
        <div className="mr-table-wrapper">
          {fetchLoading ? (
            <div className="mr-loading-state">Loading reasons...</div>
          ) : reasons.length === 0 ? (
            <div className="mr-empty-state">
              <AlertCircle size={40} className="mr-empty-icon" />
              <p>No reasons configured yet.</p>
              <span>Use the form above to add options for your visitors.</span>
            </div>
          ) : (
            <table className="mr-table">
              <thead>
                <tr>
                  <th>Reason Title</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reasons.map((reason) => (
                  <tr key={reason.id}>
                    <td className="mr-reason-cell">
                      {editingId === reason.id ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="mr-edit-input"
                          autoFocus
                          onKeyDown={(e) => { if(e.key === 'Enter') saveEdit(reason.id); if(e.key === 'Escape') cancelEdit(); }}
                        />
                      ) : (
                        <span className="mr-reason-text">{reason.reason_text}</span>
                      )}
                    </td>
                    <td className="text-right">
                      {editingId === reason.id ? (
                        <div className="mr-action-group">
                          <button className="btn-icon-success" onClick={() => saveEdit(reason.id)} title="Save">
                            <Check size={16} />
                          </button>
                          <button className="btn-icon-neutral" onClick={cancelEdit} title="Cancel">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="mr-action-group">
                          <button className="btn-icon-primary" onClick={() => startEdit(reason.id, reason.reason_text)} title="Edit">
                            <Edit2 size={16} />
                          </button>
                          <button className="btn-icon-danger" onClick={() => handleDelete(reason.id)} title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <FormalModal
        show={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Visit Reason"
        footer={
          <>
            <button className="btn-mr-cancel" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </button>
            <button className="btn-mr-danger" onClick={confirmDelete}>
              Yes, Delete Reason
            </button>
          </>
        }
      >
        <p className="mr-modal-text">Are you sure you want to permanently delete <strong>{reasons.find(r => r.id === deleteTargetId)?.reason_text}</strong>?</p>
        <p className="mr-modal-warning">This action cannot be undone. Visitors will no longer see this reason when booking appointments.</p>
      </FormalModal>
    </div>
  );
};

export default ManageReasons;