import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Isolated render-only verification server; no database or app entry-point imports. */
export default defineConfig({ plugins: [react()], server: { host: '127.0.0.1', port: 4174, strictPort: true } });
