import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';
import FormalModal from '../components/FormalModal';
import './ManageScanners.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

export const FLOOR_3_ROOMS = [ 'Classroom', 'AHA Room', 'Private Room', 'Operating Room', 'Delivery Room', 'NICU', 'ICU', 'Library', 'Breakout Room 1', 'Breakout Room 2', 'Breakout Room 3', 'Faculty Room', 'Main Entrance' ];
export const FLOOR_5_ROOMS = [ 'Lounge / IV Drip', 'Operating Room', 'Delivery Room', 'ICU', 'Educ Head', 'Executive', 'Conference', 'Creatives', 'Debrief Room', 'Lobby', 'Entrance', 'AHA Room', 'Classroom 1', 'Classroom 2', 'HR / Admin', 'Pantry', 'Toilet' ];

const ManageScanners = () => {
  const currentUserRole = getUserRole();
  const isAdmin = currentUserRole === 'admin';
  const isSecurity = currentUserRole === 'security';
  const canWrite = isAdmin || isSecurity;

  const [scanners, setScanners] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showAddModal, setShowAddModal] = useState(false);
  const [newScannerId, setNewScannerId] = useState('');
  const [newAssignedFloor, setNewAssignedFloor] = useState('5');
  const [newAssignedRoom, setNewAssignedRoom] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [scannerToDelete, setScannerToDelete] = useState(null);
  const [editScannerId, setEditScannerId] = useState(null); 

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
    if (!canWrite) return toast.error('Permission denied.');

    if (!newScannerId.trim() || !newAssignedRoom.trim() || !newAssignedFloor.trim()) {
      toast.warning('All fields are required.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        scanner_id: newScannerId.trim(),
        assigned_room: newAssignedRoom.trim(),
        assigned_floor: newAssignedFloor.trim()
      };

      if (editScannerId) {
        await axios.put(`${API_BASE}/scanners/${editScannerId}`, payload, getAuthHeaders());
        toast.success('Scanner updated successfully.');
      } else {
        await axios.post(`${API_BASE}/scanners`, payload, getAuthHeaders());
        toast.success('Scanner added successfully.');
      }

      setNewScannerId('');
      setNewAssignedRoom('');
      setNewAssignedFloor('5');
      setEditScannerId(null);
      setShowAddModal(false);
      fetchScanners();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to save scanner configuration.';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!canWrite) return toast.error('Permission denied.');
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
    if (!canWrite) return;
    setScannerToDelete(scanner);
    setShowDeleteModal(true);
  };

  const handleFloorChange = (floor) => {
    setNewAssignedFloor(floor);
    const rooms = floor === '3' ? FLOOR_3_ROOMS : FLOOR_5_ROOMS;
    setNewAssignedRoom(rooms[0]);
  };

  const filteredScanners = scanners.filter(scanner => {
    const searchString = `${scanner.scanner_id} ${scanner.assigned_room} ${scanner.assigned_floor}`.toLowerCase();
    return !searchQuery || searchString.includes(searchQuery.toLowerCase());
  });

  const totalPages = Math.ceil(filteredScanners.length / itemsPerPage);
  useEffect(() => { setCurrentPage(page => Math.min(page, Math.max(1, totalPages))); }, [totalPages]);
  const currentScanners = filteredScanners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const availableRooms = newAssignedFloor === '3' ? FLOOR_3_ROOMS : FLOOR_5_ROOMS;

  return (
    <div className="expert-container univita-scanner-page">
      <div className="expert-header">
        <div className="expert-title-group">
          <div>
            
            <p className="expert-subtitle">Dynamically configure physical ESP32 scanner boxes and room assignments.</p>
          </div>
        </div>
        <div className="uv-hardware-header-actions">
        {canWrite && (
          <button className="expert-btn-primary" onClick={() => { setEditScannerId(null); handleFloorChange('5'); setShowAddModal(true); }}>
            Assign Scanner
          </button>
        )}
        </div>
      </div>

      {!canWrite && (
        <p className="expert-readonly-banner" role="note">View-only access</p>
      )}

      <section className="uv-hardware-metrics" aria-label="Scanner inventory summary">
        <div className="uv-hardware-metric"><span>Registered scanners</span><strong>{scanners.length}</strong><small>All mapped devices</small></div>
        <div className="uv-hardware-metric"><span>Third floor</span><strong>{scanners.filter(scanner => String(scanner.assigned_floor) === '3').length}</strong><small>Configured scanner units</small></div>
        <div className="uv-hardware-metric"><span>Fifth floor</span><strong>{scanners.filter(scanner => String(scanner.assigned_floor) === '5').length}</strong><small>Configured scanner units</small></div>
      </section>

      <div className="expert-search-card">
        <div className="expert-search-row">
          <div className="expert-search-input-group">
            <Search size={18} className="text-muted" />
            <input
              type="text"
              placeholder="Search by Scanner ID, Room, or Floor..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="expert-clean-input"
            />
            {searchQuery && <button type="button" className="uv-search-clear" aria-label="Clear search" onClick={() => setSearchQuery('')}><X size={16} /></button>}
          </div>
          <div className="expert-stats-badge">
            Showing <strong>{filteredScanners.length}</strong> of {scanners.length}
          </div>
        </div>
      </div>

      <div className="expert-card">
        {initialLoad ? (
          <div className="expert-loading">Loading room scanners...</div>
        ) : filteredScanners.length === 0 ? (
          <div className="expert-empty">
            
            <p>No Room Scanners Found</p>
            {searchQuery ? <span>Try adjusting your search criteria.</span> : canWrite && <span>Click "Assign Scanner" to map hardware to a room.</span>}
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
                    {canWrite && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {currentScanners.map(scanner => (
                    <tr key={scanner.id}>
                      <td><strong className="text-dark">{scanner.scanner_id}</strong></td>
                      <td><span className="ms-floor-badge">Floor {scanner.assigned_floor}</span></td>
                      <td><span className="font-medium text-dark">{scanner.assigned_room}</span></td>
                      {canWrite && (
                        <td>
                          <div className="expert-action-group right">
                            <button
                              className="expert-btn-icon"
                              title="Edit Scanner"
                              onClick={() => {
                                setEditScannerId(scanner.id);
                                setNewScannerId(scanner.scanner_id);
                                setNewAssignedFloor(scanner.assigned_floor);
                                setNewAssignedRoom(scanner.assigned_room);
                                setShowAddModal(true);
                              }}
                            >
                              Edit</button>
                            <button className="expert-btn-icon danger" onClick={() => triggerDelete(scanner)} title="Remove Scanner">
                              Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="expert-pagination">
                <span className="expert-page-info">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredScanners.length)} of {filteredScanners.length} entries
                </span>
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

      {canWrite && (
        <>
          <FormalModal
            show={showAddModal}
            onClose={() => setShowAddModal(false)}
            title="Configure Room Scanner"
            footer={
              <>
                <button className="expert-btn-secondary" onClick={() => setShowAddModal(false)} disabled={loading}>Cancel</button>
                <button className="expert-btn-primary" onClick={handleAdd} disabled={loading}>
                  {loading ? 'Saving...' : 'Save Configuration'}
                </button>
              </>
            }
          >
            <div className="expert-form-stack">
              <div className="expert-form-group">
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
                <span className="expert-form-hint">
                  Must match the <code>scannerID</code> variable programmed into the ESP32 firmware.
                </span>
              </div>

              <div className="expert-form-group">
                <label>Building Floor <span className="text-danger">*</span></label>
                <div className="expert-radio-row">
                  <label className="expert-radio-label">
                    <input
                      type="radio"
                      name="floorGroup"
                      checked={newAssignedFloor === '3'}
                      onChange={() => handleFloorChange('3')}
                    /> 3rd Floor
                  </label>
                  <label className="expert-radio-label">
                    <input
                      type="radio"
                      name="floorGroup"
                      checked={newAssignedFloor === '5'}
                      onChange={() => handleFloorChange('5')}
                    /> 5th Floor
                  </label>
                </div>
              </div>

              <div className="expert-form-group">
                <label>Assigned Room / Area <span className="text-danger">*</span></label>
                <select
                  value={newAssignedRoom}
                  onChange={e => setNewAssignedRoom(e.target.value)}
                  disabled={loading}
                  className="expert-clean-input border"
                >
                  <option value="">Select Room</option>
                  {availableRooms.map(room => (
                    <option key={room} value={room}>{room}</option>
                  ))}
                </select>
              </div>
            </div>
          </FormalModal>

          <FormalModal
            show={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            title="Remove Scanner Mapping"
            footer={
              <>
                <button className="expert-btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={loading}>Cancel</button>
                <button className="expert-btn-primary bg-red" onClick={confirmDelete} disabled={loading}>
                  {loading ? 'Processing...' : 'Yes, Remove'}
                </button>
              </>
            }
          >
            <div className="expert-confirm-body">
              <p className="expert-confirm-title">
                Are you sure you want to delete scanner <strong>{scannerToDelete?.scanner_id}</strong>?
              </p>
              <div className="expert-confirm-note">
                <p>
                  The physical box will stop reporting room tracking data until it is
                  re-registered in the system.
                </p>
              </div>
            </div>
          </FormalModal>
        </>
      )}
    </div>
  );
};

export default ManageScanners;