import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';
import viteCompression from 'vite-plugin-compression';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    svgr(),
    // Precompress build output to .gz and .br at max quality so the server can
    // serve a compressed payload without re-compressing on every request (see
    // express-static-gzip in api.js). Brotli at quality 11 also beats the
    // on-the-fly gzip default — a meaningful first-load win for the large @mdi
    // chunk, especially on low-power ARM/Raspberry Pi hosts.
    viteCompression({ algorithm: 'gzip', ext: '.gz', threshold: 1024 }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split large third-party deps into their own long-cacheable chunks so
        // they aren't re-downloaded when app code changes, and the @mdi icon
        // data doesn't sit in the same chunk as everything else.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-redux': ['redux', 'react-redux', 'redux-thunk'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable'],
          // NOTE: @mdi/js is intentionally NOT pinned here. The client only
          // imports single named icons from it (tree-shaken by Rollup); arbitrary
          // user-chosen icon names are fetched from the server (GET /api/icons).
          // Pinning it would pull the whole ~2.7MB set into a chunk.
        },
      },
    },
  },
  server: {
    // Proxy API requests to the backend server
    proxy: {
      '/api': 'http://localhost:5005',
    },
  },
});
