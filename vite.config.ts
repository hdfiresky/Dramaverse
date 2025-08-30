
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// This configuration is a placeholder for a React project using Vite.
// You would typically include the React plugin as well.
// For example: import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    // react(), // Assuming you are using the official Vite React plugin.
    VitePWA({
      // Automatically update the service worker without prompting the user.
      registerType: 'autoUpdate',
      
      // Cache the PWA manifest and icons.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      
      // Define the PWA's metadata.
      manifest: {
        name: 'Dramaverse',
        short_name: 'Dramaverse',
        description: 'An advanced drama finder and recommendation application.',
        theme_color: '#111827', // dark-slate-900
        background_color: '#111827',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      // Configure the service worker's caching behavior using Workbox.
      workbox: {
        // Pre-cache files that are part of the build output.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        
        // Define runtime caching rules for assets and API calls.
        runtimeCaching: [
          {
            // Cache drama data from the backend API.
            // Strategy: StaleWhileRevalidate - Serve from cache first for speed,
            // then fetch a fresh copy from the network in the background.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/dramas'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 1,      // Only cache one entry (the full drama list)
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            // Cache images from MyDramaList.
            // Strategy: CacheFirst - If the image is in the cache, serve it.
            // Only go to the network if it's not cached.
            urlPattern: /^https:\/\/i\.mydramalist\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,    // Cache up to 200 images
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }),
  ],
});
