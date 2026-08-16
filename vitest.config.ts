import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

const testDefaults = {
  clearMocks: true,
  globals: false,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};

export default defineConfig({
  root: repositoryRoot,
  test: {
    projects: [
      {
        root: fileURLToPath(new URL("./apps/backoffice/", import.meta.url)),
        test: {
          ...testDefaults,
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          name: "backoffice",
        },
      },
      {
        root: fileURLToPath(new URL("./apps/pos/", import.meta.url)),
        test: {
          ...testDefaults,
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          name: "pos",
        },
      },
      {
        root: fileURLToPath(new URL("./apps/api/", import.meta.url)),
        test: {
          ...testDefaults,
          environment: "node",
          include: ["src/**/*.test.ts"],
          name: "api",
        },
      },
      {
        root: repositoryRoot,
        test: {
          ...testDefaults,
          exclude: ["packages/ui/**"],
          environment: "node",
          include: [
            "packages/*/src/**/*.test.{ts,tsx}",
            "packages/*/tests/**/*.test.{ts,tsx}",
          ],
          name: "packages",
        },
      },
      {
        root: fileURLToPath(new URL("./packages/ui/", import.meta.url)),
        test: {
          ...testDefaults,
          environment: "happy-dom",
          include: ["tests/**/*.test.{ts,tsx}"],
          name: "ui",
        },
      },
      {
        root: repositoryRoot,
        test: {
          ...testDefaults,
          environment: "node",
          include: ["tooling/tests/**/*.test.ts"],
          name: "repository-boundaries",
          testTimeout: 15_000,
        },
      },
      {
        root: repositoryRoot,
        test: {
          ...testDefaults,
          environment: "node",
          include: ["database/tests/**/*.unit.test.mjs"],
          name: "database-unit",
        },
      },
      {
        root: repositoryRoot,
        test: {
          ...testDefaults,
          environment: "node",
          hookTimeout: 30_000,
          include: ["database/tests/**/*.integration.test.mjs"],
          name: "database-integration",
          testTimeout: 30_000,
        },
      },
    ],
  },
});
