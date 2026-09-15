import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';
import FormalModal from '../components/FormalModal';

const PerformanceEvaluation = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [form, setForm] = useState({ type: 'student_feedback', rating: '', comments: '', evaluation_date: '' });
  const [showForm, setShowForm] = useState(false);
  const token = localStorage.getItem('auth_token');

  useEffect(() => {
    axios.get('http://localhost:5000/api/employees', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setEmployees(res.data.filter(u => u.role === 'instructor' && u.status === 'active')))
      .catch(console.error);
  }, []);

  const loadEvaluations = async (empId) => {
    const res = await axios.get(`http://localhost:5000/api/evaluations/${empId}`, { headers: { Authorization: `Bearer ${token}` } });
    setEvaluations(res.data);
  };

  const handleEmployeeChange = (e) => {
    const empId = e.target.value;
    const emp = employees.find(e => e.employee_id === empId);
    setSelectedEmployee(emp);
    if (emp) loadEvaluations(emp.employee_id);
  };

  const submitEvaluation = async () => {
    try {
      await axios.post('http://localhost:5000/api/evaluations', {
        employee_id: selectedEmployee.employee_id,
        type: form.type,
        rating: parseFloat(form.rating),
        comments: form.comments,
        evaluation_date: form.evaluation_date
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowForm(false);
      loadEvaluations(selectedEmployee.employee_id);
    } catch (err) { alert('Failed to save'); }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h3>Performance Evaluation</h3>
        <button className="btn-add-schedule" onClick={() => setShowForm(true)} disabled={!selectedEmployee}><Plus size={18} /> Add Evaluation</button>
      </div>
      <div className="modal-form-group" style={{ maxWidth: 300, marginBottom: '1.5rem' }}>
        <label className="modal-label">Select Instructor</label>
        <select className="modal-select" value={selectedEmployee?.employee_id || ''} onChange={handleEmployeeChange}>
          <option value="">-- Choose --</option>
          {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.full_name}</option>)}
        </select>
      </div>

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Rating</th><th>Comments</th><th>Evaluator</th></tr>
          </thead>
          <tbody>
            {evaluations.length === 0 ? <tr><td colSpan="5" className="empty-row">No evaluations found.</td></tr> :
              evaluations.map(ev => (
                <tr key={ev.id}>
                  <td>{ev.evaluation_date}</td>
                  <td>{ev.type.replace('_', ' ')}</td>
                  <td>{ev.rating}</td>
                  <td>{ev.comments?.substring(0, 50)}</td>
                  <td>{ev.evaluator_id}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      <FormalModal show={showForm} onClose={() => setShowForm(false)} title="New Evaluation"
        footer={<><button className="btn-modal-cancel" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-modal-submit" onClick={submitEvaluation}>Save</button></>}
      >
        <div className="modal-form-group"><label className="modal-label">Type</label>
          <select className="modal-select" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
            <option value="student_feedback">Student Feedback</option>
            <option value="peer_review">Peer Review</option>
            <option value="supervisor_assessment">Supervisor Assessment</option>
          </select>
        </div>
        <div className="modal-form-group"><label className="modal-label">Rating (1-5)</label>
          <input type="number" className="modal-input" min="1" max="5" step="0.1" value={form.rating} onChange={e => setForm({...form, rating: e.target.value})} />
        </div>
        <div className="modal-form-group"><label className="modal-label">Comments</label>
          <textarea className="modal-input" rows="3" value={form.comments} onChange={e => setForm({...form, comments: e.target.value})} />
        </div>
        <div className="modal-form-group"><label className="modal-label">Date</label>
          <input type="date" className="modal-input" value={form.evaluation_date} onChange={e => setForm({...form, evaluation_date: e.target.value})} />
        </div>
      </FormalModal>
    </div>
  );
};

export default PerformanceEvaluation;