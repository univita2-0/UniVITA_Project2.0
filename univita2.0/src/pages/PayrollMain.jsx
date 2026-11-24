// UniVITA / PayrollMain.jsx — cutoff-aware HR interface.
// Requires the matching server.js and SQL changes described in the delivery notes.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight, Search, X, RefreshCw, LockKeyhole } from 'lucide-react';
import { API_BASE } from '../api';
import './PayrollMain.css';
import { getUserRole } from '../permissions';

const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
const payrollAuth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('payroll_token')}` } });
const money = v => `₱${Number(v || 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2})}`;
const displayDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-PH', {month:'short',day:'numeric',year:'numeric'});
const periodFor = (year, month, cutoff) => {
  const mm = String(month).padStart(2,'0');
  if (cutoff === '11-25') return { label: `${months[month-1]} ${year} | 11-25`, start: `${year}-${mm}-11`, end:`${year}-${mm}-25` };
  const prior = new Date(year,month-2,26);
  const yy = prior.getFullYear(), pm = String(prior.getMonth()+1).padStart(2,'0');
  return {label:`${months[month-1]} ${year} | 26-10`, start:`${yy}-${pm}-26`, end:`${year}-${mm}-10`};
};
const fields = [
  ['transport_allowance','Transport allowance'], ['meal_allowance','Meal allowance'],
  ['housing_allowance','Housing allowance'], ['bonus','Bonus / 13th month (approved amount)'],
  ['mbf_deduction','MBF deduction'], ['loan_deduction','Loan / advances'],
  ['other_deduction','Other authorized deductions']
];
const blankAdjustments = () => Object.fromEntries(fields.map(([key])=>[key,'0']));
const showApiError = e => e?.response?.data?.message || e?.response?.data?.error || e.message || 'Request failed.';

const PayrollMain = ({ setView, onLock, onChangePin, onShowHistory }) => {
  const isHR = getUserRole() === 'hr_admin';
  const now = new Date();
  const [month,setMonth] = useState(now.getMonth()+1);
  const [year,setYear] = useState(now.getFullYear());
  const [cutoff,setCutoff] = useState(now.getDate() > 10 ? '11-25' : '26-10');
  const [people,setPeople] = useState([]);
  const [history,setHistory] = useState([]);
  const [query,setQuery] = useState('');
  const [page,setPage] = useState(1);
  const [loading,setLoading] = useState(false);
  const [selected,setSelected] = useState(null);
  const [adjustments,setAdjustments] = useState(blankAdjustments);
  const [preview,setPreview] = useState(null);
  const [previewSource,setPreviewSource] = useState(null);
  const [busy,setBusy] = useState(false);
  const [batchOpen,setBatchOpen] = useState(false);
  const [batchBusy,setBatchBusy] = useState(false);
  const [periodError,setPeriodError] = useState('');
  const period = useMemo(()=>periodFor(year,month,cutoff),[year,month,cutoff]);
  const currentDay = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const incomplete = period.end > currentDay;
  const records = useMemo(()=>new Map(history.filter(x=>x.month_year===period.label).map(x=>[Number(x.user_id),x])),[history,period.label]);

  const load = useCallback(async()=>{
    if (!isHR) return;
    setLoading(true);
    try {
      const [a,b]= await Promise.all([
        axios.get(`${API_BASE}/employees`,auth()),
        axios.get(`${API_BASE}/payroll/history`,auth())
      ]);
      if (!Array.isArray(a.data)||!Array.isArray(b.data)) throw new Error('The server returned an invalid payroll response.');
      // Historical records remain available even after employment separation.
      setPeople(a.data.filter(x=>String(x.role||'').toLowerCase()==='instructor' && !['deleted','archived'].includes(String(x.status||'').toLowerCase())));
      setHistory(b.data);
      setPeriodError('');
    } catch(e){setPeriodError(showApiError(e));toast.error(showApiError(e));}
    finally{setLoading(false);}
  },[isHR]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{setPage(1);setSelected(null);setPreview(null);},[year,month,cutoff,query]);
  const matching=people.filter(x=>[x.full_name,x.employee_id,x.position_level].some(v=>String(v||'').toLowerCase().includes(query.toLowerCase())));
  const pages=Math.max(1,Math.ceil(matching.length/10));
  const visible=matching.slice((Math.min(page,pages)-1)*10,Math.min(page,pages)*10);
  const finalized=[...records.values()];
  const totals=finalized.reduce((a,r)=>({gross:a.gross+Number(r.gross_pay||0),net:a.net+Number(r.net_pay||0)}),{gross:0,net:0});
  const lock=()=>{localStorage.removeItem('payroll_token');if(onLock)onLock();else if(setView)setView('payroll');};
  const shiftMonth=d=>{const date=new Date(year,month-1+d,1);setYear(date.getFullYear());setMonth(date.getMonth()+1);};
  const openEmployee=emp=>{
    setSelected(emp);setPreview(null);setPreviewSource(null);
    const record=records.get(Number(emp.id));
    const values=blankAdjustments();
    if(record) Object.keys(values).forEach(k=>{values[k]=String(record[k]??0);});
    setAdjustments(values);
  };
  const parseAdjustments=()=>{
    const output={};
    for(const [key] of fields){
      const value=String(adjustments[key]??'').trim();
      if(!/^\d+(?:\.\d{1,2})?$/.test(value)||Number(value)>1000000) throw new Error(`${key.replaceAll('_',' ')} must be between 0 and 1,000,000 with up to 2 decimals.`);
      output[key]=Number(value);
    }
    return output;
  };
  const getPayload=()=>({ user_id: selected.id, month_year:period.label,...parseAdjustments() });
  const canPrepare = person => String(person?.employment_status || 'active').toLowerCase() === 'active' && String(person?.status || 'active').toLowerCase() === 'active';
  const calculate=async()=>{
    if(!selected || records.has(Number(selected.id)) || !canPrepare(selected))return;
    setBusy(true);
    try{
      const data=(await axios.post(`${API_BASE}/payroll/preview`,getPayload(),payrollAuth())).data;
      if(!data.success||!data.calculated)throw new Error('Server did not return a verified calculation.');
      setPreview(data.calculated);setPreviewSource(data.source||null);
      toast.success('Server payroll preview ready.');
    } catch(e){setPreview(null);toast.error(showApiError(e));if([401,403].includes(e.response?.status))lock();}
    finally{setBusy(false);}
  };
  const finalize=async()=>{
    if(!selected||!preview||records.has(Number(selected.id))||incomplete||!canPrepare(selected))return;
    if(!window.confirm(`Finalize ${selected.full_name} for ${period.label}?\n\nNet pay (last server preview): ${money(preview.net_pay)}\nThe server recalculates the cutoff during finalization. Review the resulting saved record before payment confirmation.`))return;
    setBusy(true);
    try{
      const data=(await axios.post(`${API_BASE}/payroll/finalize`,getPayload(),payrollAuth())).data;
      if(!data.success)throw new Error(data.message||'Finalization failed.');
      toast.success('Payroll finalized and awaiting actual payment.');setSelected(null);await load();
    }catch(e){toast.error(showApiError(e));if([401,403].includes(e.response?.status))lock();}
    finally{setBusy(false);}
  };
  const confirmPaid=async rec=>{
    if(rec.status!=='pending'||!window.confirm(`Confirm actual disbursement of ${money(rec.net_pay)}? This is not an electronic fund transfer.`))return;
    setBusy(true);
    try{
      const data=(await axios.post(`${API_BASE}/payroll/${rec.id}/mark-paid`,{confirm_paid:true},payrollAuth())).data;
      if(!data.success)throw new Error(data.message||'Payment confirmation failed.');
      toast.success('Payment confirmation recorded.');await load();
    }catch(e){toast.error(showApiError(e));}finally{setBusy(false);}
  };
  const runBatch=async()=>{
    if(incomplete)return toast.error('Wait until the cutoff period has ended.');
    setBatchBusy(true);
    try{
      const data=(await axios.post(`${API_BASE}/payroll/run-cutoff`,{month_year:period.label},payrollAuth())).data;
      if(!data.success)throw new Error(data.message||'Batch failed.');
      toast.success(`${data.processed} payroll record(s) finalized; ${data.skipped} skipped.`);setBatchOpen(false);await load();
    }catch(e){toast.error(showApiError(e));}finally{setBatchBusy(false);}
  };
  const exportRemittance=()=>{
    if(!finalized.length)return toast.warning('No finalized cutoff records to export.');
    const headers=['Employee ID','Name','Cutoff','SSS contribution','PhilHealth','Pag-IBIG','MBF','Tax'];
    const esc=value=>{const str=String(value??'');return `"${(/^[\s]*[=+@\-]/.test(str)?"'":"")+str.replaceAll('"','""')}"`;};
    const data=[headers.join(','),...finalized.map(r=>[
      r.employee_id,r.full_name,r.month_year,r.sss_deduction,r.philhealth_deduction,
      r.pagibig_deduction,r.mbf_deduction||0,r.tax_deduction
    ].map(esc).join(','))].join('\r\n');
    const href=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=href;a.download=`UniVITA_Remittance_${year}_${String(month).padStart(2,'0')}_${cutoff}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
  };
  const printSavedPayslip=()=>{
    if(!saved)return toast.warning('Finalize the payroll before printing an official payslip.');
    const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const rows=[
      ['Hourly rate',money(saved.salary_rate)],['Payable hours',String(saved.total_hours||0)],
      ['Overtime',money(saved.overtime_pay)],['Transport',money(saved.transport_allowance)],
      ['Meal',money(saved.meal_allowance)],['Housing',money(saved.housing_allowance)],
      ['Bonus',money(saved.bonus)],['Gross pay',money(saved.gross_pay)],
      ['SSS',money(saved.sss_deduction)],['PhilHealth',money(saved.philhealth_deduction)],
      ['Pag-IBIG',money(saved.pagibig_deduction)],['MBF',money(saved.mbf_deduction)],
      ['Tax',money(saved.tax_deduction)],['Loans',money(saved.loan_deduction)],
      ['Other deductions',money(saved.other_deduction)],['Late deductions',money(saved.late_deduction)],
      ['NET TAKE-HOME PAY',money(saved.net_pay)]
    ];
    const w=window.open('','_blank','width=800,height=900');
    if(!w)return toast.error('Enable pop-ups to print the payslip.');
    w.document.write(`<html><head><title>UniVITA Payslip</title><style>body{font:13px Arial,sans-serif;max-width:700px;margin:35px auto;color:#0f172a}h1{text-align:center}p{text-align:center}table{width:100%;border-collapse:collapse}td{padding:9px 7px;border-bottom:1px solid #ddd}td:last-child{text-align:right}tr:last-child{font-weight:bold;font-size:17px;border-top:2px solid black}@media print{body{margin:12mm}}</style></head><body><h1>HCT ACADEMY — PAYSLIP</h1><p>${escape(selected.full_name)} (${escape(selected.employee_id)})</p><p>${escape(period.label)} • ${escape(displayDate(period.start))} – ${escape(displayDate(period.end))}</p><p>PAYMENT STATUS: ${escape(saved.status==='paid'?'PAID':'FINALIZED; PAYMENT NOT CONFIRMED')}</p><table>${rows.map(([name,value])=>`<tr><td>${escape(name)}</td><td>${escape(value)}</td></tr>`).join('')}</table><p>Confidential payroll document — authorized HR issue only.</p></body></html>`);
    w.document.close();w.focus();w.print();
  };
  const exportCsv=()=>{
    if(!finalized.length)return toast.warning('No finalized records for this cutoff.');
    const csv=(v)=>{const s=String(v??'');return `"${(/^[\s]*[=+@\-]/.test(s)?"'":"")+s.replaceAll('"','""')}"`;};
    const keys=['employee_id','full_name','month_year','gross_pay','sss_deduction','philhealth_deduction','pagibig_deduction','mbf_deduction','tax_deduction','net_pay','status'];
    const data=[keys.join(','),...finalized.map(r=>keys.map(k=>csv(r[k])).join(','))].join('\r\n');
    const href=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=href;a.download=`UniVITA_Payroll_${year}_${String(month).padStart(2,'0')}_${cutoff}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);
  };
  if(!isHR)return <div className="pm-container"><p>Payroll management is restricted to authorized HR personnel.</p></div>;
  const saved=selected?records.get(Number(selected.id)):null;
  const allowanceEligible = selected && (String(selected.contract_type||" ").toLowerCase()==="regular" || String(selected.employment_type||"").toLowerCase()==="part-time");
  const calc=saved||preview;
  return <main className="pm-container">
    <header className="pm-page-heading"><div><p>Prepare, review and finalize instructor payroll by cutoff period.</p></div><div className="pm-toolbar-actions"><button className="pm-btn-outline" onClick={lock}><LockKeyhole size={15}/> Lock payroll</button></div></header>
    <section className="pm-top-bar">
      <div className="pm-period-group"><span className="pm-period-label">Payroll cutoff</span><div className="pm-date-navigator"><button className="pm-nav-arrow" onClick={()=>shiftMonth(-1)}><ChevronLeft size={17}/></button><div className="pm-current-date">{months[month-1]} {year}</div><button className="pm-nav-arrow" onClick={()=>shiftMonth(1)} disabled={year>now.getFullYear()||(year===now.getFullYear()&&month>=now.getMonth()+1)}><ChevronRight size={17}/></button></div></div>
      <div className="pm-period-group"><label className="pm-period-label" htmlFor="pm-cutoff">Cutoff period</label><select id="pm-cutoff" className="pm-input" value={cutoff} onChange={e=>setCutoff(e.target.value)}><option value="26-10">26th (previous month) – 10th</option><option value="11-25">11th – 25th</option></select></div>
      <div className="pm-period-actions"><span className="pm-period-helper">{displayDate(period.start)} – {displayDate(period.end)} {incomplete?'• In progress':'• Completed'}</span><button className="pm-btn-outline" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
    </section>
    {periodError&&<div className="pm-alert" role="alert">{periodError}</div>}
    <section className="pm-metrics-grid"><div className="pm-metric-card"><span>Instructors in roster</span><strong>{matching.length}</strong></div><div className="pm-metric-card"><span>Finalized for cutoff</span><strong>{finalized.length}</strong></div><div className="pm-metric-card"><span>Finalized gross pay</span><strong>{money(totals.gross)}</strong></div><div className="pm-metric-card"><span>Finalized net pay</span><strong>{money(totals.net)}</strong></div></section>
    <section className="pm-roster-container"><div className="pm-roster-heading"><div><h2>Cutoff Payroll Register</h2><p>{period.label}. Finalized amounts are loaded from stored payroll records.</p></div><span>{matching.length} people</span></div>
      <div className="pm-toolbar"><div className="pm-search-box"><Search size={15}/><input aria-label="Search payroll" placeholder="Search employee name or ID" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="pm-toolbar-actions"><button className="pm-btn-outline" onClick={exportCsv}>Export finalized CSV</button><button className="pm-btn-outline" onClick={exportRemittance}>Export remittance CSV</button><button className="pm-btn-primary" onClick={()=>setBatchOpen(true)} disabled={incomplete||busy||batchBusy||loading||Boolean(periodError)}>Run cutoff batch</button></div></div>
      <div className="pm-table-wrapper"><table className="pm-table"><thead><tr><th>Employee ID</th><th>Instructor</th><th>Job title</th><th>Contract</th><th>Status</th><th className="text-right">Action</th></tr></thead><tbody>{loading?<tr><td colSpan={6}>Loading payroll data…</td></tr>:visible.length===0?<tr><td colSpan={6}>No matching instructor records.</td></tr>:visible.map(emp=>{const r=records.get(Number(emp.id));return <tr key={emp.id}><td>{emp.employee_id}</td><td>{emp.full_name}</td><td>{emp.position_level||emp.position||'—'}</td><td>{emp.contract_type||emp.employment_type||'—'}</td><td><span className={`pm-status ${r?(r.status==='paid'?'paid':'pending'):'draft'}`}>{r?(r.status==='paid'?'Paid':'Awaiting Payment'):'Not Finalized'}</span></td><td className="text-right"><div className="pm-action-group"><button className="pm-btn-outline pm-table-action" onClick={()=>openEmployee(emp)}>View</button>{r?.status==='pending'&&<button className="pm-btn-primary pm-table-action" onClick={()=>confirmPaid(r)} disabled={busy}>Confirm paid</button>}</div></td></tr>})}</tbody></table></div>
      <div className="pm-pagination"><span>Page {Math.min(page,pages)} of {pages}</span><div className="pm-pagination-actions"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div></div>
    </section>
    {selected&&<div className="pm-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setSelected(null);}}><section className="pm-modal-card wide" role="dialog" aria-modal="true" aria-label="Payroll details"><header className="pm-modal-header"><div><h3>{saved?'Finalized payslip':'Payroll preview'}</h3><span className="pm-modal-subtitle">{selected.full_name} • {period.label}</span></div><button className="pm-modal-close" onClick={()=>setSelected(null)}><X/></button></header><div className="pm-modal-body">
      <div className="pm-payslip-summary"><div><span>Employee</span><strong>{selected.employee_id}</strong></div><div><span>Dates</span><strong>{displayDate(period.start)} – {displayDate(period.end)}</strong></div><div><span>Status</span><strong>{saved?(saved.status==='paid'?'Paid':'Finalized'):'Draft (not saved)'}</strong></div></div>
      {!saved&&<><p className="pm-modal-desc">Enter approved adjustments and request a server-authoritative preview. Changes invalidate the previous preview. Finalization is unavailable before the cutoff ends. Allowances are restricted by employee classification.</p><div className="pm-form-row pm-adjustment-grid">{fields.map(([key,label])=><div className="pm-form-group" key={key}><label htmlFor={`pm-${key}`}>{label}</label><input id={`pm-${key}`} className="pm-input" inputMode="decimal" disabled={!allowanceEligible && ["transport_allowance","meal_allowance","housing_allowance"].includes(key)} value={adjustments[key]} onChange={e=>{setAdjustments(a=>({...a,[key]:e.target.value}));setPreview(null);}}/></div>)}</div><button className="pm-btn-outline" onClick={calculate} disabled={busy||!canPrepare(selected)}>Calculate on server</button></>}
      {calc?<div className="pm-formal-payslip"><h4>Earnings & deductions</h4>{[
        ['Recorded / paid hours',Number(calc.total_hours||0).toFixed(2)+' hrs'],['Hourly basis',money(calc.salary_rate)],['Overtime pay',money(calc.overtime_pay)],
        ['Transport allowance',money(calc.transport_allowance)],['Meal allowance',money(calc.meal_allowance)],['Housing allowance',money(calc.housing_allowance)],['Bonus',money(calc.bonus)],
        ['Gross earnings',money(calc.gross_pay)],['Tax',money(calc.tax_deduction)],['SSS',money(calc.sss_deduction)],['PhilHealth',money(calc.philhealth_deduction)],['Pag-IBIG',money(calc.pagibig_deduction)],['MBF',money(calc.mbf_deduction)],['Loans',money(calc.loan_deduction)],['Other deductions',money(calc.other_deduction)],['Late / undertime',money(calc.late_deduction)]
      ].map(([k,v])=><div className="pm-formal-row" key={k}><span>{k}</span><strong>{v}</strong></div>)}<div className="pm-net-banner"><strong>Net take-home pay</strong><strong>{money(calc.net_pay)}</strong></div>{previewSource&&<p className="pm-modal-desc">Verified: {previewSource.regular_hours} working hours, {previewSource.paid_leave_days} approved paid leave days, {previewSource.overtime_hours} approved overtime hours.</p>}</div>:<p className="pm-modal-desc">{saved?'No stored amount available.':'Select Calculate on server to obtain payroll amounts.'}</p>}
    </div><footer className="pm-modal-footer"><button className="pm-btn-outline" onClick={()=>setSelected(null)}>Close</button>{saved&&<button className="pm-btn-outline" onClick={printSavedPayslip}>Print / Save PDF</button>}{!saved&&<button className="pm-btn-primary" disabled={busy||!preview||incomplete||!canPrepare(selected)} onClick={finalize}>Finalize cutoff</button>}</footer></section></div>}
    {batchOpen&&<div className="pm-modal-backdrop"><section className="pm-modal-card small" role="dialog" aria-modal="true"><header className="pm-modal-header"><h3>Run cutoff payroll</h3><button className="pm-modal-close" onClick={()=>setBatchOpen(false)}><X/></button></header><div className="pm-modal-body"><p className="pm-modal-desc">Finalize eligible instructors for <strong>{period.label}</strong>. The server validates all records and skips already-finalized employee/cutoff pairs. Confirm approved allowances and payroll policies before proceeding.</p></div><footer className="pm-modal-footer"><button className="pm-btn-outline" onClick={()=>setBatchOpen(false)}>Cancel</button><button className="pm-btn-primary" disabled={batchBusy||incomplete} onClick={runBatch}>{batchBusy?'Processing…':'Run cutoff batch'}</button></footer></section></div>}
  </main>;
};

export default PayrollMain;
