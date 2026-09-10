import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: false, proxy: {
    '/api': 'http://127.0.0.1:8790',
    '/ws': { target: 'ws://127.0.0.1:8790', ws: true },
    '/generated': 'http://127.0.0.1:8790',
  } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 800 },
});
