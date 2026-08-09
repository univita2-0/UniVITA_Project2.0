import React, { useState } from 'react';
import { Search, Download, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import './VisitorHistory.css';

// Mock data generator to make the table fully functional for demonstration
const generateMockData = () => {
  return Array.from({ length: 215 }, (_, i) => ({
    id: `VIS-${1000 + i}`,
    name: `Visitor Name ${i + 1}`,
    purpose: i % 3 === 0 ? 'Official Business' : i % 2 === 0 ? 'Facility Tour' : 'Meeting',
    date: '2026-08-09',
    timeIn: '08:00 AM',
    timeOut: i % 4 === 0 ? '—' : '11:30 AM',
  }));
};

const VisitorHistory = () => {
  const [data] = useState(generateMockData());
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination State - Defaulted to 10 rows per page
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Search Filter Logic
  const filteredData = data.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.purpose.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleRowsChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to first page when changing row count
  };

  return (
    <div className="vh-container">
      {/* Header Section */}
      <div className="vh-header-section">
        <div>
          <h2 className="vh-title">Visitor History Log</h2>
          <p className="vh-subtitle">Complete archive of all past campus visits and security clearances.</p>
        </div>
        <div className="vh-actions">
          <button className="btn-vh-outline">
            <Filter size={16} /> Filter
          </button>
          <button className="btn-vh-outline">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="vh-card">
        {/* Toolbar with Search Bar */}
        <div className="vh-toolbar">
          <div className="vh-search-box">
            <Search size={16} className="vh-search-icon" />
            <input 
              type="text" 
              placeholder="Search by visitor ID, name, or purpose..." 
              className="vh-search-input"
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
        </div>

        {/* Table Area */}
        <div className="vh-table-wrapper">
          <table className="vh-table">
            <thead>
              <tr>
                <th>Visitor ID</th>
                <th>Name</th>
                <th>Purpose</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
              </tr>
            </thead>
            <tbody>
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="vh-empty-state">
                    No visitors found matching "{searchTerm}".
                  </td>
                </tr>
              ) : (
                currentData.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.id}</strong></td>
                    <td>{row.name}</td>
                    <td>{row.purpose}</td>
                    <td>{row.date}</td>
                    <td>{row.timeIn}</td>
                    <td>{row.timeOut}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Fully Functional Pagination Footer */}
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