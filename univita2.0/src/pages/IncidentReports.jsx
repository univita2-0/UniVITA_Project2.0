import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Download, Eye, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';
import './IncidentReports.css';

const phDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const safeText = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const phTime = (value) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(/Z$|[+-]\d\d:\d\d$/.test(String(value)) ? value : `${String(value).replace(' ', 'T')}+08:00`);
  return isNaN(date.getTime()) ? safeText(value) : date.toLocaleString('en-US', {
    timeZone: 'Asia/Manila', year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true
  });
};
const getHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
const typeMeta = {
  instructor: { label:'Instructor Location Incident', description:'GPS status, campus boundary alerts, and suspicious-location flags. These are system observations, not confirmed employee violations.' },
  visitor: { label:'Visitor Tracking Incident', description:'Only visitor history entries explicitly marked as incidents or emergencies are listed. Routine BLE events are not treated as emergencies.' },
  activity: { label:'Visitor Tracking Activity Log', description:'A factual record of visitor BLE tracking entries for the selected date; not an incident or evacuation certification.' }
};
const incidentPattern = /incident|emergency|evacuat|missing|lost|distress|sos|alert|panic/i;
const normaliseGps = (alert) => {
  const message = String(alert.alert_message || '');
  const category = alert.category || (/gps|signal/i.test(message) ? 'GPS Status' : /campus|perimeter/i.test(message) ? 'Geofence' : 'Other');
  const severity = alert.severity || (/lost|off|outside/i.test(message) ? 'warning' : 'information');
  return {
    key:`gps-${alert.id}`, id:alert.id, subject:safeText(alert.full_name || alert.employee_id),
    reference:safeText(alert.employee_id), date:alert.created_at,
    category, severity, description:message, location:safeText(alert.location_name),
    origin:'GPS monitoring alert', verified:false
  };
};
const normaliseSuspicious = (event) => ({
  key:`flag-${event.id}`, id:event.id, subject:safeText(event.full_name || event.employee_id),
  reference:safeText(event.employee_id), date:event.created_at, category:'Suspicious Activity',
  severity:'requires_review', description:Array.isArray(event.flags) && event.flags.length
    ? event.flags.map(flag => `${safeText(flag.reason, 'Flag')}${flag.detail ? ` — ${flag.detail}` : ''}`).join('; ')
    : 'Automated location anomaly was flagged for review',
  location:event.lat != null && event.lon != null ? `${event.lat}, ${event.lon}` : 'Unavailable',
  origin:'System audit flag', verified:false
});
const normaliseVisitor = (event) => ({
  key:`visitor-${event.id}`, id:event.id, subject:safeText(event.visitor_name),
  reference:safeText(event.ble_id, 'No tag specified'), date:event.timestamp || event.created_at,
  category:'Visitor BLE Tracking', severity:incidentPattern.test(String(event.event_type || '')) ? 'requires_review' : 'information',
  description:safeText(event.event_type, 'Tracking observation'),
  location:[event.floor && `Floor ${event.floor}`, event.current_room].filter(Boolean).join(' / ') || 'Unavailable',
  origin:'Visitor tracking history', verified:false
});

const IncidentReports = () => {
  const role = getUserRole();
  // A prop must never grant permissions that are absent from the active session.
  const allowed = ['admin', 'hr_admin', 'security'].includes(role);
  const availableTypes = role === 'admin' ? ['instructor', 'visitor', 'activity']
    : role === 'hr_admin' ? ['instructor'] : role === 'security' ? ['visitor', 'activity'] : [];
  const [type, setType] = useState(availableTypes[0] || '');
  const [date, setDate] = useState(phDay);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const [revision, setRevision] = useState(0);
  const [lastLoaded, setLastLoaded] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    if (!availableTypes.includes(type)) setType(availableTypes[0] || '');
  }, [role, type]);

  useEffect(() => {
    if (!allowed || !type || !availableTypes.includes(type)) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError(''); setRecords([]); setPreview(null); setPrintSnapshot(null);
      try {
        const options = { ...getHeaders(), signal:controller.signal, params:{ date, type } };
        const response = await axios.get(`${API_BASE}/reports/tracking-evidence`, options);
        if (!response.data?.success || !Array.isArray(response.data.records)) {
          throw new Error('The tracking evidence API returned incomplete data.');
        }
        const result = response.data.records;
        if (!controller.signal.aborted) {
          setRecords(result.sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))));
          setLastLoaded(new Date());
        }
      } catch (err) {
        if (controller.signal.aborted || axios.isCancel(err)) return;
        const status = err.response?.status;
        setError(status === 403 ? 'Your account is not authorized to view this report source.'
          : status === 401 ? 'Your session has expired. Sign in again.'
          : err.response?.data?.message || err.message || 'Report records could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [allowed, type, date, revision, role]);

  const selectedType = typeMeta[type];
  const summary = useMemo(() => ({
    count:records.length,
    warnings:records.filter(r => r.severity === 'warning').length,
    reviews:records.filter(r => r.severity === 'requires_review').length
  }), [records]);
  const makeSnapshot = (item) => ({ ...item, period:date, reportType:type, preparedAt:new Date(),
    documentRef:`UNV-${type === 'instructor' ? 'INS' : type === 'visitor' ? 'VIS' : 'ACT'}-${date.replace(/-/g,'')}-${item?.id ?? 'SUMMARY'}` });
  const openPreview = (item) => { setPreview(makeSnapshot(item)); setPrintSnapshot(null); setPrintError(''); };
  const handlePrint = async () => {
    if (!preview || loading || printing || error ||
        !records.some(r => r.key === preview.key)) return;
    setPrinting(true);
    setPrintError('');
    try {
      // The server checks the current JWT role, verifies the record, and
      // writes an audit record before we open the browser print dialog.
      const response = await axios.post(
        `${API_BASE}/reports/tracking-evidence/print-request`,
        { type: preview.reportType, date: preview.period, key: preview.key },
        getHeaders()
      );
      if (!response.data?.success || !response.data?.record) {
        throw new Error('The report print request was not authorized.');
      }
      const snapshot = {
        ...response.data.record,
        period: preview.period,
        reportType: preview.reportType,
        preparedAt: new Date(),
        auditId: response.data.audit_id,
        documentRef: preview.documentRef
      };
      setPrintSnapshot(snapshot);
      // This logs a print REQUEST, not confirmation of a saved PDF.
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    } catch (err) {
      setPrintError(err.response?.data?.message || err.message || 'Unable to authorize report printing.');
    } finally {
      setPrinting(false);
    }
  };

  if (!allowed || !availableTypes.length) return <div className="ir-root" role="alert">Reports access is restricted.</div>;

  return (
    <section className="ir-root">
      <header className="ir-heading">
        <div><h2>Formal Incident &amp; Tracking Reports</h2></div>
        <span className="ir-access"><ShieldCheck size={15}/> {role === 'security' ? 'Security' : role === 'hr_admin' ? 'HR Personnel' : 'Administrator'} scope</span>
      </header>
      <div className="ir-panel ir-filters">
        <label>Report category
          <select value={type} onChange={e => setType(e.target.value)} disabled={loading}>
            {availableTypes.map(key => <option key={key} value={key}>{typeMeta[key].label}</option>)}
          </select>
        </label>
        <label>Event date
          <input type="date" value={date} max={phDay()} disabled={loading} onChange={e => setDate(e.target.value)} />
        </label>
        <button type="button" className="ir-button ir-button-subtle" onClick={() => setRevision(v => v + 1)} disabled={loading}><RefreshCw size={15}/> Refresh</button>
      </div>
      <p className="ir-context">{selectedType?.description}</p>
      <div className="ir-stats">
        <div><span>Recorded events</span><strong>{loading ? '—' : summary.count}</strong></div>
        <div><span>Warnings</span><strong>{loading ? '—' : summary.warnings}</strong></div>
        <div><span>Requires review</span><strong>{loading ? '—' : summary.reviews}</strong></div>
      </div>
      <div className="ir-panel ir-records">
        <div className="ir-records-top"><h3>Available source records</h3><span>{lastLoaded ? `Last refreshed: ${phTime(lastLoaded)}` : 'Not loaded'}</span></div>
        {error ? <div role="alert" className="ir-error"><AlertTriangle size={16}/>{error}</div>
          : loading ? <p className="ir-empty">Loading authoritative tracking records...</p>
          : records.length === 0 ? <p className="ir-empty">{type === 'visitor' ? 'No visitor tracking events explicitly identified as incidents on this date.' : type === 'instructor' ? 'No instructor location alerts or suspicious flags recorded for this date.' : 'No visitor tracking history returned for this date.'} No incident document will be generated.</p>
          : <div className="ir-table-scroll"><table><thead><tr><th>Date / Time</th><th>Person</th><th>Event Category</th><th>Source Observation</th><th>Classification</th><th>Action</th></tr></thead><tbody>
            {records.map(item => <tr key={item.key}>
              <td>{phTime(item.date)}</td><td><b>{item.subject}</b><small>{item.reference}</small></td>
              <td>{item.category}</td><td>{item.description}</td>
              <td><span className={`ir-status ${item.severity}`}>{item.severity === 'requires_review' ? 'Requires Review' : item.severity === 'warning' ? 'Warning' : 'Information'}</span></td>
              <td><button type="button" className="ir-button ir-button-subtle" onClick={() => openPreview(item)}><Eye size={14}/> Preview</button></td>
            </tr>)}
          </tbody></table></div>}
      </div>
      <p className="ir-disclaimer"><AlertTriangle size={14}/> Exported PDFs are browser-generated evidence summaries, not signed or verified incident findings. PDF print requests are recorded in the server audit log. Print-dialog cancellation or successful file saving cannot be verified by the server; formal review and sign-off are separate workflows.</p>

      {preview && <div className="ir-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPreview(null); }}>
        <section className="ir-dialog" role="dialog" aria-modal="true" aria-label="Incident report preview">
          <header><div><h3>Report Preview</h3><span>{preview.documentRef}</span></div><button type="button" className="ir-icon-button" onClick={() => setPreview(null)} aria-label="Close report preview"><X size={18}/></button></header>
          <div className="ir-preview-content">
            <strong>HCT ACADEMY · UNIVITA</strong><h2>{typeMeta[preview.reportType].label}</h2>
            <p>Internal tracking evidence summary · {preview.period}</p>
            <dl><dt>Subject</dt><dd>{preview.subject}</dd><dt>Record identifier</dt><dd>{preview.reference}</dd><dt>Recorded at (PHT)</dt><dd>{phTime(preview.date)}</dd>
              <dt>Category</dt><dd>{preview.category}</dd><dt>Classification</dt><dd>{preview.severity === 'requires_review' ? 'Requires Review' : preview.severity === 'warning' ? 'Warning' : 'Information'}</dd>
              <dt>Location / last known position</dt><dd>{preview.location}</dd><dt>Evidence source</dt><dd>{preview.origin}</dd><dt>Recorded observation</dt><dd>{preview.description}</dd><dt>Verification status</dt><dd>Not independently verified</dd></dl>
            <p className="ir-review-warning">No inference of intentional GPS disabling, visitor disappearance, emergency, or employee misconduct is made from signal interruption or automated flags alone.</p>
          </div>
          {printError && <div className="ir-error" role="alert">{printError}</div>}
          <footer><button type="button" className="ir-button ir-button-subtle" onClick={() => setPreview(null)}>Close</button><button type="button" className="ir-button ir-button-primary" disabled={loading || printing || Boolean(error)} onClick={handlePrint}><Download size={16}/> {printing ? 'Authorizing...' : 'Print / Save as PDF'}</button></footer>
        </section>
      </div>}

      {printSnapshot && <article className="ir-print-only" aria-label="Printable tracking evidence report">
        <header className="ir-document-header">
          <div className="ir-letterhead">
            <strong>HCT ACADEMY</strong>
            <span>Healthcare Training Center &amp; Clinical Simulation Laboratories</span>
            <span>611 Shaw Boulevard, Pasig City, Metro Manila</span>
            <span>UniVITA Information System</span>
          </div>
          <div className="ir-document-control">
            <strong>INTERNAL RECORD</strong>
            <span>Reference: {printSnapshot.documentRef}</span>
            <span>Generated (PHT): {phTime(printSnapshot.preparedAt)}</span>
            <span>Print request audit ID: {printSnapshot.auditId}</span>
          </div>
        </header>

        <div className="ir-document-title">
          <p>INSTITUTIONAL SECURITY AND MONITORING RECORD</p>
          <h1>{typeMeta[printSnapshot.reportType].label}</h1>
          <span>System-generated evidence summary — subject to human verification</span>
        </div>

        <section className="ir-document-section">
          <h2>1. Document Information</h2>
          <table className="ir-document-metadata"><tbody>
            <tr><th>Reporting Date</th><td>{printSnapshot.period}</td><th>Record Classification</th><td>{printSnapshot.severity === 'requires_review' ? 'Requires review' : printSnapshot.severity === 'warning' ? 'Warning' : 'Information'}</td></tr>
            <tr><th>Record Source</th><td>{printSnapshot.origin}</td><th>Verification Status</th><td>Unverified system observation</td></tr>
          </tbody></table>
        </section>

        <section className="ir-document-section">
          <h2>2. Subject and Event Details</h2>
          <table className="ir-document-metadata"><tbody>
            <tr><th>Subject</th><td colSpan="3">{printSnapshot.subject}</td></tr>
            <tr><th>Record Identifier</th><td>{printSnapshot.reference}</td><th>Event Date / Time (PHT)</th><td>{phTime(printSnapshot.date)}</td></tr>
            <tr><th>Event Category</th><td>{printSnapshot.category}</td><th>Recorded Location</th><td>{printSnapshot.location}</td></tr>
          </tbody></table>
        </section>

        <section className="ir-document-section">
          <h2>3. Recorded Observation</h2>
          <div className="ir-document-description">{printSnapshot.description}</div>
          <p className="ir-document-caption">Observation reproduced from the authorized system record. The entry is not independently corroborated by this report.</p>
        </section>

        <section className="ir-document-section">
          <h2>4. Assessment and Evidence Limitations</h2>
          <p className="ir-document-paragraph">This document records the information available from the identified UniVITA source at the time of the authorized print request. It does not establish that an emergency, deliberate GPS disabling, visitor disappearance, or misconduct occurred. Signal loss, location anomalies, and automated classifications require human examination and supporting evidence before any incident determination.</p>
          <p className="ir-document-paragraph"><strong>Recorded assessment:</strong> No independently verified finding is included in this evidence summary.</p>
        </section>

        <section className="ir-document-section ir-review-section">
          <h2>5. Review and Acknowledgment</h2>
          <p className="ir-document-caption">To be completed manually by authorized personnel after reviewing the supporting evidence. Blank fields are not evidence of approval.</p>
          <div className="ir-signature-grid">
            <div><div className="ir-signature-line"/><strong>Prepared / Retrieved By</strong><span>Name, Signature, Date</span></div>
            <div><div className="ir-signature-line"/><strong>Reviewed By</strong><span>Name, Signature, Date</span></div>
            <div><div className="ir-signature-line"/><strong>Acknowledged By</strong><span>Name, Signature, Date</span></div>
          </div>
        </section>

        <footer className="ir-document-footer">
          <strong>CONFIDENTIAL — FOR AUTHORIZED INTERNAL USE ONLY</strong>
          <span>Handle according to institutional records-management procedures and applicable data privacy requirements.</span>
          <span>System-generated document · Print request is audit-logged; successful printing, PDF saving, and sign-off are not verified by the system.</span>
        </footer>
      </article>}
    </section>
  );
};

export default IncidentReports;
