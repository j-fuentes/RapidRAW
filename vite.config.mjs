import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const host = process.env.TAURI_DEV_HOST;

// Backend chosen at run time (Settings → Backend: this device or an external rapidraw-web server): the UI's imports
// of these Tauri modules go to src/backend/tauri/*, which call Tauri or the external server (src/remote/). Only
// imports from src/ are redirected (not from src/backend and src/remote themselves, nor from Tauri's plugin packages,
// whose calls always go to this app's backend). scripts/check-backend-switch.mjs checks what the UI imports.
const SWITCHED = {
  '@tauri-apps/api/core': 'core',
  '@tauri-apps/api/event': 'event',
  '@tauri-apps/api/path': 'path',
  '@tauri-apps/plugin-dialog': 'dialog',
};
const posix = (p) => p.replace(/\\/g, '/');
const SRC = posix(fileURLToPath(new URL('./src/', import.meta.url)));
const OWN = [`${SRC}backend/`, `${SRC}remote/`];
const backendSwitch = {
  name: 'rapidraw-backend-switch',
  enforce: 'pre',
  resolveId(source, importer) {
    const target = SWITCHED[source];
    if (!target || !importer) return null;
    const from = posix(importer.split('?')[0]);
    if (!from.startsWith(SRC) || OWN.some((d) => from.startsWith(d))) return null;
    return `${SRC}backend/tauri/${target}.ts`;
  },
};

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [backendSwitch, tailwindcss(), react()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
