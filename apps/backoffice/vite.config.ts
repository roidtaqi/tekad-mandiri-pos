import { defineConfig, mergeConfig } from "vite";

import { createReactAppConfig } from "../../tooling/vite/react-app.ts";

export default defineConfig(
  mergeConfig(createReactAppConfig(), {
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8787",
      },
    },
  }),
);
