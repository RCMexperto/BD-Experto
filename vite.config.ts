import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    // This tells Vite your site is in the /BD-Experto/ subfolder
    base: '/BD-Experto/', 
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'node-fetch': path.resolve(__dirname, 'src/fetch-shim.ts'),
        'whatwg-fetch': path.resolve(__dirname, 'src/fetch-shim.ts'),
        'isomorphic-fetch': path.resolve(__dirname, 'src/fetch-shim.ts'),
        'cross-fetch': path.resolve(__dirname, 'src/fetch-shim.ts'),
      },
    },
    optimizeDeps: {
      exclude: ['node-fetch', 'whatwg-fetch', 'isomorphic-fetch', 'cross-fetch'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
