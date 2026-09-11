import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { seoStaticFilesPlugin } from './scripts/seo/seo-static-files-plugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), seoStaticFilesPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Backend REST (phase 2+). The browser never talks to the provider.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // Application market stream (never the provider feed).
      '/ws': { target: 'ws://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // AG Grid is a single large, lazily loaded chunk; that is expected.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['lightweight-charts'],
          grid: ['ag-grid-community', 'ag-grid-react'],
          vendor: ['react', 'react-dom', 'react-router', '@tanstack/react-query', 'zustand'],
        },
      },
    },
  },
});
