import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served under /console/ next to the 3D game (same origin, so the player session is shared).
export default defineConfig({
  base: '/console/',
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:8080' } },
  preview: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:8080' } },
});
