import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, Download } from 'lucide-react';
import FormalModal from '../components/FormalModal';

const Policies = () => {
  const [policies, setPolicies] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const token = localStorage.getItem('auth_token');

  const fetchPolicies = async () => {
    const res = await axios.get('http://localhost:5000/api/policies', { headers: { Authorization: `Bearer ${token}` } });
    setPolicies(res.data);
  };

  useEffect(() => { fetchPolicies(); }, []);

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);
    await axios.post('http://localhost:5000/api/policies', formData, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
    });
    setShowUpload(false);
    fetchPolicies();
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3>HR Policies</h3>
        <button className="btn-add-schedule" onClick={() => setShowUpload(true)}><Upload size={18} /> Upload Policy</button>
      </div>
      <div className="table-container">
        <table className="custom-table">
          <thead><tr><th>Title</th><th>Uploaded</th><th>Action</th></tr></thead>
          <tbody>
            {policies.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{new Date(p.uploaded_at).toLocaleDateString()}</td>
                <td><a href={`http://localhost:5000${p.file_path}`} target="_blank"><Download size={16} /></a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormalModal show={showUpload} onClose={() => setShowUpload(false)} title="Upload Policy"
        footer={<><button className="btn-modal-cancel" onClick={() => setShowUpload(false)}>Cancel</button><button className="btn-modal-submit" onClick={handleUpload}>Upload</button></>}
      >
        <div className="modal-form-group"><label className="modal-label">Title</label><input className="modal-input" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="modal-form-group"><label className="modal-label">File</label><input type="file" onChange={e => setFile(e.target.files[0])} /></div>
      </FormalModal>
    </div>
  );
};

export default Policies;