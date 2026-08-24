// src/pages/JobPostings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Plus, Edit3, Trash2, Eye, Calendar as CalendarIcon,
  Users, FileText, CheckCircle, XCircle,
  MapPin, DollarSign, Search, ChevronLeft, ChevronRight, Briefcase,
  Building2, Clock, Mail, Phone
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
  const applicantsPerPage = 8;

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

  const filteredJobs = jobs.filter(job => {
    if (activeTab === 'active' && job.status !== 'open') return false;
    if (activeTab === 'closed' && job.status !== 'closed') return false;
    if (searchTerm && !job.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });
  
  const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
      return toast.warning('Title and description are required');
    }
    setSaving(true);
    try {
      if (editingJob) {
        await axios.put(`${API_BASE}/jobs/${editingJob.id}`, jobForm, getAuthHeaders());
        toast.success('Job updated successfully');
      } else {
        await axios.post(`${API_BASE}/jobs`, jobForm, getAuthHeaders());
        toast.success('Job created successfully');
      }
      setShowJobModal(false);
      fetchJobs();
    } catch (err) {
      console.error(err);
      toast.error('Error saving job');
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
      toast.success(`Job ${newStatus === 'open' ? 'opened' : 'closed'} successfully`);
      fetchJobs();
    } catch (err) {
      toast.error('Failed to update job status');
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
      toast.success('Job deleted');
      fetchJobs();
    } catch (err) {
      toast.error('Failed to delete job');
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
      toast.error('Failed to load applicants');
    }
  };

  const openApplicantDetails = async (applicant) => {
    setSelectedApplicant(applicant);
    setShowApplicantDetailsModal(true);

    // Automatically mark status as 'reviewed' if it's currently 'new'
    if (applicant.status === 'new') {
      try {
        await axios.put(`${API_BASE}/applicants/${applicant.id}`, { status: 'reviewed' }, getAuthHeaders());
        setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, status: 'reviewed' } : a));
        setSelectedApplicant(prev => ({ ...prev, status: 'reviewed' }));
        // Refresh job counts immediately so badge decrements
        fetchJobs();
      } catch (err) {
        console.error('Failed to automatically update status to reviewed', err);
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
      fetchJobs(); // Refresh main list to update unread counts
      toast.success('Applicant status updated');
    } catch (err) {
      toast.error('Failed to update status');
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
      return toast.warning('Please select date and time');
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

      toast.success('Interview scheduled! Candidate will receive an email.');
      setShowInterviewModal(false);
      
      if (interviewApplicant.status !== 'shortlisted') {
        await updateApplicantStatus(interviewApplicant.id, 'shortlisted');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to schedule interview');
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
    if (!min && !max) return 'Not specified';
    if (min && max) return `₱${Number(min).toLocaleString()} - ₱${Number(max).toLocaleString()}`;
    if (min) return `From ₱${Number(min).toLocaleString()}`;
    return `Up to ₱${Number(max).toLocaleString()}`;
  };

  const StatusBadge = ({ status }) => {
    if (status === 'open') return <span className="jp-badge jp-badge-open">OPEN</span>;
    if (status === 'closed') return <span className="jp-badge jp-badge-closed">CLOSED</span>;
    return <span className="jp-badge">{status.toUpperCase()}</span>;
  };

  return (
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Manage open requisitions and track candidate applications.</p>
          </div>
        </div>
        <button className="expert-btn-primary" onClick={() => openJobForm()}>
          <Plus size={16} /> <span>New Job Posting</span>
        </button>
      </div>

      <div className="expert-card">
        {/* Toolbar: Tabs + Search */}
        <div className="jp-toolbar">
          <div className="jp-tabs">
            <button className={`jp-tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => { setActiveTab('active'); setCurrentPage(1); }}>
              Active Postings <span className="jp-tab-count">{jobs.filter(j => j.status === 'open').length}</span>
            </button>
            <button className={`jp-tab ${activeTab === 'closed' ? 'active' : ''}`} onClick={() => { setActiveTab('closed'); setCurrentPage(1); }}>
              Closed <span className="jp-tab-count">{jobs.filter(j => j.status === 'closed').length}</span>
            </button>
          </div>
          
          <div className="expert-search-input-group" style={{ maxWidth: '320px', height: '42px', margin: 0 }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" placeholder="Search job titles..." 
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
              className="expert-clean-input"
            />
          </div>
        </div>

        {/* Jobs Table */}
        <div className="expert-table-wrapper hide-scrollbar">
          {loading ? (
            <div className="expert-loading">Loading job postings...</div>
          ) : (
            <table className="expert-table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.length === 0 ? (
                  <tr>
                    <td colSpan="3">
                      <div className="expert-empty">
                        <Briefcase size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
                        <p>No job postings found.</p>
                        <span>{searchTerm ? 'Try adjusting your search filters.' : 'Click "New Job Posting" to create one.'}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedJobs.map(job => (
                    <tr key={job.id}>
                      <td>
                        <div className="text-dark font-semibold">{job.title}</div>
                      </td>
                      <td className="text-center">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="text-right">
                        <div className="jp-action-group">
                          <button className="jp-btn-icon" onClick={() => { setSelectedJob(job); setShowJobDetails(true); }} title="View Details">
                            <Eye size={16} style={{ color: '#64748B' }} />
                          </button>
                          
                          {/* Applicants Button with Red Notification Badge representing 'new' applicants */}
                          <button className="jp-btn-icon relative" onClick={() => viewApplicants(job)} title="View Applicants">
                            <Users size={16} style={{ color: '#0284C7' }} />
                            {job.applicant_count > 0 && (
                              <span className="jp-action-badge">{job.applicant_count}</span>
                            )}
                          </button>

                          <button className="jp-btn-icon" onClick={() => openJobForm(job)} title="Edit Posting">
                            <Edit3 size={16} style={{ color: '#0D9488' }} />
                          </button>
                          <button className="jp-btn-icon" onClick={() => handleToggleClick(job)} title={job.status === 'open' ? 'Close Job' : 'Open Job'}>
                            {job.status === 'open' ? <XCircle size={16} style={{ color: '#D97706' }} /> : <CheckCircle size={16} style={{ color: '#059669' }} />}
                          </button>
                          <button className="jp-btn-icon" onClick={() => { setDeleteJobId(job.id); setShowDeleteConfirm(true); }} title="Delete">
                            <Trash2 size={16} style={{ color: '#DC2626' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="expert-pagination">
            <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredJobs.length)} of {filteredJobs.length} postings</span>
            <div className="expert-page-controls">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="expert-page-btn">
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="expert-page-current">{currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="expert-page-btn">
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toggle Job Status Confirmation Modal */}
      <FormalModal 
        show={showStatusConfirm} 
        onClose={() => setShowStatusConfirm(false)} 
        title={jobToToggle?.status === 'open' ? 'Close Job Posting' : 'Reopen Job Posting'} 
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => setShowStatusConfirm(false)}>Cancel</button>
            <button className={`expert-btn-primary ${jobToToggle?.status === 'open' ? 'bg-red' : ''}`} onClick={confirmToggleStatus} disabled={saving}>
              {saving ? 'Processing...' : jobToToggle?.status === 'open' ? 'Yes, Close Post' : 'Yes, Reopen Post'}
            </button>
          </>
        }
      >
        <div className="jp-font-fix hide-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '0.95rem', color: '#334155', margin: 0 }}>
            Are you sure you want to {jobToToggle?.status === 'open' ? 'close' : 'reopen'} the posting for <strong>{jobToToggle?.title}</strong>?
          </p>
          {jobToToggle?.status === 'open' && (
            <p style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: '500', margin: 0 }}>
              Closing this post will remove it from the active job board. You can still access its applicants.
            </p>
          )}
        </div>
      </FormalModal>

      {/* Job Form Modal */}
      <FormalModal
        show={showJobModal}
        onClose={() => setShowJobModal(false)}
        title={editingJob ? 'Edit Job Posting' : 'Create New Job Posting'}
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => setShowJobModal(false)}>Cancel</button>
            <button className="expert-btn-primary" onClick={handleSaveJob} disabled={saving}>
              {saving ? 'Saving...' : editingJob ? 'Update Posting' : 'Publish Job'}
            </button>
          </>
        }
      >
        <div className="jp-modal-widen jp-font-fix">
          <div className="jp-form-layout hide-scrollbar">
            <div className="jp-form-row">
              <div className="jp-form-group flex-2">
                <label>Job Title <span className="text-danger">*</span></label>
                <input className="expert-clean-input border" value={jobForm.title} onChange={e => setJobForm({...jobForm, title: e.target.value})} placeholder="e.g. Senior Instructor" required />
              </div>
              <div className="jp-form-group flex-1">
                <label>Department</label>
                <input className="expert-clean-input border" value={jobForm.department} onChange={e => setJobForm({...jobForm, department: e.target.value})} placeholder="e.g. IT Department" />
              </div>
            </div>
            <div className="jp-form-row triple">
              <div className="jp-form-group">
                <label>Employment Type</label>
                <select className="expert-clean-input border jp-select" value={jobForm.employment_type} onChange={e => setJobForm({...jobForm, employment_type: e.target.value})}>
                  <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
                </select>
              </div>
              <div className="jp-form-group">
                <label>Location Type</label>
                <select className="expert-clean-input border jp-select" value={jobForm.location_type} onChange={e => setJobForm({...jobForm, location_type: e.target.value})}>
                  <option>On-site</option><option>Remote</option><option>Hybrid</option>
                </select>
              </div>
              <div className="jp-form-group">
                <label>Specific Location</label>
                <input className="expert-clean-input border" value={jobForm.location} onChange={e => setJobForm({...jobForm, location: e.target.value})} placeholder="e.g., Main Campus" />
              </div>
            </div>
            <div className="jp-form-row">
              <div className="jp-form-group">
                <label>Monthly Salary (Min)</label>
                <div className="jp-input-with-icon">
                  <span className="jp-input-prefix">₱</span>
                  <input type="number" className="expert-clean-input border pl-override" value={jobForm.salary_min} onChange={e => setJobForm({...jobForm, salary_min: e.target.value})} placeholder="0.00" />
                </div>
              </div>
              <div className="jp-form-group">
                <label>Monthly Salary (Max)</label>
                <div className="jp-input-with-icon">
                  <span className="jp-input-prefix">₱</span>
                  <input type="number" className="expert-clean-input border pl-override" value={jobForm.salary_max} onChange={e => setJobForm({...jobForm, salary_max: e.target.value})} placeholder="0.00" />
                </div>
              </div>
            </div>
            <div className="jp-form-row">
              <div className="jp-form-group flex-1">
                <label>Job Description <span className="text-danger">*</span></label>
                <textarea className="expert-clean-input border jp-textarea" rows="5" value={jobForm.description} onChange={e => setJobForm({...jobForm, description: e.target.value})} placeholder="Describe the role and responsibilities..." required />
              </div>
              <div className="jp-form-group flex-1">
                <label>Requirements / Qualifications</label>
                <textarea className="expert-clean-input border jp-textarea" rows="5" value={jobForm.requirements} onChange={e => setJobForm({...jobForm, requirements: e.target.value})} placeholder="List skills, experience, and educational requirements..." />
              </div>
            </div>
          </div>
        </div>
      </FormalModal>

      {/* Job Details Modal */}
      <FormalModal 
        show={showJobDetails} 
        onClose={() => setShowJobDetails(false)} 
        title="Job Posting Details" 
        footer={<button className="expert-btn-secondary" onClick={() => setShowJobDetails(false)}>Close Window</button>} 
      >
        <div className="jp-modal-widen jp-font-fix">
          <div className="jp-details-container hide-scrollbar">
            <div className="jp-details-header">
              <h3>{selectedJob?.title}</h3>
              <StatusBadge status={selectedJob?.status} />
            </div>
            
            <div className="jp-details-grid-clean">
              <div className="jp-detail-box">
                <span className="jp-detail-label"><Building2 size={14} /> Department</span>
                <p className="jp-detail-value">{selectedJob?.department || 'Unassigned'}</p>
              </div>
              <div className="jp-detail-box">
                <span className="jp-detail-label"><Clock size={14} /> Employment Type</span>
                <p className="jp-detail-value">{selectedJob?.employment_type}</p>
              </div>
              <div className="jp-detail-box">
                <span className="jp-detail-label"><MapPin size={14} /> Location</span>
                <p className="jp-detail-value">{selectedJob?.location_type}{selectedJob?.location ? ` (${selectedJob.location})` : ''}</p>
              </div>
              <div className="jp-detail-box">
                <span className="jp-detail-label"><DollarSign size={14} /> Salary Range</span>
                <p className="jp-detail-value font-mono">{formatSalaryRange(selectedJob?.salary_min, selectedJob?.salary_max)}</p>
              </div>
            </div>
            
            <div className="jp-form-row" style={{ marginTop: '1.25rem' }}>
              <div className="jp-section-box flex-1">
                <label>Role Description</label>
                <p>{selectedJob?.description}</p>
              </div>
              <div className="jp-section-box flex-1">
                <label>Requirements & Qualifications</label>
                <p>{selectedJob?.requirements || 'No specific requirements listed.'}</p>
              </div>
            </div>
          </div>
        </div>
      </FormalModal>

      {/* Applicants List Modal */}
      <FormalModal 
        show={showApplicantsModal} 
        onClose={() => setShowApplicantsModal(false)} 
        title={`Applicants: ${currentJobForApplicants?.title}`} 
        footer={<button className="expert-btn-secondary" onClick={() => setShowApplicantsModal(false)}>Close Window</button>}
      >
        <div className="jp-modal-widen jp-font-fix">
          <div className="hide-scrollbar">
            
            <div className="jp-applicants-toolbar">
              <div className="jp-tabs" style={{ gap: '1.5rem' }}>
                {['all', 'new', 'reviewed', 'shortlisted', 'rejected', 'hired'].map(tab => (
                  <button 
                    key={tab} 
                    className={`jp-tab small ${applicantTab === tab ? 'active' : ''}`} 
                    onClick={() => { setApplicantTab(tab); setApplicantsPage(1); }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              
              <div className="expert-search-input-group" style={{ maxWidth: '280px', height: '38px', margin: 0 }}>
                <Search size={14} className="text-muted" />
                <input 
                  type="text" placeholder="Search applicants..." 
                  value={applicantSearch} onChange={e => { setApplicantSearch(e.target.value); setApplicantsPage(1); }} 
                  className="expert-clean-input" style={{ fontSize: '0.85rem' }}
                />
              </div>
            </div>
            
            <div className="expert-table-wrapper hide-scrollbar" style={{ border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '1rem', overflow: 'hidden' }}>
              <table className="expert-table">
                <thead>
                  <tr>
                    <th>Candidate Name</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedApplicants.length === 0 ? (
                    <tr><td colSpan="3" className="expert-empty"><p>No applicants match this criteria.</p></td></tr>
                  ) : (
                    paginatedApplicants.map(app => (
                      <tr key={app.id}>
                        <td>
                          <div className="text-dark font-semibold">{app.full_name}</div>
                        </td>
                        <td>
                          <span className={`jp-status-pill ${app.status}`}>{app.status.toUpperCase()}</span>
                        </td>
                        <td className="text-right">
                          <button className="jp-btn-icon" onClick={() => openApplicantDetails(app)} title="View Applicant Details">
                            <Eye size={16} style={{ color: '#64748B' }} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {totalApplicantPages > 1 && (
              <div className="expert-pagination">
                <span className="expert-page-info">Page {applicantsPage} of {totalApplicantPages}</span>
                <div className="expert-page-controls">
                  <button onClick={() => setApplicantsPage(p => Math.max(1, p - 1))} disabled={applicantsPage === 1} className="expert-page-btn">
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span className="expert-page-current">{applicantsPage} / {totalApplicantPages}</span>
                  <button onClick={() => setApplicantsPage(p => Math.min(totalApplicantPages, p + 1))} disabled={applicantsPage === totalApplicantPages} className="expert-page-btn">
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </FormalModal>

      {/* Applicant Detailed View Modal */}
      <FormalModal 
        show={showApplicantDetailsModal} 
        onClose={() => setShowApplicantDetailsModal(false)} 
        title="Applicant Detailed Profile" 
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => setShowApplicantDetailsModal(false)}>Close</button>
            <button className="expert-btn-primary" onClick={() => { setShowApplicantDetailsModal(false); openScheduleInterview(selectedApplicant); }}>
              <CalendarIcon size={16} style={{ marginRight: '0.4rem' }} /> Schedule Interview
            </button>
          </>
        }
      >
        <div className="jp-modal-widen medium jp-font-fix">
          <div className="jp-details-container hide-scrollbar">
            <div className="jp-details-header">
              <h3>{selectedApplicant?.full_name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: '600' }}>STATUS:</span>
                <select 
                  className={`jp-status-select ${selectedApplicant?.status}`} 
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

            <div className="jp-details-grid-clean">
              <div className="jp-detail-box">
                <span className="jp-detail-label"><Mail size={14} /> Email Address</span>
                <p className="jp-detail-value">{selectedApplicant?.email}</p>
              </div>
              <div className="jp-detail-box">
                <span className="jp-detail-label"><Phone size={14} /> Phone Number</span>
                <p className="jp-detail-value font-mono">{selectedApplicant?.phone || 'Not provided'}</p>
              </div>
              <div className="jp-detail-box">
                <span className="jp-detail-label"><FileText size={14} /> Resume File</span>
                <p className="jp-detail-value">
                  {selectedApplicant?.resume_path ? (
                    <a className="jp-resume-link" href={`${staticBase}${selectedApplicant.resume_path}`} target="_blank" rel="noreferrer">
                      View Document
                    </a>
                  ) : (
                    <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>Not provided</span>
                  )}
                </p>
              </div>
              <div className="jp-detail-box">
                <span className="jp-detail-label"><Clock size={14} /> Application Submitted</span>
                <p className="jp-detail-value font-mono" style={{ fontSize: '0.85rem' }}>
                  {formatDateTime(selectedApplicant?.applied_at)}
                </p>
              </div>
            </div>
            
            {selectedApplicant?.cover_letter && (
              <div className="jp-section-box" style={{ marginTop: '1.25rem' }}>
                <label>Cover Letter / Additional Notes</label>
                <p>{selectedApplicant.cover_letter}</p>
              </div>
            )}
          </div>
        </div>
      </FormalModal>

      {/* Interview Modal */}
      <FormalModal 
        show={showInterviewModal} 
        onClose={() => setShowInterviewModal(false)} 
        title={`Schedule Interview: ${interviewApplicant?.full_name}`} 
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => setShowInterviewModal(false)}>Cancel</button>
            <button className="expert-btn-primary" onClick={scheduleInterview} disabled={saving}>
              {saving ? 'Scheduling...' : 'Send Invitation'}
            </button>
          </>
        }
      >
        <div className="jp-modal-widen medium jp-font-fix">
          <div className="jp-form-layout hide-scrollbar">
            {['rejected', 'hired'].includes(interviewApplicant?.status) && (
              <div className="jp-info-alert" style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', color: '#DC2626' }}>
                <XCircle size={16} />
                <span>Warning: You are scheduling an interview for a candidate marked as <strong>{interviewApplicant.status}</strong>.</span>
              </div>
            )}
            <div className="jp-form-row">
              <div className="jp-form-group">
                <label>Interview Date <span className="text-danger">*</span></label>
                <input type="date" className="expert-clean-input border" value={interviewForm.date} onChange={e => setInterviewForm({...interviewForm, date: e.target.value})} min={new Date().toISOString().split('T')[0]} required />
              </div>
              <div className="jp-form-group">
                <label>Time <span className="text-danger">*</span></label>
                <input type="time" className="expert-clean-input border" value={interviewForm.time} onChange={e => setInterviewForm({...interviewForm, time: e.target.value})} required />
              </div>
            </div>
            <div className="jp-form-group">
              <label>Notes / Meeting Link</label>
              <input type="text" className="expert-clean-input border" value={interviewForm.notes} onChange={e => setInterviewForm({...interviewForm, notes: e.target.value})} placeholder="e.g. Zoom link or meeting room location" />
            </div>
            <div className="jp-info-alert">
              <FileText size={16} />
              <span>The candidate will receive an automated email confirmation with these details.</span>
            </div>
          </div>
        </div>
      </FormalModal>

      {/* Delete Confirmation Modal */}
      <FormalModal 
        show={showDeleteConfirm} 
        onClose={() => setShowDeleteConfirm(false)} 
        title="Delete Job Posting" 
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="expert-btn-primary bg-red" onClick={confirmDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </>
        }
      >
        <div className="jp-font-fix hide-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '0.95rem', color: '#334155', margin: 0 }}>Are you sure you want to permanently delete this job posting?</p>
          <p style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: '500', margin: 0 }}>This action cannot be undone. All associated applicant data and resumes will also be permanently removed.</p>
        </div>
      </FormalModal>
    </div>
  );
};

export default JobPostings;