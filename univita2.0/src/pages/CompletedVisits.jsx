import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Calendar, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_BASE } from '../api';
import './CompletedVisits.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const CompletedVisits = () => {
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Date Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Pagination State
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchHistory = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.warning('Please select both start and end dates');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/visitor-requests/history`, {
        params: { startDate, endDate },
        ...getAuthHeaders()
      });
      setVisitors(res.data);
      setCurrentPage(1); // Reset to first page after a new search
    } catch (err) {
      console.error('Failed to fetch visitor history', err);
      toast.error(err.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const exportToCSV = () => {
    const headers = ['Name', 'Visit Date', 'Checked In', 'Checked Out', 'Duration', 'Destination', 'BLE Tag'];
    const rows = visitors.map(v => [
      `${v.first_name} ${v.last_name}`,
      v.visit_date,
      v.arrived_time,
      v.returned_time,
      v.duration,
      v.destination || '—',
      v.ble_id || '—'
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visitor_history_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  // Pagination Logic
  const totalPages = Math.ceil(visitors.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentVisitors = visitors.slice(startIndex, startIndex + rowsPerPage);

  const handleRowsChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to first page when changing row count
  };

  return (
    <div className="cv-container">
      <div className="cv-header">
        <div>
          <h2 className="cv-title">Completed Visits</h2>
          <p className="cv-subtitle">View and export historical data for visitors who have checked out.</p>
        </div>
      </div>

      <div className="cv-filters-card">
        <div className="cv-filters-wrapper">
          <div className="cv-date-group">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="cv-modern-input"
            />
          </div>
          
          <div className="cv-date-separator">to</div>
          
          <div className="cv-date-group">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="cv-modern-input"
            />
          </div>

          <div className="cv-action-group">
            <button className="btn-search-modern" onClick={fetchHistory} disabled={loading}>
              <Search size={16} /> 
              <span>{loading ? 'Searching...' : 'Search Records'}</span>
            </button>
            <button className="btn-export-modern" onClick={exportToCSV} disabled={visitors.length === 0}>
              <Download size={16} /> 
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="cv-loading-state">Loading completed visits...</div>
      ) : visitors.length === 0 ? (
        <div className="cv-empty-state">
          <Calendar size={40} className="empty-icon" />
          <p>No completed visits found for the selected date range.</p>
        </div>
      ) : (
        <div className="cv-table-wrapper">
          <div className="cv-table-scroll">
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Visitor Name</th>
                  <th>Visit Date</th>
                  <th>Checked In</th>
                  <th>Checked Out</th>
                  <th>Duration</th>
                  <th>Destination</th>
                  <th>BLE Tag</th>
                </tr>
              </thead>
              <tbody>
                {currentVisitors.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div className="cv-name">{v.first_name} {v.last_name}</div>
                      <div className="cv-email">{v.email}</div>
                    </td>
                    <td>
                      <div className="cv-date-text">{v.visit_date}</div>
                      <div className="cv-time-text">{v.visit_time?.slice(0,5)}</div>
                    </td>
                    <td className="font-medium text-gray-900">{v.arrived_time}</td>
                    <td className="font-medium text-gray-900">{v.returned_time}</td>
                    <td>
                      <span className="cv-duration-badge">{v.duration}</span>
                    </td>
                    <td className="cv-destination" title={v.destination}>{v.destination || '—'}</td>
                    <td>{v.ble_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="cv-pagination-footer">
            <div className="cv-rows-selector">
              <span>Rows per page:</span>
              <select 
                className="cv-select"
                value={rowsPerPage} 
                onChange={handleRowsChange}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="cv-page-controls">
              <button 
                className="cv-page-btn" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft size={18} />
              </button>
              
              <span className="cv-page-info">
                Page {currentPage} of {totalPages}
              </span>
              
              <button 
                className="cv-page-btn" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompletedVisits;