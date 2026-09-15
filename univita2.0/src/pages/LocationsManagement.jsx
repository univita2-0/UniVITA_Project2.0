import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit3, Trash2, MapPin, Search, X, ChevronLeft, ChevronRight, AlertCircle, Crosshair } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './LocationsManagement.css';

// Fix for Leaflet marker icons in React
const customMarker = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Component to handle map clicks and automatically set coordinates
const MapInteraction = ({ setLocationForm }) => {
  useMapEvents({
    click(e) {
      setLocationForm(prev => ({
        ...prev,
        latitude: parseFloat(e.latlng.lat.toFixed(6)),
        longitude: parseFloat(e.latlng.lng.toFixed(6))
      }));
    },
  });
  return null;
};

// Component to dynamically pan the map when search coordinates change
const MapUpdater = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.flyTo(center, 16);
    }
  }, [center, map]);
  return null;
};

const LocationsManagement = () => {
  const [locations, setLocations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationForm, setLocationForm] = useState({ name: '', latitude: 0, longitude: 0, radius: 200 });
  
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteTargetName, setDeleteTargetName] = useState('');

  // Map Search States
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [searchingMap, setSearchingMap] = useState(false);

  // Default Map Center (Pasay City / Manila Area)
  const defaultCenter = [14.5378, 121.0014]; 

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/school-locations`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => b.id - a.id);
      setLocations(sorted);
    } catch (err) {
      toast.error("Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const resetForm = () => {
    setLocationForm({ name: '', latitude: 0, longitude: 0, radius: 200 });
    setMapSearchQuery('');
    setEditingLocation(null);
  };

  const handleEdit = (loc) => {
    setEditingLocation(loc);
    setLocationForm({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude, radius: loc.radius });
    setMapSearchQuery('');
    setShowModal(true);
  };

  const handleDeleteClick = (id, name) => {
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setProcessing(true);
    try {
      await axios.delete(`${API_BASE}/school-locations/${deleteTargetId}`, getAuthHeaders());
      toast.success("Location deleted successfully");
      loadLocations();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete location");
    } finally {
      setProcessing(false);
      setShowConfirm(false);
      setDeleteTargetId(null);
      setDeleteTargetName('');
    }
  };

  const handleSave = async () => {
    if (!locationForm.name.trim()) return toast.warning("Location name required");
    if (locationForm.latitude === 0 || locationForm.longitude === 0) return toast.warning("Please pin a valid location on the map.");
    
    setProcessing(true);
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
      toast.error(err.response?.data?.error || "Error saving location");
    } finally {
      setProcessing(false);
    }
  };

  // OpenStreetMap Nominatim Geocoding Search
  const searchMapLocation = async (e) => {
    e.preventDefault();
    if (!mapSearchQuery.trim()) return;
    setSearchingMap(true);
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapSearchQuery)}`);
      if (res.data && res.data.length > 0) {
        const { lat, lon } = res.data[0];
        setLocationForm(prev => ({
          ...prev,
          latitude: parseFloat(lat),
          longitude: parseFloat(lon)
        }));
        toast.success("Location found!");
      } else {
        toast.warning("Location not found. Try a different search term.");
      }
    } catch (err) {
      toast.error("Failed to search map.");
    } finally {
      setSearchingMap(false);
    }
  };

  const filteredLocations = locations.filter(loc => 
    !searchQuery || loc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredLocations.length / itemsPerPage);
  const currentLocations = filteredLocations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const mapCenter = locationForm.latitude && locationForm.longitude 
    ? [locationForm.latitude, locationForm.longitude] 
    : defaultCenter;

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Manage approved campus boundaries for location tracking and attendance.</p>
          </div>
        </div>
        <button className="expert-btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus size={16} /> Register New Campus
        </button>
      </div>

      {/* Search Bar */}
      <div className="expert-search-card" style={{ padding: '12px 20px' }}>
        <div className="expert-search-row">
          <div className="expert-search-input-group" style={{ maxWidth: '500px' }}>
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search locations..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="expert-clean-input" 
            />
            {searchQuery && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
          </div>
          <div className="expert-stats-badge">
            Total Locations: <strong>{locations.length}</strong>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="expert-card">
        {loading ? (
          <div className="expert-loading">Loading locations...</div>
        ) : filteredLocations.length === 0 ? (
          <div className="expert-empty">
            <AlertCircle size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
            <p>No locations found.</p>
            {searchQuery ? <span>Try adjusting your search criteria.</span> : <span>Click "Register New Campus" to configure options.</span>}
          </div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
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
                  {currentLocations.map(loc => (
                    <tr key={loc.id}>
                      <td>
                        <span className="font-semibold text-dark">{loc.name}</span>
                      </td>
                      <td className="text-center font-mono text-muted">{Number(loc.latitude).toFixed(6)}</td>
                      <td className="text-center font-mono text-muted">{Number(loc.longitude).toFixed(6)}</td>
                      <td className="text-center">
                        <span className="expert-chip default">{loc.radius}m</span>
                      </td>
                      <td>
                        <div className="expert-action-group right">
                          <button className="expert-btn-icon" onClick={() => handleEdit(loc)} title="Edit Location">
                            <Edit3 size={18} color="#475569" />
                          </button>
                          <button className="expert-btn-icon danger" onClick={() => handleDeleteClick(loc.id, loc.name)} title="Delete Location">
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
                <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLocations.length)} of {filteredLocations.length} entries</span>
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

      {/* Add/Edit Location Map Modal */}
      <FormalModal
        show={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingLocation ? 'Edit Campus Location' : 'Register New Campus'}
        wide
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => { setShowModal(false); resetForm(); }} disabled={processing}>Cancel</button>
            <button className="expert-btn-primary" onClick={handleSave} disabled={processing}>
              {processing ? 'Saving...' : (editingLocation ? 'Update Location' : 'Save Location')}
            </button>
          </>
        }
      >
        <div className="loc-modal-split">
          
          {/* Left Panel: Form Fields */}
          <div className="loc-form-panel">
            <div className="loc-form-group">
              <label>Location Name <span className="text-danger">*</span></label>
              <input 
                type="text" 
                className="expert-clean-input border" 
                value={locationForm.name} 
                onChange={e => setLocationForm(prev => ({ ...prev, name: e.target.value }))} 
                placeholder="e.g. Main Campus Building" 
                disabled={processing}
              />
            </div>
            
            <div className="loc-form-group">
              <label>Geofence Radius (Meters) <span className="text-danger">*</span></label>
              <input 
                type="number" 
                className="expert-clean-input border" 
                value={locationForm.radius} 
                onChange={e => setLocationForm(prev => ({ ...prev, radius: parseInt(e.target.value) || 50 }))} 
                min="50"
                disabled={processing}
              />
              <span className="loc-hint-text">Adjust this to cover the entire campus boundary.</span>
            </div>

            <div className="loc-coordinates-box">
              <div className="loc-form-group">
                <label>Latitude</label>
                <input 
                  type="number" 
                  className="expert-clean-input border font-mono text-muted" 
                  value={Number(locationForm.latitude).toString()} 
                  onChange={e => setLocationForm(prev => ({ ...prev, latitude: parseFloat(e.target.value) || 0 }))} 
                  step="any" 
                  disabled={processing}
                />
              </div>
              <div className="loc-form-group">
                <label>Longitude</label>
                <input 
                  type="number" 
                  className="expert-clean-input border font-mono text-muted" 
                  value={Number(locationForm.longitude).toString()} 
                  onChange={e => setLocationForm(prev => ({ ...prev, longitude: parseFloat(e.target.value) || 0 }))} 
                  step="any" 
                  disabled={processing}
                />
              </div>
            </div>
            
            <div className="loc-info-alert">
              <Crosshair size={18} />
              <span>You can manually edit the coordinates above or simply <strong>click anywhere on the map</strong> to drop a pin.</span>
            </div>
          </div>

          {/* Right Panel: Interactive Map */}
          <div className="loc-map-panel">
            <form onSubmit={searchMapLocation} className="loc-map-search">
              <div className="expert-search-input-group" style={{ height: '40px' }}>
                <Search size={16} className="text-muted" />
                <input 
                  type="text" 
                  placeholder="Search map for address or landmark..." 
                  value={mapSearchQuery}
                  onChange={e => setMapSearchQuery(e.target.value)}
                  className="expert-clean-input"
                  style={{ fontSize: '0.85rem' }}
                />
                <button type="submit" className="loc-map-search-btn" disabled={searchingMap}>
                  {searchingMap ? 'Searching...' : 'Find'}
                </button>
              </div>
            </form>

            <div className="loc-map-container">
              <MapContainer 
                center={mapCenter} 
                zoom={15} 
                scrollWheelZoom={true} 
                style={{ height: '100%', width: '100%', zIndex: 0 }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <MapInteraction setLocationForm={setLocationForm} />
                <MapUpdater center={mapCenter} />
                
                {locationForm.latitude !== 0 && locationForm.longitude !== 0 && (
                  <>
                    <Marker position={[locationForm.latitude, locationForm.longitude]} icon={customMarker} />
                    <Circle 
                      center={[locationForm.latitude, locationForm.longitude]} 
                      radius={locationForm.radius || 200}
                      pathOptions={{ color: '#0D9488', fillColor: '#0D9488', fillOpacity: 0.2 }}
                    />
                  </>
                )}
              </MapContainer>
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
            <button className="expert-btn-secondary" onClick={() => setShowConfirm(false)} disabled={processing}>Cancel</button>
            <button className="expert-btn-primary bg-red" onClick={confirmDelete} disabled={processing}>
              {processing ? 'Processing...' : 'Yes, Delete Location'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '0.95rem', color: '#334155', margin: 0 }}>
            Are you sure you want to permanently delete <strong>"{deleteTargetName}"</strong>?
          </p>
          <div style={{ background: '#FEF2F2', padding: '12px', borderRadius: '8px', border: '1px solid #FECACA', marginTop: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: '#DC2626', margin: 0, fontWeight: '500' }}>
              Warning: This may affect existing instructor schedules and attendance routing logic.
            </p>
          </div>
        </div>
      </FormalModal>
    </div>
  );
};

export default LocationsManagement;