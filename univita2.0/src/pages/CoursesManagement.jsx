// src/pages/CoursesManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit3, Trash2, Search, X, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { API_BASE } from '../api';
import './CoursesManagement.css';

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const CoursesManagement = () => {
  const [courses, setCourses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseName, setCourseName] = useState('');
  
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteTargetName, setDeleteTargetName] = useState('');

  // Reset page on search
  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/courses`, getAuthHeaders());
      // Sort newest to oldest
      const sorted = (res.data || []).sort((a, b) => b.id - a.id);
      setCourses(sorted);
    } catch (err) {
      console.error("Failed to load courses", err);
      toast.error("Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCourses(); }, [loadCourses]);

  const resetForm = () => {
    setCourseName('');
    setEditingCourse(null);
  };

  const handleEdit = (course) => {
    setEditingCourse(course);
    setCourseName(course.name);
    setShowModal(true);
  };

  const handleDeleteClick = (id, name) => {
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setProcessing(true);
    try {
      await axios.delete(`${API_BASE}/courses/${deleteTargetId}`, getAuthHeaders());
      toast.success("Course deleted successfully");
      loadCourses();
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to delete course";
      toast.error(errorMsg);
    } finally {
      setProcessing(false);
      setShowConfirm(false);
      setDeleteTargetId(null);
      setDeleteTargetName('');
    }
  };

  const handleSave = async () => {
    if (!courseName.trim()) {
      toast.warning("Course name required");
      return;
    }
    setProcessing(true);
    try {
      if (editingCourse) {
        await axios.put(`${API_BASE}/courses/${editingCourse.id}`, { name: courseName.trim() }, getAuthHeaders());
        toast.success("Course updated successfully");
      } else {
        await axios.post(`${API_BASE}/courses`, { name: courseName.trim() }, getAuthHeaders());
        toast.success("Course added successfully");
      }
      setShowModal(false);
      resetForm();
      loadCourses();
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Error saving course";
      toast.error(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  // Instant Client-Side Filtering
  const filteredCourses = courses.filter(c => 
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredCourses.length / itemsPerPage);
  const currentCourses = filteredCourses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="cm-container">
      {/* Header Section */}
      <div className="cm-header">
        <div className="cm-title-group">
          <div>
            <p className="cm-subtitle">Manage academic courses and subjects for instructor assignment.</p>
          </div>
        </div>
        <button className="cm-btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus size={16} /> Add New Course
        </button>
      </div>

      <div className="cm-content-card">
        {/* Search & Toolbar */}
        <div className="cm-toolbar border-bottom">
          <div className="cm-search-input-group">
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search courses by name..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="cm-clean-input" 
            />
            {searchQuery && <X size={14} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
          </div>
          <div className="cm-stats-badge">
            Total Courses: <strong>{courses.length}</strong>
          </div>
        </div>

        {/* Main Table Area */}
        {loading ? (
          <div className="cm-loading">Loading courses...</div>
        ) : filteredCourses.length === 0 ? (
          <div className="cm-empty">
            <AlertCircle size={36} className="text-muted" style={{ marginBottom: '1rem' }} />
            <p>No courses found.</p>
            {searchQuery ? <span>Try adjusting your search criteria.</span> : <span>Click "Add New Course" to create your first subject.</span>}
          </div>
        ) : (
          <>
            <div className="cm-table-wrapper">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Course Name</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCourses.map(course => (
                    <tr key={course.id}>
                      <td>
                        <span className="font-medium text-dark">{course.name}</span>
                      </td>
                      <td>
                        <div className="cm-action-group right">
                          <button className="cm-icon-btn edit" onClick={() => handleEdit(course)} title="Edit Course">
                            <Edit3 size={16} />
                          </button>
                          <button className="cm-icon-btn danger" onClick={() => handleDeleteClick(course.id, course.name)} title="Delete Course">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="cm-pagination">
                <span className="cm-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCourses.length)} of {filteredCourses.length}</span>
                <div className="cm-page-controls">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="cm-page-btn"><ChevronLeft size={16} /></button>
                  <span className="cm-page-current">{currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="cm-page-btn"><ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ADD/EDIT COURSE MODAL */}
      {showModal && (
        <div className="cm-custom-modal-backdrop" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="cm-custom-modal small" onClick={e => e.stopPropagation()}>
            <div className="cm-custom-modal-header">
              <h3>{editingCourse ? 'Edit Course' : 'Add New Course'}</h3>
              <button className="cm-custom-close-btn" onClick={() => { setShowModal(false); resetForm(); }}>
                <X size={18} />
              </button>
            </div>
            
            <div className="cm-custom-modal-body">
              <div className="cm-form-group">
                <label>Course Name <span className="text-danger">*</span></label>
                <input 
                  type="text" 
                  className="cm-clean-input border" 
                  value={courseName} 
                  onChange={e => setCourseName(e.target.value)} 
                  placeholder="e.g. Web Development 101" 
                  disabled={processing}
                  autoFocus
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

      {/* DELETE CONFIRMATION MODAL */}
      {showConfirm && (
        <div className="cm-custom-modal-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="cm-custom-modal small" onClick={e => e.stopPropagation()}>
            <div className="cm-custom-modal-header">
              <h3>Delete Course</h3>
              <button className="cm-custom-close-btn" onClick={() => setShowConfirm(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="cm-custom-modal-body">
              <p style={{ fontSize: '0.95rem', color: '#334155', margin: '0 0 1rem 0' }}>
                Are you sure you want to permanently delete <strong>"{deleteTargetName}"</strong>?
              </p>
              <div className="cm-alert-box danger">
                <AlertCircle size={16} /> 
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