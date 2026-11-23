import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Download, Calendar, FileText, CheckCircle, Clock, ShieldCheck, Award, Users, ShieldAlert, Layers, BookOpen } from 'lucide-react';
import './ComplianceReports.css';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const readBlobError = async (err) => {
  const data = err?.response?.data;
  if (!data) return null;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed.message || parsed.error || null;
    } catch {
      return null;
    }
  }
  return data.message || data.error || null;
};

const ComplianceReports = () => {
  // ---- Role detection (Fix 10.13) ----
  // The JWT-derived role is the source of truth; do not grant HR access by default.
  const currentUserRole = getUserRole();
  const isAdmin = currentUserRole === 'admin';
  const isHR = currentUserRole === 'hr_admin';
  const canWrite = isHR; // governs PDF generation

  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [printReport, setPrintReport] = useState(null);
  const autoPrintRef = useRef(false);

  const [programs, setPrograms] = useState([]);
  const [courses, setCourses] = useState([]);
  const [programId, setProgramId] = useState('');
  const [courseName, setCourseName] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('last_compliance_report');
    if (saved) setLastGenerated(new Date(parseInt(saved, 10)));
  }, []);

  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        const [progRes, courseRes] = await Promise.all([
          axios.get(`${API_BASE}/programs`, getAuthHeaders()),
          axios.get(`${API_BASE}/courses`, getAuthHeaders())
        ]);
        setPrograms(progRes.data || []);
        setCourses(courseRes.data || []);
      } catch (err) {
        console.error('Failed to load filter data', err);
      }
    };
    fetchFilterData();
  }, []);

  useEffect(() => {
    if (!printReport || !autoPrintRef.current) return;
    autoPrintRef.current = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
    return () => cancelAnimationFrame(frame);
  }, [printReport]);

  const generateReport = async () => {
    // ---- Defense-in-depth: HR only ----
    if (!canWrite) {
      toast.error('You do not have permission to generate compliance reports.');
      return;
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      toast.warning('Please select a valid month (1–12).');
      return;
    }
    const now = new Date();
    if (
      year > now.getFullYear() ||
      (year === now.getFullYear() && month > now.getMonth() + 1)
    ) {
      toast.warning('Cannot generate reports for future periods.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/reports/compliance/attendance-compliance`, {
        params: { month, year, program_id: programId, course: courseName, format: 'json' },
        ...getAuthHeaders()
      });
      if (!response.data?.success || !Array.isArray(response.data?.records)) {
        throw new Error('The compliance source returned invalid report data.');
      }
      autoPrintRef.current = true;
      setPrintReport(response.data);

      const nowMs = Date.now();
      localStorage.setItem('last_compliance_report', nowMs.toString());
      setLastGenerated(new Date(nowMs));

      toast.info('Print preview opened. Select Save as PDF to export the report.');
    } catch (err) {
      console.error(err);
      autoPrintRef.current = false;
      let errorMsg = err.message || 'Failed to generate attendance report.';
      const status = err.response?.status;

      if (status === 401) errorMsg = 'Session expired. Please log in again.';
      else if (status === 403) errorMsg = 'You do not have permission to generate compliance reports.';
      else if (status === 404) errorMsg = 'No active instructor records found for this period.';
      else if (status === 400) {
        const backendMsg = await readBlobError(err);
        errorMsg = backendMsg || 'Invalid report parameters.';
      } else if (!err.response) errorMsg = 'Network error. Please check your connection and try again.';

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

  const filteredCourses = courses.filter(c => !programId || String(c.program_id) === String(programId));

  return (
    <div className="formal-cr-container">
      <div className="formal-cr-header">
        <div className="formal-cr-title-block">
          
          <p>Prepare internal HR attendance and timekeeping summaries for review and printing.</p>
        </div>
        <span className="formal-cr-security-badge">Internal report</span>
      </div>

      {/* ---- Read-only banner ---- */}
      {isAdmin && (
        <p className="formal-cr-readonly-banner">View-only access</p>
      )}

      <div className="formal-cr-grid">
        {/* Left: Configuration */}
        <div className="formal-cr-card">
          <div className="formal-cr-card-header">
            <h3>Report Scope Parameters</h3>
          </div>
          <div className="formal-cr-card-body">
            <div className="formal-cr-form-row">
              <div className="formal-cr-form-group">
                <label>Program Filter (Optional)</label>
                <div className="formal-cr-input-wrapper">
                  <select value={programId} onChange={e => { setProgramId(e.target.value); setCourseName(''); }} disabled={loading || !canWrite}>
                    <option value="">All Programs</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.program_name}</option>)}
                  </select>
                </div>
              </div>

              <div className="formal-cr-form-group">
                <label>Course Filter (Optional)</label>
                <div className="formal-cr-input-wrapper">
                  <select value={courseName} onChange={e => setCourseName(e.target.value)} disabled={loading || !canWrite}>
                    <option value="">All Courses</option>
                    {filteredCourses.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="formal-cr-form-row">
              <div className="formal-cr-form-group">
                <label>Target Month</label>
                <div className="formal-cr-input-wrapper">
                  <select value={month} onChange={e => setMonth(parseInt(e.target.value, 10))} disabled={loading || !canWrite}>
                    {monthNames.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="formal-cr-form-group">
                <label>Fiscal Year</label>
                <div className="formal-cr-input-wrapper">
                  <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} disabled={loading || !canWrite}>
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
                  <span>Last exported: {lastGenerated.toLocaleString()}</span>
                </div>
              ) : (
                <div className="formal-cr-status neutral">
                  <span>No recent exports on this device.</span>
                </div>
              )}

              {/* ---- Generate button — HR only ---- */}
              {canWrite && (
                <button className="formal-cr-btn-primary" onClick={generateReport} disabled={loading}>
                  {loading ? (
                    <><span className="formal-cr-spinner"></span> Preparing Internal Report...</>
                  ) : (
                    <>Print / Save as PDF</>
                  )}
                </button>
              )}
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
              The report template includes the following timekeeping and data-handling elements. Confirm statutory compliance with the responsible officer before official use:
            </p>

            <ul className="formal-cr-specs-list">
              <li>
                <div>
                  <strong>Approved Leave Adjustment</strong>
                  <span>Source formula: Present shifts ÷ (Scheduled shifts − Approved leave days) × 100. Reconcile leave-unit differences and source records before formal sign-off.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Undertime & Equivalent Days</strong>
                  <span>Displays recorded undertime and equivalent days from the report source. Validate calculations and employment rules before using the data for payroll.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Unexcused Absence Itemization</strong>
                  <span>Separates authorized leaves from unexcused absences and records late arrivals independently.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Timekeeping Source & Privacy Notice</strong>
                  <span>Includes a confidential handling notice and document review fields; individual employee DTR acknowledgment is recorded separately.</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {canWrite && printReport && (
        <section className="cr-print-only" aria-label="Monthly attendance and timekeeping summary">
          <div className="cr-document-header">
            <div>
              <h1>HCT ACADEMY</h1>
              <p className="cr-doc-accent">MONTHLY ATTENDANCE AND TIMEKEEPING COMPLIANCE SUMMARY — INTERNAL</p>
              <p>Healthcare Training Center & Clinical Simulation Laboratories</p>
              <p>611 Shaw Boulevard, Pasig City, Metro Manila</p>
            </div>
            <div className="cr-document-meta">
              <strong>REF: ATT-SUM-{printReport.period.year}{String(printReport.period.month).padStart(2, '0')}</strong>
              <span>Period: {new Date(printReport.period.year, printReport.period.month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
              <span>Prepared for: Internal HR Review</span>
              <span>Generated (PHT): {new Date(printReport.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span>
              <span>Scope: {printReport.filters.course || (printReport.filters.program_id ? `Program ${printReport.filters.program_id}` : 'All programs')}</span>
            </div>
          </div>

          <div className="cr-summary">
            <div><span>Faculty Records</span><strong>{printReport.records.length}</strong></div>
            <div><span>Scheduled Hours</span><strong>{printReport.records.reduce((sum, r) => sum + Number(r.scheduled_hours || 0), 0).toFixed(1)} h</strong></div>
            <div><span>Rendered Hours</span><strong>{printReport.records.reduce((sum, r) => sum + Number(r.rendered_hours || 0), 0).toFixed(1)} h</strong></div>
            <div><span>Attendance Rate</span><strong>{(() => {
              const expected = printReport.records.reduce((sum, r) => sum + Math.max(0, Number(r.scheduled_shifts || 0) - Number(r.leave_days || 0)), 0);
              const present = printReport.records.reduce((sum, r) => sum + Number(r.present_shifts || 0), 0);
              return expected > 0 ? `${Math.min(100, present / expected * 100).toFixed(1)}%` : 'N/A';
            })()}</strong></div>
          </div>

          <div className="cr-methodology">
            <strong>REPORT BASIS & LIMITATIONS</strong>
            <p>Source: UniVITA schedules, recorded attendance, approved leave, and overtime requests. Attendance rate uses present shifts divided by scheduled shifts minus approved leave days, where the denominator is positive. Counts and hour totals require source reconciliation; this is not a government-prescribed DTR, an audited certification, or proof of payroll disbursement.</p>
          </div>

          <table className="cr-document-table">
            <thead><tr>
              <th>Employee ID</th><th>Instructor</th><th>Position</th>
              <th>Sched</th><th>Pres</th><th>Late</th><th>UT (min)</th><th>Leave</th>
              <th>Unexc Abs</th><th>Sched Hrs</th><th>Rend Hrs</th><th>Eqv Days</th>
              <th>OT Hrs</th><th>Att Rate</th><th>Verification Status</th>
            </tr></thead>
            <tbody>{printReport.records.map((r, idx) => (
              <tr key={`${r.employee_id}-${idx}`}>
                <td>{r.employee_id}</td><td>{r.full_name}</td><td>{r.position}</td>
                <td>{r.scheduled_shifts}</td><td>{r.present_shifts}</td><td>{r.late_count}</td>
                <td>{r.total_undertime_mins}</td><td>{r.leave_days}</td><td>{r.unexcused_absences}</td>
                <td>{r.scheduled_hours}</td><td>{r.rendered_hours}</td><td>{r.equivalent_days}</td>
                <td>{r.overtime_hours}</td><td>{r.attendance_rate}</td>
                <td>{Number(r.scheduled_shifts) === 0 ? 'NO SCHEDULE DATA' : 'FOR HR REVIEW'}</td>
              </tr>
            ))}</tbody>
          </table>

          <div className="cr-legend">SCHED = scheduled shifts; PRES = recorded present shifts; UT = undertime minutes; UNEXC ABS = derived unexcused absence count; EQV DAYS = rendered hours / 8; OT HRS = approved overtime hours; ATT RATE = derived attendance rate. A zero may indicate no source records, not verified absence.</div>
          <div className="cr-signatures">
            <div><span className="cr-sign-line"/><strong>PREPARED BY: HR REPRESENTATIVE</strong><small>Name / Signature / Date</small></div>
            <div><span className="cr-sign-line"/><strong>REVIEWED BY: DESIGNATED SUPERVISOR</strong><small>Name / Signature / Date</small></div>
            <div><span className="cr-sign-line"/><strong>APPROVED BY: AUTHORIZED SIGNATORY</strong><small>Name / Signature / Date</small></div>
          </div>
          <footer className="cr-document-footer"><strong>CONFIDENTIAL — AUTHORIZED HR AND MANAGEMENT USE ONLY</strong><span>Handle according to HCT Academy records-management policies and the Data Privacy Act of 2012 (RA 10173). Individual daily time records and acknowledgment, when required, are maintained separately.</span></footer>
        </section>
      )}
    </div>
  );
};

export default ComplianceReports;