import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit3, Trash2, BookOpen, Search, X, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import FormalModal from '../components/FormalModal';
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
    <div className="expert-container">
      {/* Header Section */}
      <div className="expert-header">
        <div className="expert-title-group">
          
          <div>
            
            <p className="expert-subtitle">Manage academic courses and subjects for instructor assignment.</p>
          </div>
        </div>
        <button className="expert-btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus size={16} /> Add New Course
        </button>
      </div>

      {/* Search Bar */}
      <div className="expert-search-card" style={{ padding: '12px 20px' }}>
        <div className="expert-search-row">
          <div className="expert-search-input-group" style={{ maxWidth: '500px' }}>
            <Search size={18} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search courses..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="expert-clean-input" 
            />
            {searchQuery && <X size={16} className="text-muted cursor-pointer" onClick={() => setSearchQuery('')} />}
          </div>
          <div className="expert-stats-badge">
            Total Courses: <strong>{courses.length}</strong>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="expert-card">
        {loading ? (
          <div className="expert-loading">Loading courses...</div>
        ) : filteredCourses.length === 0 ? (
          <div className="expert-empty">
            <AlertCircle size={48} className="text-muted" style={{ marginBottom: '1rem' }} />
            <p>No courses found.</p>
            {searchQuery ? <span>Try adjusting your search criteria.</span> : <span>Click "Add New Course" to create your first subject.</span>}
          </div>
        ) : (
          <>
            <div className="expert-table-wrapper">
              <table className="expert-table">
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
                        <span className="font-semibold text-dark">{course.name}</span>
                      </td>
                      <td>
                        <div className="expert-action-group right">
                          <button className="expert-btn-icon" onClick={() => handleEdit(course)} title="Edit Course">
                            <Edit3 size={18} color="#475569" />
                          </button>
                          <button className="expert-btn-icon danger" onClick={() => handleDeleteClick(course.id, course.name)} title="Delete Course">
                            <Trash2 size={18} />
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
              <div className="expert-pagination">
                <span className="expert-page-info">Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCourses.length)} of {filteredCourses.length} entries</span>
                <div className="expert-page-controls">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="expert-page-btn"><ChevronLeft size={16} /> Prev</button>
                  <span className="expert-page-current">{currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="expert-page-btn">Next <ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      <FormalModal
        show={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingCourse ? 'Edit Course' : 'Add New Course'}
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => { setShowModal(false); resetForm(); }} disabled={processing}>Cancel</button>
            <button className="expert-btn-primary" onClick={handleSave} disabled={processing}>
              {processing ? 'Saving...' : (editingCourse ? 'Update Course' : 'Save Course')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Course Name <span className="text-danger">*</span></label>
          <input 
            type="text" 
            className="expert-clean-input border" 
            value={courseName} 
            onChange={e => setCourseName(e.target.value)} 
            placeholder="e.g. Web Development 101" 
            disabled={processing}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>
      </FormalModal>

      {/* Delete Confirmation Modal */}
      <FormalModal
        show={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Delete Course"
        footer={
          <>
            <button className="expert-btn-secondary" onClick={() => setShowConfirm(false)} disabled={processing}>Cancel</button>
            <button className="expert-btn-primary bg-red" onClick={confirmDelete} disabled={processing}>
              {processing ? 'Processing...' : 'Yes, Delete Course'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '0.95rem', color: '#334155', margin: 0 }}>
            Are you sure you want to permanently delete <strong>"{deleteTargetName}"</strong>?
          </p>
          <div style={{ background: '#FEF2F2', padding: '12px', borderRadius: '8px', border: '1px solid #FECACA', marginTop: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: '#DC2626', margin: 0, fontWeight: '500' }}>
              Warning: This action cannot be undone and may affect instructors currently assigned to this course.
            </p>
          </div>
        </div>
      </FormalModal>
    </div>
  );
};

export default CoursesManagement;