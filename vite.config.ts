/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// BASE_PATH lets the same build serve from GitHub Pages (/PRTracker/) or the root (Capacitor).
const base = process.env.BASE_PATH ?? './';

// Content-Security-Policy for the built app (PWA and the Capacitor WebViews). Only scripts
// shipped in the bundle may run; nothing can be framed or embedded as a plugin.
//  • connect-src allows any https host because the open-data URL is user-configurable
//    (Settings → data URL); every fetch is credential-free and shape-validated.
//  • style-src needs 'unsafe-inline' for React style attributes; there are no external fonts.
//  • capacitor://localhost is listed next to 'self' for older iOS WebKit, which did not always
//    match a custom scheme with 'self'. Android serves from https://localhost (= 'self').
//  • frame-ancestors can't be set from a meta tag (needs a header, e.g. on a custom domain).
// Added at build time only: the Vite dev server needs inline scripts and a websocket for HMR.
const SELF = "'self' capacitor://localhost";
const CSP = [
  `default-src ${SELF}`,
  `script-src ${SELF}`,
  `style-src ${SELF} 'unsafe-inline'`,
  `img-src ${SELF} data: blob:`,
  `font-src ${SELF} data:`,
  `connect-src ${SELF} https:`,
  `worker-src 'self'`,
  `manifest-src 'self'`,
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const cspMeta = (): Plugin => ({
  name: 'pr-tracker-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
});

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    cspMeta(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'PR Tracker – Canada days',
        short_name: 'PR Tracker',
        description: 'Track Canadian PR residency, citizenship eligibility and travel days. Data stays on your device.',
        theme_color: '#c8102e',
        background_color: '#faf9f7',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        // Language chunks are fetched on demand and cached at runtime, not pre-downloaded.
        globIgnores: ['**/assets/{fr,zh,zh-Hant,es,pt,hi,pa,tl,vi,ko,ar,fa,ur}-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'lazy-chunks', expiration: { maxEntries: 40 } },
          },
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'open-data', expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
