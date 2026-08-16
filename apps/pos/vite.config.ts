import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
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
  ],
});
