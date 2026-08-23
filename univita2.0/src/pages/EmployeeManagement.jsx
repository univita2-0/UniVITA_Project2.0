import React, { useState, useEffect, useCallback } from 'react';
import './EmployeeManagement.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Search, Edit2, Trash2, UserCheck, AlertCircle, ChevronLeft, ChevronRight, Users, Eye, EyeOff, Plus, Copy, CheckCircle
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmployeeManagement = ({ onOpenPinChange }) => {
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('instructors');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [activeTabModal, setActiveTabModal] = useState('general');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    employee_id: '',
    full_name: '',
    first_name: '',
    last_name: '',
    middle_initial: '',
    email: '',
    phone: '',
    date_of_birth: '',
    gender: 'Prefer not to say',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    street: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'Philippines',
    additional_info: '',
    position: 'Entry Level Simulationist',
    employment_type: 'Regular',
    date_of_joining: '',
    account_expiry: '',
    status: 'active',
    role: 'instructor',
    salary: 0,
    work_days_per_month: 22,
  });

  const [showSoftDeleteModal, setShowSoftDeleteModal] = useState(false);
  const [softDeleteTarget, setSoftDeleteTarget] = useState(null);

  const [showPermanentDeleteModal, setShowPermanentDeleteModal] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null);
  const [generatedEmpId, setGeneratedEmpId] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmployeeData, setNewEmployeeData] = useState({
    first_name: '',
    last_name: '',
    middle_initial: '',
    full_name: '',
    email: '',
    phone: '',
    position: 'Entry Level Simulationist',
    employment_type: 'Regular',
    role: 'instructor',
    status: 'active',
  });

  const calculateSalary = (position) => {
    if (position === 'Entry Level Simulationist') return 32000;
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
      toast.error('Failed to load employees');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

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
      setGeneratedPassword(`emp${newId.substring(1)}`);
    } catch (err) {
      const newNum = employees.length + 1;
      const newId = `E${newNum.toString().padStart(3, '0')}`;
      setGeneratedEmpId(newId);
      setGeneratedPassword(`emp${newId.substring(1)}`);
    }
  };

  const extractDate = (isoStr) => {
    if (!isoStr) return '';
    return isoStr.split('T')[0];
  };

  const openEditModal = (emp) => {
    setSelectedEmployee(emp);
    setFormData({
      employee_id: emp.employee_id || '',
      full_name: emp.full_name || '',
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      middle_initial: emp.middle_initial || '',
      email: emp.email || '',
      phone: emp.phone_number || emp.phone || '',
      date_of_birth: extractDate(emp.date_of_birth),
      gender: emp.gender || 'Prefer not to say',
      emergency_contact_name: emp.emergency_contact_name || '',
      emergency_contact_phone: emp.emergency_contact_phone || '',
      street: emp.street_address || emp.street || '',
      city: emp.city || '',
      state: emp.state_province || emp.state || '',
      postal_code: emp.postal_code || '',
      country: emp.country || 'Philippines',
      additional_info: emp.additional_info || '',
      position: emp.position_level || emp.position || 'Entry Level Simulationist',
      employment_type: emp.contract_type === 'Full-time' ? 'Regular' : (emp.contract_type || emp.employment_type || 'Regular'),
      date_of_joining: extractDate(emp.date_of_joining),
      account_expiry: extractDate(emp.account_expiration_date || emp.account_expiry),
      status: emp.status || 'active',
      role: emp.role || 'instructor',
      salary: emp.monthly_salary || calculateSalary(emp.position_level || emp.position || 'Entry Level Simulationist'),
      work_days_per_month: emp.work_days_per_month || 22,
    });
    setActiveTabModal('general');
    setShowChangePassword(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setShowEditModal(true);
  };

  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'first_name' || name === 'last_name' || name === 'middle_initial') {
      setFormData(prev => {
        const newFirst = name === 'first_name' ? value : prev.first_name;
        const newMiddle = name === 'middle_initial' ? value : prev.middle_initial;
        const newLast = name === 'last_name' ? value : prev.last_name;
        const newFull = updateFullName(newFirst, newMiddle, newLast);
        return { ...prev, [name]: value, full_name: newFull };
      });
    } else if (name === 'position') {
      setFormData(prev => ({
        ...prev,
        position: value,
        salary: calculateSalary(value)
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatDateForDB = (dateStr) => {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    return dateStr.split('T')[0];
  };

  // VALIDATED EDIT UPDATE HANDLER
  const handleUpdateEmployee = async () => {
    const firstName = (formData.first_name || '').trim();
    const lastName = (formData.last_name || '').trim();
    const email = (formData.email || '').trim();

    if (!firstName) {
      toast.warning('First name is required.');
      setActiveTabModal('general');
      return;
    }
    if (!lastName) {
      toast.warning('Last name is required.');
      setActiveTabModal('general');
      return;
    }
    if (!email) {
      toast.warning('Email address is required.');
      setActiveTabModal('account');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      toast.warning('Please enter a valid email address.');
      setActiveTabModal('account');
      return;
    }

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        first_name: firstName,
        last_name: lastName,
        middle_initial: (formData.middle_initial || '').trim(),
        email: email,
        phone: (formData.phone || '').trim(),
        position_level: formData.position,
        contract_type: formData.employment_type,
        status: formData.status,
        role: formData.role,
        date_of_joining: formatDateForDB(formData.date_of_joining),
        monthly_salary: formData.salary,
        work_days_per_month: formData.work_days_per_month,
        date_of_birth: formatDateForDB(formData.date_of_birth),
        gender: formData.gender,
        emergency_contact_name: (formData.emergency_contact_name || '').trim(),
        emergency_contact_phone: (formData.emergency_contact_phone || '').trim(),
        street: (formData.street || '').trim(),
        city: (formData.city || '').trim(),
        state: (formData.state || '').trim(),
        postal_code: (formData.postal_code || '').trim(),
        country: (formData.country || 'Philippines').trim(),
        additional_info: (formData.additional_info || '').trim(),
        account_expiry: formatDateForDB(formData.account_expiry),
      };

      await axios.put(`${API_BASE}/employees/${selectedEmployee.id}`, payload, getAuthHeaders());
      toast.success('Employee updated successfully!');
      setShowEditModal(false);
      await loadEmployees();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Update failed.');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    try {
      await axios.put(`${API_BASE}/users/${selectedEmployee.id}/reset-password`, {
        newPassword: newPassword.trim(),
      }, getAuthHeaders());
      toast.success('Password changed successfully!');
      setShowChangePassword(false);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
    } catch (err) {
      setPasswordError('Network error.');
      toast.error('Failed to change password');
    }
  };

  const handleAddEmployeeChange = (field, value) => {
    setNewEmployeeData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'first_name' || field === 'last_name' || field === 'middle_initial') {
        updated.full_name = updateFullName(updated.first_name, updated.middle_initial, updated.last_name);
      }
      return updated;
    });
  };

  // VALIDATED ADD EMPLOYEE HANDLER
  const handleAddEmployee = async () => {
    const firstName = (newEmployeeData.first_name || '').trim();
    const lastName = (newEmployeeData.last_name || '').trim();
    const email = (newEmployeeData.email || '').trim();

    if (!firstName) {
      toast.warning('Please enter a First Name.');
      return;
    }
    if (!lastName) {
      toast.warning('Please enter a Last Name.');
      return;
    }
    if (!email) {
      toast.warning('Please enter an Email Address.');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      toast.warning('Please enter a valid Email Address.');
      return;
    }

    try {
      await axios.post(`${API_BASE}/employees`, {
        employee_id: generatedEmpId,
        full_name: newEmployeeData.full_name.trim(),
        first_name: firstName,
        last_name: lastName,
        middle_initial: (newEmployeeData.middle_initial || '').trim(),
        email: email,
        phone: (newEmployeeData.phone || '').trim(),
        position_level: newEmployeeData.position,
        contract_type: newEmployeeData.employment_type,
        status: newEmployeeData.status,
        role: newEmployeeData.role,
        password: generatedPassword,
        monthly_salary: calculateSalary(newEmployeeData.position),
        work_days_per_month: 22,
      }, getAuthHeaders());

      toast.success(`Employee added! ID: ${generatedEmpId}`);
      setShowAddModal(false);
      setNewEmployeeData({
        first_name: '', last_name: '', middle_initial: '', full_name: '', email: '', phone: '',
        position: 'Entry Level Simulationist', employment_type: 'Regular', role: 'instructor', status: 'active',
      });
      setGeneratedEmpId('');
      setGeneratedPassword('');
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error adding employee');
    }
  };

  const handleSoftDelete = (emp) => {
    setSoftDeleteTarget(emp);
    setShowSoftDeleteModal(true);
  };

  const confirmSoftDelete = async () => {
    if (!softDeleteTarget) return;
    try {
      await axios.put(`${API_BASE}/employees/${softDeleteTarget.id}`, { status: 'deleted' }, getAuthHeaders());
      toast.info('Employee moved to deleted accounts.');
      loadEmployees();
    } catch (err) {
      toast.error('Failed to move to deleted accounts.');
    } finally {
      setShowSoftDeleteModal(false);
      setSoftDeleteTarget(null);
    }
  };

  const handlePermanentDelete = (emp) => {
    setPermanentDeleteTarget(emp);
    setShowPermanentDeleteModal(true);
  };

  const confirmPermanentDelete = async () => {
    if (!permanentDeleteTarget) return;
    try {
      await axios.delete(`${API_BASE}/employees/${permanentDeleteTarget.id}`, getAuthHeaders());
      toast.success('Employee permanently deleted.');
      loadEmployees();
    } catch (err) {
      toast.error('Delete failed.');
    } finally {
      setShowPermanentDeleteModal(false);
      setPermanentDeleteTarget(null);
    }
  };

  const getFilteredList = () => {
    let filtered = [];
    switch (activeTab) {
      case 'instructors':
        filtered = employees.filter(emp => emp.role === 'instructor' && emp.status === 'active');
        break;
      case 'staff':
        filtered = employees.filter(emp => emp.role !== 'instructor' && emp.status === 'active');
        break;
      case 'deactivated':
        filtered = employees.filter(emp => emp.status === 'inactive');
        break;
      case 'deleted':
        filtered = employees.filter(emp => emp.status === 'deleted');
        break;
      default:
        filtered = [];
    }
    return filtered.filter(emp =>
      (emp.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.employee_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredEmployees = getFilteredList();
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1); }, [activeTab, searchTerm]);

  const goToPage = (page) => { if (page >= 1 && page <= totalPages) setCurrentPage(page); };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
    const pages = [];
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return (
      <div className="pagination">
        <button className="page-arrow" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}><ChevronLeft size={16} /></button>
        {pages.map(page => (<button key={page} className={`page-number ${currentPage === page ? 'active' : ''}`} onClick={() => goToPage(page)}>{page}</button>))}
        <button className="page-arrow" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}><ChevronRight size={16} /></button>
      </div>
    );
  };

  const renderTableInfo = () => {
    if (filteredEmployees.length === 0) return null;
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, filteredEmployees.length);
    return (<div className="table-info">Showing {start} to {end} of {filteredEmployees.length} entries</div>);
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const activeEmployees = employees.filter(e => e.status === 'active');
  const instructorsCount = activeEmployees.filter(e => e.role === 'instructor').length;
  const staffCount = activeEmployees.filter(e => e.role !== 'instructor').length;
  const deactivatedCount = employees.filter(e => e.status === 'inactive').length;
  const deletedCount = employees.filter(e => e.status === 'deleted').length;

  return (
    <div className="em-container">
      <div className="em-header">
        <div>
         
          <p>Oversee directory, manage system roles, and configure employee profiles.</p>
        </div>
        <button className="btn-add" onClick={() => { generateNewEmployeeId(); setShowAddModal(true); }}>
          <Plus size={18} /> Add Employee
        </button>
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-icon"><Users size={22} /></div>
          <div className="stat-info">
            <span className="stat-value">{activeEmployees.length}</span>
            <span className="stat-label">Active Personnel</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><UserCheck size={22} /></div>
          <div className="stat-info">
            <span className="stat-value">{instructorsCount}</span>
            <span className="stat-label">Instructors</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><AlertCircle size={22} /></div>
          <div className="stat-info">
            <span className="stat-value">{staffCount}</span>
            <span className="stat-label">Administrative Staff</span>
          </div>
        </div>
      </div>

      <div className="filter-tabs">
        <button className={`filter-tab ${activeTab === 'instructors' ? 'active' : ''}`} onClick={() => setActiveTab('instructors')}>
          Instructors <span className="tab-count">{instructorsCount}</span>
        </button>
        <button className={`filter-tab ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveTab('staff')}>
          Staff <span className="tab-count">{staffCount}</span>
        </button>
        <button className={`filter-tab ${activeTab === 'deactivated' ? 'active' : ''}`} onClick={() => setActiveTab('deactivated')}>
          Deactivated <span className="tab-count">{deactivatedCount}</span>
        </button>
        <button className={`filter-tab ${activeTab === 'deleted' ? 'active' : ''}`} onClick={() => setActiveTab('deleted')}>
          Deleted <span className="tab-count">{deletedCount}</span>
        </button>
      </div>

      <div className="search-wrapper">
        <Search size={18} className="search-icon" />
        <input type="text" placeholder="Search by name, ID, or email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <div className="table-wrapper">
        <table className="employee-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Position</th>
              <th>Contract</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEmployees.length === 0 ? (
              <tr className="empty-row"><td colSpan="7">No matching employees found.</td></tr>
            ) : (
              paginatedEmployees.map(emp => (
                <tr key={emp.id}>
                  <td className="emp-id">{emp.employee_id}</td>
                  <td className="emp-name">
                    <div className="table-user-cell">
                      <div className="table-avatar">{getInitials(emp.full_name)}</div>
                      <span>{emp.full_name}</span>
                    </div>
                  </td>
                  <td className="emp-email">{emp.email}</td>
                  <td className="emp-position">{emp.position_level || emp.position || '—'}</td>
                  <td className="emp-contract">{emp.contract_type || emp.employment_type || '—'}</td>
                  <td>
                    <span className={`status-badge ${emp.status === 'active' ? 'active' : emp.status === 'inactive' ? 'inactive' : 'deleted'}`}>
                      {emp.status === 'active' ? 'Active' : emp.status === 'inactive' ? 'Deactivated' : 'Deleted'}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="action-icon" onClick={() => openEditModal(emp)} title="Edit Employee"><Edit2 size={16} /></button>
                    {emp.status !== 'deleted' ? (
                      <button className="action-icon danger" onClick={() => handleSoftDelete(emp)} title="Move to Deleted"><Trash2 size={16} /></button>
                    ) : (
                      <button className="action-icon danger" onClick={() => handlePermanentDelete(emp)} title="Permanently Delete"><Trash2 size={16} /></button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}
      {renderTableInfo()}

      {/* ADD EMPLOYEE MODAL */}
      <FormalModal show={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Employee" wide>
        <div className="form-section-notice">
          Fields marked with <span className="req-star">*</span> are strictly required.
        </div>
        <div className="form-row-grid">
          <div className="modal-form-group">
            <label>First Name <span className="req-star">*</span></label>
            <input placeholder="e.g. Maria" value={newEmployeeData.first_name} onChange={e => handleAddEmployeeChange('first_name', e.target.value)} />
          </div>
          <div className="modal-form-group">
            <label>Middle Initial</label>
            <input placeholder="e.g. S" value={newEmployeeData.middle_initial} onChange={e => handleAddEmployeeChange('middle_initial', e.target.value)} maxLength={1} />
          </div>
          <div className="modal-form-group">
            <label>Last Name <span className="req-star">*</span></label>
            <input placeholder="e.g. Santos" value={newEmployeeData.last_name} onChange={e => handleAddEmployeeChange('last_name', e.target.value)} />
          </div>
        </div>

        <div className="form-row-grid">
          <div className="modal-form-group">
            <label>Employee ID (auto)</label>
            <input value={generatedEmpId} disabled className="disabled-input" />
          </div>
          <div className="modal-form-group">
            <label>Default Password</label>
            <div className="copy-input-wrapper">
              <input value={generatedPassword} disabled className="disabled-input" />
              <button type="button" className="btn-copy" onClick={() => { navigator.clipboard.writeText(generatedPassword); toast.info('Password copied'); }}>
                <Copy size={14} /> Copy
              </button>
            </div>
          </div>
        </div>

        <div className="modal-form-group">
          <label>Full Name (auto)</label>
          <input value={newEmployeeData.full_name} disabled className="disabled-input" />
        </div>

        <div className="form-row-grid">
          <div className="modal-form-group">
            <label>Email Address <span className="req-star">*</span></label>
            <input type="email" placeholder="e.g. maria.santos@company.com" value={newEmployeeData.email} onChange={e => handleAddEmployeeChange('email', e.target.value)} />
          </div>
          <div className="modal-form-group">
            <label>Phone Number</label>
            <input placeholder="e.g. 09171234567" value={newEmployeeData.phone} onChange={e => handleAddEmployeeChange('phone', e.target.value)} />
          </div>
        </div>

        <div className="form-row-grid">
          <div className="modal-form-group">
            <label>Position</label>
            <select value={newEmployeeData.position} onChange={e => handleAddEmployeeChange('position', e.target.value)}>
              <option>Entry Level Simulationist</option>
              <option>Senior Simulationist</option>
            </select>
          </div>
          <div className="modal-form-group">
            <label>Contract Type</label>
            <select value={newEmployeeData.employment_type} onChange={e => handleAddEmployeeChange('employment_type', e.target.value)}>
              <option>Regular</option>
              <option>Part-time</option>
              <option>Contract</option>
            </select>
          </div>
        </div>

        <div className="form-row-grid">
          <div className="modal-form-group">
            <label>Role</label>
            <select value={newEmployeeData.role} onChange={e => handleAddEmployeeChange('role', e.target.value)}>
              <option value="instructor">Instructor</option>
              <option value="admin">Admin</option>
              <option value="hr_admin">HR</option>
              <option value="security">Security</option>
            </select>
          </div>
          <div className="modal-form-group">
            <label>Status</label>
            <select value={newEmployeeData.status} onChange={e => handleAddEmployeeChange('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
          <button className="btn-save" onClick={handleAddEmployee}>Add Employee</button>
        </div>
      </FormalModal>

      {/* EDIT EMPLOYEE MODAL */}
      <FormalModal show={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Employee Profile" wide>
        <div className="edit-employee-layout">
          <div className="edit-sidebar">
            <div className="edit-avatar">{getInitials(selectedEmployee?.full_name || '')}</div>
            <h3>{selectedEmployee?.full_name}</h3>
            <p>{selectedEmployee?.employee_id}</p>
            <div className="edit-tabs">
              <button className={`tab-btn ${activeTabModal === 'general' ? 'active' : ''}`} onClick={() => setActiveTabModal('general')}>General</button>
              <button className={`tab-btn ${activeTabModal === 'account' ? 'active' : ''}`} onClick={() => setActiveTabModal('account')}>Account</button>
              <button className={`tab-btn ${activeTabModal === 'profile' ? 'active' : ''}`} onClick={() => setActiveTabModal('profile')}>Profile</button>
              <button className={`tab-btn ${activeTabModal === 'address' ? 'active' : ''}`} onClick={() => setActiveTabModal('address')}>Address</button>
            </div>
          </div>

          <div className="edit-content">
            {activeTabModal === 'general' && (
              <>
                <div className="form-group">
                  <label>Employee ID</label>
                  <input value={formData.employee_id} disabled className="disabled-input" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>First Name <span className="req-star">*</span></label>
                    <input name="first_name" value={formData.first_name} onChange={handleEditInputChange} />
                  </div>
                  <div className="form-group">
                    <label>Last Name <span className="req-star">*</span></label>
                    <input name="last_name" value={formData.last_name} onChange={handleEditInputChange} />
                  </div>
                  <div className="form-group">
                    <label>Middle Initial</label>
                    <input name="middle_initial" value={formData.middle_initial} onChange={handleEditInputChange} maxLength={1} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Full Name</label>
                  <input value={formData.full_name} disabled className="disabled-input" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Position</label>
                    <select name="position" value={formData.position} onChange={handleEditInputChange}>
                      <option>Entry Level Simulationist</option>
                      <option>Senior Simulationist</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Contract Type</label>
                    <select name="employment_type" value={formData.employment_type} onChange={handleEditInputChange}>
                      <option>Regular</option>
                      <option>Part-time</option>
                      <option>Contract</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date of Joining</label>
                    <input type="date" name="date_of_joining" value={formData.date_of_joining} onChange={handleEditInputChange} />
                  </div>
                  <div className="form-group">
                    <label>Account Expiration Date</label>
                    <input type="date" name="account_expiry" value={formData.account_expiry} onChange={handleEditInputChange} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select name="status" value={formData.status} onChange={handleEditInputChange}>
                    <option value="active">Active</option>
                    <option value="inactive">Deactivated</option>
                  </select>
                </div>
              </>
            )}

            {activeTabModal === 'account' && (
              <div className="account-tab-content">
                <div className="form-group">
                  <label>Email Address <span className="req-star">*</span></label>
                  <input name="email" value={formData.email} onChange={handleEditInputChange} />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select name="role" value={formData.role} onChange={handleEditInputChange}>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                    <option value="hr_admin">HR</option>
                    <option value="security">Security</option>
                  </select>
                </div>
                {!showChangePassword ? (
                  <button className="btn-change-password" onClick={() => setShowChangePassword(true)}>
                    Change Password
                  </button>
                ) : (
                  <div className="change-password-section">
                    <div className="form-group">
                      <label>New Password</label>
                      <div className="password-wrapper">
                        <input type={showPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Confirm Password</label>
                      <div className="password-wrapper">
                        <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                          {showConfirmPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </div>
                    </div>
                    {passwordError && <p className="error-text">{passwordError}</p>}
                    <div className="password-actions">
                      <button className="btn-save-password" onClick={handleChangePassword}>Save Password</button>
                      <button className="btn-cancel-password" onClick={() => { setShowChangePassword(false); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTabModal === 'profile' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date of Birth</label>
                    <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleEditInputChange} />
                  </div>
                  <div className="form-group">
                    <label>Gender</label>
                    <select name="gender" value={formData.gender} onChange={handleEditInputChange}>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Prefer not to say</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input name="phone" value={formData.phone} onChange={handleEditInputChange} />
                  </div>
                  <div className="form-group">
                    <label>Salary</label>
                    <input value={`₱${formData.salary ? Number(formData.salary).toLocaleString() : '0'}`} disabled className="disabled-input" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Emergency Contact Name</label>
                    <input name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleEditInputChange} />
                  </div>
                  <div className="form-group">
                    <label>Emergency Contact Phone</label>
                    <input name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleEditInputChange} />
                  </div>
                </div>
              </>
            )}

            {activeTabModal === 'address' && (
              <div className="address-tab-content">
                <div className="form-row">
                  <div className="form-group">
                    <label>Street Address</label>
                    <input name="street" value={formData.street} onChange={handleEditInputChange} />
                  </div>
                  <div className="form-group">
                    <label>City</label>
                    <input name="city" value={formData.city} onChange={handleEditInputChange} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>State / Province</label>
                    <input name="state" value={formData.state} onChange={handleEditInputChange} />
                  </div>
                  <div className="form-group">
                    <label>Postal Code</label>
                    <input name="postal_code" value={formData.postal_code} onChange={handleEditInputChange} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Country</label>
                  <input name="country" value={formData.country} onChange={handleEditInputChange} />
                </div>
                <div className="form-group">
                  <label>Additional Info</label>
                  <textarea name="additional_info" rows="4" value={formData.additional_info} onChange={handleEditInputChange} placeholder="Notes, housing allowance, relocation status, etc." />
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn-save" onClick={handleUpdateEmployee}>Save Changes</button>
            </div>
          </div>
        </div>
      </FormalModal>

      {/* SOFT DELETE MODAL */}
      <FormalModal show={showSoftDeleteModal} onClose={() => setShowSoftDeleteModal(false)} title="Move to Deleted" small>
        <p className="modal-confirm-text">
          Are you sure you want to move <strong>{softDeleteTarget?.full_name}</strong> to <strong>Deleted Accounts</strong>?
        </p>
        <div className="modal-actions border-none">
          <button className="btn-cancel" onClick={() => setShowSoftDeleteModal(false)}>Cancel</button>
          <button className="btn-danger" onClick={confirmSoftDelete}>Move to Deleted</button>
        </div>
      </FormalModal>

      {/* PERMANENT DELETE MODAL */}
      <FormalModal show={showPermanentDeleteModal} onClose={() => setShowPermanentDeleteModal(false)} title="Permanently Delete Employee" small>
        <p className="modal-confirm-text">
          Are you sure you want to <strong>permanently delete</strong> {permanentDeleteTarget?.full_name}? This action <strong>cannot be undone</strong>.
        </p>
        <div className="modal-actions border-none">
          <button className="btn-cancel" onClick={() => setShowPermanentDeleteModal(false)}>Cancel</button>
          <button className="btn-danger" onClick={confirmPermanentDelete}>Permanently Delete</button>
        </div>
      </FormalModal>
    </div>
  );
};

export default EmployeeManagement;