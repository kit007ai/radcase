import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',

  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3457',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3457',
        changeOrigin: true
      },
      '/thumbnails': {
        target: 'http://localhost:3457',
        changeOrigin: true
      },
      '/dicom': {
        target: 'http://localhost:3457',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3457',
        ws: true
      }
    }
  },

  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: true,
    minify: 'esbuild',

    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html')
      },
      output: {
        // Route-based and vendor code splitting
        manualChunks(id) {
          // React core in its own chunk (cached across deploys)
          if (id.includes('node_modules/react-dom')) {
            return 'vendor-react-dom';
          }
          if (id.includes('node_modules/react-router')) {
            return 'vendor-react-router';
          }
          if (id.includes('node_modules/react')) {
            return 'vendor-react';
          }
        },
        // Content-hashed filenames for long-term caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames(assetInfo) {
          // Organize assets by type
          if (/\.(png|jpe?g|gif|svg|webp|avif|ico)$/i.test(assetInfo.name)) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          if (/\.css$/i.test(assetInfo.name)) {
            return 'assets/css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },

  css: {
    postcss: resolve(__dirname, 'postcss.config.js')
  },

  // Keep Cornerstone.js CDN scripts as external (loaded via <script> tags)
  // Service worker (sw.js) stays in public/ and is copied as-is, not bundled
  publicDir: resolve(__dirname, 'public')
});
