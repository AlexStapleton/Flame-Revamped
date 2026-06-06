import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), svgr()],
  build: {
    rollupOptions: {
      output: {
        // Split large third-party deps into their own long-cacheable chunks so
        // they aren't re-downloaded when app code changes, and the @mdi icon
        // data doesn't sit in the same chunk as everything else.
        //
        // Function form (not the object form): Vite 8's rolldown bundler expects
        // `manualChunks` to be a function. The `[\\/]` boundaries keep e.g.
        // `react` from also matching `react-redux`/`react-router`.
        //
        // NOTE: @mdi/js is intentionally NOT grouped here. It's dynamically
        // imported in Icon.tsx, so the bundler gives it its own async chunk that
        // loads off the initial critical path. Pinning it (especially with the
        // statically-imported @mdi/react) would pull it back into eager load.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react-router-dom|react-router|react-dom|react)[\\/]/.test(id))
            return 'vendor-react';
          if (/[\\/]node_modules[\\/](react-redux|redux-thunk|redux)[\\/]/.test(id))
            return 'vendor-redux';
          if (/[\\/]node_modules[\\/]@dnd-kit[\\/]/.test(id)) return 'vendor-dnd';
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
