import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import url from 'url';

// Vite dev server API simulation plugin to test /api endpoints locally
function devApiPlugin() {
  return {
    name: 'baia-dev-api-router',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        if (!pathname.startsWith('/api/')) {
          return next();
        }

        const endpoint = pathname.replace('/api/', '').split('?')[0];
        let handlerModule;

        try {
          if (endpoint === 'claim-stamp') {
            handlerModule = await import('./api/claim-stamp.js');
          } else if (endpoint === 'redeem-reward') {
            handlerModule = await import('./api/redeem-reward.js');
          } else if (endpoint === 'admin-token') {
            handlerModule = await import('./api/admin-token.js');
          } else if (endpoint === 'admin-manual-stamp') {
            handlerModule = await import('./api/admin-manual-stamp.js');
          } else {
            return next();
          }

          // Parse JSON body if POST
          let body = {};
          if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            const buffers = [];
            for await (const chunk of req) {
              buffers.push(chunk);
            }
            const dataStr = Buffer.concat(buffers).toString();
            try {
              body = dataStr ? JSON.parse(dataStr) : {};
            } catch (e) {
              body = {};
            }
          }

          req.body = body;
          req.query = parsedUrl.query;

          // Polyfill Express/Vercel response helpers for Vite Connect middleware
          res.status = function (code) {
            this.statusCode = code;
            return this;
          };
          res.json = function (jsonObj) {
            this.setHeader('Content-Type', 'application/json');
            this.end(JSON.stringify(jsonObj));
            return this;
          };

          const handler = handlerModule.default || handlerModule;
          await handler(req, res);
        } catch (err) {
          console.error(`Error executing dev API /api/${endpoint}:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Internal dev API error' }));
          }
        }
      });
    }
  };
}

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    devApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'images/Logo.webp', 'images/crew.webp'],
      manifest: {
        name: 'Baia Café — Digital Loyalty Card',
        short_name: 'Baia Loyalty',
        description: 'Collect daily coffee stamps and unlock free drinks & tote bags at Baia Café.',
        theme_color: '#16255C',
        background_color: '#FAF4EB',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/card/',
        icons: [
          {
            src: '/images/Logo.webp',
            sizes: '192x192',
            type: 'image/webp'
          },
          {
            src: '/images/Logo.webp',
            sizes: '512x512',
            type: 'image/webp'
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        menu: resolve(__dirname, 'menu/index.html'),
        floatingCottage: resolve(__dirname, 'floating-cottage/index.html'),
        location: resolve(__dirname, 'location/index.html'),
        card: resolve(__dirname, 'card/index.html'),
        claim: resolve(__dirname, 'claim/index.html'),
        admin: resolve(__dirname, 'admin/index.html')
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false
  }
});
