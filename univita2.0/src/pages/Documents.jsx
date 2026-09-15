import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, FileText, Download, Search } from 'lucide-react';
import FormalModal from '../components/FormalModal';

const API_BASE = 'http://localhost:5000';

const Documents = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('auth_token') || '';
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Load employees on mount
  useEffect(() => {
    axios.get(`${API_BASE}/api/employees`, { headers: authHeaders })
      .then(res => setEmployees(res.data || []))
      .catch(console.error);
  }, []);

  // Fetch documents when an employee is selected
  const fetchDocuments = async (employeeId) => {
    try {
      const res = await axios.get(`${API_BASE}/api/employee-documents/${employeeId}`, {
        headers: authHeaders
      });
      setDocuments(res.data || []);
    } catch (err) {
      console.error(err);
      setDocuments([]);
    }
  };

  const handleEmployeeChange = (e) => {
    const empId = e.target.value;
    const emp = employees.find(e => e.id === parseInt(empId));
    setSelectedEmployee(emp);
    if (emp) {
      fetchDocuments(emp.id);
    } else {
      setDocuments([]);
    }
  };

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!selectedEmployee || !selectedFile || !docTitle.trim()) {
      setError('Please fill all fields and select a file.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('user_id', selectedEmployee.id);
      formData.append('title', docTitle.trim());
      formData.append('file', selectedFile);

      await axios.post(`${API_BASE}/api/employee-documents`, formData, {
        headers: {
          ...authHeaders,
          'Content-Type': 'multipart/form-data'
        }
      });
      setShowUploadModal(false);
      setDocTitle('');
      setSelectedFile(null);
      fetchDocuments(selectedEmployee.id);
    } catch (err) {
      console.error(err);
      setError('Upload failed. Check file size and permissions.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (filePath) => {
    window.open(`${API_BASE}${filePath}`, '_blank');
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Employee Documents</h3>
        <button
          className="btn-add-schedule"
          onClick={() => setShowUploadModal(true)}
          disabled={!selectedEmployee}
        >
          <Upload size={18} /> Upload Document
        </button>
      </div>

      {/* Employee selection */}
      <div className="modal-form-group" style={{ maxWidth: 400, marginBottom: '1.5rem' }}>
        <label className="modal-label">Select Employee</label>
        <select
          value={selectedEmployee?.id || ''}
          onChange={handleEmployeeChange}
          className="modal-select"
        >
          <option value="">Choose an employee</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_id})</option>
          ))}
        </select>
      </div>

      {/* Documents table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Uploaded</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan="3" className="empty-row">
                  {selectedEmployee ? 'No documents found for this employee.' : 'Please select an employee to see their documents.'}
                </td>
              </tr>
            ) : (
              documents.map(doc => (
                <tr key={doc.id}>
                  <td>
                    <FileText size={16} style={{ marginRight: 8, color: '#64748b' }} />
                    {doc.title}
                  </td>
                  <td>{new Date(doc.uploaded_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn-payslip"
                      onClick={() => handleDownload(doc.file_path)}
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      <FormalModal
        show={showUploadModal}
        onClose={() => { setShowUploadModal(false); setError(''); }}
        title="Upload New Document"
        footer={
          <>
            <button className="btn-modal-cancel" onClick={() => setShowUploadModal(false)}>Cancel</button>
            <button className="btn-modal-submit" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </>
        }
      >
        {error && <p className="error-message" style={{ marginBottom: '1rem' }}>{error}</p>}
        <div className="modal-form-group">
          <label className="modal-label">Document Title</label>
          <input
            type="text"
            className="modal-input"
            placeholder="e.g., Employment Contract"
            value={docTitle}
            onChange={e => setDocTitle(e.target.value)}
          />
        </div>
        <div className="modal-form-group">
          <label className="modal-label">File</label>
          <input
            type="file"
            className="modal-input"
            onChange={handleFileChange}
          />
        </div>
      </FormalModal>
    </div>
  );
};

export default Documents;