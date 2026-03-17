import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // Loads environment variables from .env files
  const env = loadEnv(mode, '.', '');
  
  return {
    // CRITICAL: Tells GitHub Pages to look for files in the /BD-Experto/ subfolder
    base: '/BD-Experto/', 
    
    plugins: [react(), tailwindcss()],
    
    define: {
      // Allows the app to access the API key from both local .env and GitHub Secrets
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Shims to ensure compatibility with older fetch libraries if used by dependencies
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var to prevent flickering
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    
    build: {
      // Ensures the output goes to 'dist' which matches your static.yml
      outDir: 'dist',
    }
  };
});
