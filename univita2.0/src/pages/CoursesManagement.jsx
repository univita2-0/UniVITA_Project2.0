// src/pages/CoursesManagement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit3, Trash2, BookOpen } from 'lucide-react';
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
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteTargetName, setDeleteTargetName] = useState('');
  const [editingCourse, setEditingCourse] = useState(null);
  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(true);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/courses`, getAuthHeaders());
      setCourses(res.data || []);
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
    try {
      await axios.delete(`${API_BASE}/courses/${deleteTargetId}`, getAuthHeaders());
      toast.success("Course deleted successfully");
      loadCourses();
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to delete course";
      toast.error(errorMsg);
    } finally {
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
    }
  };

  return (
    <div className="cm-container">
      <div className="cm-header">
        <div>
          <h2 className="cm-title">Course Directory</h2>
          <p className="cm-subtitle">Manage academic courses and subjects for instructor assignment.</p>
        </div>
        <div className="cm-header-actions">
          <button className="btn-cm-primary" onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus size={16} /> <span>Add Course</span>
          </button>
        </div>
      </div>

      <div className="cm-card">
        {loading ? (
          <div className="cm-loading-state">Loading courses...</div>
        ) : (
          <div className="cm-table-wrapper">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>Course Name</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.length === 0 ? (
                  <tr className="cm-empty-row">
                    <td colSpan="2">
                      <div className="cm-empty-state">
                        <BookOpen size={40} className="cm-empty-icon" />
                        <p>No courses configured yet.</p>
                        <span>Click "Add Course" to create your first subject.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  courses.map(course => (
                    <tr key={course.id}>
                      <td className="cm-name-cell">
                        <div className="cm-icon-wrapper">
                          <BookOpen size={16} className="cm-book-icon" />
                        </div>
                        <span className="cm-name-text">{course.name}</span>
                      </td>
                      <td className="text-right">
                        <div className="cm-action-group">
                          <button className="btn-icon-edit" onClick={() => handleEdit(course)} title="Edit Course">
                            <Edit3 size={16} />
                          </button>
                          <button className="btn-icon-delete" onClick={() => handleDeleteClick(course.id, course.name)} title="Delete Course">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <FormalModal
        show={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingCourse ? 'Edit Course' : 'Add New Course'}
        footer={
          <>
            <button className="btn-cm-cancel" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
            <button className="btn-cm-primary" onClick={handleSave}>{editingCourse ? 'Update Course' : 'Save Course'}</button>
          </>
        }
      >
        <div className="cm-form">
          <div className="cm-form-group">
            <label>Course Name</label>
            <input 
              type="text" 
              className="cm-input" 
              value={courseName} 
              onChange={e => setCourseName(e.target.value)} 
              placeholder="e.g. Web Development 101" 
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>
        </div>
      </FormalModal>

      {/* Delete Confirmation Modal */}
      <FormalModal
        show={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Delete Course"
        footer={
          <>
            <button className="btn-cm-cancel" onClick={() => setShowConfirm(false)}>Cancel</button>
            <button className="btn-cm-danger" onClick={confirmDelete}>Yes, Delete Course</button>
          </>
        }
      >
        <p className="cm-modal-text">Are you sure you want to permanently delete <strong>"{deleteTargetName}"</strong>?</p>
        <p className="cm-modal-warning">Warning: This action cannot be undone and may affect instructors currently assigned to this course.</p>
      </FormalModal>
    </div>
  );
};

export default CoursesManagement;