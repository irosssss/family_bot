import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const input = path.resolve('work/telegram-preview/index.html');
await mkdir(path.dirname(input), { recursive: true });
await writeFile(input, (await readFile('index.html', 'utf8')).replace('/src/main.tsx', '/src/preview/main.tsx'));
await build({ configFile: false, root: process.cwd(), plugins: [react(), tailwindcss()],
  build: { outDir: 'work/telegram-preview/dist', emptyOutDir: true, sourcemap: false,
    rollupOptions: { input } },
});
const nested = 'work/telegram-preview/dist/work/telegram-preview/index.html';
await writeFile('work/telegram-preview/dist/index.html', await readFile(nested));
await rm('work/telegram-preview/dist/work', { recursive: true });
