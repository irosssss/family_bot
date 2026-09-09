import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Isolated V3 client artifacts. API and exact release assets are served by its runtime.
export default defineConfig({
  envDir: false,
  publicDir: false,
  plugins: [react(), {
    name: 'family-life-v3-entry',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/') { res.writeHead(302, { Location: '/family-life-v3.html' }); res.end(); }
        else if (req.url?.startsWith('/api/') || req.url?.startsWith('/assets/')) { res.writeHead(404); res.end(); }
        else next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/') { res.writeHead(302, { Location: '/family-life-v3.html' }); res.end(); }
        else if (req.url?.startsWith('/api/') || req.url?.startsWith('/assets/game/')) { res.writeHead(404); res.end(); }
        else next();
      });
    },
  }],
  server: { host: '127.0.0.1', port: 3002, strictPort: true },
  build: { outDir: 'work/v3-build', rollupOptions: { input: ['family-life-v3.html','family-life-v3-telegram.html'] } },
});
