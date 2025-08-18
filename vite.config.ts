        },
import path from "path";
import { VitePWA } from 'vite-plugin-pwa'; 
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: "/launchpad/",
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "robots.txt",
          "favicon.png",
          "apple-touch-icon.webp",
          "pwa-192x192.webp",
          "pwa-512x512.webp",
        ],
        manifest: {
          name: "Launchpad",
          short_name: "Launch",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: "#ffffff",
          icons: [
            {
              src: "/launchpad/pwa-192x192.webp",
              sizes: "192x192",
              type: "image/webp",
            },
            {
              src: "/launchpad/pwa-512x512.webp",
              sizes: "512x512",
              type: "image/webp",
            },
            {
              src: "/launchpad/pwa-512x512.webp",
              sizes: "512x512",
              type: "image/webp",
              purpose: "any maskable",
            },
          ],
        },
      }),
    ],
  };
});
