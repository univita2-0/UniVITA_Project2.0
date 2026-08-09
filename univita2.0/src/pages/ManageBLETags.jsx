import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, Cpu, Tag, Wifi, ShieldAlert } from 'lucide-react';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';
import './ManageBLETags.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const ManageBLETags = () => {
  const [bleTags, setBleTags] = useState([]);
  const [newBleId, setNewBleId] = useState('');
  const [newBleLabel, setNewBleLabel] = useState('');
  const [newBleMac, setNewBleMac] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tagToDelete, setTagToDelete] = useState(null);

  const fetchBleTags = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ble-tags`, getAuthHeaders());
      setBleTags(res.data || []);
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
    try {
      await axios.delete(`${API_BASE}/ble-tags/${tagToDelete.id}`, getAuthHeaders());
      toast.success(`BLE Tag ${tagToDelete.ble_id} deleted successfully.`);
      fetchBleTags();
    } catch (err) { 
      toast.error('Failed to delete the BLE tag. It may be in use.'); 
    } finally {
      setShowDeleteModal(false);
      setTagToDelete(null);
    }
  };

  const triggerDelete = (tag) => {
    setTagToDelete(tag);
    setShowDeleteModal(true);
  };

  return (
    <div className="mble-container">
      <div className="mble-header-section">
        <div className="mble-title-area">
          <h2 className="mble-title">Hardware Management: BLE Tags</h2>
          <p className="mble-subtitle">Register and manage Bluetooth Low Energy tags for real-time campus tracking.</p>
        </div>
        <div className="mble-stats-badge">
          <Wifi size={16} /> Active Tags: <strong>{bleTags.length}</strong>
        </div>
      </div>

      <div className="mble-card">
        {/* Registration Toolbar */}
        <div className="mble-toolbar">
          <div className="mble-toolbar-header">
            <h3><Cpu size={18} /> Register New BLE Tag</h3>
          </div>
          <form onSubmit={handleAdd} className="mble-form">
            <div className="mble-form-group">
              <label>Hardware BLE ID</label>
              <input 
                type="text" 
                placeholder="e.g. BLE-3F-01" 
                value={newBleId} 
                onChange={e => setNewBleId(e.target.value)} 
                required 
                className="mble-input"
              />
            </div>
            <div className="mble-form-group">
              <label>Assigned Label / Name</label>
              <input 
                type="text" 
                placeholder="e.g. Visitor Badge 1" 
                value={newBleLabel} 
                onChange={e => setNewBleLabel(e.target.value)} 
                required
                className="mble-input"
              />
            </div>
            <div className="mble-form-group">
              <label>MAC Address</label>
              <input 
                type="text" 
                placeholder="00:1A:2B:3C:4D:5E" 
                value={newBleMac} 
                onChange={e => setNewBleMac(e.target.value)} 
                required 
                className="mble-input mble-mono"
              />
            </div>
            <div className="mble-form-action">
              <button type="submit" className="btn-mble-primary" disabled={loading}>
                <Plus size={16} /> Add Hardware Tag
              </button>
            </div>
          </form>
        </div>

        {/* Tags Table Area */}
        <div className="mble-table-wrapper">
          <table className="mble-table">
            <thead>
              <tr>
                <th>BLE ID Code</th>
                <th>Assigned Label</th>
                <th>MAC Address</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialLoad ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="mble-row-empty">
                    <td><div className="mble-skeleton short"></div></td>
                    <td><div className="mble-skeleton medium"></div></td>
                    <td><div className="mble-skeleton long"></div></td>
                    <td className="text-right"><div className="mble-skeleton square"></div></td>
                  </tr>
                ))
              ) : bleTags.length === 0 ? (
                <tr>
                  <td colSpan="4">
                    <div className="mble-empty-state">
                      <Tag size={32} className="mble-empty-icon" />
                      <p>No BLE Tags Registered</p>
                      <span>Use the form above to add your first hardware tag.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                bleTags.map(tag => (
                  <tr key={tag.id}>
                    <td><strong>{tag.ble_id}</strong></td>
                    <td>{tag.label}</td>
                    <td><span className="mble-mac-badge">{tag.mac_address}</span></td>
                    <td className="text-right">
                      <button className="btn-mble-danger-icon" onClick={() => triggerDelete(tag)} title="Delete Tag">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formal Delete Confirmation Modal */}
      <FormalModal
        show={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Hardware Tag"
        footer={
          <>
            <button className="btn-mble-cancel" onClick={() => setShowDeleteModal(false)}>Cancel</button>
            <button className="btn-mble-danger" onClick={confirmDelete}>Yes, Remove Tag</button>
          </>
        }
      >
        <div className="mble-modal-content">
          <ShieldAlert size={40} className="mble-modal-icon" />
          <p className="mble-modal-text">
            Are you sure you want to permanently delete the BLE tag <strong>{tagToDelete?.ble_id}</strong>?
          </p>
          <p className="mble-modal-warning">
            Removing this hardware tag will unassign it from any active visitors and prevent it from being tracked by the campus receivers.
          </p>
        </div>
      </FormalModal>
    </div>
  );
};

export default ManageBLETags;