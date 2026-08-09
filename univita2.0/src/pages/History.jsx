import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Eye, Clock, X, Calendar as CalendarIcon, Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { toast } from 'react-toastify';
import { API_BASE } from '../api';
import './History.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const History = () => {
  const [historyData, setHistoryData] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [initialLoad, setInitialLoad] = useState(true);

  // Pagination State
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Modal state
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [updating, setUpdating] = useState(false);
  const [isPastAppointment, setIsPastAppointment] = useState(false);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/appointments/history`, getAuthHeaders());
      setHistoryData(res.data);
    } catch (err) {
      console.error("Error fetching history:", err);
      toast.error('Failed to load request history.');
    } finally {
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Filter Logic
  const filteredData = historyData.filter(item => {
    const matchesDate = !selectedDate || new Date(item.visit_date).toISOString().split('T')[0] === selectedDate;
    const searchString = `${item.first_name} ${item.last_name} ${item.email} ${item.reason}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());
    return matchesDate && matchesSearch;
  });

  // Pagination Logic
  const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleRowsChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const openDetails = (appointment) => {
    setSelectedAppointment(appointment);
    const visitDate = appointment.visit_date?.split('T')[0] || '';
    setEditDate(visitDate);
    setEditTime(appointment.visit_time?.substring(0,5) || '');
    
    const today = new Date().toISOString().split('T')[0];
    setIsPastAppointment(visitDate < today);
    
    setShowDetailModal(true);
  };

  const handleUpdate = async () => {
    if (!editDate || !editTime) {
      toast.warning('Please provide both date and time.');
      return;
    }
    setUpdating(true);
    try {
      await axios.put(`${API_BASE}/appointments/${selectedAppointment.id}`, {
        visit_date: editDate,
        visit_time: editTime
      }, getAuthHeaders());
      toast.success('Appointment schedule updated successfully.');
      setShowDetailModal(false);
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to update schedule.');
    } finally {
      setUpdating(false);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '—';
    const [hour, minute] = timeStr.split(':');
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minute} ${ampm}`;
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return 'Select date';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="his-container">
      {/* Header Section */}
      <div className="his-header-section">
        <div className="his-title-area">
          <h2 className="his-title">Visitor Request History</h2>
          <p className="his-subtitle">Review and manage past and upcoming visitor appointment requests.</p>
        </div>
      </div>

      <div className="his-card">
        {/* Toolbar */}
        <div className="his-toolbar">
          <div className="his-search-box">
            <Search size={16} className="his-search-icon" />
            <input 
              type="text" 
              placeholder="Search names, emails, or reasons..." 
              className="his-search-input"
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>

          <div className="his-filters">
            <div className="his-date-picker">
              <CalendarIcon size={16} className="his-date-icon" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setCurrentPage(1); }}
                className="his-date-input"
              />
              {selectedDate && (
                <button className="his-clear-date" onClick={() => { setSelectedDate(''); setCurrentPage(1); }} title="Clear date filter">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Area */}
        <div className="his-table-wrapper">
          <table className="his-table">
            <thead>
              <tr>
                <th>Visitor Details</th>
                <th>Purpose of Visit</th>
                <th>Schedule</th>
                <th className="text-center">Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {initialLoad ? (
                [...Array(rowsPerPage)].map((_, i) => (
                  <tr key={i} className="his-row-empty">
                    <td><div className="his-skeleton medium"></div><div className="his-skeleton short mt-1"></div></td>
                    <td><div className="his-skeleton long"></div></td>
                    <td><div className="his-skeleton medium"></div></td>
                    <td className="text-center"><div className="his-skeleton short mx-auto"></div></td>
                    <td className="text-right"><div className="his-skeleton square"></div></td>
                  </tr>
                ))
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="his-empty-state">
                    No visit requests found matching your filters.
                  </td>
                </tr>
              ) : (
                currentData.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="his-guest-name">{item.first_name} {item.last_name}</div>
                      <div className="his-guest-email">{item.email}</div>
                    </td>
                    <td><span className="his-purpose-text">{item.reason}</span></td>
                    <td>
                      <div className="his-schedule-text">
                        <span>{new Date(item.visit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <span className="his-time-subtext">{formatTime(item.visit_time)}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <span className={`his-status-badge ${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <button className="btn-his-icon" onClick={() => openDetails(item)} title="View Details">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="his-pagination-footer">
          <div className="his-rows-selector">
            <span>Rows per page:</span>
            <select 
              className="his-select"
              value={rowsPerPage} 
              onChange={handleRowsChange}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="his-page-controls">
            <button 
              className="his-page-btn" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="his-page-info">Page {currentPage} of {totalPages}</span>
            <button 
              className="his-page-btn" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Appointment Details Modal */}
      <FormalModal
        show={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Appointment Request Details"
        footer={
          <>
            <button className="btn-his-cancel" onClick={() => setShowDetailModal(false)}>Close</button>
            {!isPastAppointment && (
              <button className="btn-his-primary" onClick={handleUpdate} disabled={updating}>
                {updating ? 'Saving Changes...' : 'Save Schedule Changes'}
              </button>
            )}
          </>
        }
      >
        {selectedAppointment && (
          <div className="his-modal-content">
            <div className="his-modal-grid">
              <div className="his-modal-item">
                <label>Visitor Name</label>
                <p>{selectedAppointment.first_name} {selectedAppointment.last_name}</p>
              </div>
              <div className="his-modal-item">
                <label>Contact Email</label>
                <p>{selectedAppointment.email}</p>
              </div>
              <div className="his-modal-item">
                <label>Phone Number</label>
                <p>{selectedAppointment.phone || 'Not provided'}</p>
              </div>
              <div className="his-modal-item">
                <label>Current Status</label>
                <p><span className={`his-status-badge ${selectedAppointment.status.toLowerCase()}`}>{selectedAppointment.status}</span></p>
              </div>
            </div>

            <div className="his-modal-section">
              <label>Purpose of Visit</label>
              <div className="his-modal-box">{selectedAppointment.reason}</div>
            </div>

            {isPastAppointment ? (
              <div className="his-alert-box warning">
                <Clock size={16} />
                <span>This appointment is in the past and its schedule cannot be modified.</span>
              </div>
            ) : (
              <div className="his-modal-section">
                <label>Update Schedule</label>
                <div className="his-edit-grid">
                  <div className="his-edit-group">
                    <span className="his-edit-label"><CalendarIcon size={14} /> Date</span>
                    <input 
                      type="date" 
                      className="his-edit-input" 
                      value={editDate} 
                      onChange={(e) => setEditDate(e.target.value)} 
                      min={new Date().toISOString().split('T')[0]} 
                    />
                  </div>
                  <div className="his-edit-group">
                    <span className="his-edit-label"><Clock size={14} /> Time</span>
                    <input 
                      type="time" 
                      className="his-edit-input" 
                      value={editTime} 
                      onChange={(e) => setEditTime(e.target.value)} 
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedAppointment.admin_notes && (
              <div className="his-modal-section">
                <label>Administrator Notes</label>
                <div className="his-modal-box">{selectedAppointment.admin_notes}</div>
              </div>
            )}
          </div>
        )}
      </FormalModal>
    </div>
  );
};

export default History;