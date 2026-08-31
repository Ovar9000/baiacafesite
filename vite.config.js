import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        menu: resolve(__dirname, 'menu/index.html'),
        floatingCottage: resolve(__dirname, 'floating-cottage/index.html'),
        location: resolve(__dirname, 'location/index.html')
      }
    }
  },
  server: {
    port: 5173,
    open: false
  }
});
