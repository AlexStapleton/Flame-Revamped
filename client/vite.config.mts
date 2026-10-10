import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { constants } from 'node:zlib';
import { compression, defineAlgorithm } from 'vite-plugin-compression2';

// Innermost node_modules package a module belongs to, or null for app code.
// Keyed on the innermost package so subpath imports (react-dom/client) count.
const pkgOf = (id: string): string | null => {
  const m = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
  if (!m) return null;
  return m[m.length - 1].replace(/^node_modules\//, '').replace(/\/$/, '');
};

const inPkgs = (pkgs: string[]) => (id: string) => {
  const pkg = pkgOf(id);
  return pkg !== null && pkgs.includes(pkg);
};

// NOTE: @mdi/js is intentionally NOT pinned here. The client only imports single
// named icons from it (tree-shaken); arbitrary user-chosen icon names are
// fetched from the server (GET /api/icons). Pinning it would pull the whole
// ~2.7MB set into a chunk.

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr(),
    // Precompress build output to .gz and .br at max quality so the server can
    // serve a compressed payload without re-compressing on every request (see
    // express-static-gzip in api.js). Brotli at quality 11 also beats the
    // on-the-fly gzip default — a meaningful first-load win for the large @mdi
    // chunk, especially on low-power ARM/Raspberry Pi hosts.
    compression({
      algorithms: [
        defineAlgorithm('gzip', { level: constants.Z_BEST_COMPRESSION }),
        defineAlgorithm('brotliCompress', {
          params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
        }),
      ],
      threshold: 1024,
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Split large third-party deps into their own long-cacheable chunks so
        // they aren't re-downloaded when app code changes, and the @mdi icon
        // data doesn't sit in the same chunk as everything else.
        codeSplitting: {
          // Each group also takes in the modules its packages depend on, so a
          // group must outrank the groups whose packages it serves: otherwise
          // vendor-dnd would absorb react and react-dom (its peers) and every
          // chunk would import vendor-dnd, undoing its lazy loading for guests.
          // Keeping dependencies in their group (the default) also avoids
          // circular imports between chunks, which broke startup when it was
          // turned off.
          groups: [
            {
              name: 'vendor-react',
              priority: 30,
              test: inPkgs(['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom']),
            },
            {
              name: 'vendor-redux',
              priority: 20,
              test: inPkgs(['redux', 'react-redux', 'redux-thunk']),
            },
            {
              name: 'vendor-dnd',
              priority: 10,
              test: (id: string) => (pkgOf(id) || '').startsWith('@dnd-kit/'),
            },
          ],
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
