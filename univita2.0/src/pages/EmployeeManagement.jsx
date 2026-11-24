import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Plus, Search, RefreshCw, Eye, Pencil, Users, UserCheck, UserX, X, ChevronLeft, ChevronRight } from 'lucide-react';
import './EmployeeManagement.css';
import { API_BASE } from '../api';
import { getUserRole } from '../permissions';

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_REGIONS = [
  'NCR - National Capital Region', 'CAR - Cordillera Administrative Region', 'Region I - Ilocos Region',
  'Region II - Cagayan Valley', 'Region III - Central Luzon', 'Region IV-A - CALABARZON',
  'MIMAROPA Region', 'Region V - Bicol Region', 'Region VI - Western Visayas', 'Region VII - Central Visayas',
  'Region VIII - Eastern Visayas', 'Region IX - Zamboanga Peninsula', 'Region X - Northern Mindanao',
  'Region XI - Davao Region', 'Region XII - SOCCSKSARGEN', 'Region XIII - Caraga',
  'BARMM - Bangsamoro Autonomous Region'
];

const PH_PROVINCES = [
  'Metro Manila', 'Abra', 'Agusan del Norte', 'Agusan del Sur', 'Aklan', 'Albay', 'Antique', 'Apayao',
  'Aurora', 'Basilan', 'Bataan', 'Batanes', 'Batangas', 'Benguet', 'Biliran', 'Bohol', 'Bukidnon',
  'Bulacan', 'Cagayan', 'Camarines Norte', 'Camarines Sur', 'Camiguin', 'Capiz', 'Catanduanes',
  'Cavite', 'Cebu', 'Cotabato', 'Davao de Oro', 'Davao del Norte', 'Davao del Sur', 'Davao Occidental',
  'Davao Oriental', 'Dinagat Islands', 'Eastern Samar', 'Guimaras', 'Ifugao', 'Ilocos Norte',
  'Ilocos Sur', 'Iloilo', 'Isabela', 'Kalinga', 'La Union', 'Laguna', 'Lanao del Norte', 'Lanao del Sur',
  'Leyte', 'Maguindanao', 'Marinduque', 'Masbate', 'Misamis Occidental', 'Misamis Oriental',
  'Mountain Province', 'Negros Occidental', 'Negros Oriental', 'Northern Samar', 'Nueva Ecija',
  'Nueva Vizcaya', 'Occidental Mindoro', 'Oriental Mindoro', 'Palawan', 'Pampanga', 'Pangasinan',
  'Quezon', 'Quirino', 'Rizal', 'Romblon', 'Samar', 'Sarangani', 'Siquijor', 'Sorsogon',
  'South Cotabato', 'Southern Leyte', 'Sultan Kudarat', 'Sulu', 'Surigao del Norte', 'Surigao del Sur',
  'Tarlac', 'Tawi-Tawi', 'Zambales', 'Zamboanga del Norte', 'Zamboanga del Sur', 'Zamboanga Sibugay'
];

const PH_CITIES = [
  { name: 'Pasay City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1300' },
  { name: 'Manila', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1000' },
  { name: 'Makati City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1200' },
  { name: 'Quezon City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1100' },
  { name: 'Taguig City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1630' },
  { name: 'Pasig City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1600' },
  { name: 'Parañaque City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1700' },
  { name: 'Mandaluyong City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1550' },
  { name: 'Muntinlupa City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1770' },
  { name: 'Las Piñas City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1740' },
  { name: 'Caloocan City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1400' },
  { name: 'Marikina City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1800' },
  { name: 'Valenzuela City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1440' },
  { name: 'Malabon City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1470' },
  { name: 'Navotas City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1485' },
  { name: 'San Juan City', province: 'Metro Manila', region: 'NCR - National Capital Region', zip: '1500' },
  { name: 'Baguio City', province: 'Benguet', region: 'CAR - Cordillera Administrative Region', zip: '2600' },
  { name: 'San Fernando City', province: 'Pampanga', region: 'Region III - Central Luzon', zip: '2000' },
  { name: 'Angeles City', province: 'Pampanga', region: 'Region III - Central Luzon', zip: '2009' },
  { name: 'Antipolo City', province: 'Rizal', region: 'Region IV-A - CALABARZON', zip: '1870' },
  { name: 'Bacoor City', province: 'Cavite', region: 'Region IV-A - CALABARZON', zip: '4102' },
  { name: 'Imus City', province: 'Cavite', region: 'Region IV-A - CALABARZON', zip: '4103' },
  { name: 'Dasmariñas City', province: 'Cavite', region: 'Region IV-A - CALABARZON', zip: '4114' },
  { name: 'Calamba City', province: 'Laguna', region: 'Region IV-A - CALABARZON', zip: '4027' },
  { name: 'Santa Rosa City', province: 'Laguna', region: 'Region IV-A - CALABARZON', zip: '4026' },
  { name: 'Batangas City', province: 'Batangas', region: 'Region IV-A - CALABARZON', zip: '4200' },
  { name: 'Cebu City', province: 'Cebu', region: 'Region VII - Central Visayas', zip: '6000' },
  { name: 'Mandaue City', province: 'Cebu', region: 'Region VII - Central Visayas', zip: '6014' },
  { name: 'Lapu-Lapu City', province: 'Cebu', region: 'Region VII - Central Visayas', zip: '6015' },
  { name: 'Iloilo City', province: 'Iloilo', region: 'Region VI - Western Visayas', zip: '5000' },
  { name: 'Bacolod City', province: 'Negros Occidental', region: 'Region VI - Western Visayas', zip: '6100' },
  { name: 'Davao City', province: 'Davao del Sur', region: 'Region XI - Davao Region', zip: '8000' },
  { name: 'Cagayan de Oro City', province: 'Misamis Oriental', region: 'Region X - Northern Mindanao', zip: '9000' },
  { name: 'Zamboanga City', province: 'Zamboanga del Sur', region: 'Region IX - Zamboanga Peninsula', zip: '7000' },
  { name: 'General Santos City', province: 'South Cotabato', region: 'Region XII - SOCCSKSARGEN', zip: '9500' }
];


const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'yopmail.com',
  '10minutemail.com', 'trashmail.com', 'throwawaymail.com', 'getnada.com', 'maildrop.cc',
  'sharklasers.com', 'mohmal.com', 'mailsac.com', 'tempail.com', 'tmpmail.net'
]);

const FAKE_EMAIL_LOCAL_PARTS = new Set([
  'test', 'tests', 'testing', 'dummy', 'fake', 'sample', 'demo', 'admin', 'user', 'guest',
  'asdf', 'qwerty', 'abc', 'xyz', '123', '1234', 'temp', 'noreply', 'no-reply', 'example', 'null'
]);

const RESERVED_TEST_DOMAINS = new Set([
  'example.com', 'example.net', 'example.org', 'test.com', 'test.net', 'test.org', 'localhost'
]);

const isRealEmail = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, reason: 'Please enter a valid email address.' };
  const [local, domain] = email.split('@');
  if (!domain) return { ok: false, reason: 'Email domain is missing.' };
  if (RESERVED_TEST_DOMAINS.has(domain)) return { ok: false, reason: `"${domain}" is a test domain.` };
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return { ok: false, reason: 'Disposable email domains are not allowed.' };
  if (FAKE_EMAIL_LOCAL_PARTS.has(local)) return { ok: false, reason: `"${local}" is a placeholder local-part.` };
  if (/^\d+$/.test(local)) return { ok: false, reason: 'Email cannot be purely numeric.' };
  if (/^(.)\1+$/.test(local)) return { ok: false, reason: 'Email looks like a placeholder.' };
  if (local.length < 3) return { ok: false, reason: 'Email local-part is too short.' };
  return { ok: true };
};


const dateValue = value => value ? String(value).slice(0, 10) : '';
const readable = value => value === null || value === undefined || value === '' ? '—' : String(value);
// Suggestions only: the position is HR-owned employment data, never inferred from system role.
const employmentOptions = ['Full-time', 'Part-time', 'Consultant'];
const contractOptions = { 'Full-time': ['Regular', 'Probationary', 'Project-based'], 'Part-time': ['Part-time'], 'Consultant': ['On-call Simulationist', 'Offsite Consultant'] };
const positionOptions = [
  'Entry Level Simulationist',
  'Senior Simulationist',
  'HR Personnel',
  'Security Personnel',
  'IT Personnel',
  'Administrative Staff'
];
const blank = () => ({
  employee_id: '', first_name: '', middle_initial: '', last_name: '', email: '',
  phone_number: '', position_level: '', contract_type: 'Regular', employment_type: 'Full-time', compensation_basis: 'monthly', hourly_rate: '',
  monthly_salary: '', work_days_per_month: '22', date_of_joining: '',
  date_of_birth: '', gender: 'prefer_not_to_say', emergency_contact_name: '',
  emergency_contact_phone: '', region: '', street_address: '', city: '',
  state_province: '', postal_code: '', country: 'Philippines',
  sss_number: '', pagibig_number: '', philhealth_number: '', tin_number: '',
  application_date: '', interview_date: '', resume_link: '', notes: '', resume_file: ''
});
const parseInfo = info => { try { return info && typeof info === 'object' ? info : JSON.parse(info || '{}'); } catch { return {}; } };
const toForm = person => {
  const additional = parseInfo(person.additional_info);
  const source = blank();
  Object.keys(source).forEach(key => {
    if (person[key] !== undefined && person[key] !== null) source[key] = person[key];
    else if (additional[key] !== undefined && additional[key] !== null) source[key] = additional[key];
  });
  if (!person.position_level && person.position) source.position_level = person.position;
  if (person.phone_number) source.phone_number = person.phone_number;
  source.compensation_basis = additional.compensation_basis || 'monthly';
  source.hourly_rate = additional.hourly_rate ?? '';
  const oldType = String(source.employment_type || '');
  const oldContract = String(source.contract_type || '');
  if (!employmentOptions.includes(oldType)) source.employment_type = ['Part-time'].includes(oldContract) ? 'Part-time' : 'Full-time';
  if (!(contractOptions[source.employment_type] || []).includes(oldContract)) source.contract_type = oldContract === 'Provisionary' ? 'Probationary' : oldContract;
  source.date_of_joining = dateValue(person.date_of_joining);
  source.date_of_birth = dateValue(person.date_of_birth);
  source.application_date = dateValue(source.application_date);
  source.interview_date = dateValue(source.interview_date);
  return source;
};
const tabs = [
  ['general', 'General & Employment'], ['personal', 'Personal Details'],
  ['statutory', 'Statutory IDs'], ['onboarding', 'Onboarding & Resume'], ['address', 'Address']
];
const fields = {
  general: [
    ['employee_id', 'Employee ID', 'text'], ['first_name', 'First name', 'text'],
    ['middle_initial', 'Middle initial', 'text'], ['last_name', 'Last name', 'text'],
    ['email', 'Email address', 'email'], ['phone_number', 'Contact number', 'tel'],
    ['position_level', 'Employment position / Job title', 'text'], ['employment_type', 'Employment type', 'employment'], ['contract_type', 'Contract classification', 'contract'], ['compensation_basis', 'Compensation basis', 'basis'], ['hourly_rate', 'Hourly rate (PHP, if hourly)', 'number'],
    ['monthly_salary', 'Monthly salary', 'number'], ['work_days_per_month', 'Workdays per month', 'number'],
    ['date_of_joining', 'Date hired', 'date']
  ],
  personal: [
    ['date_of_birth', 'Date of birth', 'date'], ['gender', 'Gender', 'select'],
    ['emergency_contact_name', 'Emergency contact name', 'text'],
    ['emergency_contact_phone', 'Emergency contact number', 'tel']
  ],
  statutory: [
    ['sss_number', 'SSS number', 'text'], ['pagibig_number', 'Pag-IBIG number', 'text'],
    ['philhealth_number', 'PhilHealth number', 'text'], ['tin_number', 'TIN', 'text']
  ],
  onboarding: [
    ['application_date', 'Application date', 'date'], ['interview_date', 'Interview date', 'date'],
    ['resume_link', 'Resume link', 'url'], ['notes', 'Onboarding notes', 'textarea']
  ],
  address: [
    ['region', 'Region', 'text'], ['street_address', 'Street address', 'text'],
    ['city', 'City', 'text'], ['state_province', 'Province / State', 'text'],
    ['postal_code', 'Postal code', 'text'], ['country', 'Country', 'text']
  ]
};
const infoKeys = ['sss_number', 'pagibig_number', 'philhealth_number', 'tin_number', 'region',
  'application_date', 'interview_date', 'resume_link', 'notes', 'resume_file'];
const editKeys = ['first_name', 'last_name', 'middle_initial', 'email', 'phone_number',
  'position_level', 'contract_type', 'employment_type', 'monthly_salary', 'work_days_per_month', 'date_of_joining',
  'date_of_birth', 'gender', 'emergency_contact_name', 'emergency_contact_phone',
  'street_address', 'city', 'state_province', 'postal_code', 'country'];

const EmployeeManagement = () => {
  const role = getUserRole();
  const isHR = role === 'hr_admin';
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [directory, setDirectory] = useState('all');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(blank());
  const [activeTab, setActiveTab] = useState('general');
  const [resume, setResume] = useState(null);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await axios.get(`${API_BASE}/employees`, auth());
      if (!Array.isArray(result.data)) throw new Error('Invalid employee directory response');
      setEmployees(result.data.filter(record => (
        !['archived', 'deleted'].includes(String(record.status || '').trim().toLowerCase()) &&
        !['archived', 'deleted'].includes(String(record.account_status || '').trim().toLowerCase())
      )));
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Unable to load employee information');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, filter, directory]);

  const shown = useMemo(() => employees.filter(emp => {
    const status = emp.employment_status;
    if (filter === 'review' && status != null && status !== '') return false;
    if (filter !== 'all' && filter !== 'review' && status !== filter) return false;
    // Directory grouping reflects system role only. Job title is separately maintained by HR.
    const instructor = emp.role === 'instructor';
    if (directory === 'instructor' && !instructor) return false;
    if (directory === 'staff' && instructor) return false;
    const text = [emp.full_name, emp.employee_id, emp.email, emp.position_level].join(' ').toLowerCase();
    return text.includes(search.trim().toLowerCase());
  }), [employees, search, filter, directory]);
  const count = key => employees.filter(emp => emp.employment_status === key).length;
  const pageCount = Math.max(1, Math.ceil(shown.length / 10));
  const items = shown.slice((Math.min(page, pageCount) - 1) * 10, Math.min(page, pageCount) * 10);

  const openAdd = async () => {
    if (!isHR) return;
    setSelected(null); setForm(blank()); setResume(null); setActiveTab('general');
    try {
      const result = await axios.get(`${API_BASE}/employees/last-id`, auth());
      const match = String(result.data?.lastId || '').match(/\d+/);
      const next = (match ? Number(match[0]) : 0) + 1;
      setForm(prev => ({ ...prev, employee_id: `E${String(next).padStart(3, '0')}` }));
    } catch { toast.info('Please enter an unused employee ID before saving.'); }
    setModal('add');
  };
  const openPerson = (person, mode = 'view') => {
    if (mode === 'edit' && !isHR) return;
    setSelected(person); setForm(toForm(person)); setResume(null); setActiveTab('general'); setModal(mode);
  };
  const change = (name, value) => setForm(current => {
    const updated = { ...current, [name]: value };
    if (name === 'employment_type') updated.contract_type = contractOptions[value]?.[0] || '';
    if (name === 'compensation_basis' && value === 'monthly') updated.hourly_rate = ''; 
    if (name === 'region' && String(value).startsWith('NCR')) updated.state_province = 'Metro Manila';
    if (name === 'city') {
      const city = PH_CITIES.find(item => item.name.toLowerCase() === String(value).toLowerCase());
      if (city) { updated.state_province = city.province; updated.region = city.region; updated.postal_code = city.zip; }
    }
    // Salary, job title and system role must never change each other implicitly.
    return updated;
  });
  const fullName = [form.first_name, form.middle_initial, form.last_name].filter(Boolean).map(x => String(x).trim()).join(' ');
  const validate = () => {
    if (!form.employee_id.trim() || !form.first_name.trim() || !form.last_name.trim()) return 'Employee ID, first name, and last name are required.';
    if (!String(form.position_level || '').trim()) return 'Enter the actual employment position or job title.';
    if (!employmentOptions.includes(form.employment_type)) return 'Select a valid employment type.';
    if (!(contractOptions[form.employment_type] || []).includes(form.contract_type)) return 'Select a valid contract classification.';
    if (!['monthly','hourly'].includes(form.compensation_basis)) return 'Select a compensation basis.';
    if (form.compensation_basis === 'hourly' && (!Number.isFinite(Number(form.hourly_rate)) || Number(form.hourly_rate) <= 0 || Number(form.hourly_rate) > 99999999.99)) return 'Enter a valid positive hourly rate.';
    if (form.date_of_joining && (!/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_joining) || Number.isNaN(new Date(form.date_of_joining + 'T12:00:00').getTime()))) return 'Enter a valid hire date.';
    const emailCheck = isRealEmail(form.email);
    if (!emailCheck.ok) return emailCheck.reason;
    if ((form.compensation_basis === 'monthly' && form.monthly_salary === '') || !Number.isFinite(Number(form.monthly_salary)) || Number(form.monthly_salary) < 0 || Number(form.monthly_salary) > 99999999.99) return 'Enter a valid nonnegative monthly salary.';
    if (resume && (resume.type !== 'application/pdf' && !/\.pdf$/i.test(resume.name))) return 'Only a PDF resume can be uploaded.';
    if (resume && resume.size > 10 * 1024 * 1024) return 'Resume must not exceed 10 MB.';
    const days = Number(form.work_days_per_month);
    if (!Number.isInteger(days) || days < 1 || days > 31) return 'Workdays must be between 1 and 31.';
    return null;
  };
  const save = async () => {
    if (!isHR || saving || modal === 'view') return;
    const problem = validate(); if (problem) { toast.warning(problem); if (problem.includes('Resume')) setActiveTab('onboarding'); else setActiveTab('general'); return; }
    setSaving(true);
    try {
      const payload = new FormData();
      if (modal === 'add') {
        payload.append('employee_id', form.employee_id.trim());
        payload.append('full_name', fullName);
        editKeys.forEach(key => payload.append(key, form[key] ?? ''));
        payload.append('position', form.position_level.trim());
        // The Phase 3 POST accepts an onboarding JSON object and resume_file.
        const advanced = {...Object.fromEntries(infoKeys.map(key => [key, form[key] || ''])), compensation_basis: form.compensation_basis, hourly_rate: form.compensation_basis === 'hourly' ? Number(form.hourly_rate) : null};
        payload.append('additional_info', JSON.stringify(advanced));
        if (resume) payload.append('resume_file', resume);
        await axios.post(`${API_BASE}/employees`, payload, auth());
      } else {
        // The Phase 3 employee GET does not yet return additional_info. Do not overwrite
        // existing statutory/onboarding data with empty values when editing.
        editKeys.forEach(key => payload.append(key, form[key] ?? ''));
        payload.append('phone', form.phone_number ?? '');
        payload.append('street', form.street_address ?? '');
        payload.append('state', form.state_province ?? '');
        payload.append('position', String(form.position_level || '').trim());
        payload.append('full_name', fullName);
        if (selected?.additional_info !== undefined) {
          const oldInfo = parseInfo(selected.additional_info);
          const advanced = { ...oldInfo, ...Object.fromEntries(infoKeys.map(key => [key, form[key] || ''])), compensation_basis: form.compensation_basis, hourly_rate: form.compensation_basis === 'hourly' ? Number(form.hourly_rate) : null };
          payload.append('additional_info', JSON.stringify(advanced));
          if (resume) payload.append('resume_file', resume);
        }
        await axios.put(`${API_BASE}/employees/${selected.id}`, payload, auth());
      }
      toast.success(modal === 'add' ? 'Employee recorded. Account provisioning belongs to System Admin.' : 'Employee information updated.');
      setModal(null); await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to save employee.'); }
    finally { setSaving(false); }
  };
  const changeEmployment = async person => {
    if (!isHR || changingStatus) return;
    const next = person.employment_status === 'active' ? 'separated' : 'active';
    if (!['active', 'separated'].includes(person.employment_status)) return toast.error('Legacy status requires review before changing.');
    if (!window.confirm(`Mark ${person.full_name} as ${next === 'separated' ? 'Separated' : 'Active'}? Historical records will be retained. Account access is managed separately by Admin.`)) return;
    setChangingStatus(person.id);
    try {
      await axios.put(`${API_BASE}/employees/${person.id}/employment-status`, { employment_status: next }, auth());
      toast.success(`Employment status set to ${next}.`); await load();
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to change employment status.'); }
    finally { setChangingStatus(null); }
  };

  // ------------------------------------------------------------
  // Render: personnel directory and profile modal
  // ------------------------------------------------------------
  if (!['admin', 'hr_admin'].includes(role)) return null;

  return (
    <main className="em4-page">
      {/* Page heading */}
      <header className="em4-header">
        <div className="em4-header-copy">
          
          <p>Manage institutional personnel records and employment classifications.</p>
        </div>
        <div className="em4-header-actions">
          <button type="button" className="em4-secondary" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
          {isHR && (
            <button type="button" className="em4-primary" onClick={openAdd}>
              <Plus size={15} /> Add Employee
            </button>
          )}
        </div>
      </header>

      {/* Summary */}
      <section className="em4-stats" aria-label="Personnel statistics">
        <div className="em4-stat">
          
          <span><strong>{employees.length}</strong>Total records</span>
        </div>
        <div className="em4-stat">
          
          <span><strong>{count('active')}</strong>Active employment</span>
        </div>
        <div className="em4-stat">
          
          <span><strong>{count('separated')}</strong>Separated</span>
        </div>
      </section>

      {/* Directory */}
      <section className="em4-panel">
        <div className="em4-panel-heading">
          <div>
            <strong>Personnel records</strong>
            
          </div>
          <span className="em4-panel-count">{shown.length} records</span>
        </div>

        <div className="em4-category" role="tablist" aria-label="Employee category">
          {[
            ['all', 'All personnel'],
            ['instructor', 'Instructors'],
            ['staff', 'Staff']
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={directory === key}
              className={directory === key ? 'selected' : ''}
              onClick={() => setDirectory(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="em4-toolbar">
          <label className="em4-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search employees"
              placeholder="Search by name, ID, email, or position"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>
          <select
            aria-label="Filter by employment status"
            value={filter}
            onChange={event => setFilter(event.target.value)}
          >
            <option value="all">All employment statuses</option>
            <option value="active">Active</option>
            <option value="separated">Separated</option>
            <option value="review">Review required</option>
          </select>
        </div>

        <div className="em4-scroll">
          <table className="em4-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Employee</th>
                <th>Position</th>
                <th>Contract</th>
                <th>Employment Status</th>
                <th className="em4-actions-head">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="em4-empty">Loading employee records…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="em4-empty">No matching employee records.</td></tr>
              ) : (
                items.map(emp => (
                  <tr key={emp.id}>
                    <td className="em4-id">{readable(emp.employee_id)}</td>
                    <td>
                      <strong>{readable(emp.full_name)}</strong>
                      <small>{readable(emp.email)}</small>
                    </td>
                    <td>{readable(emp.position_level || emp.position)}</td>
                    <td>{readable(emp.contract_type || emp.employment_type)}</td>
                    <td>
                      <span className={`em4-badge ${
                        emp.employment_status === 'active' ? 'active' :
                        emp.employment_status === 'separated' ? 'separated' : 'legacy'
                      }`}>
                        {emp.employment_status === 'active' ? 'Active' :
                         emp.employment_status === 'separated' ? 'Separated' : 'Review required'}
                      </span>
                    </td>
                    <td className="em4-actions-cell">
                      <div className="em4-actions">
                        <button
                          type="button"
                          className="em4-table-action"
                          onClick={() => openPerson(emp, 'view')}
                        >
                          <Eye size={13} /> View
                        </button>
                        {isHR && (
                          <>
                            <button
                              type="button"
                              className="em4-table-action"
                              onClick={() => openPerson(emp, 'edit')}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            {['active', 'separated'].includes(emp.employment_status) && (
                              <button
                                type="button"
                                disabled={changingStatus === emp.id}
                                className="em4-table-action em4-table-action-status"
                                onClick={() => changeEmployment(emp)}
                              >
                                {emp.employment_status === 'active' ? 'Mark Separated' : 'Mark Active'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="em4-pagination">
          <span>{shown.length} matching employees</span>
          <div>
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>
              <ChevronLeft size={16} />
            </button>
            <span>Page {Math.min(page, pageCount)} of {pageCount}</span>
            <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(current => current + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </section>

      {/* Create / edit / view employee */}
      {modal && (
        <div
          className="em4-overlay"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !saving) setModal(null);
          }}
        >
          <section
            className="em4-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={modal === 'add' ? 'Add Employee' : modal === 'edit' ? 'Edit Employee' : 'View Employee'}
          >
            <div className="em4-dialog-head">
              <div>
                <h2>{modal === 'add' ? 'Add Employee' : modal === 'edit' ? 'Edit Employee' : 'Employee Details'}</h2>
                <p>
                  {modal === 'add'
                    ? 'Creates an employee record without login access. HR manages employment details; Admin provisions login access.'
                    : `${selected?.full_name || ''} · ${selected?.employee_id || ''}`}
                </p>
                
              </div>
              <button type="button" aria-label="Close dialog" onClick={() => !saving && setModal(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="em4-tabs" role="tablist" aria-label="Employee detail sections">
              {tabs.map(([key, title]) => (
                <button
                  type="button"
                  key={key}
                  role="tab"
                  aria-selected={activeTab === key}
                  className={activeTab === key ? 'selected' : ''}
                  onClick={() => setActiveTab(key)}
                >
                  {title}
                </button>
              ))}
            </div>

            <div className="em4-dialog-body">
              <datalist id="em4-region-options">
                {PH_REGIONS.map(item => <option value={item} key={item} />)}
              </datalist>
              <datalist id="em4-province-options">
                {PH_PROVINCES.map(item => <option value={item} key={item} />)}
              </datalist>
              <datalist id="em4-city-options">
                {PH_CITIES.map(item => <option value={item.name} key={item.name} />)}
              </datalist>
              <datalist id="em4-position-options">
                {positionOptions.map(item => <option value={item} key={item} />)}
              </datalist>

              {activeTab === 'general' && (
                <p className="em4-field-help">
                  Employment type, contract classification, position and compensation basis are separate.
                  Entry-level and senior simulationist salary ranges are references only; HR verifies the agreed amount.
                </p>
              )}
              <div className="em4-form-grid">
                {fields[activeTab].map(([key, label, type]) => (
                  <label className={`em4-field ${type === 'textarea' ? 'wide' : ''} ${key === 'hourly_rate' && form.compensation_basis !== 'hourly' ? 'em4-field-muted' : ''}`} key={key}>
                    <span>
                      {label}{['employee_id', 'first_name', 'last_name', 'email', 'position_level', 'employment_type', 'contract_type'].includes(key) ? ' *' : ''}
                    </span>
                    {modal === 'view' ? (
                      <div className="em4-display">{readable(form[key])}</div>
                    ) : modal === 'edit' && key === 'employee_id' ? (
                      <div className="em4-display">{readable(form.employee_id)}</div>
                    ) : modal === 'edit' && infoKeys.includes(key) && selected?.additional_info === undefined ? (
                      <div className="em4-display" title="Employee API must return additional_info for safe editing">
                        Details unavailable until API supports additional_info
                      </div>
                    ) : type === 'employment' ? (
                      <select value={form.employment_type || ''} onChange={event => change(key, event.target.value)}>
                        {employmentOptions.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : type === 'contract' ? (
                      <select value={form.contract_type || ''} onChange={event => change(key, event.target.value)}>
                        {!((contractOptions[form.employment_type] || []).includes(form.contract_type)) && <option value={form.contract_type}>{form.contract_type || 'Choose classification'} — review required</option>}
                        {(contractOptions[form.employment_type] || []).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : type === 'basis' ? (
                      <select value={form.compensation_basis || 'monthly'} onChange={event => change(key, event.target.value)}>
                        <option value="monthly">Monthly salary</option>
                        <option value="hourly">Hourly rate</option>
                      </select>
                    ) : type === 'textarea' ? (
                      <textarea rows={3} value={form[key] || ''} onChange={event => change(key, event.target.value)} />
                    ) : type === 'select' ? (
                      <select value={form[key] || ''} onChange={event => change(key, event.target.value)}>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    ) : (
                      <input
                        type={type}
                        placeholder={key === 'position_level' ? 'e.g. HR Personnel, Security Personnel, Simulationist' : undefined}
                        list={key === 'region' ? 'em4-region-options' :
                          key === 'state_province' ? 'em4-province-options' :
                          key === 'city' ? 'em4-city-options' :
                          key === 'position_level' ? 'em4-position-options' : undefined}
                        min={type === 'number' ? '0' : undefined}
                        max={key === 'work_days_per_month' ? '31' : undefined}
                        value={form[key] ?? ''}
                        onChange={event => change(key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>

              {activeTab === 'onboarding' && (
                <div className="em4-upload">
                  <label>Resume / supporting file {modal === 'add' ? '(optional)' : ''}</label>
                  {modal !== 'view' && (modal === 'add' || selected?.additional_info !== undefined) && (
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={event => setResume(event.target.files?.[0] || null)}
                    />
                  )}
                  {form.resume_file && (
                    <a
                      href={`${API_BASE.replace(/\/api\/?$/, '')}${form.resume_file}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View saved resume
                    </a>
                  )}
                  {modal === 'edit' && selected?.additional_info === undefined && (
                    <p>Editing onboarding details requires the employee API to return additional_info.</p>
                  )}
                </div>
              )}
            </div>

            <footer className="em4-dialog-footer">
              <button type="button" className="em4-secondary" onClick={() => !saving && setModal(null)}>
                {modal === 'view' ? 'Close' : 'Cancel'}
              </button>
              {modal !== 'view' && (
                <button type="button" className="em4-primary" disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : modal === 'add' ? 'Create Employee' : 'Save Changes'}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
};

export default EmployeeManagement;
