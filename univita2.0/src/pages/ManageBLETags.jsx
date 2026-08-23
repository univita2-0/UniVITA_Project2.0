import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, Cpu, Tag, Search, X, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';
import './ManageBLETags.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const ManageBLETags = () => {
  const [bleTags, setBleTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBleId, setNewBleId] = useState('');
  const [newBleLabel, setNewBleLabel] = useState('');
  const [newBleMac, setNewBleMac] = useState('');

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tagToDelete, setTagToDelete] = useState(null);

  // Reset page on search
  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const fetchBleTags = async () => {
    setInitialLoad(true);
    try {
      const res = await axios.get(`${API_BASE}/ble-tags`, getAuthHeaders());
      // Sort newest to oldest
      const sorted = (res.data || []).sort((a, b) => b.id - a.id);
      setBleTags(sorted);
    } catch (err) { 
      toast.error('Failed to load BLE tags data.'); 
    } finally {
      setInitialLoad(false);
    }
  };

  useEffect(() => { fetchBleTags(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    
    // Strict MAC Address Validation
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macRegex.test(newBleMac.trim())) {
      toast.warning('Invalid MAC Address format. Please use the format XX:XX:XX:XX:XX:XX');
      return;
    }

    if (!newBleId.trim() || !newBleLabel.trim()) {
      toast.warning('BLE ID and Label are required fields.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/ble-tags`, { 
        ble_id: newBleId.trim(), 
        label: newBleLabel.trim(), 
        mac_address: newBleMac.trim().toUpperCase() 
      }, getAuthHeaders());
      
      toast.success('BLE Tag successfully registered.');
      setNewBleId(''); 
      setNewBleLabel(''); 
      setNewBleMac('');
      setShowAddModal(false);
      fetchBleTags();
    } catch (err) { 
      const errorMsg = err.response?.data?.error || 'Failed to register BLE tag.';
      toast.error(errorMsg); 
    } finally { 
      setLoading(false); 
    }
  };

  const confirmDelete = async () => {
    if (!tagToDelete) return;
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/ble-tags/${tagToDelete.id}`, getAuthHeaders());
      toast.success(`BLE Tag deleted successfully.`);
      fetchBleTags();
    } catch (err) { 
      toast.error('Failed to delete the BLE tag. It may be currently in use.'); 
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setTagToDelete(null);
    }
  };

  const triggerDelete = (tag) => {
    setTagToDelete(tag);
    setShowDeleteModal(true);
  };

  // Instant Client-Side Filtering
  const filteredTags = bleTags.filter(tag => {
    const searchString = `${tag.ble_id} ${tag.label} ${tag.mac_address}`.toLowerCase();
    return !searchQuery || searchString.includes(searchQuery.toLowerCase());
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredTags.length / itemsPerPage);
  const currentTags = filteredTags.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Register and manage hardware BLE tags for tracking.</p>
          </div>
        </div>
        <button className="expert-btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> Register New Tag
        </button>
      </div>

      {/* Search Bar */}
      <div className="expert-search-card" style={{ padding: '12px 20px' }}>
        <div className="expert-search-row">
          <div className="expert-search-input-group" style={{ maxWidth: '500px' }}>
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search by BLE ID, Label, or MAC Address..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="expert-clean-input" 
            />
            {searchQuery && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
          </div>
          <div className="bt-stats-badge">
            Total Active Tags: <strong>{bleTags.length}</strong>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="expert-card">
        {initialLoad ? (
          <div className="expert-loading">Loading BLE tags...</div>
        ) : filteredTags.length === 0 ? (
          <div className="expert-empty">
            <Tag size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
            <p>No BLE Tags Found</p>
            {searchQuery ? <span>Try adjusting your search criteria.</span> : <span>Click "Register New Tag" to add hardware.</span>}
          </div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
                <thead>
                  <tr>
                    <th>BLE ID Code</th>
                    <th>Assigned Label</th>
                    <th>MAC Address</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTags.map(tag => (
                    <tr key={tag.id}>
                      <td><strong className="text-dark">{tag.ble_id}</strong></td>
                      <td>{tag.label || '—'}</td>
                      <td><span className="bt-mac-badge">{tag.mac_address}</span></td>
                      <td>
                        <div className="expert-action-group right">
                          <button className="expert-btn-icon danger" onClick={() => triggerDelete(tag)} title="Delete Tag">
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
                <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredTags.length)} of {filteredTags.length} entries</span>
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

      {/* Add Tag Modal */}
      <FormalModal show={showAddModal} onClose={() => setShowAddModal(false)} title="Register BLE Hardware Tag" footer={
        <>
          <button className="expert-btn-secondary" onClick={() => setShowAddModal(false)} disabled={loading}>Cancel</button>
          <button className="expert-btn-primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'Registering...' : 'Register Tag'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="bt-form-group">
            <label>Hardware BLE ID <span className="text-danger">*</span></label>
            <input 
              type="text" 
              placeholder="e.g. BLE-3F-01" 
              value={newBleId} 
              onChange={e => setNewBleId(e.target.value)} 
              disabled={loading}
              className="expert-clean-input border"
              autoFocus
            />
          </div>
          <div className="bt-form-group">
            <label>Assigned Label / Name <span className="text-danger">*</span></label>
            <input 
              type="text" 
              placeholder="e.g. Visitor Badge 1" 
              value={newBleLabel} 
              onChange={e => setNewBleLabel(e.target.value)} 
              disabled={loading}
              className="expert-clean-input border"
            />
          </div>
          <div className="bt-form-group">
            <label>MAC Address <span className="text-danger">*</span></label>
            <input 
              type="text" 
              placeholder="00:1A:2B:3C:4D:5E" 
              value={newBleMac} 
              onChange={e => setNewBleMac(e.target.value)} 
              disabled={loading}
              className="expert-clean-input border font-mono"
            />
          </div>
        </div>
      </FormalModal>

      {/* Delete Confirmation Modal */}
      <FormalModal show={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Hardware Tag" footer={
        <>
          <button className="expert-btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={loading}>Cancel</button>
          <button className="expert-btn-primary bg-red" onClick={confirmDelete} disabled={loading}>
            {loading ? 'Processing...' : 'Yes, Remove Tag'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', padding: '16px 0' }}>
          <ShieldAlert size={48} color="#DC2626" style={{ marginBottom: '8px' }} />
          <p style={{ fontSize: '1.05rem', color: '#0F172A', margin: 0, fontWeight: '500' }}>
            Are you sure you want to permanently delete the BLE tag <strong>{tagToDelete?.ble_id}</strong>?
          </p>
          <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0 }}>
              Removing this hardware tag will unassign it from any active visitors and prevent it from being tracked by the campus receivers.
            </p>
          </div>
        </div>
      </FormalModal>

    </div>
  );
};

export default ManageBLETags;