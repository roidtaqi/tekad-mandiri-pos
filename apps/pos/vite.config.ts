import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { createReactAppConfig } from "../../tooling/vite/react-app.ts";

export default defineConfig(
  createReactAppConfig([
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Kastur POS",
        short_name: "Kastur POS",
        description: "Aplikasi kasir Kastur",
        theme_color: "#f7f7f5",
        background_color: "#f7f7f5",
        display: "standalone",
        scope: "./",
        start_url: "./",
        lang: "id",
      },
    }),
  ]),
);
