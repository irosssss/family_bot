import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // FE-01 FIX: precache — только бандл (js/css/html/ico/svg-иконки).
        // 16 756 PNG из public/ (81 МБ) НЕ попадают в precache-манифест:
        // спрайты кэшируются runtime-стратегией CacheFirst по /assets/game/.
        globPatterns: ['**/*.{js,css,html,ico}'],
        runtimeCaching: [
          {
            // Игровые ассеты (Habitica/ULPC спрайты, фоны) — CacheFirst
            urlPattern: /\/assets\/game\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rpg-assets-cache',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Прочие статические ресурсы (не из бандла) — StaleWhileRevalidate
            urlPattern: /\/assets\/(?!game\/).*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: 'Family Chores RPG',
        short_name: 'Chores RPG',
        description: 'Gamified household chores for the family',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    hmr: {
      host: '0.0.0.0',
      clientPort: 3000,
    },
  },
});
