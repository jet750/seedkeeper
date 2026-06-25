import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Sprint 10: inline assets up to 8 KB as data URIs. Vite's emit step
    // non-deterministically DROPS a few small sprite sheets even with explicit
    // ?url imports (e.g. mushrooms_flowers_stones.png, 6 KB — see MEMORY:
    // vite-glob-asset-emission). Every manifest image (src/data/imageImports.js)
    // is <= 8 KB, so inlining guarantees all of them land in the bundle; only the
    // genuinely large tilesets/world map still emit as separate files.
    assetsInlineLimit: 8192,
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
