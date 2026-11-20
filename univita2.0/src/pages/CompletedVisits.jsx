// src/pages/CompletedVisits.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Calendar, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_BASE } from '../api';
import './CompletedVisits.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const formatToManilaTime = (timestamp) => {
  if (!timestamp) return '—';
  let safeStamp = timestamp;
  if (typeof timestamp === 'string' && timestamp.includes(' ') && !timestamp.includes('T')) {
    safeStamp = `${timestamp.replace(' ', 'T')}+08:00`; // The API's naive SQL datetime is Philippine local time.
  }
  const date = new Date(safeStamp);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

const formatVisitTime = (timeStr) => {
  if (!timeStr) return '—';
  const [hour, minute] = timeStr.split(':');
  let h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${minute} ${ampm}`;
};

const CompletedVisits = () => {
  const [visitors, setVisitors] = useState([]);
  const [fetchError, setFetchError] = useState('');
  const [loading, setLoading] = useState(false);

  const phToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  });
  const [endDate, setEndDate] = useState(() => phToday());

  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchHistory = useCallback(async () => {
    if (!startDate || !endDate || startDate > endDate) {
      toast.warning('Choose a valid start and end date (start must not follow end).');
      return;
    }
    setLoading(true);
    setFetchError('');
    try {
      const res = await axios.get(`${API_BASE}/visitor-requests/history`, {
        params: { startDate, endDate },
        ...getAuthHeaders()
      });
      setVisitors(Array.isArray(res.data) ? res.data : []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Failed to fetch visitor history', err);
      setVisitors([]);
      const message = err.response?.data?.error || 'Failed to load history';
      setFetchError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const exportToCSV = () => {
    const headers = ['Name', 'Visit Date', 'Checked In', 'Checked Out', 'Duration', 'Destination', 'BLE Tag'];
    const rows = visitors.map(v => [
      `${v.first_name} ${v.last_name}`,
      v.visit_date,
      formatToManilaTime(v.arrived_at),
      formatToManilaTime(v.returned_at),
      v.duration,
      v.destination || '—',
      v.ble_id || '—'
    ]);
    const csvCell = value => {
      const raw = String(value ?? '');
      const safe = /^[\s\uFEFF]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csvContent = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visitor_history_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  const totalPages = Math.ceil(visitors.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentVisitors = visitors.slice(startIndex, startIndex + rowsPerPage);

  const handleRowsChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  return (
    <div className="cv-container">
      <div className="cv-header">
        <div>
          
          <p className="cv-subtitle">Browse historical visitor records and export for reporting.</p>
        </div>
      </div>

      <section className="cv-overview" aria-label="Completed visitor summary">
        <div className="cv-overview-item"><span>Completed visits</span><strong>{visitors.length}</strong><small>Within selected date range</small></div>
        <div className="cv-overview-item"><span>Unique visitors</span><strong>{new Set(visitors.map(v => v.email || `${v.first_name || ''}|${v.last_name || ''}`).filter(Boolean)).size}</strong><small>Distinct visitor records</small></div>
        <div className="cv-overview-item"><span>BLE-tagged visits</span><strong>{visitors.filter(v => v.ble_id).length}</strong><small>Visits with a recorded tag</small></div>
      </section>
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
            <button
              className="btn-export-modern"
              onClick={exportToCSV}
              disabled={loading || Boolean(fetchError) || visitors.length === 0}
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="cv-loading-state">Loading completed visits...</div>
      ) : fetchError ? (
        <div className="cv-empty-state" role="alert"><p>Unable to load completed visits: {fetchError}</p></div>
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
                      <div className="cv-time-text">{formatVisitTime(v.visit_time)}</div>
                    </td>
                    <td className="font-medium text-gray-900">{formatToManilaTime(v.arrived_at)}</td>
                    <td className="font-medium text-gray-900">{formatToManilaTime(v.returned_at)}</td>
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