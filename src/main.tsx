import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { appRouter } from './app/router';
import { PasscodeGate } from './features/passcodeGate';
import './shared/styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PasscodeGate>
      <RouterProvider router={appRouter} />
    </PasscodeGate>
  </React.StrictMode>
);
