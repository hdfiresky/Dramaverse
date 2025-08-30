# Guide: Converting Dramaverse to an Offline PWA

This guide provides step-by-step instructions to turn the Dramaverse application into a full-featured, offline-capable Progressive Web App (PWA) using `vite-plugin-pwa`.

## 1. What is a PWA?

A Progressive Web App (PWA) is a web application that can be "installed" on a user's device, providing an app-like experience with features like offline access and push notifications. The core technology that enables this is the **Service Worker**, a script that runs in the background and acts as a network proxy, allowing you to intercept requests and cache responses.

For Dramaverse, this means:
-   **Offline Access**: Users can browse the drama list and their personal "My List" page without an internet connection.
-   **Improved Performance**: Cached assets and data load instantly, making the app feel significantly faster.
-   **Reliability**: The app works reliably even on flaky or slow network connections.
-   **Offline Mutations**: Users can favorite dramas, update statuses, and write reviews while offline, and the changes will automatically sync to the server when the connection is restored.

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

### 3.1 Deploying to a Sub-path (e.g., `/dramaveerse/`)

If your application will not be deployed at the root of your domain (e.g., `https://example.com/dramaveerse/` instead of `https://example.com/`), you must configure the `base` path in your Vite config. This ensures that all asset paths and service worker scopes are generated correctly.

We will set `base: '/dramaveerse/'` in our configuration. This will also be reflected in the `scope` and `start_url` of the PWA manifest.

### 3.2 Main Configuration

Paste the following complete code into your `vite.config.ts`. This configuration sets up the base path, the PWA manifest, and defines the caching strategies for our service worker.

```typescript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
// import react from '@vitejs/plugin-react';

export default defineConfig({
  // Set the base path if deploying to a subdirectory.
  base: '/dramaveerse/', 

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
        scope: '/dramaveerse/', // Match the base path
        start_url: '/dramaveerse/', // Match the base path
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
            // Cache drama data from the local JSON or backend API (GET requests).
            // Strategy: StaleWhileRevalidate - Serve from cache first for speed,
            // then update the cache from the network in the background.
            urlPattern: ({ url }) => /\/data\/dramas\.json$/.test(url.pathname) || url.pathname.startsWith('/api/dramas'),
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
          {
            // Handle offline mutations for user data (POST requests).
            // This is detailed in the "Implementing Offline Mutations" section.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/user/'),
            handler: 'NetworkOnly',
            method: 'POST',
            options: {
              backgroundSync: {
                name: 'dramaverse-mutation-queue',
                options: {
                  maxRetentionTime: 24 * 60 * 7, // Retry for up to 7 days
                },
              },
            },
          }
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

## 5. Implementing Offline Mutations (Backend Mode)

The configuration above makes the app **viewable** offline. To allow users to **make changes** (like adding a favorite) while offline, we need to implement a "queue and sync" pattern. This is achieved with **Optimistic UI**, the **Service Worker**, and **Background Sync**.

### The Concept

1.  **Optimistic UI**: When the user performs an action offline, we immediately update the UI as if the action was successful. This provides a seamless experience.
2.  **Request Queuing**: The service worker intercepts the outgoing network request. Because the user is offline, the request fails. Instead of discarding it, Workbox's `BackgroundSyncPlugin` automatically saves it to a queue in IndexedDB.
3.  **Automatic Sync**: When the browser detects that the network connection has been restored, it automatically triggers a `sync` event. The service worker listens for this event and retries all the requests in the queue, syncing the user's offline changes with the server.

### Step 1: Configure Background Sync in `vite.config.ts`

The `runtimeCaching` array in the configuration in section 3.2 already includes the necessary rule for handling data mutations. The `NetworkOnly` strategy with the `backgroundSync` plugin is key here.

```typescript
// From vite.config.ts
// ...
{
  // Handle offline mutations for user data (POST requests).
  // Strategy: NetworkOnly with Background Sync.
  // This attempts to send the request to the network. If it fails (due to being offline),
  // Workbox automatically adds it to a queue and retries when the network is available.
  urlPattern: ({ url }) => url.pathname.startsWith('/api/user/'),
  handler: 'NetworkOnly',
  method: 'POST',
  options: {
    backgroundSync: {
      name: 'dramaverse-mutation-queue',
      options: {
        maxRetentionTime: 24 * 60 * 7, // Retry for up to 7 days
      },
    },
  },
}
// ...
```

### Step 2: Update Data Handling Logic in `hooks/useAuth.ts`

The `authenticatedUpdate` function in `hooks/useAuth.ts` must be modified to handle network failures gracefully. Instead of reverting the UI on any error, it should only revert if the *server* rejects the change (e.g., a 4xx or 5xx error). If the request fails because of a network problem, we let the optimistic UI update stand, knowing the service worker will sync it later.

```typescript
// hooks/useAuth.ts

const authenticatedUpdate = useCallback(async (endpoint, body, updateFn) => {
    if (!currentUser) return false;
    
    const oldUserData = userData;
    const newUserData = updateFn(oldUserData);
    setUserData(newUserData); // 1. Optimistic UI update happens immediately.

    if (BACKEND_MODE) {
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, { /* ... */ });
            if (res.status === 409) {
                // Conflict detected. Open modal for user resolution.
                // The optimistic state is left as-is until the user decides.
            } else if (!res.ok) {
                // 2. The server responded with a non-conflict error (e.g., 401, 500).
                // This is a permanent failure. We must revert the optimistic update.
                console.error('API update failed with status:', res.status);
                setUserData(oldUserData);
            }
            // If res.ok, the update succeeded. The optimistic state is now confirmed.
        } catch (error) {
            // 3. The fetch() itself failed. This is a network error (user is offline).
            // The service worker has queued this request for background sync.
            // We DO NOT revert the optimistic UI update.
            console.log('Network error. Request queued for background sync.');
        }
    } else {
        // Frontend-only mode: persist to localStorage.
        localStorage.setItem(`${LOCAL_STORAGE_KEYS.USER_DATA_PREFIX}${currentUser.username}`, JSON.stringify(newUserData));
    }
    return true;
}, [currentUser, authToken, userData]);
```

## 6. Building and Testing Your PWA

1.  **Build the App**: Run the Vite build command.
    ```bash
    npm run build
    ```
    This will create a `dist` folder containing your production-ready app and the service worker.

2.  **Serve Locally**: To test the service worker, you must use a local HTTP server.
    ```bash
    npm install -g serve
    serve -s dist
    ```

3.  **Test in Browser**:
    -   Open your app (e.g., `http://localhost:3000/dramaveerse/`).
    -   Open Chrome DevTools -> **Application** tab.
    -   Under **Service Workers**, verify your worker is running.
    -   Go to **Backend Mode**, log in, and then check the **"Offline"** box.
    -   Try to favorite a drama. The UI should update.
    -   Go to the **Network** tab. You'll see the failed `fetch` request.
    -   Go back to the **Application** tab -> **Background Sync**. You will see your request in the queue.
    -   Uncheck the **"Offline"** box. The request will be sent automatically, and the queue will clear. Your data is now synced with the server!