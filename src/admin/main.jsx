import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminApp from './App.jsx';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <AdminApp />
    </React.StrictMode>
  );
}
