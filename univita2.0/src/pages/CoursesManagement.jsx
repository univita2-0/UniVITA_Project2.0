import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit3, Trash2, Search, X, ChevronLeft, ChevronRight, AlertCircle, BookOpen, Layers } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { API_BASE } from '../api';
import { useRole } from '../permissions';
import './CoursesManagement.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const CoursesManagement = () => {
  const { can, isAdmin } = useRole();
  const canWrite = can('courses:write');

  const [courses, setCourses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseName, setCourseName] = useState('');

  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');

  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteTargetName, setDeleteTargetName] = useState('');

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/courses`, getAuthHeaders());
      const sorted = (res.data || []).sort((a, b) => b.id - a.id);
      setCourses(sorted);
    } catch (err) {
      console.error("Failed to load courses", err);
      toast.error("Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrograms = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/programs`, getAuthHeaders());
      setPrograms(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedProgramId(res.data[0].id);
      }
    } catch (err) {
      console.error("Failed to load programs", err);
      toast.error("Failed to load programs");
    }
  }, []);

  useEffect(() => { 
    loadCourses(); 
    loadPrograms();
  }, [loadCourses, loadPrograms]);

  const resetForm = () => {
    setCourseName('');
    setEditingCourse(null);
    if (programs.length > 0) setSelectedProgramId(programs[0].id);
  };

  const handleEdit = (course) => {
    // FIX 10.8 — defense-in-depth
    if (!canWrite) {
      toast.error('You do not have permission to edit courses.');
      return;
    }
    setEditingCourse(course);
    setCourseName(course.name);
    setSelectedProgramId(course.program_id);
    setShowModal(true);
  };

  const handleDeleteClick = (id, name) => {
    // FIX 10.8 — defense-in-depth
    if (!canWrite) {
      toast.error('You do not have permission to delete courses.');
      return;
    }
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    // FIX 10.8 — defense-in-depth
    if (!canWrite) {
      toast.error('You do not have permission to delete courses.');
      return;
    }
    if (!deleteTargetId) return;
    setProcessing(true);
    try {
      await axios.delete(`${API_BASE}/courses/${deleteTargetId}`, getAuthHeaders());
      toast.success("Course deleted successfully");
      loadCourses();
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Failed to delete course";
      toast.error(errorMsg);
    } finally {
      setProcessing(false);
      setShowConfirm(false);
      setDeleteTargetId(null);
      setDeleteTargetName('');
    }
  };

  const handleSave = async () => {
    // FIX 10.8 — defense-in-depth
    if (!canWrite) {
      toast.error('You do not have permission to save courses.');
      return;
    }
    const trimmed = courseName.trim();
    if (!trimmed) {
      toast.warning("Course name required");
      return;
    }

    if (trimmed.length > 100) {
      toast.warning("Course name must be 100 characters or fewer");
      return;
    }

    if (!selectedProgramId) {
      toast.warning("Please select a program for this course");
      return;
    }

    setProcessing(true);
    try {
      const payload = { 
        name: trimmed, 
        program_id: selectedProgramId 
      };

      if (editingCourse) {
        await axios.put(`${API_BASE}/courses/${editingCourse.id}`, payload, getAuthHeaders());
        toast.success("Course updated successfully");
      } else {
        await axios.post(`${API_BASE}/courses`, payload, getAuthHeaders());
        toast.success("Course added successfully");
      }
      setShowModal(false);
      resetForm();
      loadCourses();
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Error saving course";
      toast.error(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  const filteredCourses = courses.filter(c =>
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.program_name && c.program_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalPages = Math.ceil(filteredCourses.length / itemsPerPage);
  const currentCourses = filteredCourses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="cm-container facility-courses">
      {isAdmin && (
        <p className="facility-view-only" role="note">View-only access</p>
      )}

     
      <section className="facility-stat-strip" aria-label="Course inventory summary">
        <div className="facility-stat-card">
          <span>Total courses</span>
          <strong>{courses.length}</strong>
        </div>
        <div className="facility-stat-card">
          <span>Matching courses</span>
          <strong>{filteredCourses.length}</strong>
        </div>
        <div className="facility-stat-card">
          <span>Available programs</span>
          <strong>{programs.length}</strong>
        </div>
      </section>
      {/* Header Area */}
      {canWrite && (
        <div className="cm-header facility-header-actions">
          <button className="cm-btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
            Add New Course
          </button>
        </div>
      )}

      {/* Main Content Card */}
      <div className="cm-content-card">
        
        {/* Toolbar */}
        <div className="cm-toolbar">
          <div className="cm-search-input-group">
            <Search size={18} className="cm-search-icon" />
            <input
              type="text"
              placeholder="Search courses by name or program..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="cm-clean-input"
            />
            {searchQuery && (
              <button className="cm-clear-search" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="cm-total-count">
            Showing <span>{filteredCourses.length} of {courses.length}</span>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="cm-loading">Loading courses...</div>
        ) : filteredCourses.length === 0 ? (
          <div className="cm-empty">
            <h3>No courses found</h3>
            <p>
              {searchQuery 
                ? "We couldn't find any courses matching your search." 
                : (canWrite ? "Get started by adding your first academic course." : "No courses configured yet.")}
            </p>
            {!searchQuery && canWrite && (
              <button className="cm-btn-outline mt-4" onClick={() => { resetForm(); setShowModal(true); }}>
                Add First Course
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="cm-table-wrapper">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Course Name</th>
                    {canWrite && <th className="text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {currentCourses.map(course => (
                    <tr key={course.id}>
                      <td>
                        <span style={{ color: '#64748B', fontSize: '0.875rem', fontWeight: '500' }}>
                          {course.program_name || 'Unassigned'}
                        </span>
                      </td>
                      <td>
                        <span className="cm-course-name">{course.name}</span>
                      </td>
                      {canWrite && (
                        <td>
                          <div className="cm-action-group">
                            <button className="cm-action-btn edit" onClick={() => handleEdit(course)} title="Edit Course">
                              Edit
                            </button>
                            <button className="cm-action-btn delete" onClick={() => handleDeleteClick(course.id, course.name)} title="Delete Course">
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="cm-pagination">
                <span className="cm-page-info">
                  Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, filteredCourses.length)}</strong> of <strong>{filteredCourses.length}</strong> entries
                </span>
                <div className="cm-page-controls">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                    disabled={currentPage === 1} 
                    className="cm-page-btn"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="cm-page-current">Page {currentPage} of {totalPages}</span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                    disabled={currentPage === totalPages} 
                    className="cm-page-btn"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Modal — reachable only via HR-gated openers */}
      {showModal && (
        <div className="cm-custom-modal-backdrop" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="cm-custom-modal small" onClick={e => e.stopPropagation()}>
            <div className="cm-custom-modal-header">
              <h3>{editingCourse ? 'Edit Course' : 'Add New Course'}</h3>
              <button className="cm-custom-close-btn" onClick={() => { setShowModal(false); resetForm(); }}>
                <X size={20} />
              </button>
            </div>

            <div className="cm-custom-modal-body">
              
              <div className="cm-form-group" style={{ marginBottom: '1rem' }}>
                <label>Belongs to Program <span className="text-danger">*</span></label>
                <select
                  className="cm-clean-input border"
                  value={selectedProgramId}
                  onChange={e => setSelectedProgramId(e.target.value)}
                  disabled={processing}
                >
                  <option value="" disabled>Select a Program</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>{p.program_name}</option>
                  ))}
                </select>
              </div>

              <div className="cm-form-group">
                <label>Course Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className="cm-clean-input border"
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  placeholder="e.g. Bachelor of Science in Nursing"
                  disabled={processing}
                  autoFocus
                  maxLength={100}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                />
              </div>
            </div>

            <div className="cm-custom-modal-footer">
              <button className="cm-btn-outline" onClick={() => { setShowModal(false); resetForm(); }} disabled={processing}>Cancel</button>
              <button className="cm-btn-primary" onClick={handleSave} disabled={processing}>
                {processing ? 'Saving...' : (editingCourse ? 'Update Course' : 'Save Course')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showConfirm && (
        <div className="cm-custom-modal-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="cm-custom-modal small" onClick={e => e.stopPropagation()}>
            <div className="cm-custom-modal-header">
              <h3>Delete Course</h3>
              <button className="cm-custom-close-btn" onClick={() => setShowConfirm(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="cm-custom-modal-body">
              <p className="cm-delete-text">
                Are you sure you want to permanently delete <strong>"{deleteTargetName}"</strong>?
              </p>
              <div className="cm-alert-box danger">
                <span>Warning: This action cannot be undone and may affect instructors currently assigned to this course.</span>
              </div>
            </div>

            <div className="cm-custom-modal-footer">
              <button className="cm-btn-outline" onClick={() => setShowConfirm(false)} disabled={processing}>Cancel</button>
              <button className="cm-btn-primary bg-red" onClick={confirmDelete} disabled={processing}>
                {processing ? 'Processing...' : 'Delete Course'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoursesManagement;