import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../api';
import './VisitorIncidentReports.css';

const STATUSES = [
  ['all', 'All statuses'],
  ['pending_review', 'Pending review'],
  ['under_review', 'Under review'],
  ['dismissed', 'Dismissed'],
  ['confirmed_incident', 'Confirmed incident']
];

const formatStatus = value => ({
  pending_review: 'Pending review',
  under_review: 'Under review',
  dismissed: 'Dismissed',
  confirmed_incident: 'Confirmed incident'
}[value] || 'Pending review');

const safeCSV = value => {
  const raw = String(value ?? '');
  const safe = /^[\s\uFEFF]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

const monthRange = month => {
  const [year, number] = month.split('-').map(Number);
  return {
    start: `${month}-01`,
    end: `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, '0')}`
  };
};

const dateText = value => value ? String(value).replace('T', ' ').slice(0, 19) : '—';

const VisitorIncidentReports = ({ month, canExport = false }) => {
  const [status, setStatus] = useState('all');
  const [records, setRecords] = useState([]);
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [evidence, setEvidence] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const requestRef = useRef(0);
  const evidenceRef = useRef(0);

  const load = useCallback(async (signal, requestId) => {
    setLoading(true);
    setError('');
    try {
      const { start, end } = monthRange(month);
      const { data } = await axios.get(`${API_BASE}/visitor-incident-reports`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        params: { startDate: start, endDate: end, status },
        signal
      });
      if (!data?.success || !Array.isArray(data.records)) throw new Error('Invalid report response.');
      if (requestRef.current !== requestId || signal.aborted) return;
      setRecords(data.records);
      setCapped(Boolean(data.capped));
    } catch (err) {
      if (signal.aborted || requestRef.current !== requestId) return;
      setRecords([]);
      setError(err.response?.data?.message || err.message || 'Unable to load visitor incident reports.');
    } finally {
      if (!signal.aborted && requestRef.current === requestId) setLoading(false);
    }
  }, [month, status]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    load(controller.signal, requestId);
    return () => controller.abort();
  }, [load, revision]);

  const totals = useMemo(() => ({
    observations: records.length,
    confirmed: records.filter(r => r.reviewStatus === 'confirmed_incident').length,
    pending: records.filter(r => r.reviewStatus === 'pending_review').length,
    dismissed: records.filter(r => r.reviewStatus === 'dismissed').length
  }), [records]);

  const fetchEvidence = async eventId => {
    const current = ++evidenceRef.current;
    setEvidence(null);
    setEvidenceError('');
    setEvidenceLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/visitor-incident-reports/${eventId}/evidence`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      });
      if (!data?.success || !data.observation || !Array.isArray(data.reviewHistory)) throw new Error('Invalid evidence response.');
      if (current === evidenceRef.current) setEvidence(data);
    } catch (err) {
      if (current === evidenceRef.current) setEvidenceError(err.response?.data?.message || err.message || 'Unable to retrieve evidence.');
    } finally {
      if (current === evidenceRef.current) setEvidenceLoading(false);
    }
  };

  const exportCSV = () => {
    if (!canExport || loading || error || !records.length) return;
    const headers = ['Event ID', 'Observed At (PHT)', 'Visitor', 'BLE Tag', 'Floor', 'Room', 'Observation', 'Review Status', 'Reviewed By', 'Reviewed At (PHT)', 'Review Notes', 'Audit ID'];
    const rows = records.map(r => [r.eventId, r.observedAt, r.visitorName, r.bleId, r.floor, r.room, r.eventType, formatStatus(r.reviewStatus), r.reviewedBy, r.reviewedAt, r.reviewNotes, r.auditId]);
    const contents = '\uFEFF' + [headers, ...rows].map(row => row.map(safeCSV).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Visitor_Incident_Report_${month}_${status}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="vir-root" aria-label="Visitor incident reports">
      <div className="vir-toolbar">
        <div className="vir-toolbar-title">
          <h3>Visitor Incident Reports</h3>
          <p>Reviewed BLE tracking observations for the selected reporting period.</p>
        </div>
        <div className="vir-actions">
          <label>Review status
            <select value={status} onChange={e => setStatus(e.target.value)} disabled={loading}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="vir-button" onClick={() => setRevision(v => v + 1)} disabled={loading}>Refresh</button>
          {canExport && <button type="button" className="vir-button vir-primary" onClick={exportCSV} disabled={loading || Boolean(error) || !records.length}>Export CSV</button>}
        </div>
      </div>

      <div className="vir-stats">
        <div><span>Observations</span><strong>{loading ? '—' : totals.observations}</strong></div>
        <div><span>Confirmed incidents</span><strong>{loading ? '—' : totals.confirmed}</strong></div>
        <div><span>Pending review</span><strong>{loading ? '—' : totals.pending}</strong></div>
        <div><span>Dismissed events</span><strong>{loading ? '—' : totals.dismissed}</strong></div>
      </div>

      {capped && !loading && !error && <p className="vir-note">The report reached the 1,000-record limit. The displayed data and CSV may not include every event in this period.</p>}
      <div className="vir-panel">
        <div className="vir-panel-heading"><h3>Recorded observations</h3><span>{loading ? 'Loading...' : `${records.length} loaded`}</span></div>
        {error ? <p className="vir-error" role="alert">{error}</p> : (
          <div className="vir-table-scroll">
            <table>
              <thead><tr><th>Observed at (PHT)</th><th>Visitor / Tag</th><th>Location</th><th>Event</th><th>Review decision</th><th>Reviewer</th><th>Action</th></tr></thead>
              <tbody>
                {!records.length && <tr><td colSpan="7" className="vir-empty">{loading ? 'Loading report records...' : 'No matching observations for the selected period.'}</td></tr>}
                {records.map(r => <tr key={r.eventId}>
                  <td>{dateText(r.observedAt)}</td>
                  <td><strong>{r.visitorName || 'Unknown visitor'}</strong><small>{r.bleId || 'No tag'}</small></td>
                  <td>Floor {r.floor || '—'}<small>{r.room || '—'}</small></td>
                  <td>{r.eventType === 'signal_lost' ? 'Signal lost' : 'Unexpected room stay'}</td>
                  <td><span className={`vir-status vir-${r.reviewStatus}`}>{formatStatus(r.reviewStatus)}</span></td>
                  <td>{r.reviewedBy || '—'}<small>{dateText(r.reviewedAt)}</small></td>
                  <td><button type="button" className="vir-button" onClick={() => fetchEvidence(r.eventId)}>View evidence</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="vir-disclaimer">Signal interruptions and unusual room stays are system observations, not verified incidents. Only an authorized review marked “Confirmed incident” is counted as confirmed.</p>

      {(evidence || evidenceLoading || evidenceError) && (
        <div className="vir-overlay" onMouseDown={e => { if (e.target === e.currentTarget) { evidenceRef.current++; setEvidence(null); setEvidenceError(''); setEvidenceLoading(false); } }}>
          <div className="vir-dialog" role="dialog" aria-modal="true" aria-label="Visitor event evidence">
            <header><h3>Event Evidence</h3><button type="button" className="vir-button" onClick={() => { evidenceRef.current++; setEvidence(null); setEvidenceError(''); setEvidenceLoading(false); }}>Close</button></header>
            {evidenceLoading ? <p className="vir-empty">Loading evidence...</p> : evidenceError ? <p className="vir-error">{evidenceError}</p> : evidence && (
              <div className="vir-evidence">
                <dl>
                  <dt>Event ID</dt><dd>{evidence.observation.id}</dd>
                  <dt>Visitor</dt><dd>{evidence.observation.visitor_name || 'Unknown visitor'}</dd>
                  <dt>BLE tag</dt><dd>{evidence.observation.ble_id || '—'}</dd>
                  <dt>Observation</dt><dd>{evidence.observation.event_type}</dd>
                  <dt>Location</dt><dd>Floor {evidence.observation.floor || '—'} / {evidence.observation.current_room || '—'}</dd>
                  <dt>Recorded at (PHT)</dt><dd>{dateText(evidence.observation.observed_at)}</dd>
                </dl>
                <h4>Review audit trail</h4>
                {evidence.reviewHistory.length ? (
                  <div className="vir-timeline">{evidence.reviewHistory.map(entry => <article key={entry.auditId}>
                    <strong>{formatStatus(entry.decision?.status)}</strong>
                    <span>{entry.reviewer} · {dateText(entry.reviewedAt)} · Audit #{entry.auditId}</span>
                    <p>{entry.decision?.notes || 'No notes recorded.'}</p>
                  </article>)}</div>
                ) : <p>No review decisions have been recorded.</p>}
                <p className="vir-disclaimer">This record documents a BLE observation and its human review decisions. It does not independently establish misconduct or emergency circumstances.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default VisitorIncidentReports;
