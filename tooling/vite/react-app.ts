import react from "@vitejs/plugin-react";
import type { PluginOption, UserConfig } from "vite";

export function createReactAppConfig(
  appPlugins: PluginOption[] = [],
): UserConfig {
  return {
    base: "./",
    plugins: [react(), ...appPlugins],
  };
}
