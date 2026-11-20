import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import './FormalModal.css';

/**
 * Shared administrative dialog.
 *
 * The public props and their original meanings are intentionally unchanged:
 * show, onClose, title, children, footer, wide, and small.
 */
const FormalModal = ({ show, onClose, title, children, footer, wide, small }) => {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!show) return undefined;

    previousFocusRef.current = document.activeElement;
    closeButtonRef.current?.focus();

    return () => {
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [show]);

  if (!show) return null;

  // Preserve the previous modal-size priority: wide takes precedence over small.
  const getModalStyle = () => {
    if (wide) return { width: '90%', maxWidth: '1150px' };
    if (small) return { width: '100%', maxWidth: '400px' };
    return { width: '100%', maxWidth: '540px' };
  };

  return (
    <div className="formal-modal-overlay">
      <div
        className={`formal-modal-content${wide ? ' formal-modal-wide' : ''}${small && !wide ? ' formal-modal-small' : ''}`}
        style={getModalStyle()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="formal-modal-header">
          <h3 id={titleId} className="formal-modal-title">{title}</h3>
          <button
            ref={closeButtonRef}
            type="button"
            className="formal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close"
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
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
