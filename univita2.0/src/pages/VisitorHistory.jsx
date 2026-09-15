// src/pages/VisitorHistory.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Download, Filter, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE } from '../api';
import './VisitorHistory.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

// Helper to format timestamps exactly to Manila Time
const formatToManilaTime = (timestamp) => {
  if (!timestamp) return '—';
  let safeStamp = timestamp;
  if (typeof timestamp === 'string' && timestamp.includes(' ') && !timestamp.includes('T')) {
    safeStamp = timestamp.replace(' ', 'T') + 'Z';
  }
  const date = new Date(safeStamp);
  if (isNaN(date.getTime())) return '—';
  
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  }).format(date);
};

// Helper to render beautiful badges based on movement events
const renderEventBadge = (eventType) => {
  switch(eventType) {
    case 'enter':
    case 'connect':
      return <span style={{ color: '#059669', background: '#ECFDF5', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>Connected</span>;
    case 'move':
      return <span style={{ color: '#D97706', background: '#FFFBEB', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>Moved Room</span>;
    case 'exit':
    case 'disconnect':
      return <span style={{ color: '#DC2626', background: '#FEF2F2', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>Disconnected</span>;
    case 'loitering':
      return <span style={{ color: '#9D174D', background: '#FCE7F3', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>Loitering</span>;
    default:
      return <span style={{ color: '#4B5563', background: '#F3F4F6', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>{eventType}</span>;
  }
};

const VisitorHistory = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  
  // Pagination
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      // Fetches the fine-grained hardware tracking logs
      const res = await axios.get(`${API_BASE}/visitor-history`, getAuthHeaders());
      setData(res.data || []);
    } catch (err) {
      console.error('Failed to load tracking history:', err);
      toast.error('Failed to load tracking history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Combined Filter Logic (Search + Date)
  const filteredData = data.filter(item => {
    // 1. Search Filter
    const matchesSearch = 
      (item.visitor_name && item.visitor_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.ble_id && item.ble_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.current_room && item.current_room.toLowerCase().includes(searchTerm.toLowerCase()));

    // 2. Date Filter
    let matchesDate = true;
    if (selectedDate) {
      let safeStamp = item.timestamp;
      if (typeof safeStamp === 'string' && safeStamp.includes(' ') && !safeStamp.includes('T')) {
        safeStamp = safeStamp.replace(' ', 'T') + 'Z';
      }
      const itemDateObj = new Date(safeStamp);
      if (!isNaN(itemDateObj.getTime())) {
        // Format to local YYYY-MM-DD for accurate day comparison
        const itemDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(itemDateObj);
        matchesDate = itemDateStr === selectedDate;
      } else {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesDate;
  });

  // Calculate Pagination Slices
  const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to page 1 on new search
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setCurrentPage(1); // Reset to page 1 on new date filter
  };

  const handleRowsChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to page 1 on rows change
  };

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Visitor Name', 'BLE Tag', 'Floor', 'Room Detected', 'Event'];
    const rows = filteredData.map(row => [
      formatToManilaTime(row.timestamp).replace(/,/g, ''), // remove commas to prevent CSV breaking
      row.visitor_name || 'Unknown',
      row.ble_id || '—',
      row.floor || '—',
      row.current_room || '—',
      row.event_type || '—'
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `hardware_tracking_log_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="vh-container">
      <div className="vh-header-section">
        <div>
          <h2 className="vh-title">Hardware Tracking Log</h2>
          <p className="vh-subtitle">Complete fine-grained archive of all BLE tag movements and room detections.</p>
        </div>
        <div className="vh-actions">
          <button className="btn-vh-outline" onClick={fetchHistory} disabled={loading}>
            <RefreshCw size={16} /> {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="btn-vh-outline" onClick={exportToCSV} disabled={data.length === 0}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="vh-card">
        <div className="vh-toolbar">
          <div className="vh-toolbar-controls">
            
            {/* Search Box */}
            <div className="vh-search-box">
              <Search size={16} className="vh-search-icon" />
              <input 
                type="text" 
                placeholder="Search by name, tag, or room..." 
                className="vh-search-input"
                value={searchTerm}
                onChange={handleSearch}
              />
            </div>

            {/* Date Filter */}
            <div className="vh-date-filter">
              <Filter size={16} className="vh-filter-icon" />
              <input 
                type="date" 
                className="vh-date-input"
                value={selectedDate}
                onChange={handleDateChange}
              />
              {selectedDate && (
                <button 
                  className="vh-clear-date" 
                  onClick={() => { setSelectedDate(''); setCurrentPage(1); }}
                  title="Clear Date Filter"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            
          </div>
        </div>

        <div className="vh-table-wrapper">
          <table className="vh-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Visitor Name</th>
                <th>BLE Tag</th>
                <th>Floor</th>
                <th>Room Detected</th>
                <th>Event Type</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                 <tr><td colSpan="6" className="vh-empty-state">Loading tracking data...</td></tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="vh-empty-state">
                    No hardware tracking logs found matching your filters.
                  </td>
                </tr>
              ) : (
                currentData.map((row) => (
                  <tr key={row.id}>
                    <td style={{ color: '#4B5563', fontSize: '0.85rem' }}>{formatToManilaTime(row.timestamp)}</td>
                    <td><strong>{row.visitor_name || 'Unknown'}</strong></td>
                    <td style={{ fontFamily: 'monospace', color: '#6B7280' }}>{row.ble_id}</td>
                    <td>{row.floor || '—'}</td>
                    <td>{row.current_room || '—'}</td>
                    <td>{renderEventBadge(row.event_type)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="vh-pagination-footer">
          <div className="vh-rows-selector">
            <span>Rows per page:</span>
            <select 
              className="vh-select"
              value={rowsPerPage} 
              onChange={handleRowsChange}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="vh-page-controls">
            <button 
              className="vh-page-btn" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={18} />
            </button>
            
            <span className="vh-page-info">
              Page {currentPage} of {totalPages}
            </span>
            
            <button 
              className="vh-page-btn" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisitorHistory;