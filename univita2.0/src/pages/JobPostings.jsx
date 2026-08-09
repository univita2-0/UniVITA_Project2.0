// src/pages/JobPostings.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Plus, Edit3, Trash2, Eye, Calendar as CalendarIcon,
  Users, FileText, CheckCircle, XCircle,
  MapPin, DollarSign, Search, Filter, ChevronLeft, ChevronRight, Briefcase
} from 'lucide-react';
import FormalModal from '../components/FormalModal';
import { API_BASE } from '../api';
import './JobPostings.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const staticBase = API_BASE.replace(/\/api$/, '');

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

  const [showApplicantsModal, setShowApplicantsModal] = useState(false);
  const [currentJobForApplicants, setCurrentJobForApplicants] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [applicantFilter, setApplicantFilter] = useState('');
  const [applicantsPage, setApplicantsPage] = useState(1);
  const applicantsPerPage = 10;

  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [interviewApplicant, setInterviewApplicant] = useState(null);
  const [interviewForm, setInterviewForm] = useState({ date: '', time: '', notes: '' });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState(null);
  const [loading, setLoading] = useState(true);

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
        title: job.title,
        department: job.department || '',
        employment_type: job.employment_type || 'Full-time',
        location_type: job.location_type || 'On-site',
        location: job.location || '',
        salary_min: job.salary_min || '',
        salary_max: job.salary_max || '',
        description: job.description || '',
        requirements: job.requirements || '',
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
      toast.warning('Title and description are required');
      return;
    }
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
    }
  };

  const toggleJobStatus = async (job) => {
    const newStatus = job.status === 'open' ? 'closed' : 'open';
    try {
      await axios.put(`${API_BASE}/jobs/${job.id}`, { ...job, status: newStatus }, getAuthHeaders());
      toast.success(`Job ${newStatus === 'open' ? 'opened' : 'closed'}`);
      fetchJobs();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const confirmDelete = async () => {
    try {
      await axios.delete(`${API_BASE}/jobs/${deleteJobId}`, getAuthHeaders());
      toast.success('Job deleted');
      fetchJobs();
    } catch (err) {
      toast.error('Failed to delete job');
    } finally {
      setShowDeleteConfirm(false);
      setDeleteJobId(null);
    }
  };

  const viewApplicants = async (job) => {
    setCurrentJobForApplicants(job);
    setApplicantsPage(1);
    setApplicantFilter('');
    try {
      const res = await axios.get(`${API_BASE}/jobs/${job.id}/applicants`, getAuthHeaders());
      setApplicants(res.data);
      setShowApplicantsModal(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load applicants');
    }
  };

  const updateApplicantStatus = async (applicantId, newStatus) => {
    try {
      await axios.put(`${API_BASE}/applicants/${applicantId}`, { status: newStatus }, getAuthHeaders());
      const res = await axios.get(`${API_BASE}/jobs/${currentJobForApplicants.id}/applicants`, getAuthHeaders());
      setApplicants(res.data);
      toast.success('Status updated');
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const openScheduleInterview = (applicant) => {
    setInterviewApplicant(applicant);
    setInterviewForm({ date: '', time: '', notes: `Interview for ${currentJobForApplicants?.title}` });
    setShowInterviewModal(true);
  };

  const scheduleInterview = async () => {
    if (!interviewForm.date || !interviewForm.time) {
      toast.warning('Please select date and time');
      return;
    }
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
    }
  };

  const filteredApplicants = applicantFilter ? applicants.filter(a => a.status === applicantFilter) : applicants;
  const totalApplicantPages = Math.ceil(filteredApplicants.length / applicantsPerPage);
  const paginatedApplicants = filteredApplicants.slice((applicantsPage - 1) * applicantsPerPage, applicantsPage * applicantsPerPage);

  const formatSalaryRange = (min, max) => {
    if (!min && !max) return 'Not specified';
    if (min && max) return `₱${Number(min).toLocaleString()} - ₱${Number(max).toLocaleString()}`;
    if (min) return `From ₱${Number(min).toLocaleString()}`;
    return `Up to ₱${Number(max).toLocaleString()}`;
  };

  const StatusBadge = ({ status }) => {
    if (status === 'open') return <span className="jp-badge jp-badge-open">Open</span>;
    if (status === 'closed') return <span className="jp-badge jp-badge-closed">Closed</span>;
    return <span className="jp-badge">{status}</span>;
  };

  return (
    <div className="jp-container">
      {/* Header */}
      <div className="jp-header">
        <div className="jp-title-area">
          <h2 className="jp-title">Recruitment & Job Postings</h2>
          <p className="jp-subtitle">Manage open requisitions and track candidate applications.</p>
        </div>
        <div className="jp-header-actions">
          <button className="btn-jp-primary" onClick={() => openJobForm()}>
            <Plus size={16} /> <span>New Job Posting</span>
          </button>
        </div>
      </div>

      <div className="jp-card">
        {/* Toolbar: Tabs + Search */}
        <div className="jp-toolbar">
          <div className="jp-tabs">
            <button 
              className={`jp-tab ${activeTab === 'active' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('active'); setCurrentPage(1); }}
            >
              Active Postings <span className="jp-tab-count">{jobs.filter(j => j.status === 'open').length}</span>
            </button>
            <button 
              className={`jp-tab ${activeTab === 'closed' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('closed'); setCurrentPage(1); }}
            >
              Closed <span className="jp-tab-count">{jobs.filter(j => j.status === 'closed').length}</span>
            </button>
          </div>
          
          <div className="jp-search-wrapper">
            <Search size={16} className="jp-search-icon" />
            <input 
              type="text" 
              placeholder="Search job titles..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="jp-search-input"
            />
          </div>
        </div>

        {/* Jobs Table */}
        <div className="jp-table-wrapper">
          {loading ? (
            <div className="jp-empty-state">Loading job postings...</div>
          ) : (
            <table className="jp-table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Department</th>
                  <th>Type & Location</th>
                  <th>Salary Range</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.length === 0 ? (
                  <tr className="jp-empty-row">
                    <td colSpan="6">
                      <div className="jp-empty-state">
                        <Briefcase size={40} className="jp-empty-icon" />
                        <p>No job postings found.</p>
                        <span>{searchTerm ? 'Try adjusting your search filters.' : 'Click "New Job Posting" to create one.'}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedJobs.map(job => (
                    <tr key={job.id}>
                      <td>
                        <div className="jp-job-title">{job.title}</div>
                      </td>
                      <td>
                        <span className="jp-dept-badge">{job.department || 'Unassigned'}</span>
                      </td>
                      <td>
                        <div className="jp-location-cell">
                          <span className="jp-type-text">{job.employment_type}</span>
                          <span className="jp-loc-text">
                            <MapPin size={12} /> {job.location_type}{job.location ? ` (${job.location})` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="jp-salary-text">
                        <DollarSign size={14} className="jp-salary-icon" /> {formatSalaryRange(job.salary_min, job.salary_max)}
                      </td>
                      <td className="text-center">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="text-right">
                        <div className="jp-action-group">
                          <button className="btn-icon-neutral" onClick={() => { setSelectedJob(job); setShowJobDetails(true); }} title="View Details">
                            <Eye size={16} />
                          </button>
                          <button className="btn-icon-primary" onClick={() => viewApplicants(job)} title="View Applicants">
                            <Users size={16} />
                          </button>
                          <button className="btn-icon-edit" onClick={() => openJobForm(job)} title="Edit Posting">
                            <Edit3 size={16} />
                          </button>
                          <button className="btn-icon-warning" onClick={() => toggleJobStatus(job)} title={job.status === 'open' ? 'Close Job' : 'Open Job'}>
                            {job.status === 'open' ? <XCircle size={16} /> : <CheckCircle size={16} />}
                          </button>
                          <button className="btn-icon-danger" onClick={() => { setDeleteJobId(job.id); setShowDeleteConfirm(true); }} title="Delete">
                            <Trash2 size={16} />
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
          <div className="jp-pagination">
            <button className="jp-page-btn" onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1}>
              <ChevronLeft size={16} />
            </button>
            <div className="jp-page-numbers">
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} className={`jp-page-num ${currentPage === i+1 ? 'active' : ''}`} onClick={() => setCurrentPage(i+1)}>
                  {i+1}
                </button>
              ))}
            </div>
            <button className="jp-page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Job Form Modal */}
      <FormalModal
        show={showJobModal}
        onClose={() => setShowJobModal(false)}
        title={editingJob ? 'Edit Job Posting' : 'Create New Job Posting'}
        footer={
          <>
            <button className="btn-jp-cancel" onClick={() => setShowJobModal(false)}>Cancel</button>
            <button className="btn-jp-primary" onClick={handleSaveJob}>{editingJob ? 'Update Posting' : 'Publish Job'}</button>
          </>
        }
        wide
      >
        <div className="jp-form-layout">
          <div className="jp-form-row">
            <div className="jp-form-group flex-2">
              <label>Job Title <span className="jp-required">*</span></label>
              <input className="jp-input" value={jobForm.title} onChange={e => setJobForm({...jobForm, title: e.target.value})} placeholder="e.g. Senior Instructor" required />
            </div>
            <div className="jp-form-group flex-1">
              <label>Department</label>
              <input className="jp-input" value={jobForm.department} onChange={e => setJobForm({...jobForm, department: e.target.value})} placeholder="e.g. IT Department" />
            </div>
          </div>
          <div className="jp-form-row triple">
            <div className="jp-form-group">
              <label>Employment Type</label>
              <select className="jp-input jp-select" value={jobForm.employment_type} onChange={e => setJobForm({...jobForm, employment_type: e.target.value})}>
                <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
              </select>
            </div>
            <div className="jp-form-group">
              <label>Location Type</label>
              <select className="jp-input jp-select" value={jobForm.location_type} onChange={e => setJobForm({...jobForm, location_type: e.target.value})}>
                <option>On-site</option><option>Remote</option><option>Hybrid</option>
              </select>
            </div>
            <div className="jp-form-group">
              <label>Specific Location</label>
              <input className="jp-input" value={jobForm.location} onChange={e => setJobForm({...jobForm, location: e.target.value})} placeholder="e.g., Main Campus" />
            </div>
          </div>
          <div className="jp-form-row">
            <div className="jp-form-group">
              <label>Monthly Salary (Min)</label>
              <div className="jp-input-with-icon">
                <span className="jp-input-prefix">₱</span>
                <input type="number" className="jp-input pl-override" value={jobForm.salary_min} onChange={e => setJobForm({...jobForm, salary_min: e.target.value})} placeholder="0.00" />
              </div>
            </div>
            <div className="jp-form-group">
              <label>Monthly Salary (Max)</label>
              <div className="jp-input-with-icon">
                <span className="jp-input-prefix">₱</span>
                <input type="number" className="jp-input pl-override" value={jobForm.salary_max} onChange={e => setJobForm({...jobForm, salary_max: e.target.value})} placeholder="0.00" />
              </div>
            </div>
          </div>
          <div className="jp-form-group">
            <label>Job Description <span className="jp-required">*</span></label>
            <textarea className="jp-input jp-textarea" rows="5" value={jobForm.description} onChange={e => setJobForm({...jobForm, description: e.target.value})} placeholder="Describe the role and responsibilities..." required />
          </div>
          <div className="jp-form-group">
            <label>Requirements / Qualifications</label>
            <textarea className="jp-input jp-textarea" rows="4" value={jobForm.requirements} onChange={e => setJobForm({...jobForm, requirements: e.target.value})} placeholder="List skills, experience, and educational requirements..." />
          </div>
        </div>
      </FormalModal>

      {/* Job Details Modal */}
      <FormalModal 
        show={showJobDetails} 
        onClose={() => setShowJobDetails(false)} 
        title="Job Posting Details" 
        footer={<button className="btn-jp-cancel" onClick={() => setShowJobDetails(false)}>Close</button>} 
        wide
      >
        <div className="jp-details-container">
          <div className="jp-details-header">
            <h3>{selectedJob?.title}</h3>
            <StatusBadge status={selectedJob?.status} />
          </div>
          
          <div className="jp-details-grid">
            <div className="jp-detail-item">
              <label>Department</label>
              <p>{selectedJob?.department || 'Unassigned'}</p>
            </div>
            <div className="jp-detail-item">
              <label>Employment Type</label>
              <p>{selectedJob?.employment_type}</p>
            </div>
            <div className="jp-detail-item">
              <label>Location</label>
              <p>{selectedJob?.location_type}{selectedJob?.location ? ` (${selectedJob.location})` : ''}</p>
            </div>
            <div className="jp-detail-item">
              <label>Salary Range</label>
              <p>{formatSalaryRange(selectedJob?.salary_min, selectedJob?.salary_max)}</p>
            </div>
          </div>
          
          <div className="jp-details-section">
            <h4>Role Description</h4>
            <div className="jp-details-text">{selectedJob?.description}</div>
          </div>
          
          <div className="jp-details-section">
            <h4>Requirements</h4>
            <div className="jp-details-text">{selectedJob?.requirements || 'No specific requirements listed.'}</div>
          </div>
        </div>
      </FormalModal>

      {/* Applicants Modal */}
      <FormalModal 
        show={showApplicantsModal} 
        onClose={() => setShowApplicantsModal(false)} 
        title={`Applicants: ${currentJobForApplicants?.title}`} 
        wide 
        footer={<button className="btn-jp-cancel" onClick={() => setShowApplicantsModal(false)}>Close</button>}
      >
        <div className="jp-applicants-toolbar">
          <div className="jp-filter-box">
            <Filter size={14} className="jp-filter-icon" />
            <select className="jp-filter-select" value={applicantFilter} onChange={e => { setApplicantFilter(e.target.value); setApplicantsPage(1); }}>
              <option value="">All Statuses</option>
              <option value="new">New Applications</option>
              <option value="reviewed">Reviewed</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="rejected">Rejected</option>
              <option value="hired">Hired</option>
            </select>
          </div>
          <div className="jp-applicants-count">
            Total Candidates: <strong>{applicants.length}</strong>
          </div>
        </div>
        
        <div className="jp-table-wrapper border-inner">
          <table className="jp-table">
            <thead>
              <tr>
                <th>Candidate Name</th>
                <th>Contact Info</th>
                <th className="text-center">Resume</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedApplicants.length === 0 ? (
                <tr className="jp-empty-row"><td colSpan="5">No applicants match this criteria.</td></tr>
              ) : (
                paginatedApplicants.map(app => (
                  <tr key={app.id}>
                    <td>
                      <div className="jp-candidate-name">{app.full_name}</div>
                    </td>
                    <td>
                      <div className="jp-contact-cell">
                        <span className="jp-contact-email">{app.email}</span>
                        {app.phone && <span className="jp-contact-phone">{app.phone}</span>}
                      </div>
                    </td>
                    <td className="text-center">
                      {app.resume_path ? (
                        <a className="jp-resume-link" href={`${staticBase}${app.resume_path}`} target="_blank" rel="noreferrer">
                          <FileText size={14} /> View File
                        </a>
                      ) : (
                        <span className="jp-no-file">Not provided</span>
                      )}
                    </td>
                    <td>
                      <select 
                        className={`jp-status-select ${app.status}`} 
                        value={app.status} 
                        onChange={e => updateApplicantStatus(app.id, e.target.value)}
                      >
                        <option value="new">New</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="shortlisted">Shortlisted</option>
                        <option value="rejected">Rejected</option>
                        <option value="hired">Hired</option>
                      </select>
                    </td>
                    <td className="text-right">
                      <button className="btn-jp-schedule" onClick={() => openScheduleInterview(app)}>
                        <CalendarIcon size={14} /> Schedule Interview
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {totalApplicantPages > 1 && (
          <div className="jp-pagination">
            <button className="jp-page-btn" onClick={() => setApplicantsPage(p => Math.max(1, p-1))} disabled={applicantsPage === 1}>
              <ChevronLeft size={16} />
            </button>
            <div className="jp-page-numbers">
              {[...Array(totalApplicantPages)].map((_, i) => (
                <button key={i} className={`jp-page-num ${applicantsPage === i+1 ? 'active' : ''}`} onClick={() => setApplicantsPage(i+1)}>
                  {i+1}
                </button>
              ))}
            </div>
            <button className="jp-page-btn" onClick={() => setApplicantsPage(p => Math.min(totalApplicantPages, p+1))} disabled={applicantsPage === totalApplicantPages}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </FormalModal>

      {/* Interview Modal */}
      <FormalModal 
        show={showInterviewModal} 
        onClose={() => setShowInterviewModal(false)} 
        title={`Schedule Interview: ${interviewApplicant?.full_name}`} 
        footer={
          <>
            <button className="btn-jp-cancel" onClick={() => setShowInterviewModal(false)}>Cancel</button>
            <button className="btn-jp-primary" onClick={scheduleInterview}>Send Invitation</button>
          </>
        }
      >
        <div className="jp-form-layout">
          <div className="jp-form-row">
            <div className="jp-form-group">
              <label>Interview Date <span className="jp-required">*</span></label>
              <input type="date" className="jp-input" value={interviewForm.date} onChange={e => setInterviewForm({...interviewForm, date: e.target.value})} min={new Date().toISOString().split('T')[0]} required />
            </div>
            <div className="jp-form-group">
              <label>Time <span className="jp-required">*</span></label>
              <input type="time" className="jp-input" value={interviewForm.time} onChange={e => setInterviewForm({...interviewForm, time: e.target.value})} required />
            </div>
          </div>
          <div className="jp-form-group">
            <label>Notes / Meeting Link</label>
            <input type="text" className="jp-input" value={interviewForm.notes} onChange={e => setInterviewForm({...interviewForm, notes: e.target.value})} placeholder="e.g. Zoom link or meeting room location" />
          </div>
          <div className="jp-info-alert">
            <FileText size={16} />
            <span>The candidate will receive an automated email confirmation with these details.</span>
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
            <button className="btn-jp-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button className="btn-jp-danger" onClick={confirmDelete}>Yes, Delete</button>
          </>
        }
      >
        <p className="jp-modal-text">Are you sure you want to permanently delete this job posting?</p>
        <p className="jp-modal-warning">This action cannot be undone. All associated applicant data and resumes will also be permanently removed.</p>
      </FormalModal>
    </div>
  );
};

export default JobPostings;