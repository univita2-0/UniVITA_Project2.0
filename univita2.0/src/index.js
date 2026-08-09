import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// 1. Import ToastContainer and its CSS styles
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    {/* 2. Mount ToastContainer globally so toasts are visible */}
    <ToastContainer 
      position="top-right" 
      autoClose={4000} 
      hideProgressBar={false} 
      newestOnTop 
      closeOnClick 
      rtl={false} 
      pauseOnFocusLoss 
      draggable 
      pauseOnHover 
      theme="colored"
    />
  </React.StrictMode>
);

reportWebVitals();