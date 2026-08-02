import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  resolve: { alias: [{ find: /^three$/, replacement: 'three/src/Three.js' }] },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: { ecma: 2022, module: true, compress: { passes: 4, pure_getters: true, unsafe: true }, mangle: true, format: { comments: false, semicolons: false } },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/examples/jsm/postprocessing/') || id.includes('/node_modules/three/examples/jsm/shaders/')) return 'render-effects';
          if (id.includes('/node_modules/three/src/renderers/')) return 'three-renderer';
          if (id.includes('/node_modules/three/')) return 'three-core';
          if (id.includes('/node_modules/postprocessing/')) return 'postprocessing';
          return undefined;
        },
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
