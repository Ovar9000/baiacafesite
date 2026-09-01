import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminRewardsApp from './App.jsx';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <AdminRewardsApp />
    </React.StrictMode>
  );
}
