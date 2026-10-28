import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig, loadEnv} from 'vite';
import {validateReleaseConfig} from './scripts/release-config';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({command, mode}) => {
  if (command==='build') validateReleaseConfig(loadEnv(mode, appRoot, 'VITE_'));
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': appRoot,
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    build: {
      rollupOptions: {
        output: {
          // Some iOS WebViews do not identify .mjs assets as JavaScript.
          assetFileNames: asset => (asset.names || [asset.name]).some(name => name?.endsWith('pdf.worker.min.mjs'))
            ? 'assets/pdf.worker-[hash].js' : 'assets/[name]-[hash][extname]',
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
