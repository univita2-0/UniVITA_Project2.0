import React from 'react';
import { X } from 'lucide-react';
import './FormalModal.css';

const FormalModal = ({ show, onClose, title, children, footer, wide, small }) => {
  if (!show) return null;

  // Inline styles absolutely guarantee the modal ignores conflicting external CSS grid/width rules
  const getModalStyle = () => {
    if (wide) return { width: '100%', maxWidth: '768px' }; // Perfect for 2-column forms
    if (small) return { width: '100%', maxWidth: '400px' }; // Perfect for alerts/deletes
    return { width: '100%', maxWidth: '540px' }; // Perfect default for standard forms
  };

  return (
    <div className="formal-modal-overlay">
      <div 
        className="formal-modal-content" 
        style={getModalStyle()}
      >
        <div className="formal-modal-header">
          <h3 className="formal-modal-title">{title}</h3>
          <button className="formal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className="formal-modal-body">
          {children}
        </div>
        
        {footer && (
          <div className="formal-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default FormalModal;