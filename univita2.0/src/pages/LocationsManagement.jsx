// src/pages/LocationsManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit3, Trash2, MapPin } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './LocationsManagement.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const LocationsManagement = () => {
  const [locations, setLocations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteTargetName, setDeleteTargetName] = useState('');
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationForm, setLocationForm] = useState({ name: '', latitude: 0, longitude: 0, radius: 200 });
  const [loading, setLoading] = useState(true);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/school-locations`, getAuthHeaders());
      setLocations(res.data || []);
    } catch (err) {
      console.error("Failed to load locations", err);
      toast.error("Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const resetForm = () => {
    setLocationForm({ name: '', latitude: 0, longitude: 0, radius: 200 });
    setEditingLocation(null);
  };

  const handleEdit = (loc) => {
    setEditingLocation(loc);
    setLocationForm({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude, radius: loc.radius });
    setShowModal(true);
  };

  const handleDeleteClick = (id, name) => {
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await axios.delete(`${API_BASE}/school-locations/${deleteTargetId}`, getAuthHeaders());
      toast.success("Location deleted successfully");
      loadLocations();
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to delete location";
      toast.error(errorMsg);
    } finally {
      setShowConfirm(false);
      setDeleteTargetId(null);
      setDeleteTargetName('');
    }
  };

  const handleSave = async () => {
    if (!locationForm.name.trim()) {
      toast.warning("Location name required");
      return;
    }
    try {
      if (editingLocation) {
        await axios.put(`${API_BASE}/school-locations/${editingLocation.id}`, locationForm, getAuthHeaders());
        toast.success("Location updated successfully");
      } else {
        await axios.post(`${API_BASE}/school-locations`, locationForm, getAuthHeaders());
        toast.success("Location added successfully");
      }
      setShowModal(false);
      resetForm();
      loadLocations();
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Error saving location";
      toast.error(errorMsg);
    }
  };

  return (
    <div className="loc-container">
      <div className="loc-header">
        <div>
          <h2 className="loc-title">Campus Geofencing</h2>
          <p className="loc-subtitle">Manage approved campus boundaries for location tracking and attendance.</p>
        </div>
        <div className="loc-header-actions">
          <button className="btn-loc-primary" onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus size={16} /> <span>Add Location</span>
          </button>
        </div>
      </div>

      <div className="loc-card">
        {loading ? (
          <div className="loc-loading-state">Loading locations...</div>
        ) : (
          <div className="loc-table-wrapper">
            <table className="loc-table">
              <thead>
                <tr>
                  <th>Campus / Location Name</th>
                  <th className="text-center">Latitude</th>
                  <th className="text-center">Longitude</th>
                  <th className="text-center">Radius (m)</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.length === 0 ? (
                  <tr className="loc-empty-row">
                    <td colSpan="5">No locations configured yet.</td>
                  </tr>
                ) : (
                  locations.map(loc => (
                    <tr key={loc.id}>
                      <td className="loc-name-cell">
                        <MapPin size={16} className="loc-pin-icon" />
                        <span className="loc-name-text">{loc.name}</span>
                      </td>
                      <td className="text-center loc-mono-text">{Number(loc.latitude).toFixed(6)}</td>
                      <td className="text-center loc-mono-text">{Number(loc.longitude).toFixed(6)}</td>
                      <td className="text-center">
                        <span className="loc-radius-badge">{loc.radius}m</span>
                      </td>
                      <td className="text-right">
                        <div className="loc-action-group">
                          <button className="btn-icon-edit" onClick={() => handleEdit(loc)} title="Edit Location">
                            <Edit3 size={16} />
                          </button>
                          <button className="btn-icon-delete" onClick={() => handleDeleteClick(loc.id, loc.name)} title="Delete Location">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <FormalModal
        show={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingLocation ? 'Edit Campus Location' : 'Register New Campus'}
        footer={
          <>
            <button className="btn-loc-cancel" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
            <button className="btn-loc-primary" onClick={handleSave}>{editingLocation ? 'Update Coordinates' : 'Save Location'}</button>
          </>
        }
      >
        <div className="loc-form">
          <div className="loc-form-group">
            <label>Location Name</label>
            <input 
              type="text" 
              className="loc-input" 
              value={locationForm.name} 
              onChange={e => setLocationForm(prev => ({ ...prev, name: e.target.value }))} 
              placeholder="e.g. HCT Academy Pasig" 
            />
          </div>
          
          <div className="loc-form-row">
            <div className="loc-form-group">
              <label>Latitude</label>
              <input 
                type="number" 
                className="loc-input loc-mono-input" 
                value={Number(locationForm.latitude).toString()} 
                onChange={e => setLocationForm(prev => ({ ...prev, latitude: parseFloat(e.target.value) || 0 }))} 
                step="any" 
              />
            </div>
            <div className="loc-form-group">
              <label>Longitude</label>
              <input 
                type="number" 
                className="loc-input loc-mono-input" 
                value={Number(locationForm.longitude).toString()} 
                onChange={e => setLocationForm(prev => ({ ...prev, longitude: parseFloat(e.target.value) || 0 }))} 
                step="any" 
              />
            </div>
            <div className="loc-form-group">
              <label>Radius (Meters)</label>
              <input 
                type="number" 
                className="loc-input" 
                value={locationForm.radius} 
                onChange={e => setLocationForm(prev => ({ ...prev, radius: parseInt(e.target.value) || 200 }))} 
                min="50"
              />
            </div>
          </div>
        </div>
      </FormalModal>

      {/* Delete Confirmation Modal */}
      <FormalModal
        show={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Delete Campus Location"
        footer={
          <>
            <button className="btn-loc-cancel" onClick={() => setShowConfirm(false)}>Cancel</button>
            <button className="btn-loc-danger" onClick={confirmDelete}>Yes, Delete Location</button>
          </>
        }
      >
        <p className="loc-modal-text">Are you sure you want to permanently delete <strong>"{deleteTargetName}"</strong>?</p>
        <p className="loc-modal-warning">Warning: This may affect existing instructor schedules and attendance routing logic.</p>
      </FormalModal>
    </div>
  );
};

export default LocationsManagement;