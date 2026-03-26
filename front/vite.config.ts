import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import { readFileSync } from 'fs';
import path from 'path';
import tailwindcss from 'tailwindcss';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_NAME__: JSON.stringify('Domo'),
  },
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
