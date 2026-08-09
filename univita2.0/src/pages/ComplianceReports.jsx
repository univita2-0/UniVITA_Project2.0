// src/pages/ComplianceReports.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Download, Calendar, FileText, ShieldCheck, CheckCircle, TrendingUp, ChevronDown } from 'lucide-react';
import './ComplianceReports.css';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const ComplianceReports = () => {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('last_compliance_report');
    if (saved) setLastGenerated(new Date(parseInt(saved)));
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/reports/compliance/attendance-compliance`, {
        params: { month, year },
        responseType: 'blob',
        ...getAuthHeaders()
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_compliance_${year}_${String(month).padStart(2, '0')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      const now = Date.now();
      localStorage.setItem('last_compliance_report', now);
      setLastGenerated(new Date(now));

      toast.success('Report downloaded successfully');
    } catch (err) {
      console.error(err);
      let errorMsg = 'Failed to generate report. Please try again.';
      if (err.response?.status === 401) errorMsg = 'Session expired. Please log in again.';
      else if (err.response?.data?.error) errorMsg = err.response.data.error;
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleString('default', { month: 'long' })
  );
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="cr-container">
      <div className="cr-header">
        <div>
          <h2 className="cr-title">Compliance Reports</h2>
          <p className="cr-subtitle">Audit-ready attendance compliance reports for accreditation.</p>
        </div>
        <div className="cr-badge">
          <ShieldCheck size={16} />
          <span>Accreditation Ready</span>
        </div>
      </div>

      <div className="cr-grid">
        {/* Main Report Card */}
        <div className="cr-card main-card">
          <div className="cr-card-icon teal">
            <FileText size={20} />
          </div>
          <h3>Attendance Compliance</h3>
          <p className="cr-card-desc">
            Summarizes instructor attendance, late arrivals, leave days, and compliance rate
            for the selected month. Includes scheduled vs. actual presence metrics.
          </p>

          <div className="cr-filters-wrapper">
            <div className="cr-filter-group">
              <label>Target Month</label>
              <div className="cr-select-container">
                <Calendar size={16} className="cr-select-icon" />
                <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="cr-select">
                  {monthNames.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>{name}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="cr-chevron-icon" />
              </div>
            </div>
            
            <div className="cr-filter-group">
              <label>Target Year</label>
              <div className="cr-select-container">
                <Calendar size={16} className="cr-select-icon" />
                <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="cr-select">
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="cr-chevron-icon" />
              </div>
            </div>
          </div>

          <div className="cr-action-footer">
            {lastGenerated ? (
              <div className="cr-last-generated">
                <CheckCircle size={14} />
                <span>Last generated: {lastGenerated.toLocaleString()}</span>
              </div>
            ) : (
              <div className="cr-last-generated empty">No previous generation found.</div>
            )}

            <button className="btn-generate-report" onClick={generateReport} disabled={loading}>
              {loading ? (
                <>
                  <span className="cr-spinner"></span>
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Generate & Download</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* What's Inside Card */}
        <div className="cr-card info-card">
          <div className="cr-card-icon slate">
            <TrendingUp size={20} />
          </div>
          <h3>Report Contents Overview</h3>
          <ul className="cr-features-list">
            <li>
              <CheckCircle size={14} className="feature-icon" />
              <span>Instructor attendance summary and totals</span>
            </li>
            <li>
              <CheckCircle size={14} className="feature-icon" />
              <span>Detailed log of late arrivals & leave days</span>
            </li>
            <li>
              <CheckCircle size={14} className="feature-icon" />
              <span>Compliance rate calculations per instructor</span>
            </li>
            <li>
              <CheckCircle size={14} className="feature-icon" />
              <span>Overall department summary compared to targets</span>
            </li>
            <li>
              <CheckCircle size={14} className="feature-icon" />
              <span>Formal institution headers & signature lines</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ComplianceReports;