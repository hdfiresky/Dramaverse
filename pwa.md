
# Guide: Converting Dramaverse to an Offline PWA

This guide provides step-by-step instructions to turn the Dramaverse application into a full-featured, offline-capable Progressive Web App (PWA) using `vite-plugin-pwa`.

## 1. What is a PWA?

A Progressive Web App (PWA) is a web application that can be "installed" on a user's device, providing an app-like experience with features like offline access and push notifications. The core technology that enables this is the **Service Worker**, a script that runs in the background and acts as a network proxy, allowing you to intercept requests and cache responses.

For Dramaverse, this means:
-   **Offline Access**: Users can browse the drama list and their personal "My List" page without an internet connection.
-   **Improved Performance**: Cached assets and data load instantly, making the app feel significantly faster.
-   **Reliability**: The app works reliably even on flaky or slow network connections.

## 2. Setup & Installation

This guide assumes you are using Vite as your build tool.

1.  **Install `vite-plugin-pwa`**:
    Open your terminal in the project root and install the necessary development dependency.
    ```bash
    npm install vite-plugin-pwa --save-dev
    ```

2.  **Create Vite Configuration**:
    Create a new file in your project's root directory named `vite.config.ts`. This file will configure Vite and the PWA plugin.

## 3. Configuration

Paste the following code into your newly created `vite.config.ts`. This configuration sets up the PWA manifest and defines the caching strategies for our service worker.

```typescript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
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
```
**Note**: You will need to create the icon files (`pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon.png`) and place them in your `/public` directory.

## 4. Update `index.html`

Add the following meta tags inside the `<head>` of your `index.html` file to support the PWA manifest and theming.

```html
<meta name="description" content="An advanced drama finder and recommendation application." />
<meta name="theme-color" content="#111827" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
```

## 5. Handling Offline Mutations (Advanced)

The configuration above makes the app **viewable** offline. However, actions that change data (like adding a favorite or setting a status) will fail in `BACKEND_MODE` because the `fetch` request cannot reach the server.

To solve this, you need to implement a "queue and sync" pattern using **IndexedDB** and the **Background Sync API**.

### Conceptual Steps:

1.  **Modify `useAuth.ts`**: Update the `authenticatedUpdate` function.
    -   Wrap the `fetch` call in a `try...catch` block.
    -   If the `fetch` fails (i.e., the user is offline), don't revert the optimistic UI update. Instead, save the request details (endpoint and body) to a queue in IndexedDB. A library like `idb-keyval` can simplify this.
    -   Notify the service worker that there's data to sync.

2.  **Update `vite.config.ts`**: Configure Workbox to use the Background Sync plugin.
    -   Add a new `runtimeCaching` rule that targets your API's POST requests.
    -   Instead of a caching handler, use the `BackgroundSyncPlugin` to automatically retry failed requests when the network connection is restored.

    **Example `vite.config.ts` addition:**
    ```typescript
    // Inside workbox config in vite.config.ts
    import { BackgroundSyncPlugin } from 'workbox-background-sync';

    // ...
    // Inside runtimeCaching array:
    {
        // Route for all POST requests to the API
        urlPattern: ({ url }) => url.pathname.startsWith('/api/user/'),
        handler: 'NetworkOnly', // Attempt network first
        options: {
            plugins: [
                new BackgroundSyncPlugin('user-data-queue', {
                    maxRetentionTime: 24 * 60 * 7 // Retry for up to 7 days
                })
            ]
        },
        method: 'POST'
    }
    ```
    *Note: Fully implementing this requires significant changes to your data-handling logic and is an advanced PWA feature.*

## 6. Building and Testing Your PWA

1.  **Build the App**: Run the Vite build command.
    ```bash
    npm run build
    ```
    This will create a `dist` folder containing your production-ready app and the service worker.

2.  **Serve Locally**: To test the service worker, you must use a local HTTP server. The `serve` package is a great simple option.
    ```bash
    npm install -g serve
    serve -s dist
    ```

3.  **Test in Browser**:
    -   Open your app at the local server address (e.g., `http://localhost:3000`).
    -   Open Chrome DevTools. Go to the **Application** tab.
    -   Under **Service Workers**, you should see your new service worker is activated and running.
    -   Check the **"Offline"** box to simulate being offline. Refresh the page. The app should still load!
    -   In the **Manifest** section, you can verify your PWA metadata and see the "Add to Home screen" button.

With these changes, Dramaverse will be a fully functional, installable, and offline-capable Progressive Web App.
