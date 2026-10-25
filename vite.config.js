
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@jsquash/oxipng', 'svgo']
  },
  worker: {
    format: 'es'
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0
  }
});
