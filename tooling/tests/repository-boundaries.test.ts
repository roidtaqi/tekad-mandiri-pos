import { access, readdir, readFile } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
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

interface TypeScriptConfigFile {
  exclude?: string[];
  extends?: string;
  include?: string[];
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
    directory: "packages/numeric",
    name: "@kastur/numeric",
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

const nodeBuiltins = new Set(
  builtinModules.map((moduleName) =>
    moduleName.startsWith("node:") ? moduleName.slice(5) : moduleName,
  ),
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
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
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

function getIdentifierNames(fileName: string, sourceText: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const identifiers = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      identifiers.add(node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return identifiers;
}

function isPathWithin(parentDirectory: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentDirectory, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
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

  it("keeps UI DOM tests in their dedicated browser-aware program", () => {
    const rootNodeTests = loadTsConfig("tsconfig.test.json").fileNames.map(
      (fileName) => path.relative(repositoryRoot, fileName),
    );
    const uiTests = loadTsConfig("packages/ui/tsconfig.test.json").fileNames.map(
      (fileName) => path.relative(repositoryRoot, fileName),
    );
    const diagnostics = compileProbe(
      "packages/ui/tsconfig.json",
      'document.createElement("button"); void process.cwd();',
    );

    expect(
      rootNodeTests.some((fileName) => fileName.startsWith("packages/ui/")),
    ).toBe(false);
    expect(
      uiTests.some((fileName) => fileName.endsWith("ui-primitives.test.tsx")),
    ).toBe(true);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics.join("\n")).toContain("process");
  });

  it("keeps local-db production browser-only and its tests in a dedicated program", async () => {
    const productionConfig = await readJson<TypeScriptConfigFile>(
      "packages/local-db/tsconfig.json",
    );
    const testConfig = await readJson<TypeScriptConfigFile>(
      "packages/local-db/tsconfig.test.json",
    );
    const rootTestConfig = await readJson<TypeScriptConfigFile>(
      "tsconfig.test.json",
    );
    const productionFiles = loadTsConfig(
      "packages/local-db/tsconfig.json",
    ).fileNames.map((fileName) => path.relative(repositoryRoot, fileName));
    const rootNodeTests = loadTsConfig("tsconfig.test.json").fileNames.map(
      (fileName) => path.relative(repositoryRoot, fileName),
    );
    const nodeOnlyGlobals = [
      "Buffer",
      "__dirname",
      "__filename",
      "clearImmediate",
      "global",
      "module",
      "process",
      "require",
      "setImmediate",
    ];
    const diagnostics = compileProbe(
      "packages/local-db/tsconfig.json",
      [
        "void indexedDB;",
        "void IDBKeyRange;",
        ...nodeOnlyGlobals.map((globalName) => `void ${globalName};`),
      ].join("\n"),
    );

    expect(
      productionFiles.every((fileName) =>
        fileName.startsWith("packages/local-db/src/"),
      ),
    ).toBe(true);
    expect(
      productionFiles.some((fileName) => /\.(?:test|spec)\./u.test(fileName)),
    ).toBe(false);
    expect(productionConfig.extends).toBe("../../tsconfig.browser.json");
    expect(testConfig.extends).toBe("../../tsconfig.browser.json");
    expect(productionConfig.include).toContain("src");
    expect(
      productionConfig.include?.some((include) => include.includes("tests")),
    ).toBe(false);
    expect(testConfig.include).toEqual(
      expect.arrayContaining(["src", "tests"]),
    );
    expect(rootTestConfig.exclude).toContain("packages/local-db/**");
    expect(
      rootNodeTests.some((fileName) =>
        fileName.startsWith("packages/local-db/"),
      ),
    ).toBe(false);
    expect(diagnostics).toHaveLength(nodeOnlyGlobals.length);

    for (const globalName of nodeOnlyGlobals) {
      expect(diagnostics.join("\n")).toContain(globalName);
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

  it("keeps numeric primitives strictly environment-neutral", async () => {
    const isForbiddenImport = (specifier: string) => {
      const normalizedSpecifier = specifier.startsWith("node:")
        ? specifier.slice(5)
        : specifier;
      return (
        specifier.startsWith("node:") ||
        nodeBuiltins.has(normalizedSpecifier) ||
        nodeBuiltins.has(normalizedSpecifier.split("/")[0] ?? "")
      );
    };

    // Regression probe
    expect(isForbiddenImport("node:fs")).toBe(true);
    expect(isForbiddenImport("fs")).toBe(true);
    expect(isForbiddenImport("path")).toBe(true);
    expect(isForbiddenImport("decimal.js")).toBe(false);
    expect(isForbiddenImport("./decimal.js")).toBe(false);

    const violations: string[] = [];
    const files = await listCodeFiles("packages/numeric/src");

    for (const fileName of files) {
      if (!fileName.endsWith(".ts")) {
        continue;
      }

      const sourceText = await readFile(fileName, "utf8");

      for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
        if (isForbiddenImport(specifier)) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} imports ${specifier}`,
          );
        }
      }

      for (const match of sourceText.matchAll(
        /\b(?:Buffer|clearImmediate|global|process|setImmediate|require|__dirname|__filename)\b/gu,
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
      "packages/numeric/tsconfig.json",
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
  it("keeps all 13 workspaces private with explicit shared entry points", async () => {
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

  it("keeps Dexie and IndexedDB access behind the browser-only local-db boundary", async () => {
    const localDbWorkspace = workspaces.find(
      ({ name }) => name === "@kastur/local-db",
    );

    expect(localDbWorkspace).toBeDefined();

    if (localDbWorkspace === undefined) {
      return;
    }

    const localDbManifest = await readJson<PackageManifest>(
      path.join(localDbWorkspace.directory, "package.json"),
    );
    const localDbRuntimeDependencies = {
      ...localDbManifest.dependencies,
      ...localDbManifest.optionalDependencies,
      ...localDbManifest.peerDependencies,
    };
    const localDbRoot = path.join(repositoryRoot, localDbWorkspace.directory);
    const violations: string[] = [];

    expect(localDbManifest.dependencies).toHaveProperty("dexie");
    expect(localDbManifest.devDependencies).toHaveProperty("fake-indexeddb");
    expect(localDbRuntimeDependencies).not.toHaveProperty("fake-indexeddb");

    for (const dependency of Object.keys(localDbRuntimeDependencies)) {
      if (dependency.startsWith("@kastur/") && dependency !== "@kastur/contracts") {
        violations.push(
          `${localDbWorkspace.directory} has runtime dependency ${dependency}`,
        );
      }
    }

    for (const workspace of workspaces) {
      const manifest = await readJson<PackageManifest>(
        path.join(workspace.directory, "package.json"),
      );
      const declaredDependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      };

      if (
        workspace.name !== localDbWorkspace.name &&
        (declaredDependencies.dexie !== undefined ||
          declaredDependencies["fake-indexeddb"] !== undefined)
      ) {
        violations.push(
          `${workspace.directory} depends directly on Dexie tooling`,
        );
      }

      for (const fileName of await listCodeFiles(workspace.directory)) {
        const sourceText = await readFile(fileName, "utf8");

        for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
          if (
            workspace.name !== localDbWorkspace.name &&
            (specifier === "dexie" ||
              specifier.startsWith("dexie/") ||
              specifier === "fake-indexeddb" ||
              specifier.startsWith("fake-indexeddb/"))
          ) {
            violations.push(
              `${path.relative(repositoryRoot, fileName)} imports ${specifier}`,
            );
          }

          const resolvedImport = specifier.startsWith(".")
            ? path.resolve(path.dirname(fileName), specifier)
            : undefined;

          if (
            workspace.name === "@kastur/api" &&
            (specifier === "@kastur/local-db" ||
              specifier.startsWith("@kastur/local-db/") ||
              (resolvedImport !== undefined &&
                isPathWithin(localDbRoot, resolvedImport)))
          ) {
            violations.push(
              `${path.relative(repositoryRoot, fileName)} reaches @kastur/local-db through ${specifier}`,
            );
          }
        }
      }

      if (
        workspace.name === "@kastur/api" &&
        declaredDependencies["@kastur/local-db"] !== undefined
      ) {
        violations.push(`${workspace.directory} depends on @kastur/local-db`);
      }
    }

    const productionFiles = loadTsConfig(
      "packages/local-db/tsconfig.json",
    ).fileNames;
    const nodeOnlyGlobals = [
      "Buffer",
      "__dirname",
      "__filename",
      "clearImmediate",
      "global",
      "module",
      "process",
      "require",
      "setImmediate",
    ];

    for (const fileName of productionFiles) {
      const sourceText = await readFile(fileName, "utf8");

      for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
        const normalizedSpecifier = specifier.startsWith("node:")
          ? specifier.slice(5)
          : specifier;

        if (
          specifier.startsWith("node:") ||
          nodeBuiltins.has(normalizedSpecifier) ||
          nodeBuiltins.has(normalizedSpecifier.split("/")[0] ?? "")
        ) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} imports Node builtin ${specifier}`,
          );
        }

        if (specifier.startsWith("@kastur/") && specifier !== "@kastur/contracts") {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} imports ${specifier}`,
          );
        }

        if (
          specifier === "fake-indexeddb" ||
          specifier.startsWith("fake-indexeddb/")
        ) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} imports test-only ${specifier}`,
          );
        }
      }

      const identifiers = getIdentifierNames(fileName, sourceText);

      for (const globalName of nodeOnlyGlobals) {
        if (identifiers.has(globalName)) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} uses Node global ${globalName}`,
          );
        }
      }
    }

    for (const fileName of await listCodeFiles("database")) {
      const sourceText = await readFile(fileName, "utf8");

      for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
        const resolvedImport = specifier.startsWith(".")
          ? path.resolve(path.dirname(fileName), specifier)
          : undefined;
        if (
          specifier === "dexie" ||
          specifier.startsWith("dexie/") ||
          specifier === "fake-indexeddb" ||
          specifier.startsWith("fake-indexeddb/") ||
          specifier === "@kastur/local-db" ||
          specifier.startsWith("@kastur/local-db/") ||
          (resolvedImport !== undefined &&
            isPathWithin(localDbRoot, resolvedImport))
        ) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} reaches @kastur/local-db through ${specifier}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the shared UI package presentation-only and browser-safe", async () => {
    const uiWorkspace = workspaces.find(({ name }) => name === "@kastur/ui");

    expect(uiWorkspace).toBeDefined();

    if (uiWorkspace === undefined) {
      return;
    }

    const manifest = await readJson<PackageManifest>(
      path.join(uiWorkspace.directory, "package.json"),
    );
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    };
    const forbiddenWorkspaceDependencies = workspaces
      .filter(({ name }) => name !== uiWorkspace.name)
      .map(({ name }) => name);
    const violations: string[] = [];

    for (const dependency of forbiddenWorkspaceDependencies) {
      if (dependencies[dependency] !== undefined) {
        violations.push(`${uiWorkspace.directory} depends on ${dependency}`);
      }
    }

    for (const fileName of await listCodeFiles(uiWorkspace.directory)) {
      const sourceText = await readFile(fileName, "utf8");

      for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
        const normalizedSpecifier = specifier.startsWith("node:")
          ? specifier.slice(5)
          : specifier;

        if (nodeBuiltins.has(normalizedSpecifier)) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} imports Node builtin ${specifier}`,
          );
        }

        if (
          forbiddenWorkspaceDependencies.some(
            (dependency) =>
              specifier === dependency || specifier.startsWith(`${dependency}/`),
          )
        ) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} imports ${specifier}`,
          );
        }

        if (!specifier.startsWith(".")) {
          continue;
        }

        const resolvedImport = path.resolve(path.dirname(fileName), specifier);
        const repositoryRelativeImport = path.relative(
          repositoryRoot,
          resolvedImport,
        );

        if (
          ["apps", "database", "tooling"].some(
            (directory) =>
              repositoryRelativeImport === directory ||
              repositoryRelativeImport.startsWith(`${directory}${path.sep}`),
          )
        ) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} reaches ${repositoryRelativeImport}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("integrates both frontend applications through the public UI entry point", async () => {
    for (const application of ["apps/backoffice", "apps/pos"]) {
      const manifest = await readJson<PackageManifest>(
        path.join(application, "package.json"),
      );
      const declaredDependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      };
      const uiImports: string[] = [];

      expect(declaredDependencies).toHaveProperty("@kastur/ui");

      for (const fileName of await listCodeFiles(path.join(application, "src"))) {
        if (fileName.includes(".test.")) {
          continue;
        }

        const sourceText = await readFile(fileName, "utf8");

        for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
          if (specifier.startsWith("@kastur/ui")) {
            uiImports.push(specifier);
          }
        }
      }

      expect(uiImports).toContain("@kastur/ui");
      expect(uiImports.every((specifier) => specifier === "@kastur/ui")).toBe(
        true,
      );
    }
  });
});

describe("shared UI design-token contract", () => {
  it("keeps token layers, themes, focus, numerics, and motion semantic", async () => {
    const cssFiles = (await listClientBuildInputs("packages/ui")).filter(
      (fileName) => fileName.endsWith(".css"),
    );
    const css = (
      await Promise.all(
        cssFiles.sort().map(async (fileName) => await readFile(fileName, "utf8")),
      )
    ).join("\n");

    expect(cssFiles.length).toBeGreaterThan(0);
    expect(css).toContain(
      "@layer ks-primitive, ks-semantic, ks-component, ks-brand;",
    );

    for (const layer of [
      "ks-primitive",
      "ks-semantic",
      "ks-component",
      "ks-brand",
    ]) {
      expect(css).toContain(`@layer ${layer}`);
    }

    for (const token of [
      "--ks-color-neutral-0",
      "--ks-color-accent-500",
      "--ks-font-family-sans",
      "--ks-font-size-body",
      "--ks-space-1",
      "--ks-radius-md",
      "--ks-border-width-1",
      "--ks-shadow-1",
      "--ks-color-bg-canvas",
      "--ks-color-text-primary",
      "--ks-color-border-default",
      "--ks-color-action-primary",
      "--ks-color-status-success-foreground",
      "--ks-color-status-warning-foreground",
      "--ks-color-status-review-foreground",
      "--ks-color-status-danger-foreground",
      "--ks-color-status-info-foreground",
      "--ks-focus-ring-color",
      "--ks-component-control-height",
    ]) {
      expect(css).toContain(`${token}:`);
    }

    expect(css).toContain('[data-kastur-theme="dark"]');
    expect(css).toContain("[data-kastur-brand]");
    expect(css).toMatch(/:focus-visible/u);
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/u);
    expect(css).toMatch(
      /\.ks-button__spinner[^{}]*\{[^}]*position:\s*absolute/su,
    );
    expect(css).toMatch(
      /\.ks-button\[data-loading="true"\]\s+\.ks-button__content[^}]*visibility:\s*hidden/su,
    );
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
    expect(css).not.toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/u);
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

describe("numeric primitives boundary", () => {
  it("keeps decimal.js isolated to the numeric package", async () => {
    const numericWorkspace = workspaces.find(({ name }) => name === "@kastur/numeric");

    expect(numericWorkspace).toBeDefined();

    if (numericWorkspace === undefined) {
      return;
    }

    const violations: string[] = [];

    // 1. Explicitly iterate every workspace manifest
    for (const workspace of workspaces) {
      if (workspace.name === "@kastur/numeric") {
        continue;
      }
      
      const manifestPath = path.join(workspace.directory, "package.json");
      const manifest = await readJson<PackageManifest>(manifestPath);
      
      if (manifest.dependencies?.["decimal.js"] || 
          manifest.devDependencies?.["decimal.js"] || 
          manifest.optionalDependencies?.["decimal.js"] || 
          manifest.peerDependencies?.["decimal.js"]) {
        violations.push(`${path.relative(repositoryRoot, manifestPath)} declares decimal.js dependency`);
      }
    }

    // 2. Scan production files to ensure they don't import decimal.js
    const files = [
      ...(await listCodeFiles("apps")),
      ...(await listCodeFiles("packages")),
      ...(await listCodeFiles("database")),
    ];

    for (const fileName of files) {
      if (fileName.includes(path.sep + "numeric" + path.sep)) {
        continue;
      }

      if (!fileName.endsWith(".ts") && !fileName.endsWith(".tsx") && !fileName.endsWith(".mjs")) {
        continue;
      }

      const sourceText = await readFile(fileName, "utf8");
      for (const specifier of getModuleSpecifiers(fileName, sourceText)) {
        if (specifier === "decimal.js" || specifier.startsWith("decimal.js/")) {
          violations.push(
            `${path.relative(repositoryRoot, fileName)} imports ${specifier}`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
