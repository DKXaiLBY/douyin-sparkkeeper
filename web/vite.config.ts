import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发态将 /api 代理到后端 Express
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
});
