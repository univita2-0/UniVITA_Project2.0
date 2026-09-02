// src/pages/ManageScanners.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Trash2, Cpu, MapPin, Search, X, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { API_BASE } from '../api';
import FormalModal from '../components/FormalModal';
import './ManageScanners.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const FLOOR_3_ROOMS = [
  'AHA Room', 'Private Room', 'Operating Room', 'Delivery Room', 'MICU', 'ICU',
  'Classroom', 'Library', 'Breakout Room 1', 'Breakout Room 2', 'Breakout Room 3',
  'Faculty Room', 'Main Entrance'
];

const FLOOR_5_ROOMS = [
  'Lounge / IV Drip', 'Operating Room', 'Delivery Room', 'ICU', 'Educ Head',
  'Executive', 'Conference', 'Creatives', 'Debrief Room', 'Entrance',
  'AHA Room', 'Classroom 1', 'Classroom 2', 'HR / Admin Finance', 'Pantry'
];

const ManageScanners = () => {
  const [scanners, setScanners] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Add / Edit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newScannerId, setNewScannerId] = useState('');
  const [newAssignedFloor, setNewAssignedFloor] = useState('5');
  const [newAssignedRoom, setNewAssignedRoom] = useState('');

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [scannerToDelete, setScannerToDelete] = useState(null);

  // Reset page on search
  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const fetchScanners = async () => {
    setInitialLoad(true);
    try {
      const res = await axios.get(`${API_BASE}/scanners`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => b.id - a.id);
      setScanners(sorted);
    } catch (err) { 
      toast.error('Failed to load room scanners data.'); 
    } finally {
      setInitialLoad(false);
    }
  };

  useEffect(() => { fetchScanners(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();

    if (!newScannerId.trim() || !newAssignedRoom.trim() || !newAssignedFloor.trim()) {
      toast.warning('All fields are required.');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/scanners`, { 
        scanner_id: newScannerId.trim(), 
        assigned_room: newAssignedRoom.trim(), 
        assigned_floor: newAssignedFloor.trim() 
      }, getAuthHeaders());
      
      toast.success('Scanner successfully saved.');
      setNewScannerId(''); 
      setNewAssignedRoom(''); 
      setNewAssignedFloor('5');
      setShowAddModal(false);
      fetchScanners();
    } catch (err) { 
      const errorMsg = err.response?.data?.error || 'Failed to save scanner configuration.';
      toast.error(errorMsg); 
    } finally { 
      setLoading(false); 
    }
  };

  const confirmDelete = async () => {
    if (!scannerToDelete) return;
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/scanners/${scannerToDelete.id}`, getAuthHeaders());
      toast.success(`Scanner removed successfully.`);
      fetchScanners();
    } catch (err) { 
      toast.error('Failed to delete the scanner.'); 
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setScannerToDelete(null);
    }
  };

  const triggerDelete = (scanner) => {
    setScannerToDelete(scanner);
    setShowDeleteModal(true);
  };

  const handleFloorChange = (floor) => {
    setNewAssignedFloor(floor);
    // Auto-select first room in list for UX smoothness
    const rooms = floor === '3' ? FLOOR_3_ROOMS : FLOOR_5_ROOMS;
    setNewAssignedRoom(rooms[0]);
  };

  // Instant Client-Side Filtering
  const filteredScanners = scanners.filter(scanner => {
    const searchString = `${scanner.scanner_id} ${scanner.assigned_room} ${scanner.assigned_floor}`.toLowerCase();
    return !searchQuery || searchString.includes(searchQuery.toLowerCase());
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredScanners.length / itemsPerPage);
  const currentScanners = filteredScanners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const availableRooms = newAssignedFloor === '3' ? FLOOR_3_ROOMS : FLOOR_5_ROOMS;

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            
            <p className="expert-subtitle">Dynamically configure physical ESP32 scanner boxes and room assignments.</p>
          </div>
        </div>
        <button className="expert-btn-primary" onClick={() => { handleFloorChange('5'); setShowAddModal(true); }}>
          <Plus size={16} /> Register / Assign Scanner
        </button>
      </div>

      {/* Search Bar */}
      <div className="expert-search-card" style={{ padding: '12px 20px' }}>
        <div className="expert-search-row">
          <div className="expert-search-input-group" style={{ maxWidth: '500px' }}>
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search by Scanner ID, Room, or Floor..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="expert-clean-input" 
            />
            {searchQuery && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
          </div>
          <div className="bt-stats-badge">
            Active Scanners: <strong>{scanners.length}</strong>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="expert-card">
        {initialLoad ? (
          <div className="expert-loading">Loading room scanners...</div>
        ) : filteredScanners.length === 0 ? (
          <div className="expert-empty">
            <Cpu size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
            <p>No Room Scanners Found</p>
            {searchQuery ? <span>Try adjusting your search criteria.</span> : <span>Click "Register / Assign Scanner" to map hardware to a room.</span>}
          </div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
                <thead>
                  <tr>
                    <th>Scanner Hardware ID</th>
                    <th>Assigned Floor</th>
                    <th>Assigned Room / Area</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentScanners.map(scanner => (
                    <tr key={scanner.id}>
                      <td><strong className="text-dark">{scanner.scanner_id}</strong></td>
                      <td>
                        <span className="ms-floor-badge">Floor {scanner.assigned_floor}</span>
                      </td>
                      <td>
                        <span className="font-medium text-dark">{scanner.assigned_room}</span>
                      </td>
                      <td>
                        <div className="expert-action-group right">
                          <button 
                            className="expert-btn-icon" 
                            title="Edit Assignment"
                            onClick={() => {
                              setNewScannerId(scanner.scanner_id);
                              setNewAssignedFloor(scanner.assigned_floor);
                              setNewAssignedRoom(scanner.assigned_room);
                              setShowAddModal(true);
                            }}
                          >
                            <MapPin size={18} />
                          </button>
                          <button className="expert-btn-icon danger" onClick={() => triggerDelete(scanner)} title="Remove Scanner">
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
                <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredScanners.length)} of {filteredScanners.length} entries</span>
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

      {/* Add / Edit Scanner Modal */}
      <FormalModal show={showAddModal} onClose={() => setShowAddModal(false)} title="Configure Room Scanner" footer={
        <>
          <button className="expert-btn-secondary" onClick={() => setShowAddModal(false)} disabled={loading}>Cancel</button>
          <button className="expert-btn-primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'Saving...' : 'Save Configuration'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="bt-form-group">
            <label>Physical Scanner ID <span className="text-danger">*</span></label>
            <input 
              type="text" 
              placeholder="e.g. Scanner_A, Scanner_B" 
              value={newScannerId} 
              onChange={e => setNewScannerId(e.target.value)} 
              disabled={loading}
              className="expert-clean-input border"
              autoFocus
            />
            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Must match the <code>scannerID</code> variable programmed into the ESP32 firmware.</span>
          </div>

          <div className="bt-form-group">
            <label>Building Floor <span className="text-danger">*</span></label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input 
                  type="radio" 
                  name="floorGroup" 
                  checked={newAssignedFloor === '3'} 
                  onChange={() => handleFloorChange('3')} 
                /> 3rd Floor
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
                <input 
                  type="radio" 
                  name="floorGroup" 
                  checked={newAssignedFloor === '5'} 
                  onChange={() => handleFloorChange('5')} 
                /> 5th Floor
              </label>
            </div>
          </div>

          <div className="bt-form-group">
            <label>Assigned Room / Area <span className="text-danger">*</span></label>
            <select 
              value={newAssignedRoom} 
              onChange={e => setNewAssignedRoom(e.target.value)} 
              disabled={loading}
              className="expert-clean-input border"
              style={{ cursor: 'pointer' }}
            >
              <option value="">Select Room</option>
              {availableRooms.map(room => (
                <option key={room} value={room}>{room}</option>
              ))}
            </select>
          </div>
        </div>
      </FormalModal>

      {/* Delete Confirmation Modal */}
      <FormalModal show={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Remove Scanner Mapping" footer={
        <>
          <button className="expert-btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={loading}>Cancel</button>
          <button className="expert-btn-primary bg-red" onClick={confirmDelete} disabled={loading}>
            {loading ? 'Processing...' : 'Yes, Remove'}
          </button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', padding: '16px 0' }}>
          <ShieldAlert size={48} color="#DC2626" style={{ marginBottom: '8px' }} />
          <p style={{ fontSize: '1.05rem', color: '#0F172A', margin: 0, fontWeight: '500' }}>
            Are you sure you want to delete scanner <strong>{scannerToDelete?.scanner_id}</strong>?
          </p>
          <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0 }}>
              The physical box will stop reporting room tracking data until it is re-registered in the system.
            </p>
          </div>
        </div>
      </FormalModal>

    </div>
  );
};

export default ManageScanners;