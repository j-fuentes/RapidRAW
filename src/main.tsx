import React from 'react';
import { createRoot } from 'react-dom/client';
import { installFrontendLogBridge } from './utils/frontendLogBridge';
import { initBackend } from './remote/backend';
import './styles.css';

installFrontendLogBridge();

// The backend (this device or an external server, Settings → Backend) is decided before the UI loads, so that every
// call of the UI goes to the same one
initBackend().finally(async () => {
  const [{ default: App }, { notifyBackendProblem }] = await Promise.all([import('./App'), import('./remote/notice')]);
  const root = createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  notifyBackendProblem();
});
