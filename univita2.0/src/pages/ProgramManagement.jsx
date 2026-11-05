import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Edit3, Trash2, Search, X, AlertCircle, Layers } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE } from '../api';
// We are reusing your existing Course CSS so it looks identical!
import './CoursesManagement.css'; 

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
});

const ProgramManagement = () => {
  const [programs, setPrograms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);
  
  // Form State
  const [programName, setProgramName] = useState('');
  const [badge, setBadge] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');

  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteTargetName, setDeleteTargetName] = useState('');

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/programs`, getAuthHeaders());
      setPrograms(res.data || []);
    } catch (err) {
      console.error("Failed to load programs", err);
      toast.error("Failed to load programs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  const resetForm = () => {
    setProgramName(''); setBadge(''); setSubtitle(''); setDescription('');
    setEditingProgram(null);
  };

  const handleEdit = (program) => {
    setEditingProgram(program);
    setProgramName(program.program_name);
    setBadge(program.badge || '');
    setSubtitle(program.subtitle || '');
    setDescription(program.description || '');
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
      await axios.delete(`${API_BASE}/programs/${deleteTargetId}`, getAuthHeaders());
      toast.success("Program deleted successfully");
      loadPrograms();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete program");
    } finally {
      setProcessing(false); setShowConfirm(false);
    }
  };

  const handleSave = async () => {
    if (!programName.trim()) return toast.warning("Program name required");
    
    setProcessing(true);
    const payload = { 
      program_name: programName.trim(), 
      badge: badge.trim(), 
      subtitle: subtitle.trim(), 
      description: description.trim(),
      status: 'active'
    };

    try {
      if (editingProgram) {
        await axios.put(`${API_BASE}/programs/${editingProgram.id}`, payload, getAuthHeaders());
        toast.success("Program updated successfully");
      } else {
        await axios.post(`${API_BASE}/programs`, payload, getAuthHeaders());
        toast.success("Program added successfully");
      }
      setShowModal(false);
      resetForm();
      loadPrograms();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error saving program");
    } finally {
      setProcessing(false);
    }
  };

  const filteredPrograms = programs.filter(p =>
    !searchQuery || p.program_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="cm-container">
      {/* Header Area */}
      <div className="cm-header">
        <div className="cm-header-left">
          
          <p className="cm-subtitle">Manage academic programs (e.g., Nursing, MedTech) that contain multiple courses.</p>
        </div>
        <button className="cm-btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus size={18} /> Add New Program
        </button>
      </div>

      {/* Main Content Card */}
      <div className="cm-content-card">
        
        {/* Toolbar */}
        <div className="cm-toolbar">
          <div className="cm-search-input-group">
            <Search size={18} className="cm-search-icon" />
            <input
              type="text"
              placeholder="Search programs..."
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
            Total Programs <span>{programs.length}</span>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="cm-loading">Loading programs...</div>
        ) : filteredPrograms.length === 0 ? (
          <div className="cm-empty">
            <div className="cm-empty-icon-wrap"><Layers size={32} /></div>
            <h3>No programs found</h3>
            <p>{searchQuery ? "No matching programs." : "Get started by adding your first program."}</p>
          </div>
        ) : (
          <div className="cm-table-wrapper">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>Program Name</th>
                  <th>Badge</th>
                  <th>Subtitle</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrograms.map(program => (
                  <tr key={program.id}>
                    <td><span className="cm-course-name">{program.program_name}</span></td>
                    <td>{program.badge || '-'}</td>
                    <td>{program.subtitle || '-'}</td>
                    <td>
                      <div className="cm-action-group">
                        <button className="cm-action-btn edit" onClick={() => handleEdit(program)}>
                          <Edit3 size={14} /> Edit
                        </button>
                        <button className="cm-action-btn delete" onClick={() => handleDeleteClick(program.id, program.program_name)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="cm-custom-modal-backdrop" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="cm-custom-modal small" onClick={e => e.stopPropagation()}>
            <div className="cm-custom-modal-header">
              <h3>{editingProgram ? 'Edit Program' : 'Add New Program'}</h3>
              <button className="cm-custom-close-btn" onClick={() => { setShowModal(false); resetForm(); }}><X size={20} /></button>
            </div>
            <div className="cm-custom-modal-body">
              
              <div className="cm-form-group" style={{ marginBottom: '1rem' }}>
                <label>Program Name <span className="text-danger">*</span></label>
                <input type="text" className="cm-clean-input border" value={programName} onChange={e => setProgramName(e.target.value)} placeholder="e.g. BS Nursing" disabled={processing} autoFocus />
              </div>
              
              {/* UPDATED: Badge Dropdown */}
              <div className="cm-form-group" style={{ marginBottom: '1rem' }}>
                <label>Badge (Optional)</label>
                <select 
                  className="cm-clean-input border" 
                  value={badge} 
                  onChange={e => setBadge(e.target.value)} 
                  disabled={processing}
                >
                  <option value="">None</option>
                  <option value="NEW">NEW</option>
                  <option value="POPULAR">POPULAR</option>
                  <option value="FEATURED">FEATURED</option>
                  <option value="TESDA">TESDA</option>
                  <option value="HOT">HOT</option>
                </select>
              </div>
              
              <div className="cm-form-group" style={{ marginBottom: '1rem' }}>
                <label>Subtitle (Optional)</label>
                <input type="text" className="cm-clean-input border" value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="e.g. 4-Year Course" disabled={processing} />
              </div>
              
              <div className="cm-form-group">
                <label>Description (Optional)</label>
                <textarea 
                  className="cm-clean-input border" 
                  style={{ paddingTop: '10px', paddingBottom: '10px', height: 'auto', minHeight: '80px' }} 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  placeholder="Short description..." 
                  disabled={processing} 
                  rows={3} 
                />
              </div>

            </div>
            <div className="cm-custom-modal-footer">
              <button className="cm-btn-outline" onClick={() => { setShowModal(false); resetForm(); }} disabled={processing}>Cancel</button>
              <button className="cm-btn-primary" onClick={handleSave} disabled={processing}>
                {processing ? 'Saving...' : 'Save Program'}
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
              <h3>Delete Program</h3>
              <button className="cm-custom-close-btn" onClick={() => setShowConfirm(false)}><X size={20} /></button>
            </div>
            <div className="cm-custom-modal-body">
              <p className="cm-delete-text">Are you sure you want to permanently delete <strong>"{deleteTargetName}"</strong>?</p>
              <div className="cm-alert-box danger">
                <AlertCircle size={18} />
                <span>Warning: You cannot delete a program if it still has courses assigned to it.</span>
              </div>
            </div>
            <div className="cm-custom-modal-footer">
              <button className="cm-btn-outline" onClick={() => setShowConfirm(false)} disabled={processing}>Cancel</button>
              <button className="cm-btn-primary bg-red" onClick={confirmDelete} disabled={processing}>
                {processing ? 'Processing...' : 'Delete Program'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgramManagement;