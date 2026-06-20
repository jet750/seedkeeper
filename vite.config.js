import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Phaser into its own chunk so the engine caches separately from
          // game code across deploys (Sprint 13 production config).
          phaser: ['phaser']
        }
      }
    }
  },
  server: {
    port: 3001
  }
});
