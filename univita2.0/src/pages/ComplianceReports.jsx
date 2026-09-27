import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Download, Calendar, FileText, CheckCircle, Clock, ShieldCheck, Award, Users, ShieldAlert } from 'lucide-react';
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
    if (saved) setLastGenerated(new Date(parseInt(saved, 10)));
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/reports/compliance/attendance-compliance`, {
        params: { month, year },
        responseType: 'blob',
        ...getAuthHeaders()
      });

      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `HCT_Attendance_Report_${year}_${String(month).padStart(2, '0')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      const now = Date.now();
      localStorage.setItem('last_compliance_report', now.toString());
      setLastGenerated(new Date(now));

      toast.success('Attendance & Timekeeping Report downloaded.');
    } catch (err) {
      console.error(err);
      let errorMsg = 'Failed to generate attendance report.';
      if (err.response?.status === 401) errorMsg = 'Session expired. Please log in again.';
      else if (err.response?.status === 404) errorMsg = 'No active instructor records found for this period.';
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
    <div className="formal-cr-container">
      <div className="formal-cr-header">
        <div className="formal-cr-title-block">
          <div>
            <p>Generate monthly attendance summaries and DTR timekeeping reports for faculty review and institutional compliance.</p>
          </div>
        </div>
        <div className="formal-cr-security-badge">
          <ShieldCheck size={16} />
          <span>DOLE & NPC Data Compliant</span>
        </div>
      </div>

      <div className="formal-cr-grid">
        {/* Left: Configuration */}
        <div className="formal-cr-card">
          <div className="formal-cr-card-header">
            <h3>Report Scope Parameters</h3>
          </div>
          <div className="formal-cr-card-body">
            <div className="formal-cr-form-row">
              <div className="formal-cr-form-group">
                <label>Target Month</label>
                <div className="formal-cr-input-wrapper">
                  <Calendar size={16} className="formal-cr-icon" />
                  <select 
                    value={month} 
                    onChange={e => setMonth(parseInt(e.target.value, 10))} 
                    disabled={loading}
                  >
                    {monthNames.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="formal-cr-form-group">
                <label>Fiscal Year</label>
                <div className="formal-cr-input-wrapper">
                  <Calendar size={16} className="formal-cr-icon" />
                  <select 
                    value={year} 
                    onChange={e => setYear(parseInt(e.target.value, 10))} 
                    disabled={loading}
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="formal-cr-divider"></div>

            <div className="formal-cr-status-area">
              {lastGenerated ? (
                <div className="formal-cr-status success">
                  <CheckCircle size={16} />
                  <span>Last exported: {lastGenerated.toLocaleString()}</span>
                </div>
              ) : (
                <div className="formal-cr-status neutral">
                  <Clock size={16} />
                  <span>No recent exports on this device.</span>
                </div>
              )}

              <button className="formal-cr-btn-primary" onClick={generateReport} disabled={loading}>
                {loading ? (
                  <>
                    <span className="formal-cr-spinner"></span> Compiling DTR Report...
                  </>
                ) : (
                  <>
                    <Download size={16} /> Export Monthly Report (PDF)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Output Specifications */}
        <div className="formal-cr-card">
          <div className="formal-cr-card-header">
            <h3>Auditing Methodology & Document Specifications</h3>
          </div>
          <div className="formal-cr-card-body bg-light">
            <p className="formal-cr-specs-desc">
              The generated landscape document complies with standard HR timekeeping and NPC privacy standards:
            </p>

            <ul className="formal-cr-specs-list">
              <li>
                <Award size={18} className="specs-icon" />
                <div>
                  <strong>Approved Leave Adjustment</strong>
                  <span>Attendance Rate = Present ÷ (Scheduled − Approved Leave) × 100. Approved leave is excluded from expected shifts.</span>
                </div>
              </li>
              <li>
                <FileText size={18} className="specs-icon" />
                <div>
                  <strong>Unscheduled Faculty Handling</strong>
                  <span>Instructors with zero scheduled shifts are reported as N/A rather than flagged as non-compliant.</span>
                </div>
              </li>
              <li>
                <Users size={18} className="specs-icon" />
                <div>
                  <strong>Unexcused Absence Itemization</strong>
                  <span>Separates authorized leaves from unexcused absences and records late arrivals independently.</span>
                </div>
              </li>
              <li>
                <ShieldAlert size={18} className="specs-icon" />
                <div>
                  <strong>DTR Timekeeping Reference & NPC Notice</strong>
                  <span>Includes primary biometric/geofence references and strict statutory data privacy handling clauses.</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComplianceReports;