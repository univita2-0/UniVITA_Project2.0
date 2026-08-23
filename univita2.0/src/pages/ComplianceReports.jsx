import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Download, Calendar, FileText, ShieldCheck, CheckCircle, Clock, FileBadge } from 'lucide-react';
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
    <div className="expert-container">
      {/* Header */}
      <div className="expert-header" style={{ marginBottom: '2.5rem' }}>
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Generate official, audit-ready attendance compliance reports for accreditation.</p>
          </div>
        </div>
        <div className="cr-accreditation-badge">
          <FileBadge size={16} />
          <span>Accreditation Ready format</span>
        </div>
      </div>

      <div className="cr-grid-layout">
        {/* Left: Configuration Panel */}
        <div className="expert-card cr-config-panel">
          <div className="cr-panel-header">
            <div className="cr-panel-icon">
              <FileText size={20} />
            </div>
            <div>
              <h3>Report Configuration</h3>
              <p>Select the target period to compile the attendance metrics.</p>
            </div>
          </div>

          <div className="cr-form-grid">
            <div className="cr-form-group">
              <label>Target Month</label>
              <div className="cr-select-wrapper">
                <Calendar size={18} className="cr-select-icon" />
                <select 
                  value={month} 
                  onChange={e => setMonth(parseInt(e.target.value))} 
                  className="cr-modern-select"
                  disabled={loading}
                >
                  {monthNames.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="cr-form-group">
              <label>Target Year</label>
              <div className="cr-select-wrapper">
                <Calendar size={18} className="cr-select-icon" />
                <select 
                  value={year} 
                  onChange={e => setYear(parseInt(e.target.value))} 
                  className="cr-modern-select"
                  disabled={loading}
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="cr-action-section">
            {lastGenerated ? (
              <div className="cr-status-banner success">
                <CheckCircle size={18} />
                <div className="cr-status-text">
                  <strong>Ready for download</strong>
                  <span>Last generated: {lastGenerated.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="cr-status-banner neutral">
                <Clock size={18} />
                <div className="cr-status-text">
                  <strong>No recent generations</strong>
                  <span>Configure the period above and click generate.</span>
                </div>
              </div>
            )}

            <button className="cr-btn-generate" onClick={generateReport} disabled={loading}>
              {loading ? (
                <>
                  <span className="cr-spinner"></span>
                  <span>Compiling PDF Document...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>Generate Official Report</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: What's Inside / Guidelines */}
        <div className="expert-card cr-guidelines-panel">
          <h3>Report Contents Overview</h3>
          <p className="cr-guideline-desc">
            This document compiles automated metrics to meet strict institutional and accreditation auditing standards.
          </p>

          <ul className="cr-checklist">
            <li>
              <div className="cr-check-icon"><CheckCircle size={16} /></div>
              <div className="cr-check-text">
                <strong>Attendance Summary & Totals</strong>
                <span>Aggregated regular and overtime hours.</span>
              </div>
            </li>
            <li>
              <div className="cr-check-icon"><CheckCircle size={16} /></div>
              <div className="cr-check-text">
                <strong>Detailed Incident Logs</strong>
                <span>Itemized list of late arrivals, absences, and formal leave days.</span>
              </div>
            </li>
            <li>
              <div className="cr-check-icon"><CheckCircle size={16} /></div>
              <div className="cr-check-text">
                <strong>Compliance Rate Calculations</strong>
                <span>Scheduled vs. actual presence metrics calculated per instructor.</span>
              </div>
            </li>
            <li>
              <div className="cr-check-icon"><CheckCircle size={16} /></div>
              <div className="cr-check-text">
                <strong>Department Target Analysis</strong>
                <span>Overall department summary compared to expected SLA targets.</span>
              </div>
            </li>
            <li>
              <div className="cr-check-icon"><CheckCircle size={16} /></div>
              <div className="cr-check-text">
                <strong>Official Formatting</strong>
                <span>Includes formal institution headers, timestamps, and signature lines.</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ComplianceReports;