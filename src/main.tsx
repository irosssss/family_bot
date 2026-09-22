import React from 'react';
import ReactDOM from 'react-dom/client';
import V3App from './v3/V3App';
import { AppBoundary } from './v3/components/AppBoundary';
import './v3/base.css';

// V3 is the only application entry in development and production.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AppBoundary><V3App /></AppBoundary></React.StrictMode>
);
