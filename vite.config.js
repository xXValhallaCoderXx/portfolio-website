import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The flight (with three.js) is one large chunk on purpose: the page loads it only when needed.
  build: { chunkSizeWarningLimit: 800 },
});
