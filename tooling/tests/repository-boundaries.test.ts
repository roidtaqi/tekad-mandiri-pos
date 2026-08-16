import { access, readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { createReactAppConfig } from "../vite/react-app.ts";

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: unknown;
  name: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
  scripts?: Record<string, string>;
  workspaces?: string[];
}

interface WorkspaceDefinition {
  directory: string;
  name: string;
  shared: boolean;
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const workspaces: WorkspaceDefinition[] = [
  { directory: "apps/api", name: "@kastur/api", shared: false },
  {
    directory: "apps/backoffice",
    name: "@kastur/backoffice",
    shared: false,
  },
  { directory: "apps/pos", name: "@kastur/pos", shared: false },
  {
    directory: "packages/auth-client",
    name: "@kastur/auth-client",
    shared: true,
  },
  { directory: "packages/config", name: "@kastur/config", shared: true },
  {
    directory: "packages/contracts",
    name: "@kastur/contracts",
    shared: true,
  },
  { directory: "packages/domain", name: "@kastur/domain", shared: true },
  {
    directory: "packages/local-db",
    name: "@kastur/local-db",
    shared: true,
  },
  {
    directory: "packages/observability",
    name: "@kastur/observability",
    shared: true,
  },
  {
    directory: "packages/sync-client",
    name: "@kastur/sync-client",
    shared: true,
  },
  {
    directory: "packages/testing",
    name: "@kastur/testing",
    shared: true,
  },
  { directory: "packages/ui", name: "@kastur/ui", shared: true },
];

const workspaceByName = new Map(
  workspaces.map((workspace) => [workspace.name, workspace]),
);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

async function readJson<T>(relativePath: string): Promise<T> {
  const contents = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  return JSON.parse(contents) as T;
}

async function listCodeFiles(relativeDirectory: string): Promise<string[]> {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") {
      continue;
    }

    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listCodeFiles(relativePath)));
      continue;
    }

    if (/\.(?:[cm]?[jt]s|tsx)$/.test(entry.name)) {
      files.push(path.join(repositoryRoot, relativePath));
    }
  }

  return files;
}

async function listClientBuildInputs(
  relativeDirectory: string,
): Promise<string[]> {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") {
      continue;
    }

    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listClientBuildInputs(relativePath)));
      continue;
    }

    if (/\.(?:css|html|json|[cm]?[jt]s|tsx)$/.test(entry.name)) {
      files.push(path.join(repositoryRoot, relativePath));
    }
  }

  return files;
}

async function discoverWorkspaceDirectories(): Promise<string[]> {
  const directories: string[] = [];

  for (const workspaceGroup of ["apps", "packages"]) {
    const entries = await readdir(path.join(repositoryRoot, workspaceGroup), {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules") {
        continue;
      }

      const directory = path.join(workspaceGroup, entry.name);

      try {
        await access(path.join(repositoryRoot, directory, "package.json"));
        directories.push(directory);
      } catch {
        // A non-workspace directory under these roots is ignored deliberately.
      }
    }
  }

  return directories.sort();
}

function findWorkspace(absolutePath: string): WorkspaceDefinition | undefined {
  return workspaces.find(({ directory }) => {
    const workspaceRoot = path.join(repositoryRoot, directory);
    const relativePath = path.relative(workspaceRoot, absolutePath);

    return (
      relativePath === "" ||
      (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  });
}

function getModuleSpecifiers(fileName: string, sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [argument] = node.arguments;

      if (argument !== undefined && ts.isStringLiteralLike(argument)) {
        specifiers.push(argument.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function loadTsConfig(relativePath: string): ts.ParsedCommandLine {
  const configPath = path.join(repositoryRoot, relativePath);
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error !== undefined) {
    throw new Error(
      ts.formatDiagnostic(configFile.error, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repositoryRoot,
        getNewLine: () => "\n",
      }),
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );

  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnostics(parsed.errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repositoryRoot,
        getNewLine: () => "\n",
      }),
    );
  }

  return parsed;
}

function compileProbe(relativeConfigPath: string, sourceText: string): string[] {
  const configPath = path.join(repositoryRoot, relativeConfigPath);
  const { options } = loadTsConfig(relativeConfigPath);
  const probePath = path.join(
    path.dirname(configPath),
    "__kastur_runtime_boundary_probe__.ts",
  );
  const defaultHost = ts.createCompilerHost(options, true);
  const defaultGetSourceFile = defaultHost.getSourceFile.bind(defaultHost);
  const normalizedProbePath = path.resolve(probePath);

  defaultHost.fileExists = (fileName) =>
    path.resolve(fileName) === normalizedProbePath || ts.sys.fileExists(fileName);
  defaultHost.readFile = (fileName) =>
    path.resolve(fileName) === normalizedProbePath
      ? sourceText
      : ts.sys.readFile(fileName);
  defaultHost.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    if (path.resolve(fileName) === normalizedProbePath) {
      return ts.createSourceFile(
        probePath,
        sourceText,
        languageVersion,
        true,
        ts.ScriptKind.TS,
      );
    }

    return defaultGetSourceFile(
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  };

  const program = ts.createProgram([probePath], options, defaultHost);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

describe("TypeScript runtime boundaries", () => {
  it("keeps production source separate from tests and Node tooling", () => {
    for (const configPath of [
      "apps/api/tsconfig.json",
      "apps/backoffice/tsconfig.json",
      "apps/pos/tsconfig.json",
    ]) {
      const sourceFiles = loadTsConfig(configPath).fileNames.map((fileName) =>
        path.relative(repositoryRoot, fileName),
      );

      expect(sourceFiles.some((fileName) => fileName.includes(".test."))).toBe(
        false,
      );
      expect(sourceFiles.some((fileName) => fileName.endsWith("vite.config.ts"))).toBe(
        false,
      );
    }
  });

  it("allows browser APIs without exposing Node globals in browser source", () => {
    for (const configPath of [
      "apps/backoffice/tsconfig.json",
      "apps/pos/tsconfig.json",
    ]) {
      const diagnostics = compileProbe(
        configPath,
        'document.createElement("main"); void new Request("https://kastur.test"); void process.cwd(); void Buffer.from("kastur");',
      );

      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.join("\n")).toContain("process");
      expect(diagnostics.join("\n")).toContain("Buffer");
    }
  });

  it("allows configured Worker APIs without exposing browser-only DOM globals", () => {
    const configPath = "apps/api/tsconfig.json";
    const unsupportedGlobals = [
      "FileReader",
      "OffscreenCanvas",
      "Worker",
      "document",
      "indexedDB",
      "window",
    ];

    const diagnostics = compileProbe(
      configPath,
      [
        'const request = new Request("https://kastur.test");',
        "void fetch(request);",
        'void Response.json({ status: "ok" });',
        ...unsupportedGlobals.map((globalName) => `void ${globalName};`),
      ].join("\n"),
    );

    expect(diagnostics).toHaveLength(unsupportedGlobals.length);

    for (const globalName of unsupportedGlobals) {
      expect(diagnostics.join("\n")).toContain(globalName);
    }
  });

  it("uses generated Worker types without enabling Node compatibility", async () => {
    const wranglerConfig = await readJson<{
      compatibility_date?: string;
      compatibility_flags?: string[];
      main?: string;
      name?: string;
    }>("apps/api/wrangler.jsonc");
    const apiConfig = loadTsConfig("apps/api/tsconfig.json");
    const generatedTypes = await readFile(
      path.join(repositoryRoot, "apps/api/worker-configuration.d.ts"),
      "utf8",
    );

    expect(wranglerConfig).toEqual({
      $schema: "../../node_modules/wrangler/config-schema.json",
      compatibility_date: "2026-08-16",
      main: "src/index.ts",
      name: "kastur-api",
    });
    expect(wranglerConfig.compatibility_flags).toBeUndefined();
    expect(apiConfig.options.types).toEqual(["./worker-configuration.d.ts"]);
    expect(generatedTypes).toMatch(
      /Runtime types generated with workerd@\S+ 2026-08-16/u,
    );

    const productionApiFiles = (await listCodeFiles("apps/api/src")).filter(
      (fileName) => !fileName.includes(".test."),
    );
    const violations: string[] = [];

    for (const fileName of productionApiFiles) {
      const sourceText = await readFile(fileName, "utf8");

      for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
        if (specifier.startsWith("node:")) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} imports ${specifier}`,
          );
        }
      }

      for (const match of sourceText.matchAll(
        /\b(?:Buffer|clearImmediate|global|process|setImmediate)\b/gu,
      )) {
        violations.push(
          `${path.relative(repositoryRoot, fileName)} uses ${match[0]}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("exposes Node globals only to Node tooling and tests", () => {
    const toolingDiagnostics = compileProbe(
      "tsconfig.json",
      'void process.cwd(); void Buffer.from("kastur"); void document;',
    );

    expect(toolingDiagnostics).toHaveLength(1);
    expect(toolingDiagnostics.join("\n")).toContain("document");

    for (const configPath of [
      "packages/config/tsconfig.json",
      "packages/contracts/tsconfig.json",
      "packages/domain/tsconfig.json",
      "packages/observability/tsconfig.json",
    ]) {
      expect(loadTsConfig(configPath).options.types).toEqual([]);
    }

    const sharedDiagnostics = compileProbe(
      "packages/domain/tsconfig.json",
      "void process; void document;",
    );

    expect(sharedDiagnostics).toHaveLength(2);
    expect(sharedDiagnostics.join("\n")).toContain("process");
    expect(sharedDiagnostics.join("\n")).toContain("document");
  });
});

describe("workspace package boundaries", () => {
  it("keeps all 12 workspaces private with explicit shared entry points", async () => {
    const rootManifest = await readJson<PackageManifest>("package.json");
    expect(rootManifest.workspaces).toEqual(["packages/*", "apps/*"]);
    expect(await discoverWorkspaceDirectories()).toEqual(
      workspaces.map(({ directory }) => directory).sort(),
    );

    const require = createRequire(import.meta.url);

    for (const workspace of workspaces) {
      const manifest = await readJson<PackageManifest>(
        path.join(workspace.directory, "package.json"),
      );

      expect(manifest.name).toBe(workspace.name);
      expect(manifest.private).toBe(true);

      if (!workspace.shared) {
        continue;
      }

      const packageExports = asRecord(manifest.exports);
      expect(packageExports).toBeDefined();
      expect(Object.keys(packageExports ?? {})).toEqual(["."]);

      const rootExport = asRecord(packageExports?.["."]);
      expect(rootExport).toEqual({
        types: "./src/index.ts",
        default: "./src/index.ts",
      });
      await access(path.join(repositoryRoot, workspace.directory, "src/index.ts"));

      expect(path.resolve(require.resolve(workspace.name))).toBe(
        path.join(repositoryRoot, workspace.directory, "src/index.ts"),
      );
      expect(() =>
        require.resolve(`${workspace.name}/src/index.ts`),
      ).toThrow();
    }
  });

  it("uses declared public package imports without relative workspace bypasses", async () => {
    const manifests = new Map<string, PackageManifest>();

    for (const workspace of workspaces) {
      manifests.set(
        workspace.name,
        await readJson<PackageManifest>(
          path.join(workspace.directory, "package.json"),
        ),
      );
    }

    const files = [
      ...(await listCodeFiles("apps")),
      ...(await listCodeFiles("packages")),
      ...(await listCodeFiles("tooling/vite")),
    ];
    const violations: string[] = [];

    for (const fileName of files) {
      const importingWorkspace = findWorkspace(fileName);
      const sourceText = await readFile(fileName, "utf8");

      for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
        if (specifier.startsWith("@kastur/")) {
          const targetWorkspace = workspaceByName.get(specifier);

          if (targetWorkspace === undefined) {
            violations.push(
              `${path.relative(repositoryRoot, fileName)} deep-imports ${specifier}`,
            );
            continue;
          }

          if (
            importingWorkspace !== undefined &&
            importingWorkspace.name !== targetWorkspace.name
          ) {
            const manifest = manifests.get(importingWorkspace.name);
            const declaredDependencies = new Set([
              ...Object.keys(manifest?.dependencies ?? {}),
              ...Object.keys(manifest?.devDependencies ?? {}),
              ...Object.keys(manifest?.optionalDependencies ?? {}),
              ...Object.keys(manifest?.peerDependencies ?? {}),
            ]);

            if (!declaredDependencies.has(targetWorkspace.name)) {
              violations.push(
                `${path.relative(repositoryRoot, fileName)} imports undeclared ${targetWorkspace.name}`,
              );
            }
          }
        }

        if (specifier.startsWith(".")) {
          const resolvedImport = path.resolve(path.dirname(fileName), specifier);
          const targetWorkspace = findWorkspace(resolvedImport);

          if (
            importingWorkspace !== undefined &&
            targetWorkspace !== undefined &&
            importingWorkspace.name !== targetWorkspace.name
          ) {
            violations.push(
              `${path.relative(repositoryRoot, fileName)} bypasses ${targetWorkspace.name} with ${specifier}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps deployable applications independent", async () => {
    const applicationNames = new Set([
      "@kastur/api",
      "@kastur/backoffice",
      "@kastur/pos",
    ]);

    for (const workspace of workspaces.filter(({ shared }) => !shared)) {
      const manifest = await readJson<PackageManifest>(
        path.join(workspace.directory, "package.json"),
      );
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
      };

      for (const applicationName of applicationNames) {
        expect(dependencies).not.toHaveProperty(applicationName);
      }
    }
  });

  it("does not reference privileged client-side environment names", async () => {
    const browserDirectories = [
      "apps/backoffice",
      "apps/pos",
      "packages/auth-client",
      "packages/config",
      "packages/local-db",
      "packages/sync-client",
      "packages/ui",
      "tooling/vite",
    ];
    const privilegedClientName =
      /\b(?:VITE|PUBLIC)_[A-Z0-9_]*(?:API_KEY|CREDENTIAL|DATABASE_URL|DB_URL|PASSWORD|PRIVATE_KEY|SECRET|SIGNING_KEY|TOKEN)[A-Z0-9_]*\b/g;
    const violations: string[] = [];

    for (const directory of browserDirectories) {
      for (const fileName of await listClientBuildInputs(directory)) {
        const sourceText = await readFile(fileName, "utf8");
        const matches = sourceText.match(privilegedClientName) ?? [];

        for (const match of matches) {
          violations.push(`${path.relative(repositoryRoot, fileName)}: ${match}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps PostgreSQL and migration tooling out of application runtime workspaces", async () => {
    const applicationRuntimeWorkspaces = workspaces.filter(({ name }) =>
      [
        "@kastur/api",
        "@kastur/auth-client",
        "@kastur/backoffice",
        "@kastur/config",
        "@kastur/local-db",
        "@kastur/pos",
        "@kastur/sync-client",
        "@kastur/ui",
      ].includes(name),
    );
    const violations: string[] = [];

    for (const workspace of applicationRuntimeWorkspaces) {
      const manifest = await readJson<PackageManifest>(
        path.join(workspace.directory, "package.json"),
      );
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      };
      const forbiddenDependencies = ["node-pg-migrate", "pg"];

      if (workspace.name !== "@kastur/api") {
        forbiddenDependencies.push("wrangler");
      }

      for (const forbiddenDependency of forbiddenDependencies) {
        if (dependencies[forbiddenDependency] !== undefined) {
          violations.push(
            `${workspace.directory} depends on ${forbiddenDependency}`,
          );
        }
      }

      for (const fileName of await listCodeFiles(workspace.directory)) {
        const sourceText = await readFile(fileName, "utf8");

        for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
          if (
            specifier === "pg" ||
            specifier === "node-pg-migrate" ||
            specifier.includes("database/scripts")
          ) {
            violations.push(
              `${path.relative(repositoryRoot, fileName)} imports ${specifier}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("shared frontend build conventions", () => {
  it("shares no application root, output, or injected values", () => {
    const sharedConfig = createReactAppConfig();

    expect(sharedConfig).not.toHaveProperty("root");
    expect(sharedConfig).not.toHaveProperty("build");
    expect(sharedConfig).not.toHaveProperty("define");
  });
});
