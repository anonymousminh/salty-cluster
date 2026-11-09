import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Dev: the game calls same-origin /api, proxied to apps/api.
  server: { port: 5173, host: true, proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:8080', ws: true } } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { three: ['three', '@react-three/fiber', '@react-three/drei'] },
      },
    },
  },
});
