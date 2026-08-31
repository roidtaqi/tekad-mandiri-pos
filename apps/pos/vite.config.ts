import { defineConfig, mergeConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { createReactAppConfig } from "../../tooling/vite/react-app.ts";

export default defineConfig(
  mergeConfig(
    createReactAppConfig([
      VitePWA({
        registerType: "prompt",
        manifest: {
          name: "Tekad Mandiri POS",
          short_name: "Tekad Mandiri POS",
          description: "Aplikasi kasir Tekad Mandiri",
          theme_color: "#f1f5f9",
          background_color: "#f1f5f9",
          display: "standalone",
          scope: "./",
          start_url: "./",
          lang: "id",
        },
      }),
    ]),
    {
      server: {
        proxy: {
          "/api": "http://127.0.0.1:8787",
        },
      },
    },
  ),
);
