import React from 'react';
import { createRoot } from 'react-dom/client';
import { LiveApp } from './live/App';
import './v3.css';
import './live/live.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><LiveApp/></React.StrictMode>);
