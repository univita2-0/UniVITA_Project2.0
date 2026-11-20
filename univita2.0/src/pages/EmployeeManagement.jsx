import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './EmployeeManagement.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Search, Edit2, Trash2, UserCheck, AlertCircle, ChevronLeft, ChevronRight,
  Users, Eye, EyeOff, Plus, Copy, CheckCircle, FileText, Calendar, UploadCloud,
  CreditCard, RefreshCw, Archive, MoreVertical, Power, RotateCcw, AlertTriangle,
  Shield, UserCog, KeyRound
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import { getUserRole, decodeJwtPayload } from '../permissions';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PH_REGIONS = [
  'NCR - National Capital Region','CAR - Cordillera Administrative Region','Region I - Ilocos Region',
  'Region II - Cagayan Valley','Region III - Central Luzon','Region IV-A - CALABARZON',
  'MIMAROPA Region','Region V - Bicol Region','Region VI - Western Visayas','Region VII - Central Visayas',
  'Region VIII - Eastern Visayas','Region IX - Zamboanga Peninsula','Region X - Northern Mindanao',
  'Region XI - Davao Region','Region XII - SOCCSKSARGEN','Region XIII - Caraga',
  'BARMM - Bangsamoro Autonomous Region'
];

const PH_PROVINCES = [
  'Metro Manila','Abra','Agusan del Norte','Agusan del Sur','Aklan','Albay','Antique','Apayao',
  'Aurora','Basilan','Bataan','Batanes','Batangas','Benguet','Biliran','Bohol','Bukidnon',
  'Bulacan','Cagayan','Camarines Norte','Camarines Sur','Camiguin','Capiz','Catanduanes',
  'Cavite','Cebu','Cotabato','Davao de Oro','Davao del Norte','Davao del Sur','Davao Occidental',
  'Davao Oriental','Dinagat Islands','Eastern Samar','Guimaras','Ifugao','Ilocos Norte',
  'Ilocos Sur','Iloilo','Isabela','Kalinga','La Union','Laguna','Lanao del Norte','Lanao del Sur',
  'Leyte','Maguindanao','Marinduque','Masbate','Misamis Occidental','Misamis Oriental',
  'Mountain Province','Negros Occidental','Negros Oriental','Northern Samar','Nueva Ecija',
  'Nueva Vizcaya','Occidental Mindoro','Oriental Mindoro','Palawan','Pampanga','Pangasinan',
  'Quezon','Quirino','Rizal','Romblon','Samar','Sarangani','Siquijor','Sorsogon',
  'South Cotabato','Southern Leyte','Sultan Kudarat','Sulu','Surigao del Norte','Surigao del Sur',
  'Tarlac','Tawi-Tawi','Zambales','Zamboanga del Norte','Zamboanga del Sur','Zamboanga Sibugay'
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

const AutocompleteInput = ({ label, name, value, onChange, onSelect, suggestions = [], placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const filtered = useMemo(() => {
    if (!value) return suggestions.slice(0, 8);
    const query = String(value).toLowerCase().trim();
    return suggestions.filter(item => {
      const text = typeof item === 'string' ? item : `${item.name} (${item.province || item.zip || ''})`;
      return text.toLowerCase().includes(query);
    }).slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="em-form-group" ref={wrapperRef} style={{ position: 'relative' }}>
      <label>{label}</label>
      <input
        name={name} value={value} placeholder={placeholder} autoComplete="off"
        onFocus={() => setIsOpen(true)}
        onChange={(e) => { onChange(e); setIsOpen(true); }}
        className="em-input"
      />
      {isOpen && filtered.length > 0 && (
        <ul className="em-autocomplete-dropdown">
          {filtered.map((item, idx) => {
            const displayText = typeof item === 'string' ? item : item.name;
            const subText = typeof item === 'object' ? `${item.province ? item.province + ', ' : ''}${item.zip || ''}` : '';
            return (
              <li key={idx} className="em-autocomplete-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (onSelect) onSelect(item);
                  else onChange({ target: { name, value: displayText } });
                  setIsOpen(false);
                }}>
                <span className="em-autocomplete-text">{displayText}</span>
                {subText ? <span className="em-autocomplete-sub">{subText}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const formatRole = (role) => {
  const map = { instructor: 'Instructor', hr_admin: 'HR Admin', admin: 'System Admin', security: 'Security' };
  return map[role] || role || '—';
};

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com','tempmail.com','temp-mail.org','guerrillamail.com','yopmail.com',
  '10minutemail.com','trashmail.com','throwawaymail.com','getnada.com','maildrop.cc',
  'sharklasers.com','mohmal.com','mailsac.com','tempail.com','tmpmail.net'
]);

const FAKE_EMAIL_LOCAL_PARTS = new Set([
  'test','tests','testing','dummy','fake','sample','demo','admin','user','guest',
  'asdf','qwerty','abc','xyz','123','1234','temp','noreply','no-reply','example','null'
]);

const RESERVED_TEST_DOMAINS = new Set([
  'example.com','example.net','example.org','test.com','test.net','test.org','localhost'
]);

const isRealEmail = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) return { ok: false, reason: 'Please enter a valid email address.' };
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

const EmployeeManagement = () => {
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const currentUserRole = getUserRole();
  const isAdmin = currentUserRole === 'admin';
  const isHR = currentUserRole === 'hr_admin';
  const token = localStorage.getItem('auth_token');
  const decodedToken = decodeJwtPayload(token);
  const currentUserId = decodedToken?.id;

  const [directoryGroup, setDirectoryGroup] = useState(isAdmin ? 'staff' : 'instructors');
  const [activeTab, setActiveTab] = useState('active');
  const [showViewModal, setShowViewModal] = useState(false);
  useEffect(() => {
    setDirectoryGroup(isAdmin ? 'staff' : 'instructors');
    setActiveTab('active');
  }, [isAdmin]);
  const isOwnerGroup = (group = directoryGroup) =>
    (isAdmin && group === 'staff') || (isHR && group === 'instructors');
  const canManageEmployee = (employee) => Boolean(employee &&
    ((isAdmin && employee.role !== 'instructor') ||
     (isHR && employee.role === 'instructor')));

  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const itemsPerPage = 10;

  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [activeTabModal, setActiveTabModal] = useState(isAdmin ? 'account' : 'general');

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [newResumeFile, setNewResumeFile] = useState(null);
  const [editResumeFile, setEditResumeFile] = useState(null);

  const [formData, setFormData] = useState({
    employee_id: '', full_name: '', first_name: '', last_name: '', middle_initial: '',
    email: '', phone: '', date_of_birth: '', gender: 'Prefer not to say',
    emergency_contact_name: '', emergency_contact_phone: '',
    region: '', street: '', city: '', state: '', postal_code: '', country: 'Philippines',
    notes: '', position: 'Entry Level Simulationist', employment_type: 'Full-time',
    date_of_joining: '', account_expiry: '', status: 'active', role: 'instructor',
    salary: 32000, work_days_per_month: 22,
    application_date: '', interview_date: '', resume_link: '', resume_file: '',
    sss_number: '', pagibig_number: '', philhealth_number: '', tin_number: ''
  });

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showPermanentDeleteModal, setShowPermanentDeleteModal] = useState(false);

  const [generatedEmpId, setGeneratedEmpId] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [newEmployeeData, setNewEmployeeData] = useState({
    first_name: '', last_name: '', middle_initial: '', full_name: '', email: '', phone: '',
    position: 'Entry Level Simulationist', employment_type: 'Full-time', role: 'instructor', status: 'active',
    salary: 32000, application_date: '', interview_date: '', date_of_joining: '', resume_link: '',
    sss_number: '', pagibig_number: '', philhealth_number: '', tin_number: ''
  });

  const calculateDefaultSalary = (role, position) => {
    if (role !== 'instructor') return 25000;
    if (position === 'Senior Simulationist') return 45000;
    return 32000;
  };

  const updateFullName = (first, middle, last) => {
    let full = (first || '').trim();
    if (middle && middle.trim()) full += ` ${middle.trim()}`;
    if (last && last.trim()) full += ` ${last.trim()}`;
    return full;
  };

  const loadEmployees = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await axios.get(`${API_BASE}/employees`, getAuthHeaders());
      setEmployees(res.data);
    } catch (err) {
      console.error('Error loading data:', err);
      toast.error(err.response?.data?.message || 'Failed to load employees');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.em-action-dropdown') && !event.target.closest('.em-dropdown-menu')) {
        setOpenDropdownId(null);
      }
    };
    const handleScroll = () => setOpenDropdownId(null);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const handleDropdownClick = (e, empId) => {
    e.stopPropagation();
    if (openDropdownId === empId) { setOpenDropdownId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 200;
    let left = rect.right - menuWidth;
    let top = rect.bottom + 4;
    if (left < 10) left = 10;
    setDropdownPos({ top, left });
    setOpenDropdownId(empId);
  };

  const generateNewEmployeeId = async () => {
    try {
      const res = await axios.get(`${API_BASE}/employees/last-id`, getAuthHeaders());
      let lastNum = 0;
      if (res.data.lastId) {
        const match = res.data.lastId.match(/\d+/);
        if (match) lastNum = parseInt(match[0], 10);
      }
      const newNum = lastNum + 1;
      const newId = `E${newNum.toString().padStart(3, '0')}`;
      setGeneratedEmpId(newId);
      setGeneratedPassword(`Univita@${newId}`);
    } catch (err) {
      const newNum = employees.length + 1;
      const newId = `E${newNum.toString().padStart(3, '0')}`;
      setGeneratedEmpId(newId);
      setGeneratedPassword(`Univita@${newId}`);
    }
  };

  const extractDate = (isoStr) => (isoStr ? isoStr.split('T')[0] : '');

  const openEditModal = (emp) => {
    setSelectedEmployee(emp);
    let appDate = '', intDate = '', resLink = '', resFile = '', parsedNotes = '';
    let sss = emp.sss_number || '', pagibig = emp.pagibig_number || '';
    let philhealth = emp.philhealth_number || '', tin = emp.tin_number || '';
    let street = emp.street_address || emp.street || '';
    let state = emp.state_province || emp.state || '';
    let city = emp.city || '', postal = emp.postal_code || '', region = emp.region || '';

    try {
      if (emp.additional_info && emp.additional_info.startsWith('{')) {
        const parsed = JSON.parse(emp.additional_info);
        appDate = parsed.application_date || ''; intDate = parsed.interview_date || '';
        resLink = parsed.resume_link || ''; resFile = parsed.resume_file || '';
        parsedNotes = parsed.notes || '';
        if (parsed.sss_number) sss = parsed.sss_number;
        if (parsed.pagibig_number) pagibig = parsed.pagibig_number;
        if (parsed.philhealth_number) philhealth = parsed.philhealth_number;
        if (parsed.tin_number) tin = parsed.tin_number;
        if (parsed.region) region = parsed.region;
        if (!street && (parsed.street || parsed.street_address)) street = parsed.street || parsed.street_address;
        if (!state && (parsed.state || parsed.state_province)) state = parsed.state || parsed.state_province;
        if (!city && parsed.city) city = parsed.city;
        if (!postal && parsed.postal_code) postal = parsed.postal_code;
      }
    } catch (e) {}

    setFormData({
      employee_id: emp.employee_id || '', full_name: emp.full_name || '',
      first_name: emp.first_name || '', last_name: emp.last_name || '',
      middle_initial: emp.middle_initial || '', email: emp.email || '',
      phone: emp.phone_number || emp.phone || '',
      date_of_birth: extractDate(emp.date_of_birth),
      gender: emp.gender || 'Prefer not to say',
      emergency_contact_name: emp.emergency_contact_name || '',
      emergency_contact_phone: emp.emergency_contact_phone || '',
      region, street, city, state, postal_code: postal,
      country: emp.country || 'Philippines', notes: parsedNotes,
      position: emp.position_level || emp.position || 'Entry Level Simulationist',
      employment_type: emp.contract_type || emp.employment_type || 'Full-time',
      date_of_joining: extractDate(emp.date_of_joining),
      account_expiry: extractDate(emp.account_expiration_date || emp.account_expiry),
      status: emp.status || 'active', role: emp.role || 'instructor',
      salary: emp.monthly_salary || calculateDefaultSalary(emp.role, emp.position_level),
      work_days_per_month: emp.work_days_per_month || 22,
      application_date: appDate, interview_date: intDate,
      resume_link: resLink, resume_file: resFile,
      sss_number: sss, pagibig_number: pagibig, philhealth_number: philhealth, tin_number: tin
    });
    setEditResumeFile(null);
    setActiveTabModal(isAdmin ? 'account' : 'general');
    setShowChangePassword(false);
    setNewPassword(''); setConfirmPassword(''); setPasswordError('');
    setShowEditModal(true);
  };

  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'first_name' || name === 'last_name' || name === 'middle_initial') {
      setFormData(prev => {
        const newFirst = name === 'first_name' ? value : prev.first_name;
        const newMiddle = name === 'middle_initial' ? value : prev.middle_initial;
        const newLast = name === 'last_name' ? value : prev.last_name;
        return { ...prev, [name]: value, full_name: updateFullName(newFirst, newMiddle, newLast) };
      });
    } else if (name === 'role') {
      setFormData(prev => ({
        ...prev, role: value,
        position: value === 'instructor' ? 'Entry Level Simulationist' : value,
        salary: calculateDefaultSalary(value, 'Entry Level Simulationist')
      }));
    } else if (name === 'position') {
      setFormData(prev => ({ ...prev, position: value, salary: calculateDefaultSalary(prev.role, value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatDateForDB = (dateStr) => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    return dateStr.split('T')[0];
  };

  const handleUpdateEmployee = async () => {
    if (!canManageEmployee(selectedEmployee)) return toast.error('This directory is read-only.');
    const firstName = (formData.first_name || '').trim();
    const lastName = (formData.last_name || '').trim();
    const email = (formData.email || '').trim();

    if (!firstName || !lastName) {
      toast.warning('First and last names are required.');
      setActiveTabModal('general'); return;
    }
    const emailCheck = isRealEmail(email);
    if (!emailCheck.ok) {
      toast.warning(emailCheck.reason);
      setActiveTabModal(isAdmin ? 'account' : 'general'); return;
    }
    if (Number(formData.salary) < 0) {
      toast.warning('Salary cannot be negative.');
      setActiveTabModal('profile'); return;
    }

    try {
      const advancedInfoJSON = JSON.stringify({
        notes: (formData.notes || '').trim(),
        application_date: formData.application_date || null,
        interview_date: formData.interview_date || null,
        resume_link: (formData.resume_link || '').trim(),
        sss_number: (formData.sss_number || '').trim(),
        pagibig_number: (formData.pagibig_number || '').trim(),
        philhealth_number: (formData.philhealth_number || '').trim(),
        tin_number: (formData.tin_number || '').trim(),
        region: (formData.region || '').trim(),
        street: (formData.street || '').trim(),
        street_address: (formData.street || '').trim(),
        state: (formData.state || '').trim(),
        state_province: (formData.state || '').trim(),
        city: (formData.city || '').trim(),
        postal_code: (formData.postal_code || '').trim()
      });

      const fd = new FormData();
      const appendSafe = (key, val) => fd.append(key, val === null || val === undefined ? '' : val);

      appendSafe('full_name', formData.full_name.trim());
      appendSafe('first_name', firstName);
      appendSafe('last_name', lastName);
      appendSafe('middle_initial', (formData.middle_initial || '').trim());
      appendSafe('email', email);
      appendSafe('phone', (formData.phone || '').trim());
      appendSafe('position_level', formData.role === 'instructor' ? formData.position : formData.role);
      appendSafe('contract_type', formData.employment_type);
      appendSafe('status', formData.status);
      // Role reassignment is exclusively handled by Role Management.
      if (!isAdmin) appendSafe('role', formData.role);
      appendSafe('monthly_salary', Number(formData.salary));
      appendSafe('work_days_per_month', formData.work_days_per_month);
      appendSafe('gender', formData.gender);
      appendSafe('emergency_contact_name', (formData.emergency_contact_name || '').trim());
      appendSafe('emergency_contact_phone', (formData.emergency_contact_phone || '').trim());
      appendSafe('street', (formData.street || '').trim());
      appendSafe('street_address', (formData.street || '').trim());
      appendSafe('state', (formData.state || '').trim());
      appendSafe('state_province', (formData.state || '').trim());
      appendSafe('city', (formData.city || '').trim());
      appendSafe('postal_code', (formData.postal_code || '').trim());
      appendSafe('country', (formData.country || 'Philippines').trim());
      appendSafe('region', (formData.region || '').trim());
      appendSafe('sss_number', (formData.sss_number || '').trim());
      appendSafe('pagibig_number', (formData.pagibig_number || '').trim());
      appendSafe('philhealth_number', (formData.philhealth_number || '').trim());
      appendSafe('tin_number', (formData.tin_number || '').trim());
      appendSafe('date_of_joining', formatDateForDB(formData.date_of_joining));
      appendSafe('date_of_birth', formatDateForDB(formData.date_of_birth));
      appendSafe('account_expiry', formatDateForDB(formData.account_expiry));
      appendSafe('additional_info', advancedInfoJSON);
      if (editResumeFile) fd.append('resume_file', editResumeFile);

      await axios.put(`${API_BASE}/employees/${selectedEmployee.id}`, fd, getAuthHeaders());
      toast.success(isAdmin ? 'Account updated successfully!' : 'Employee updated successfully!');
      setShowEditModal(false);
      await loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Update failed.');
    }
  };

  const handleChangePassword = async () => {
    if (!canManageEmployee(selectedEmployee)) return toast.error('This directory is read-only.');
    if (!newPassword || newPassword.length < 8) return setPasswordError('Password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setPasswordError('Passwords do not match.');
    try {
      await axios.put(`${API_BASE}/users/${selectedEmployee.id}/reset-password`,
        { newPassword: newPassword.trim() }, getAuthHeaders());
      toast.success('Password changed successfully!');
      setShowChangePassword(false); setNewPassword(''); setConfirmPassword(''); setPasswordError('');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Failed to change password');
      toast.error(err.response?.data?.message || 'Failed to change password');
    }
  };

  const handleAddEmployeeChange = (field, value) => {
    setNewEmployeeData(prev => {
      let updated = { ...prev, [field]: value };
      if (['first_name', 'last_name', 'middle_initial'].includes(field)) {
        updated.full_name = updateFullName(updated.first_name, updated.middle_initial, updated.last_name);
      }
      if (field === 'role') {
        updated.position = value === 'instructor' ? 'Entry Level Simulationist' : value;
        updated.salary = calculateDefaultSalary(value, updated.position);
      }
      if (field === 'position' && updated.role === 'instructor') {
        updated.salary = calculateDefaultSalary(updated.role, value);
      }
      return updated;
    });
  };

  const handleAddEmployee = async () => {
    if (!isOwnerGroup()) return toast.error('Account creation is not permitted in this directory.');
    const firstName = (newEmployeeData.first_name || '').trim();
    const lastName = (newEmployeeData.last_name || '').trim();
    const email = (newEmployeeData.email || '').trim();
    if (!firstName || !lastName) return toast.warning('Please enter First and Last Name.');
    const emailCheck = isRealEmail(email);
    if (!emailCheck.ok) {
      setActiveTabModal?.('account');
      return toast.warning(emailCheck.reason);
    }
    if (Number(newEmployeeData.salary) < 0) return toast.warning('Salary cannot be negative.');

    try {
      const advancedInfoJSON = JSON.stringify({
        application_date: newEmployeeData.application_date || null,
        interview_date: newEmployeeData.interview_date || null,
        resume_link: (newEmployeeData.resume_link || '').trim(),
        sss_number: (newEmployeeData.sss_number || '').trim(),
        pagibig_number: (newEmployeeData.pagibig_number || '').trim(),
        philhealth_number: (newEmployeeData.philhealth_number || '').trim(),
        tin_number: (newEmployeeData.tin_number || '').trim()
      });
      const fd = new FormData();
      const appendSafe = (key, val) => fd.append(key, val === null || val === undefined ? '' : val);
      appendSafe('employee_id', generatedEmpId);
      appendSafe('full_name', newEmployeeData.full_name.trim());
      appendSafe('first_name', firstName);
      appendSafe('last_name', lastName);
      appendSafe('middle_initial', (newEmployeeData.middle_initial || '').trim());
      appendSafe('email', email);
      appendSafe('phone', (newEmployeeData.phone || '').trim());
      appendSafe('position_level', newEmployeeData.role === 'instructor' ? newEmployeeData.position : newEmployeeData.role);
      appendSafe('contract_type', newEmployeeData.employment_type);
      appendSafe('status', newEmployeeData.status);
      appendSafe('role', newEmployeeData.role);
      appendSafe('password', generatedPassword);
      appendSafe('monthly_salary', Number(newEmployeeData.salary));
      appendSafe('work_days_per_month', 22);
      appendSafe('date_of_joining', newEmployeeData.date_of_joining || '');
      appendSafe('additional_info', advancedInfoJSON);
      appendSafe('sss_number', (newEmployeeData.sss_number || '').trim());
      appendSafe('pagibig_number', (newEmployeeData.pagibig_number || '').trim());
      appendSafe('philhealth_number', (newEmployeeData.philhealth_number || '').trim());
      appendSafe('tin_number', (newEmployeeData.tin_number || '').trim());
      if (newResumeFile) fd.append('resume_file', newResumeFile);

      await axios.post(`${API_BASE}/employees`, fd, getAuthHeaders());
      toast.success(`Employee added successfully! ID: ${generatedEmpId}`);
      setShowAddModal(false);
      setNewEmployeeData({
        first_name: '', last_name: '', middle_initial: '', full_name: '', email: '', phone: '',
        position: isAdmin ? 'security' : 'Entry Level Simulationist',
        employment_type: 'Full-time',
        role: isAdmin ? 'security' : 'instructor',
        status: 'active',
        salary: isAdmin ? 25000 : 32000,
        application_date: '', interview_date: '', date_of_joining: '', resume_link: '',
        sss_number: '', pagibig_number: '', philhealth_number: '', tin_number: ''
      });
      setNewResumeFile(null); setGeneratedEmpId(''); setGeneratedPassword('');
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Error adding employee');
    }
  };

  const handleStatusChange = async (emp, newStatus) => {
    if (!canManageEmployee(emp)) return toast.error('This directory is read-only.');
    try {
      await axios.put(`${API_BASE}/employees/${emp.id}`, { status: newStatus }, getAuthHeaders());
      toast.success(`Status updated to ${newStatus} successfully.`);
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    }
  };

  const handleArchive = (emp) => { if (!canManageEmployee(emp)) return; setArchiveTarget(emp); setShowArchiveModal(true); };
  const confirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      await axios.put(`${API_BASE}/employees/${archiveTarget.id}`, { status: 'archived' }, getAuthHeaders());
      toast.info('Archived successfully.');
      loadEmployees();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to archive.'); }
    finally { setShowArchiveModal(false); setArchiveTarget(null); }
  };

  const handleDelete = (emp) => { if (!isAdmin || emp?.role === 'instructor') return; setDeleteTarget(emp); setShowDeleteModal(true); };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.put(`${API_BASE}/employees/${deleteTarget.id}`, { status: 'deleted' }, getAuthHeaders());
      toast.info('Moved to Trash.');
      loadEmployees();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to move to Trash.'); }
    finally { setShowDeleteModal(false); setDeleteTarget(null); }
  };

  const handlePermanentDelete = (emp) => { setDeleteTarget(emp); setShowPermanentDeleteModal(true); };
  const confirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${API_BASE}/employees/${deleteTarget.id}`, getAuthHeaders());
      toast.success('Account permanently deleted.');
      loadEmployees();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete.'); }
    finally { setShowPermanentDeleteModal(false); setDeleteTarget(null); }
  };

  const getFilteredList = () => employees.filter(emp => {
    const groupMatches = directoryGroup === 'instructors'
      ? emp.role === 'instructor'
      : emp.role !== 'instructor';
    const statusMatches = emp.status === activeTab;
    const search = searchTerm.trim().toLowerCase();
    const searchMatches = [emp.full_name, emp.employee_id, emp.email]
      .some(value => String(value || '').toLowerCase().includes(search));
    return groupMatches && statusMatches && searchMatches;
  });

  const groupCount = (group, status = 'active') => employees.filter(emp =>
    (group === 'instructors' ? emp.role === 'instructor' : emp.role !== 'instructor') &&
    emp.status === status
  ).length;

  const filteredEmployees = getFilteredList();
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1); setOpenDropdownId(null); }, [activeTab, directoryGroup, searchTerm]);

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const activeEmployees = employees.filter(e => e.status === 'active');
  const instructorsCount = activeEmployees.filter(e => e.role === 'instructor').length;
  const staffCount = activeEmployees.filter(e => e.role !== 'instructor').length;
  const deletedCount = employees.filter(e => e.status === 'deleted').length;
  const deactivatedCount = employees.filter(e => e.status === 'deactivated').length;

  const editTabs = isAdmin
    ? [{ key: 'account', label: 'Account & Role' }]
    : [
        { key: 'general', label: 'General' },
        { key: 'profile', label: 'Personal Details' },
        { key: 'statutory', label: 'Statutory IDs' },
        { key: 'onboarding', label: 'Onboarding' },
        { key: 'address', label: 'Address' }
      ];

  return (
    <div className="em-container">
      <header className="em-header">
        <div className="em-title-block">
          
          <p>
            {isAdmin
              ? 'Manage administrative staff accounts. Instructor records are available for viewing only. Role transfers are managed in Role Management.'
              : 'Manage instructor employment records. Administrative staff accounts are available for viewing only.'}
          </p>
        </div>
        <div className="em-header-actions">
          <button className={`em-btn-refresh ${isRefreshing ? 'spinning' : ''}`} onClick={loadEmployees} title="Refresh employee directory" aria-label="Refresh employee directory">
            <RefreshCw size={16} />
          </button>
          {isOwnerGroup() && (
            <button
              className="em-btn-add"
              onClick={() => {
                generateNewEmployeeId();
                if (isAdmin) {
                  setNewEmployeeData(prev => ({ ...prev, role: 'security', position: 'security', salary: calculateDefaultSalary('security', 'security') }));
                } else {
                  setNewEmployeeData(prev => ({ ...prev, role: 'instructor', position: 'Entry Level Simulationist', salary: calculateDefaultSalary('instructor', 'Entry Level Simulationist') }));
                }
                setShowAddModal(true);
              }}
            >
              <Plus size={18} /> Add Employee
            </button>
          )}
        </div>
      </header>

      <section className="em-stats-cards" aria-label="Directory summary">
        {isAdmin ? (
          <>
            <div className="em-stat-card">
             
              <div className="em-stat-info">
                <span className="em-stat-value">{activeEmployees.length}</span>
                <span className="em-stat-label">ACTIVE ACCOUNTS</span>
              </div>
            </div>
            <div className="em-stat-card">
              
              <div className="em-stat-info">
                <span className="em-stat-value">{deactivatedCount}</span>
                <span className="em-stat-label">DEACTIVATED</span>
              </div>
            </div>
            <div className="em-stat-card">
              
              <div className="em-stat-info">
                <span className="em-stat-value">{deletedCount}</span>
                <span className="em-stat-label">DELETED</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="em-stat-card">
              <div className="em-stat-icon"><Users size={22} /></div>
              <div className="em-stat-info">
                <span className="em-stat-value">{activeEmployees.length}</span>
                <span className="em-stat-label">ACTIVE PERSONNEL</span>
              </div>
            </div>
            <div className="em-stat-card">
              <div className="em-stat-icon"><UserCheck size={22} /></div>
              <div className="em-stat-info">
                <span className="em-stat-value">{instructorsCount}</span>
                <span className="em-stat-label">INSTRUCTORS</span>
              </div>
            </div>
            <div className="em-stat-card">
              <div className="em-stat-icon"><AlertCircle size={22} /></div>
              <div className="em-stat-info">
                <span className="em-stat-value">{staffCount}</span>
                <span className="em-stat-label">ADMINISTRATIVE STAFF</span>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="em-workspace" aria-label="Employee records">
        <div className="em-workspace-heading">
          <div>
            <span className="em-workspace-kicker">PERSONNEL RECORDS</span>
            
          </div>
          <span className="em-record-count">{filteredEmployees.length} {filteredEmployees.length === 1 ? 'record' : 'records'}</span>
        </div>
      <div className="em-directory-tabs" role="tablist" aria-label="Employee directory category">
        {[{key:'staff',label:'Staff'}, {key:'instructors',label:'Instructors'}].map(group => (
          <button key={group.key} type="button" role="tab" aria-selected={directoryGroup === group.key}
            className={`em-directory-tab ${directoryGroup === group.key ? 'active' : ''}`}
            onClick={() => { setDirectoryGroup(group.key); setActiveTab('active'); }}>
            {group.label} <span className="em-tab-count">{groupCount(group.key)}</span>
          </button>
        ))}
      </div>
      <div className="em-directory-context">
        <span>{isOwnerGroup() ? 'Management access' : 'View-only access'} · {directoryGroup === 'staff' ? 'Administrative staff' : 'Clinical instructors'}</span>
      </div>
      <div className="em-toolbar">
        <div className="em-filter-tabs" role="tablist" aria-label="Account status">
          {[
            { key: 'active', label: 'Active' },
            { key: 'deactivated', label: 'Deactivated' },
            { key: 'archived', label: 'Archived' },
            ...(isAdmin && directoryGroup === 'staff' ? [{ key: 'deleted', label: 'Deleted' }] : [])
          ].map(tab => (
            <button type="button" role="tab" key={tab.key} aria-selected={activeTab === tab.key}
              className={`em-filter-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}>
              {tab.label} <span className="em-tab-count">{groupCount(directoryGroup,tab.key)}</span>
            </button>
          ))}
        </div>
        <div className="em-search-wrapper">
          <Search size={18} className="em-search-icon" />
          <input type="text"
            placeholder="Search by name, ID, or email..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            aria-label="Search employees by name ID or email"
            className="em-search-input" />
        </div>
      </div>

      <div className="em-table-wrapper">
        <table className="em-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              {isAdmin ? <th>Role</th> : <><th>Position</th><th>Contract</th></>}
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEmployees.length === 0 ? (
              <tr className="em-empty-row">
                <td colSpan={isAdmin ? 6 : 7}>
                  {isAdmin ? 'No matching accounts found.' : 'No matching employees found.'}
                </td>
              </tr>
            ) : (
              paginatedEmployees.map(emp => (
                <tr key={emp.id}>
                  <td className="em-emp-id">{emp.employee_id}</td>
                  <td className="em-emp-name">
                    <div className="em-user-cell">
                      <div className="em-avatar">{getInitials(emp.full_name)}</div>
                      <span className="em-user-name">{emp.full_name}</span>
                    </div>
                  </td>
                  <td className="em-emp-email">{emp.email}</td>
                  {isAdmin ? (
                    <td style={{ textTransform: 'capitalize' }}>{formatRole(emp.role)}</td>
                  ) : (
                    <>
                      <td className="em-emp-position" style={{ textTransform: 'capitalize' }}>
                        {emp.role === 'instructor' ? (emp.position_level || emp.position || 'Instructor') : emp.role.replace('_', ' ')}
                      </td>
                      <td className="em-emp-contract">{emp.contract_type || emp.employment_type || '—'}</td>
                    </>
                  )}
                  <td>
                    <span className={`em-status-badge ${
                      emp.status === 'active' ? 'active'
                      : emp.status === 'deactivated' ? 'inactive'
                      : emp.status === 'archived' ? 'archived'
                      : 'deleted'}`}>
                      {emp.status === 'active' ? 'Active'
                        : emp.status === 'deactivated' ? 'Deactivated'
                        : emp.status === 'archived' ? 'Archived'
                        : 'Deleted'}
                    </span>
                  </td>
                  <td className="em-actions" style={{ justifyContent: 'flex-end' }}>
                    {emp.status !== 'deleted' && canManageEmployee(emp) && (
                      <button className="em-btn-action-edit" onClick={() => openEditModal(emp)}>
                        {isAdmin ? 'Manage' : 'Edit'}
                      </button>
                    )}
                    {emp.status === 'deleted' && canManageEmployee(emp) && (
                      <button className="em-btn-action-edit" onClick={() => openEditModal(emp)}>Manage</button>
                    )}

                    {!canManageEmployee(emp) && (
                      <button type="button" className="em-btn-action-edit" onClick={() => {setSelectedEmployee(emp); setShowViewModal(true);}}>
                        <Eye size={14} /> View Details
                      </button>
                    )}
                    {canManageEmployee(emp) && <div className="em-action-dropdown">
                      <button className="em-btn-action-more" onClick={(e) => handleDropdownClick(e, emp.id)}>
                        <MoreVertical size={16} />
                      </button>

                      {openDropdownId === emp.id && createPortal(
                        <div className="em-dropdown-menu" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
                          {isHR && emp.role === 'instructor' && (
                            <>
                              {emp.status === 'active' && (
                                <>
                                  <button className="em-dropdown-item" onClick={() => { setOpenDropdownId(null); handleStatusChange(emp, 'deactivated'); }}>
                                    <Power size={14} /> Deactivate
                                  </button>
                                  <button className="em-dropdown-item warning" onClick={() => { setOpenDropdownId(null); handleArchive(emp); }}>
                                    <Archive size={14} /> Archive
                                  </button>
                                </>
                              )}
                              {emp.status === 'deactivated' && (
                                <>
                                  <button className="em-dropdown-item success" onClick={() => { setOpenDropdownId(null); handleStatusChange(emp, 'active'); }}>
                                    <Power size={14} /> Activate
                                  </button>
                                  <button className="em-dropdown-item warning" onClick={() => { setOpenDropdownId(null); handleArchive(emp); }}>
                                    <Archive size={14} /> Archive
                                  </button>
                                </>
                              )}
                              {emp.status === 'archived' && (
                                <button className="em-dropdown-item success" onClick={() => { setOpenDropdownId(null); handleStatusChange(emp, 'active'); }}>
                                  <RotateCcw size={14} /> Restore
                                </button>
                              )}
                            </>
                          )}

                          {isAdmin && emp.role !== 'instructor' && (
                            <>
                              {emp.status === 'active' && (
                                <>
                                  {String(emp.id) !== String(currentUserId) && (
                                    <button className="em-dropdown-item" onClick={() => { setOpenDropdownId(null); handleStatusChange(emp, 'deactivated'); }}>
                                      <Power size={14} /> Deactivate
                                    </button>
                                  )}
                                  {String(emp.id) !== String(currentUserId) && (
                                    <button className="em-dropdown-item warning" onClick={() => { setOpenDropdownId(null); handleArchive(emp); }}>
                                      <Archive size={14} /> Archive
                                    </button>
                                  )}
                                  {String(emp.id) !== String(currentUserId) && (
                                    <button className="em-dropdown-item danger" onClick={() => { setOpenDropdownId(null); handleDelete(emp); }}>
                                      <Trash2 size={14} /> Move to Trash
                                    </button>
                                  )}
                                </>
                              )}
                              
                              {String(emp.id) === String(currentUserId) && (
                                <div className="em-dropdown-item disabled">
                                  Cannot modify own account
                                </div>
                              )}

                              {emp.status === 'deactivated' && (
                                <>
                                  <button className="em-dropdown-item success" onClick={() => { setOpenDropdownId(null); handleStatusChange(emp, 'active'); }}>
                                    <Power size={14} /> Activate
                                  </button>
                                  {String(emp.id) !== String(currentUserId) && (
                                    <button className="em-dropdown-item warning" onClick={() => { setOpenDropdownId(null); handleArchive(emp); }}>
                                      <Archive size={14} /> Archive
                                    </button>
                                  )}
                                  {String(emp.id) !== String(currentUserId) && (
                                    <button className="em-dropdown-item danger" onClick={() => { setOpenDropdownId(null); handleDelete(emp); }}>
                                      <Trash2 size={14} /> Move to Trash
                                    </button>
                                  )}
                                </>
                              )}
                              
                              {emp.status === 'archived' && (
                                <>
                                  <button className="em-dropdown-item success" onClick={() => { setOpenDropdownId(null); handleStatusChange(emp, 'active'); }}>
                                    <RotateCcw size={14} /> Restore
                                  </button>
                                  {String(emp.id) !== String(currentUserId) && (
                                    <button className="em-dropdown-item danger" onClick={() => { setOpenDropdownId(null); handleDelete(emp); }}>
                                      <Trash2 size={14} /> Move to Trash
                                    </button>
                                  )}
                                </>
                              )}
                              {emp.status === 'deleted' && (
                                <>
                                  <button className="em-dropdown-item success" onClick={() => { setOpenDropdownId(null); handleStatusChange(emp, 'active'); }}>
                                    <RotateCcw size={14} /> Restore
                                  </button>
                                  {String(emp.id) !== String(currentUserId) && (
                                    <button className="em-dropdown-item danger" onClick={() => { setOpenDropdownId(null); handlePermanentDelete(emp); }}>
                                      <AlertTriangle size={14} /> Permanently Delete
                                    </button>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>,
                        document.body
                      )}
                    </div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="em-pagination">
          <button className="em-page-arrow" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
            <ChevronLeft size={16} />
          </button>
          <span className="em-pagination-info">Page {currentPage} of {totalPages}</span>
          <button className="em-page-arrow" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      </section>

      <FormalModal show={showViewModal} onClose={() => setShowViewModal(false)} title="Employee Information" wide>
        <div className="em-section-notice teal"><Eye size={18} aria-hidden="true" /><span className="em-readonly-notice-text">Read-only record. Changes are restricted to the responsible department.</span></div>
        <div className="em-readonly-grid">
          {[
            ['Employee ID', selectedEmployee?.employee_id],
            ['Full Name', selectedEmployee?.full_name],
            ['Email', selectedEmployee?.email],
            ['System Role', formatRole(selectedEmployee?.role)],
            ['Status', selectedEmployee?.status],
            ['Position', selectedEmployee?.position_level || selectedEmployee?.position],
            ['Employment Type', selectedEmployee?.contract_type || selectedEmployee?.employment_type],
            ['Contact Number', selectedEmployee?.phone_number || selectedEmployee?.phone],
            ['Date Joined', selectedEmployee?.date_of_joining ? String(selectedEmployee.date_of_joining).slice(0,10) : '—']
          ].map(([label,value]) => (
            <div key={label} className="em-readonly-field"><span>{label}</span><strong>{value || '—'}</strong></div>
          ))}
        </div>
        <div className="em-modal-actions"><button className="em-btn-cancel" onClick={() => setShowViewModal(false)}>Close</button></div>
      </FormalModal>

      {isOwnerGroup() && (
        <FormalModal show={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Employee" wide>
          <div className="em-section-notice">
            Fields marked with <span className="em-req-star">*</span> are strictly required.
          </div>

          <div className="em-form-row">
            <div className="em-form-group">
              <label>First Name <span className="em-req-star">*</span></label>
              <input className="em-input" placeholder="e.g. Maria" value={newEmployeeData.first_name} onChange={e => handleAddEmployeeChange('first_name', e.target.value)} />
            </div>
            <div className="em-form-group">
              <label>Last Name <span className="em-req-star">*</span></label>
              <input className="em-input" placeholder="e.g. Santos" value={newEmployeeData.last_name} onChange={e => handleAddEmployeeChange('last_name', e.target.value)} />
            </div>
            <div className="em-form-group">
              <label>Middle Initial</label>
              <input className="em-input" placeholder="e.g. D" maxLength={1} value={newEmployeeData.middle_initial} onChange={e => handleAddEmployeeChange('middle_initial', e.target.value)} />
            </div>
          </div>

          <div className="em-form-row">
            <div className="em-form-group">
              <label>Email Address <span className="em-req-star">*</span></label>
              <input type="email" className="em-input" placeholder="e.g. maria@company.com" value={newEmployeeData.email} onChange={e => handleAddEmployeeChange('email', e.target.value)} />
            </div>
            <div className="em-form-group">
              <label>Phone Number</label>
              <input type="tel" className="em-input" placeholder="e.g. 09171234567" value={newEmployeeData.phone} onChange={e => handleAddEmployeeChange('phone', e.target.value)} />
            </div>
          </div>

          <div className="em-form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="em-form-group">
              <label>System Role</label>
              <select className="em-input" value={newEmployeeData.role} onChange={e => handleAddEmployeeChange('role', e.target.value)}>
                {isHR && <option value="instructor">Instructor</option>}
                {isAdmin && (
                  <>
                    <option value="admin">System Admin</option>
                    <option value="hr_admin">HR Administrator</option>
                    <option value="security">Security</option>
                  </>
                )}
              </select>
            </div>
            {newEmployeeData.role === 'instructor' && (
              <div className="em-form-group">
                <label>Instructor Position</label>
                <select className="em-input" value={newEmployeeData.position} onChange={e => handleAddEmployeeChange('position', e.target.value)}>
                  <option value="Entry Level Simulationist">Entry Level Simulationist</option>
                  <option value="Senior Simulationist">Senior Simulationist</option>
                </select>
              </div>
            )}
            <div className="em-form-group">
              <label>Employment Type</label>
              <select className="em-input" value={newEmployeeData.employment_type} onChange={e => handleAddEmployeeChange('employment_type', e.target.value)}>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Provisionary">Provisionary</option>
                <option value="Project-based">Project-based</option>
                <option value="Consultant">Consultant</option>
              </select>
            </div>
            <div className="em-form-group">
              <label>Base Monthly Salary (₱)</label>
              <input type="number" className="em-input" min="0" value={newEmployeeData.salary} onChange={e => handleAddEmployeeChange('salary', e.target.value)} />
            </div>
          </div>

          <div className="em-section-notice green">
            <CreditCard size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            Government Statutory Identification (Philippines)
          </div>
          <div className="em-form-row">
            <div className="em-form-group">
              <label>SSS Number</label>
              <input className="em-input" placeholder="e.g. 34-1234567-8" value={newEmployeeData.sss_number} onChange={e => handleAddEmployeeChange('sss_number', e.target.value)} />
            </div>
            <div className="em-form-group">
              <label>Pag-IBIG / HDMF MID</label>
              <input className="em-input" placeholder="e.g. 1210-1234-5678" value={newEmployeeData.pagibig_number} onChange={e => handleAddEmployeeChange('pagibig_number', e.target.value)} />
            </div>
          </div>
          <div className="em-form-row">
            <div className="em-form-group">
              <label>PhilHealth PIN</label>
              <input className="em-input" placeholder="e.g. 12-345678901-2" value={newEmployeeData.philhealth_number} onChange={e => handleAddEmployeeChange('philhealth_number', e.target.value)} />
            </div>
            <div className="em-form-group">
              <label>Tax Identification No. (TIN)</label>
              <input className="em-input" placeholder="e.g. 123-456-789-000" value={newEmployeeData.tin_number} onChange={e => handleAddEmployeeChange('tin_number', e.target.value)} />
            </div>
          </div>

          <div className="em-section-notice blue">
            Onboarding & Hiring Dates
          </div>
          <div className="em-form-row">
            <div className="em-form-group">
              <label>Date Applied</label>
              <input type="date" className="em-input" value={newEmployeeData.application_date} onChange={e => handleAddEmployeeChange('application_date', e.target.value)} />
            </div>
            <div className="em-form-group">
              <label>Date Interviewed</label>
              <input type="date" className="em-input" value={newEmployeeData.interview_date} onChange={e => handleAddEmployeeChange('interview_date', e.target.value)} />
            </div>
            <div className="em-form-group">
              <label>Hire Date (Date of Joining)</label>
              <input type="date" className="em-input" value={newEmployeeData.date_of_joining} onChange={e => handleAddEmployeeChange('date_of_joining', e.target.value)} />
            </div>
          </div>

          <div className="em-form-row">
            <div className="em-form-group">
              <label><FileText size={14} style={{display:'inline', marginBottom:'-2px'}}/> Document Link</label>
              <input type="url" className="em-input" placeholder="https://..." value={newEmployeeData.resume_link} onChange={e => handleAddEmployeeChange('resume_link', e.target.value)} />
            </div>
            <div className="em-form-group">
              <label><UploadCloud size={14} style={{display:'inline', marginBottom:'-2px'}}/> Upload PDF Resume</label>
              <input type="file" accept=".pdf" onChange={(e) => setNewResumeFile(e.target.files[0])} className="em-input" style={{ padding: '0.4rem 0' }} />
            </div>
          </div>

          <div className="em-form-row">
            <div className="em-form-group">
              <label>Employee ID (auto)</label>
              <input value={generatedEmpId} disabled className="em-input em-disabled-input" />
            </div>
            <div className="em-form-group">
              <label>Default Password</label>
              <div className="em-copy-input-wrapper">
                <input value={generatedPassword} disabled className="em-input em-disabled-input" />
                <button type="button" className="em-btn-copy" onClick={() => { navigator.clipboard.writeText(generatedPassword); toast.info('Password copied'); }}>
                  <Copy size={14} /> Copy
                </button>
              </div>
            </div>
          </div>

          <div className="em-modal-actions">
            <button className="em-btn-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button className="em-btn-save" onClick={handleAddEmployee}>Add Employee</button>
          </div>
        </FormalModal>
      )}

      <FormalModal
        show={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={isAdmin ? 'Manage Account Access' : 'Edit Employee Profile'}
        wide
      >
        <div className="em-edit-layout">
          <div className="em-edit-sidebar">
            <div className="em-edit-avatar">{getInitials(selectedEmployee?.full_name || '')}</div>
            <h3>{selectedEmployee?.full_name}</h3>
            <p>{selectedEmployee?.employee_id}</p>
            <div className="em-edit-tabs">
              {editTabs.map(t => (
                <button key={t.key}
                  className={`em-tab-btn ${activeTabModal === t.key ? 'active' : ''}`}
                  onClick={() => setActiveTabModal(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="em-edit-content">
            <div className="em-edit-tab-body">

              {isAdmin && activeTabModal === 'account' && (
                <div className="em-account-tab-content">
                  <div className="em-section-notice teal">
                    <Shield size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    System access is managed here. Personal and employment details are owned by HR.
                  </div>
                  <div className="em-form-group">
                    <label>System Role</label>
                    <select name="role" value={formData.role} disabled className="em-input" title="Use Role Management to reassign system roles">
                      {formData.role === 'instructor' ? (
                        <option value="instructor">Instructor</option>
                      ) : (
                        <>
                          <option value="admin">System Admin</option>
                          <option value="hr_admin">HR Administrator</option>
                          <option value="security">Security</option>
                        </>
                      )}
                    </select>
                  </div>
                  {formData.role === 'instructor' && (
                    <div className="em-form-group">
                      <label>Instructor Position</label>
                      <select name="position" value={formData.position} onChange={handleEditInputChange} className="em-input">
                        <option value="Entry Level Simulationist">Entry Level Simulationist</option>
                        <option value="Senior Simulationist">Senior Simulationist</option>
                      </select>
                    </div>
                  )}
                  <div className="em-form-row">
                    <div className="em-form-group"><label>First Name</label><input className="em-input" name="first_name" value={formData.first_name} onChange={handleEditInputChange}/></div>
                    <div className="em-form-group"><label>Last Name</label><input className="em-input" name="last_name" value={formData.last_name} onChange={handleEditInputChange}/></div>
                  </div>
                  <div className="em-form-group"><label>Phone Number</label><input className="em-input" name="phone" value={formData.phone} onChange={handleEditInputChange}/></div>
                  <div className="em-form-group">
                    <label>Email Address <span className="em-req-star">*</span></label>
                    <input name="email" value={formData.email} onChange={handleEditInputChange} className="em-input" />
                  </div>
                  <div className="em-form-group">
                    <label>Account Status</label>
                    <select name="status" value={formData.status} onChange={handleEditInputChange} className="em-input">
                      <option value="active">Active</option>
                      <option value="deactivated">Deactivated</option>
                      <option value="archived">Archived</option>
                      <option value="deleted">Deleted (Trash)</option>
                    </select>
                  </div>

                  {!showChangePassword ? (
                    <button className="em-btn-change-password" onClick={() => setShowChangePassword(true)}>
                      <KeyRound size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                      Change Password
                    </button>
                  ) : (
                    <div className="em-change-password-section">
                      <div className="em-form-group">
                        <label>New Password</label>
                        <div className="em-password-wrapper">
                          <input type={showPassword ? 'text' : 'password'} className="em-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                          <button type="button" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                        </div>
                      </div>
                      <div className="em-form-group">
                        <label>Confirm Password</label>
                        <div className="em-password-wrapper">
                          <input type={showConfirmPassword ? 'text' : 'password'} className="em-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                            {showConfirmPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                        </div>
                      </div>
                      {passwordError && <p className="em-error-text">{passwordError}</p>}
                      <div className="em-password-actions">
                        <button className="em-btn-save-password" onClick={handleChangePassword}>Save Password</button>
                        <button className="em-btn-cancel-password" onClick={() => { setShowChangePassword(false); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isHR && activeTabModal === 'general' && (
                <>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>First Name <span className="em-req-star">*</span></label>
                      <input name="first_name" className="em-input" value={formData.first_name} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Last Name <span className="em-req-star">*</span></label>
                      <input name="last_name" className="em-input" value={formData.last_name} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Middle Initial</label>
                      <input name="middle_initial" className="em-input" value={formData.middle_initial} onChange={handleEditInputChange} maxLength={1} />
                    </div>
                  </div>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>Email Address <span className="em-req-star">*</span></label>
                      <input name="email" className="em-input" value={formData.email} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Contract Type</label>
                      <select name="employment_type" className="em-input" value={formData.employment_type} onChange={handleEditInputChange}>
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Provisionary">Provisionary</option>
                        <option value="Project-based">Project-based</option>
                        <option value="Consultant">Consultant</option>
                      </select>
                    </div>
                  </div>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>Employment Status</label>
                      <select name="status" className="em-input" value={formData.status} onChange={handleEditInputChange}>
                        <option value="active">Active</option>
                        <option value="deactivated">Deactivated</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {isHR && activeTabModal === 'profile' && (
                <>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>Date of Birth</label>
                      <input type="date" name="date_of_birth" className="em-input" value={formData.date_of_birth} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Gender</label>
                      <select name="gender" className="em-input" value={formData.gender} onChange={handleEditInputChange}>
                        <option>Male</option><option>Female</option><option>Prefer not to say</option>
                      </select>
                    </div>
                  </div>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>Phone Number</label>
                      <input name="phone" className="em-input" value={formData.phone} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Monthly Salary (₱)</label>
                      <input type="number" min="0" name="salary" className="em-input" value={formData.salary} onChange={handleEditInputChange} />
                    </div>
                  </div>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>Emergency Contact Name</label>
                      <input name="emergency_contact_name" className="em-input" value={formData.emergency_contact_name} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Emergency Contact Phone</label>
                      <input name="emergency_contact_phone" className="em-input" value={formData.emergency_contact_phone} onChange={handleEditInputChange} />
                    </div>
                  </div>
                </>
              )}

              {isHR && activeTabModal === 'statutory' && (
                <div className="em-statutory-tab-content">
                  <div className="em-section-notice green">
                    Philippine Mandatory Benefits & Government Contribution Identifiers.
                  </div>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>Social Security System (SSS) No.</label>
                      <input name="sss_number" className="em-input" placeholder="e.g. 34-1234567-8" value={formData.sss_number} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Pag-IBIG / HDMF MID No.</label>
                      <input name="pagibig_number" className="em-input" placeholder="e.g. 1210-1234-5678" value={formData.pagibig_number} onChange={handleEditInputChange} />
                    </div>
                  </div>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>PhilHealth PIN</label>
                      <input name="philhealth_number" className="em-input" placeholder="e.g. 12-345678901-2" value={formData.philhealth_number} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Taxpayer Identification No. (TIN)</label>
                      <input name="tin_number" className="em-input" placeholder="e.g. 123-456-789-000" value={formData.tin_number} onChange={handleEditInputChange} />
                    </div>
                  </div>
                </div>
              )}

              {isHR && activeTabModal === 'onboarding' && (
                <>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label><Calendar size={14} style={{display:'inline', marginBottom:'-2px'}}/> Date Applied</label>
                      <input type="date" name="application_date" className="em-input" value={formData.application_date} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label><Calendar size={14} style={{display:'inline', marginBottom:'-2px'}}/> Date Interviewed</label>
                      <input type="date" name="interview_date" className="em-input" value={formData.interview_date} onChange={handleEditInputChange} />
                    </div>
                  </div>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label><CheckCircle size={14} style={{display:'inline', marginBottom:'-2px'}}/> Hire Date / Date Joined</label>
                      <input type="date" name="date_of_joining" className="em-input" value={formData.date_of_joining} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label><FileText size={14} style={{display:'inline', marginBottom:'-2px'}}/> Document Link</label>
                      <input type="url" name="resume_link" className="em-input" placeholder="https://..." value={formData.resume_link} onChange={handleEditInputChange} />
                      {formData.resume_link && (
                        <a href={formData.resume_link} target="_blank" rel="noreferrer" className="em-link-text">Visit Link</a>
                      )}
                    </div>
                  </div>
                  <div className="em-form-group">
                    <label><UploadCloud size={14} style={{display:'inline', marginBottom:'-2px'}}/> Upload PDF Resume</label>
                    <input type="file" accept=".pdf" className="em-input" onChange={(e) => setEditResumeFile(e.target.files[0])} style={{ padding: '0.4rem 0' }} />
                    {formData.resume_file && !editResumeFile && (
                      <a href={`${API_BASE.replace('/api', '')}${formData.resume_file}`} target="_blank" rel="noreferrer" className="em-link-text success">View Current Resume File</a>
                    )}
                  </div>
                  <div className="em-form-group">
                    <label>HR Onboarding Notes</label>
                    <textarea name="notes" className="em-input" rows="3" value={formData.notes} onChange={handleEditInputChange} placeholder="Additional details from interview or hiring process..." />
                  </div>
                </>
              )}

              {isHR && activeTabModal === 'address' && (
                <div className="em-address-tab-content">
                  <div className="em-form-row">
                    <AutocompleteInput label="Region" name="region" value={formData.region}
                      placeholder="e.g. NCR - National Capital Region" suggestions={PH_REGIONS}
                      onChange={handleEditInputChange}
                      onSelect={(selectedRegion) => {
                        setFormData(prev => ({
                          ...prev, region: selectedRegion,
                          state: selectedRegion.startsWith('NCR') ? 'Metro Manila' : prev.state
                        }));
                      }} />
                    <AutocompleteInput label="State / Province" name="state" value={formData.state}
                      placeholder="e.g. Metro Manila or Cavite" suggestions={PH_PROVINCES}
                      onChange={handleEditInputChange}
                      onSelect={(selectedProvince) => setFormData(prev => ({ ...prev, state: selectedProvince }))} />
                  </div>
                  <div className="em-form-row">
                    <AutocompleteInput label="City / Municipality" name="city" value={formData.city}
                      placeholder="e.g. Pasay City" suggestions={PH_CITIES}
                      onChange={handleEditInputChange}
                      onSelect={(selectedCity) => {
                        setFormData(prev => ({
                          ...prev, city: selectedCity.name,
                          state: selectedCity.province || prev.state,
                          region: selectedCity.region || prev.region,
                          postal_code: selectedCity.zip || prev.postal_code
                        }));
                      }} />
                    <div className="em-form-group">
                      <label>Postal Code</label>
                      <input name="postal_code" className="em-input" placeholder="e.g. 1300" value={formData.postal_code} onChange={handleEditInputChange} />
                    </div>
                  </div>
                  <div className="em-form-row">
                    <div className="em-form-group">
                      <label>Street Address</label>
                      <input name="street" className="em-input" placeholder="e.g. 123 Taft Avenue, Unit 4B" value={formData.street} onChange={handleEditInputChange} />
                    </div>
                    <div className="em-form-group">
                      <label>Country</label>
                      <input name="country" className="em-input" value={formData.country || 'Philippines'} onChange={handleEditInputChange} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="em-modal-actions">
              <button className="em-btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="em-btn-save" onClick={handleUpdateEmployee}>
                {isAdmin ? 'Save Account Changes' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </FormalModal>

      <FormalModal show={showArchiveModal} onClose={() => setShowArchiveModal(false)} title="Archive" small>
        <p className="em-modal-confirm-text">
          Are you sure you want to archive <strong>{archiveTarget?.full_name}</strong>?
          This will hide them from active lists while preserving their historical records.
          <br /><br /><strong>Note:</strong> Archived employees cannot be assigned to new schedules.
        </p>
        <div className="em-modal-actions border-none">
          <button className="em-btn-cancel" onClick={() => setShowArchiveModal(false)}>Cancel</button>
          <button className="em-btn-save" onClick={confirmArchive}>Archive</button>
        </div>
      </FormalModal>

      {isAdmin && (
        <FormalModal show={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Move to Trash" small>
          <p className="em-modal-confirm-text">
            Move <strong>{deleteTarget?.full_name}</strong> to the <strong>Trash (Deleted Accounts)</strong>?
            <br /><br />Only a System Administrator can restore this record or permanently wipe it.
          </p>
          <div className="em-modal-actions border-none">
            <button className="em-btn-cancel" onClick={() => setShowDeleteModal(false)}>Cancel</button>
            <button className="em-btn-danger" onClick={confirmDelete}>Move to Trash</button>
          </div>
        </FormalModal>
      )}

      {isAdmin && (
        <FormalModal show={showPermanentDeleteModal} onClose={() => setShowPermanentDeleteModal(false)} title="Permanently Delete" small>
          <div className="em-danger-warning-box">
            <p className="em-danger-title"><AlertTriangle size={16} /> WARNING: Irreversible Action</p>
            <p className="em-danger-text">
              This will permanently erase all records, schedules, attendance, and payroll data for <strong>{deleteTarget?.full_name}</strong>. This action cannot be undone.
            </p>
          </div>
          <div className="em-modal-actions border-none">
            <button className="em-btn-cancel" onClick={() => setShowPermanentDeleteModal(false)}>Cancel</button>
            <button className="em-btn-danger" onClick={confirmPermanentDelete}>Yes, Permanently Delete</button>
          </div>
        </FormalModal>
      )}
    </div>
  );
};

export default EmployeeManagement;