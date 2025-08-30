
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

Paste the following code into your newly created `vite.config.ts`. This configuration sets up the PWA manifest and defines the caching strategies for our service worker.

```typescript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dramaverse',
        short_name: 'Dramaverse',
        description: 'An advanced drama finder and recommendation application.',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [ /* ... icon configuration ... */ ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          // Caching rules for data and images (see file for full code)
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

Update the `workbox.runtimeCaching` array in your `vite.config.ts` to include a rule for handling data mutations.

```typescript
// vite.config.ts

// ... inside export default defineConfig({ plugins: [ VitePWA({ workbox: { ...
runtimeCaching: [
  // ... (existing rules for API GET requests and images)
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
],
// ...
```

### Step 2: Update Data Handling Logic in `hooks/useAuth.ts`

The `authenticatedUpdate` function must be modified to handle network failures gracefully. Instead of reverting the UI on any error, it should only revert if the *server* rejects the change. If the request fails because of a network problem, we let the optimistic UI update stand.

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
            if (!res.ok) {
                // 2. The server responded with an error (e.g., 401, 500).
                // This is a permanent failure. We must revert the optimistic update.
                console.error('API update failed with status:', res.status);
                setUserData(oldUserData);
            }
            // If res.ok, the update succeeded. The optimistic state is now confirmed.
        } catch (error) {
            // 3. The fetch itself failed. This is a network error (user is offline).
            // The service worker has queued this request for background sync.
            // We DO NOT revert the optimistic UI update.
            console.log('Network error. Request queued for background sync.');
        }
    } else {
        // Frontend-only mode: persist to localStorage.
        localStorage.setItem(/* ... */);
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
    -   Open your app (e.g., `http://localhost:3000`).
    -   Open Chrome DevTools -> **Application** tab.
    -   Under **Service Workers**, verify your worker is running.
    -   Go to **Backend Mode**, log in, and then check the **"Offline"** box.
    -   Try to favorite a drama. The UI should update.
    -   Go to the **Network** tab. You'll see the failed `fetch` request.
    -   Go back to the **Application** tab -> **Background Sync**. You will see your request in the queue.
    -   Uncheck the **"Offline"** box. The request will be sent automatically, and the queue will clear. Your data is now synced with the server!
