import React from 'react';
import ReactDOM from 'react-dom/client';
import CardApp from './App.jsx';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <CardApp />
    </React.StrictMode>
  );
}
