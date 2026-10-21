// src/pages/JobPostings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Plus, Edit3, Trash2, Eye, Calendar as CalendarIcon,
  Users, FileText, CheckCircle, XCircle, Power,
  MapPin, DollarSign, Search, ChevronLeft, ChevronRight,
  Building2, Clock, Mail, Phone, Briefcase, MoreVertical
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './JobPostings.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const staticBase = API_BASE.replace(/\/api$/, '');

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'Not available';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};

const JobPostings = () => {
  const [jobs, setJobs] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [jobForm, setJobForm] = useState({
    title: '', department: '', employment_type: 'Full-time',
    location_type: 'On-site', location: '', salary_min: '', salary_max: '',
    description: '', requirements: '', status: 'open'
  });

  const [showJobDetails, setShowJobDetails] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  // Status Toggle Confirmation State
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [jobToToggle, setJobToToggle] = useState(null);

  // Applicants List State
  const [showApplicantsModal, setShowApplicantsModal] = useState(false);
  const [currentJobForApplicants, setCurrentJobForApplicants] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [applicantTab, setApplicantTab] = useState('all');
  const [applicantSearch, setApplicantSearch] = useState('');
  const [applicantsPage, setApplicantsPage] = useState(1);
  const applicantsPerPage = 7; // Adjusted to fit the new sleek list

  // Applicant Details State
  const [showApplicantDetailsModal, setShowApplicantDetailsModal] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);

  // Interview State
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [interviewApplicant, setInterviewApplicant] = useState(null);
  const [interviewForm, setInterviewForm] = useState({ date: '', time: '', notes: '' });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Dropdown Menu State
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/jobs`, getAuthHeaders());
      setJobs(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Handle closing dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleDropdown = (e, id) => {
    e.stopPropagation();
    setOpenDropdownId(prev => prev === id ? null : id);
  };

  const filteredJobs = jobs.filter(job => {
    if (activeTab === 'active' && job.status !== 'open') return false;
    if (activeTab === 'closed' && job.status !== 'closed') return false;
    if (searchTerm && !job.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });
  
  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const activeCount = jobs.filter(j => j.status === 'open').length;
  const closedCount = jobs.filter(j => j.status === 'closed').length;

  const openJobForm = (job = null) => {
    if (job) {
      setEditingJob(job);
      setJobForm({
        title: job.title, department: job.department || '',
        employment_type: job.employment_type || 'Full-time',
        location_type: job.location_type || 'On-site', location: job.location || '',
        salary_min: job.salary_min || '', salary_max: job.salary_max || '',
        description: job.description || '', requirements: job.requirements || '',
        status: job.status
      });
    } else {
      setEditingJob(null);
      setJobForm({
        title: '', department: '', employment_type: 'Full-time',
        location_type: 'On-site', location: '', salary_min: '', salary_max: '',
        description: '', requirements: '', status: 'open'
      });
    }
    setShowJobModal(true);
  };

  const handleSaveJob = async () => {
    if (!jobForm.title || !jobForm.description) {
      return toast.warning('Title and description are required.');
    }
    
    if (jobForm.salary_min && jobForm.salary_max) {
      if (Number(jobForm.salary_max) < Number(jobForm.salary_min)) {
        return toast.warning('Maximum salary must be greater than or equal to minimum salary.');
      }
    }

    setSaving(true);
    try {
      if (editingJob) {
        await axios.put(`${API_BASE}/jobs/${editingJob.id}`, jobForm, getAuthHeaders());
        toast.success('Job posting updated successfully.');
      } else {
        await axios.post(`${API_BASE}/jobs`, jobForm, getAuthHeaders());
        toast.success('Job posting published successfully.');
      }
      setShowJobModal(false);
      fetchJobs();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to process request.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClick = (job) => {
    setJobToToggle(job);
    setShowStatusConfirm(true);
  };

  const confirmToggleStatus = async () => {
    if (!jobToToggle) return;
    setSaving(true);
    const newStatus = jobToToggle.status === 'open' ? 'closed' : 'open';
    try {
      await axios.put(`${API_BASE}/jobs/${jobToToggle.id}`, { ...jobToToggle, status: newStatus }, getAuthHeaders());
      toast.success(`Job ${newStatus === 'open' ? 'opened' : 'closed'} successfully.`);
      fetchJobs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to update status.');
    } finally {
      setSaving(false);
      setShowStatusConfirm(false);
      setJobToToggle(null);
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      await axios.delete(`${API_BASE}/jobs/${deleteJobId}`, getAuthHeaders());
      toast.success('Job deleted permanently.');
      fetchJobs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to delete job.');
    } finally {
      setShowDeleteConfirm(false);
      setDeleteJobId(null);
      setSaving(false);
    }
  };

  const viewApplicants = async (job) => {
    setCurrentJobForApplicants(job);
    setApplicantsPage(1);
    setApplicantTab('all');
    setApplicantSearch('');
    try {
      const res = await axios.get(`${API_BASE}/jobs/${job.id}/applicants`, getAuthHeaders());
      setApplicants(res.data);
      setShowApplicantsModal(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to retrieve applicants.');
    }
  };

  const openApplicantDetails = async (applicant) => {
    setSelectedApplicant(applicant);
    setShowApplicantDetailsModal(true);

    if (applicant.status === 'new') {
      try {
        await axios.put(`${API_BASE}/applicants/${applicant.id}`, { status: 'reviewed' }, getAuthHeaders());
        setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, status: 'reviewed' } : a));
        setSelectedApplicant(prev => ({ ...prev, status: 'reviewed' }));
        fetchJobs();
      } catch (err) {
        console.error('Status auto-update failed.', err);
      }
    }
  };

  const updateApplicantStatus = async (applicantId, newStatus) => {
    try {
      await axios.put(`${API_BASE}/applicants/${applicantId}`, { status: newStatus }, getAuthHeaders());
      const res = await axios.get(`${API_BASE}/jobs/${currentJobForApplicants.id}/applicants`, getAuthHeaders());
      setApplicants(res.data);
      
      if (selectedApplicant && selectedApplicant.id === applicantId) {
        setSelectedApplicant({ ...selectedApplicant, status: newStatus });
      }
      fetchJobs();
      toast.success('Candidate status updated.');
    } catch (err) {
      toast.error('Failed to transition candidate.');
    }
  };

  const openScheduleInterview = (applicant) => {
    if (['rejected', 'hired'].includes(applicant.status)) {
      toast.warning(`Cannot schedule interview for a ${applicant.status} candidate.`);
      return;
    }
    setInterviewApplicant(applicant);
    setInterviewForm({ date: '', time: '', notes: `Interview for ${currentJobForApplicants?.title}` });
    setShowInterviewModal(true);
  };

  const scheduleInterview = async () => {
    if (!interviewForm.date || !interviewForm.time) {
      return toast.warning('Date and time are required.');
    }
    const selectedDate = new Date(`${interviewForm.date}T${interviewForm.time}`);
    if (selectedDate < new Date()) {
      return toast.warning('Cannot schedule interviews in the past.');
    }

    setSaving(true);
    try {
      const nameParts = interviewApplicant.full_name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';

      await axios.post(`${API_BASE}/appointments/book`, {
        firstName, lastName,
        email: interviewApplicant.email,
        phone: interviewApplicant.phone || '',
        date: interviewForm.date,
        time: interviewForm.time,
        reason: interviewForm.notes,
        primaryBleId: null,
        additionalVisitors: []
      }, getAuthHeaders());

      toast.success('Interview scheduled. System email sent.');
      setShowInterviewModal(false);
      
      if (interviewApplicant.status !== 'shortlisted') {
        await updateApplicantStatus(interviewApplicant.id, 'shortlisted');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to dispatch interview.');
    } finally {
      setSaving(false);
    }
  };

  const filteredApplicants = applicants.filter(a => {
    if (applicantTab !== 'all' && a.status !== applicantTab) return false;
    if (applicantSearch && !a.full_name.toLowerCase().includes(applicantSearch.toLowerCase()) && !a.email.toLowerCase().includes(applicantSearch.toLowerCase())) return false;
    return true;
  });
  
  const totalApplicantPages = Math.ceil(filteredApplicants.length / applicantsPerPage);
  const paginatedApplicants = filteredApplicants.slice((applicantsPage - 1) * applicantsPerPage, applicantsPage * applicantsPerPage);

  const formatSalaryRange = (min, max) => {
    if (!min && !max) return 'Unspecified';
    if (min && max) return `₱${Number(min).toLocaleString()} - ₱${Number(max).toLocaleString()}`;
    if (min) return `From ₱${Number(min).toLocaleString()}`;
    return `Up to ₱${Number(max).toLocaleString()}`;
  };

  return (
    <div className="jp-wrapper">
      
      <div className="jp-main-card">
        
        <div className="jp-control-bar">
          <div className="jp-segmented-tabs">
            <button 
              className={`jp-seg-tab ${activeTab === 'active' ? 'active' : ''}`}
              onClick={() => { setActiveTab('active'); setCurrentPage(1); }}
            >
              Active Post <span className={`jp-badge ${activeTab === 'active' ? 'blue' : ''}`}>{activeCount}</span>
            </button>
            <button 
              className={`jp-seg-tab ${activeTab === 'closed' ? 'active' : ''}`}
              onClick={() => { setActiveTab('closed'); setCurrentPage(1); }}
            >
              Closed <span className={`jp-badge ${activeTab === 'closed' ? 'gray' : ''}`}>{closedCount}</span>
            </button>
          </div>

          <div className="jp-control-actions">
            <div className="jp-search-input">
              <Search size={15} className="text-muted" />
              <input 
                type="text" 
                placeholder="Search jobs..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>
            <button className="jp-btn-create" onClick={() => openJobForm()}>
              <Plus size={16} /> Create Job
            </button>
          </div>
        </div>

        <div className="jp-table-container">
          {loading ? (
            <div className="jp-empty-box">Loading records...</div>
          ) : (
            <table className="jp-data-table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Applicants</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="jp-empty-box">
                        <Briefcase size={36} color="#CBD5E1" />
                        <p>No job postings found.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedJobs.map(job => (
                    <tr key={job.id}>
                      <td>
                        <div className="jp-cell-primary">{job.title}</div>
                        <div className="jp-cell-secondary">{job.department || 'General'}</div>
                      </td>
                      <td>
                        <div className="jp-cell-primary">{job.location_type}</div>
                        <div className="jp-cell-secondary">{job.employment_type}</div>
                      </td>
                      <td>
                        <span className={`jp-status-pill ${job.status}`}>
                          {job.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="jp-app-count">
                          <span>{job.applicant_count} </span>
                        </div>
                      </td>
                      <td className="text-right">
                        
                        <div className="jp-actions-row">
                          <button 
                            className="jp-action-btn-text primary" 
                            onClick={() => viewApplicants(job)}
                          >
                            View applicants
                          </button>
                          
                          <button 
                            className="jp-action-btn-text" 
                            onClick={() => openJobForm(job)}
                          >
                            Edit
                          </button>

                          <div className="jp-dropdown-container">
                            <button 
                              className="jp-action-btn-icon" 
                              onClick={(e) => toggleDropdown(e, job.id)}
                            >
                              <MoreVertical size={16} />
                            </button>
                            
                            {openDropdownId === job.id && (
                              <div className="jp-dropdown-menu">
                                <button className="jp-dropdown-item" onClick={() => { setOpenDropdownId(null); setSelectedJob(job); setShowJobDetails(true); }}>
                                  <Eye size={14} className="text-muted" /> View Details
                                </button>
                                <button className="jp-dropdown-item" onClick={() => { setOpenDropdownId(null); handleToggleClick(job); }}>
                                  {job.status === 'open' ? <XCircle size={14} className="text-muted"/> : <CheckCircle size={14} className="text-muted" />}
                                  {job.status === 'open' ? 'Close Job' : 'Reopen Job'}
                                </button>
                                <button className="jp-dropdown-item danger" onClick={() => { setOpenDropdownId(null); setDeleteJobId(job.id); setShowDeleteConfirm(true); }}>
                                  <Trash2 size={14} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="jp-pagination">
            <span className="jp-page-text">Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredJobs.length)} of {filteredJobs.length} records</span>
            <div className="jp-page-controls">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="jp-page-num">{currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- FORMAL MODALS --- */}

      <FormalModal 
        show={showStatusConfirm} 
        onClose={() => setShowStatusConfirm(false)} 
        title="Confirm Status Change" 
        footer={
          <>
            <button className="jp-btn-cancel" onClick={() => setShowStatusConfirm(false)}>Cancel</button>
            <button className={`jp-btn-confirm ${jobToToggle?.status === 'open' ? 'danger' : ''}`} onClick={confirmToggleStatus} disabled={saving}>
              {saving ? 'Processing...' : jobToToggle?.status === 'open' ? 'Close Job' : 'Reopen Job'}
            </button>
          </>
        }
      >
        <div className="jp-modal-padding">
          <p style={{ margin: 0, color: '#334155' }}>Please confirm you wish to {jobToToggle?.status === 'open' ? 'close' : 'reopen'} the posting for <strong>{jobToToggle?.title}</strong>.</p>
          {jobToToggle?.status === 'open' && (
            <p className="text-danger" style={{ fontSize: '0.85rem', marginTop: '0.5rem', fontWeight: 500 }}>
              Closing this job will remove it from the career portal immediately.
            </p>
          )}
        </div>
      </FormalModal>

      <FormalModal
        show={showJobModal}
        onClose={() => setShowJobModal(false)}
        title={editingJob ? 'Edit Job Posting' : 'Create New Job Post'}
        footer={
          <>
            <button className="jp-btn-cancel" onClick={() => setShowJobModal(false)}>Cancel</button>
            <button className="jp-btn-confirm" onClick={handleSaveJob} disabled={saving}>
              {saving ? 'Saving...' : editingJob ? 'Save Changes' : 'Publish Job'}
            </button>
          </>
        }
      >
        <div className="jp-modal-widen">
          <div className="jp-form-grid">
            <div className="jp-form-group span-2">
              <label>Job Title <span className="text-danger">*</span></label>
              <input type="text" className="jp-input-field" value={jobForm.title} onChange={e => setJobForm({...jobForm, title: e.target.value})} placeholder="e.g. Senior Instructor" />
            </div>
            <div className="jp-form-group">
              <label>Department</label>
              <input type="text" className="jp-input-field" value={jobForm.department} onChange={e => setJobForm({...jobForm, department: e.target.value})} placeholder="e.g. Academics" />
            </div>
            
            <div className="jp-form-group">
              <label>Employment Type</label>
              <select className="jp-input-field select" value={jobForm.employment_type} onChange={e => setJobForm({...jobForm, employment_type: e.target.value})}>
                <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
              </select>
            </div>
            <div className="jp-form-group">
              <label>Location Type</label>
              <select className="jp-input-field select" value={jobForm.location_type} onChange={e => setJobForm({...jobForm, location_type: e.target.value})}>
                <option>On-site</option><option>Remote</option><option>Hybrid</option>
              </select>
            </div>
            <div className="jp-form-group">
              <label>Specific Location</label>
              <input type="text" className="jp-input-field" value={jobForm.location} onChange={e => setJobForm({...jobForm, location: e.target.value})} placeholder="e.g. Main Campus" />
            </div>

            <div className="jp-form-group">
              <label>Min Salary (₱)</label>
              <input type="number" className="jp-input-field" value={jobForm.salary_min} onChange={e => setJobForm({...jobForm, salary_min: e.target.value})} placeholder="0.00" />
            </div>
            <div className="jp-form-group span-2">
              <label>Max Salary (₱)</label>
              <input type="number" className="jp-input-field" value={jobForm.salary_max} onChange={e => setJobForm({...jobForm, salary_max: e.target.value})} placeholder="0.00" />
            </div>

            <div className="jp-form-group span-3">
              <label>Job Description <span className="text-danger">*</span></label>
              <textarea className="jp-input-field textarea" rows="4" value={jobForm.description} onChange={e => setJobForm({...jobForm, description: e.target.value})} placeholder="Detail the core responsibilities..." />
            </div>
            <div className="jp-form-group span-3">
              <label>Requirements & Qualifications</label>
              <textarea className="jp-input-field textarea" rows="3" value={jobForm.requirements} onChange={e => setJobForm({...jobForm, requirements: e.target.value})} placeholder="Detail required skills and experience..." />
            </div>
          </div>
        </div>
      </FormalModal>

      <FormalModal 
        show={showJobDetails} 
        onClose={() => setShowJobDetails(false)} 
        title="Job Posting Details" 
        footer={<button className="jp-btn-cancel" onClick={() => setShowJobDetails(false)}>Close</button>} 
      >
        <div className="jp-modal-widen">
          <div className="jp-details-header">
            <h3>{selectedJob?.title}</h3>
            <span className={`jp-status-pill ${selectedJob?.status}`}>{selectedJob?.status?.toUpperCase()}</span>
          </div>
          
          <div className="jp-details-grid">
            <div className="jp-detail-box">
              <span className="jp-detail-label"><Building2 size={14}/> Department</span>
              <span className="jp-detail-value">{selectedJob?.department || 'Unassigned'}</span>
            </div>
            <div className="jp-detail-box">
              <span className="jp-detail-label"><Clock size={14}/> Type</span>
              <span className="jp-detail-value">{selectedJob?.employment_type}</span>
            </div>
            <div className="jp-detail-box">
              <span className="jp-detail-label"><MapPin size={14}/> Location</span>
              <span className="jp-detail-value">{selectedJob?.location_type} {selectedJob?.location ? `(${selectedJob.location})` : ''}</span>
            </div>
            <div className="jp-detail-box">
              <span className="jp-detail-label"><DollarSign size={14}/> Salary Range</span>
              <span className="jp-detail-value">{formatSalaryRange(selectedJob?.salary_min, selectedJob?.salary_max)}</span>
            </div>
          </div>
          
          <div className="jp-details-text-area">
            <div className="jp-text-block">
              <h4>Job Description</h4>
              <p>{selectedJob?.description}</p>
            </div>
            <div className="jp-text-block">
              <h4>Requirements</h4>
              <p>{selectedJob?.requirements || 'None specified.'}</p>
            </div>
          </div>
        </div>
      </FormalModal>

      {/* --- REPLACED: Modern Applicants ATS Pipeline Modal --- */}
      <FormalModal 
        show={showApplicantsModal} 
        onClose={() => setShowApplicantsModal(false)} 
        title={`Pipeline: ${currentJobForApplicants?.title}`} 
        footer={<button className="jp-btn-cancel" onClick={() => setShowApplicantsModal(false)}>Close</button>}
      >
        <div className="jp-modal-widen jp-ats-wrapper hide-scrollbar">
          
          <div className="jp-ats-toolbar">
            <div className="jp-ats-segmented">
              {['all', 'new', 'reviewed', 'shortlisted', 'rejected', 'hired'].map(tab => (
                <button 
                  key={tab} 
                  className={`jp-ats-tab ${applicantTab === tab ? 'active' : ''}`} 
                  onClick={() => { setApplicantTab(tab); setApplicantsPage(1); }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="jp-search-input small">
              <Search size={14} />
              <input type="text" placeholder="Search..." value={applicantSearch} onChange={e => { setApplicantSearch(e.target.value); setApplicantsPage(1); }} />
            </div>
          </div>
          
          <div className="jp-ats-list-container">
            {paginatedApplicants.length === 0 ? (
              <div className="jp-empty-box small">No candidates match the current filters.</div>
            ) : (
              <div className="jp-ats-list">
                {paginatedApplicants.map(app => (
                  <div className="jp-ats-row" key={app.id}>
                    <div className="jp-ats-candidate">
                      <div className="jp-ats-avatar">
                        {app.full_name ? app.full_name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <span className="jp-ats-name">{app.full_name}</span>
                    </div>
                    
                    <div className="jp-ats-status">
                      <span className={`jp-app-badge ${app.status}`}>{app.status.toUpperCase()}</span>
                    </div>
                    
                    <div className="jp-ats-action">
                      <button className="jp-ats-review-btn" onClick={() => openApplicantDetails(app)}>
                        Review Profile <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {totalApplicantPages > 1 && (
            <div className="jp-pagination small ats-pagination">
              <span className="jp-page-text">Page {applicantsPage} of {totalApplicantPages}</span>
              <div className="jp-page-controls">
                <button onClick={() => setApplicantsPage(p => Math.max(1, p - 1))} disabled={applicantsPage === 1}><ChevronLeft size={14}/></button>
                <button onClick={() => setApplicantsPage(p => Math.min(totalApplicantPages, p + 1))} disabled={applicantsPage === totalApplicantPages}><ChevronRight size={14}/></button>
              </div>
            </div>
          )}
        </div>
      </FormalModal>

      <FormalModal 
        show={showApplicantDetailsModal} 
        onClose={() => setShowApplicantDetailsModal(false)} 
        title="Candidate Profile" 
        footer={
          <>
            <button className="jp-btn-cancel" onClick={() => setShowApplicantDetailsModal(false)}>Close</button>
            <button className="jp-btn-confirm" onClick={() => { setShowApplicantDetailsModal(false); openScheduleInterview(selectedApplicant); }}>
              <CalendarIcon size={14} style={{ marginRight: '0.4rem' }} /> Schedule Interview
            </button>
          </>
        }
      >
        <div className="jp-modal-widen medium">
          <div className="jp-details-header split">
            <h3>{selectedApplicant?.full_name}</h3>
            <div className="jp-stage-selector">
              <span>Status:</span>
              <select 
                className={`jp-input-field select small ${selectedApplicant?.status}`} 
                value={selectedApplicant?.status} 
                onChange={e => updateApplicantStatus(selectedApplicant.id, e.target.value)}
              >
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="rejected">Rejected</option>
                <option value="hired">Hired</option>
              </select>
            </div>
          </div>

          <div className="jp-details-grid dual">
            <div className="jp-detail-box">
              <span className="jp-detail-label"><Mail size={14}/> Email</span>
              <span className="jp-detail-value">{selectedApplicant?.email}</span>
            </div>
            <div className="jp-detail-box">
              <span className="jp-detail-label"><Phone size={14}/> Phone</span>
              <span className="jp-detail-value">{selectedApplicant?.phone || 'N/A'}</span>
            </div>
            <div className="jp-detail-box">
              <span className="jp-detail-label"><Clock size={14}/> Applied On</span>
              <span className="jp-detail-value">{formatDateTime(selectedApplicant?.applied_at)}</span>
            </div>
            <div className="jp-detail-box">
              <span className="jp-detail-label"><FileText size={14}/> Resume</span>
              <span className="jp-detail-value">
                {selectedApplicant?.resume_path ? (
                  <a className="jp-text-link" href={`${staticBase}${selectedApplicant.resume_path}`} target="_blank" rel="noreferrer">
                    View Resume
                  </a>
                ) : ('Not Provided')}
              </span>
            </div>
          </div>
          
          {selectedApplicant?.cover_letter && (
            <div className="jp-details-text-area">
              <div className="jp-text-block">
                <h4>Cover Letter / Notes</h4>
                <p>{selectedApplicant.cover_letter}</p>
              </div>
            </div>
          )}
        </div>
      </FormalModal>

      <FormalModal 
        show={showInterviewModal} 
        onClose={() => setShowInterviewModal(false)} 
        title="Schedule Interview" 
        footer={
          <>
            <button className="jp-btn-cancel" onClick={() => setShowInterviewModal(false)}>Cancel</button>
            <button className="jp-btn-confirm" onClick={scheduleInterview} disabled={saving}>
              {saving ? 'Sending...' : 'Send Invite'}
            </button>
          </>
        }
      >
        <div className="jp-modal-widen medium">
          {['rejected', 'hired'].includes(interviewApplicant?.status) && (
            <div className="jp-alert-box danger">
              <XCircle size={16} />
              <span>Warning: Scheduling an interview for a candidate marked as <strong>{interviewApplicant.status}</strong>.</span>
            </div>
          )}
          <div className="jp-form-grid">
            <div className="jp-form-group">
              <label>Date <span className="text-danger">*</span></label>
              <input type="date" className="jp-input-field" value={interviewForm.date} onChange={e => setInterviewForm({...interviewForm, date: e.target.value})} min={new Date().toISOString().split('T')[0]} required />
            </div>
            <div className="jp-form-group">
              <label>Time <span className="text-danger">*</span></label>
              <input type="time" className="jp-input-field" value={interviewForm.time} onChange={e => setInterviewForm({...interviewForm, time: e.target.value})} required />
            </div>
            <div className="jp-form-group span-2">
              <label>Notes / Meeting Link</label>
              <input type="text" className="jp-input-field" value={interviewForm.notes} onChange={e => setInterviewForm({...interviewForm, notes: e.target.value})} placeholder="e.g. Zoom link or meeting room" />
            </div>
          </div>
          <div className="jp-alert-box info" style={{marginTop: '1rem'}}>
            <CheckCircle size={16} />
            <span>The system will automatically email the invitation to {interviewApplicant?.email}.</span>
          </div>
        </div>
      </FormalModal>

      <FormalModal 
        show={showDeleteConfirm} 
        onClose={() => setShowDeleteConfirm(false)} 
        title="Confirm Deletion" 
        footer={
          <>
            <button className="jp-btn-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="jp-btn-confirm danger" onClick={confirmDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Yes, Delete Job'}
            </button>
          </>
        }
      >
        <div className="jp-modal-padding">
          <p style={{ margin: 0, color: '#334155' }}>Are you sure you want to permanently delete this job posting?</p>
          <p className="text-danger" style={{ fontSize: '0.85rem', marginTop: '0.5rem', fontWeight: 500 }}>
            This action cannot be undone. All applicant data and resumes attached to this posting will be purged.
          </p>
        </div>
      </FormalModal>

    </div>
  );
};

export default JobPostings;