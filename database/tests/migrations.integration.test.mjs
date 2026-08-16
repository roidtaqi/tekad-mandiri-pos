// @ts-check

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  applyMigrations,
  getMigrationStatus,
} from "../scripts/migrations.mjs";

const configuredAdminUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = configuredAdminUrl === undefined ? describe.skip : describe;

/** @type {Client | undefined} */
let adminClient;
/** @type {string | undefined} */
let childDatabaseName;
/** @type {string | undefined} */
let childDatabaseUrl;
/** @type {string | undefined} */
let migrationsDirectory;

function requireSafeAdminUrl() {
  if (configuredAdminUrl === undefined || configuredAdminUrl.length === 0) {
    throw new Error(
      "TEST_DATABASE_URL is required for database integration tests.",
    );
  }

  const parsed = new URL(configuredAdminUrl);
  const allowedHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use the PostgreSQL protocol.");
  }

  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(
      "Migration integration tests only accept a loopback PostgreSQL host.",
    );
  }

  const forbiddenTargetOverrides = new Set([
    "database",
    "dbname",
    "host",
    "hostaddr",
    "password",
    "port",
    "user",
  ]);
  const configuredOverrides = [...parsed.searchParams.keys()].filter((key) =>
    forbiddenTargetOverrides.has(key.toLowerCase()),
  );

  if (configuredOverrides.length > 0) {
    throw new Error(
      `TEST_DATABASE_URL must not override its loopback target or credentials through query parameters (${configuredOverrides.join(", ")}).`,
    );
  }

  if (!/^kastur_[a-z0-9_]*test[a-z0-9_]*$/u.test(databaseName)) {
    throw new Error(
      "TEST_DATABASE_URL must target an explicitly test-named admin database.",
    );
  }

  return parsed;
}

/** @param {string} databaseName */
function quoteGeneratedDatabaseName(databaseName) {
  if (!/^kastur_migration_test_[0-9a-f]{32}$/u.test(databaseName)) {
    throw new Error(`Refusing unsafe generated database name: ${databaseName}`);
  }

  return `"${databaseName}"`;
}

async function createChildDatabase() {
  const adminUrl = requireSafeAdminUrl();
  const databaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
  await adminClient?.query(
    `CREATE DATABASE ${quoteGeneratedDatabaseName(databaseName)}`,
  );
  adminUrl.pathname = `/${databaseName}`;

  return { databaseName, databaseUrl: adminUrl.toString() };
}

/**
 * @template T
 * @param {string} databaseUrl
 * @param {(client: Client) => Promise<T>} operation
 * @returns {Promise<T>}
 */
async function withDatabaseClient(databaseUrl, operation) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function reserveAndReleaseLoopbackPort() {
  const server = createServer();

  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  await listening;

  const address = server.address();

  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a loopback port for the refusal test.");
  }

  const port = address.port;

  /** @type {Promise<void>} */
  const closed = new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
  await closed;

  return port;
}

/** @param {Record<string, string>} files */
async function writeMigrations(files) {
  if (migrationsDirectory === undefined) {
    throw new Error("Migration fixture directory is not initialized.");
  }

  for (const [filename, contents] of Object.entries(files)) {
    await writeFile(path.join(migrationsDirectory, filename), contents, "utf8");
  }
}

function requireTestResources() {
  if (childDatabaseUrl === undefined || migrationsDirectory === undefined) {
    throw new Error("Integration test resources are not initialized.");
  }

  return { databaseUrl: childDatabaseUrl, migrationsDirectory };
}

describeWithPostgres("PostgreSQL migration harness", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();
  });

  beforeEach(async () => {
    const childDatabase = await createChildDatabase();
    childDatabaseName = childDatabase.databaseName;
    childDatabaseUrl = childDatabase.databaseUrl;
    migrationsDirectory = await mkdtemp(
      path.join(tmpdir(), "kastur-migrations-integration-"),
    );
  });

  afterEach(async () => {
    if (childDatabaseName !== undefined) {
      await adminClient?.query(
        `DROP DATABASE IF EXISTS ${quoteGeneratedDatabaseName(childDatabaseName)} WITH (FORCE)`,
      );
    }

    if (migrationsDirectory !== undefined) {
      if (
        !path
          .basename(migrationsDirectory)
          .startsWith("kastur-migrations-integration-")
      ) {
        throw new Error(
          `Refusing to remove unexpected fixture path: ${migrationsDirectory}`,
        );
      }

      await rm(migrationsDirectory, { force: true, recursive: true });
    }

    childDatabaseName = undefined;
    childDatabaseUrl = undefined;
    migrationsDirectory = undefined;
  });

  afterAll(async () => {
    await adminClient?.end();
  });

  it("reports pending state, applies in order once, and reruns as a no-op", async () => {
    await writeMigrations({
      "000002_second.sql": `
        INSERT INTO migration_order (step) VALUES (2);
      `,
      "000001_first.sql": `
        CREATE TABLE migration_order (step INTEGER PRIMARY KEY);
        INSERT INTO migration_order (step) VALUES (1);
      `,
    });
    const resources = requireTestResources();

    const pendingStatus = await getMigrationStatus(resources);
    expect(pendingStatus.map(({ state }) => state)).toEqual([
      "PENDING",
      "PENDING",
    ]);

    await withDatabaseClient(resources.databaseUrl, async (client) => {
      await expect(
        client.query(
          "SELECT to_regclass('public.kastur_schema_migrations') AS name",
        ),
      ).resolves.toMatchObject({ rows: [{ name: null }] });
    });

    const applied = await applyMigrations(resources);
    expect(applied.map(({ filename }) => filename)).toEqual([
      "000001_first.sql",
      "000002_second.sql",
    ]);
    await expect(applyMigrations(resources)).resolves.toEqual([]);

    await withDatabaseClient(resources.databaseUrl, async (client) => {
      const orderedRows = await client.query(
        "SELECT step FROM migration_order ORDER BY step",
      );
      const historyRows = await client.query(`
        SELECT filename
        FROM public.kastur_schema_migrations
        ORDER BY version
      `);

      expect(orderedRows.rows).toEqual([{ step: 1 }, { step: 2 }]);
      expect(historyRows.rows).toEqual([
        { filename: "000001_first.sql" },
        { filename: "000002_second.sql" },
      ]);
    });

    const appliedStatus = await getMigrationStatus(resources);
    expect(appliedStatus.map(({ state }) => state)).toEqual([
      "APPLIED",
      "APPLIED",
    ]);
    expect(appliedStatus.every(({ appliedAt }) => appliedAt instanceof Date)).toBe(
      true,
    );
  });

  it("rolls back a failed file, stops later work, and resumes after correction", async () => {
    await writeMigrations({
      "000001_first.sql": `
        CREATE TABLE first_success (value TEXT NOT NULL);
        INSERT INTO first_success (value) VALUES ('kept');
      `,
      "000002_fails.sql": `
        CREATE TABLE must_rollback (value TEXT NOT NULL);
        INSERT INTO table_that_does_not_exist (value) VALUES ('fail');
      `,
      "000003_later.sql": "CREATE TABLE later_migration (id INTEGER);",
    });
    const resources = requireTestResources();

    await expect(applyMigrations(resources)).rejects.toThrow(
      "000002_fails.sql failed and was rolled back",
    );

    await withDatabaseClient(resources.databaseUrl, async (client) => {
      const objects = await client.query(`
        SELECT
          to_regclass('public.first_success') AS first_success,
          to_regclass('public.must_rollback') AS must_rollback,
          to_regclass('public.later_migration') AS later_migration
      `);
      const history = await client.query(`
        SELECT filename
        FROM public.kastur_schema_migrations
        ORDER BY version
      `);

      expect(objects.rows).toEqual([
        {
          first_success: "first_success",
          later_migration: null,
          must_rollback: null,
        },
      ]);
      expect(history.rows).toEqual([{ filename: "000001_first.sql" }]);
    });

    expect((await getMigrationStatus(resources)).map(({ state }) => state)).toEqual(
      ["APPLIED", "PENDING", "PENDING"],
    );

    await writeMigrations({
      "000002_fails.sql": "CREATE TABLE recovered_second (id INTEGER);",
    });
    const retried = await applyMigrations(resources);
    expect(retried.map(({ filename }) => filename)).toEqual([
      "000002_fails.sql",
      "000003_later.sql",
    ]);
  });

  it("rolls back successful DDL when its history insert fails", async () => {
    await writeMigrations({
      "000001_first.sql": "CREATE TABLE history_anchor (id INTEGER);",
    });
    const resources = requireTestResources();
    await applyMigrations(resources);

    await withDatabaseClient(resources.databaseUrl, async (client) => {
      await client.query(`
        ALTER TABLE public.kastur_schema_migrations
        ADD CONSTRAINT reject_second_history CHECK (version <> 2)
      `);
    });
    await writeMigrations({
      "000002_history_fails.sql":
        "CREATE TABLE ddl_must_rollback_with_history (id INTEGER);",
    });

    await expect(applyMigrations(resources)).rejects.toThrow(
      "000002_history_fails.sql failed and was rolled back",
    );

    await withDatabaseClient(resources.databaseUrl, async (client) => {
      const result = await client.query(`
        SELECT
          to_regclass('public.ddl_must_rollback_with_history') AS rolled_back,
          array_agg(filename ORDER BY version) AS applied_files
        FROM public.kastur_schema_migrations
      `);

      expect(result.rows).toEqual([
        {
          applied_files: ["000001_first.sql"],
          rolled_back: null,
        },
      ]);
    });
    expect((await getMigrationStatus(resources)).map(({ state }) => state)).toEqual(
      ["APPLIED", "PENDING"],
    );
  });

  it("rejects checksum drift and migrations inserted before applied history", async () => {
    await writeMigrations({
      "000001_first.sql": "CREATE TABLE immutable_first (id INTEGER);",
      "000003_third.sql": "CREATE TABLE immutable_third (id INTEGER);",
    });
    const resources = requireTestResources();
    await applyMigrations(resources);

    await writeMigrations({
      "000003_third.sql": "CREATE TABLE edited_third (id INTEGER);",
    });
    await expect(getMigrationStatus(resources)).rejects.toThrow(
      "checksum mismatch",
    );

    await writeMigrations({
      "000003_third.sql": "CREATE TABLE immutable_third (id INTEGER);",
      "000002_inserted_late.sql": "SELECT 2;",
    });
    await expect(applyMigrations(resources)).rejects.toThrow("exact prefix");
  });

  it("rejects applied migration history whose repository file was removed", async () => {
    const filename = "000001_must_remain.sql";
    await writeMigrations({
      [filename]: "CREATE TABLE file_must_remain (id INTEGER);",
    });
    const resources = requireTestResources();
    await applyMigrations(resources);
    await unlink(path.join(resources.migrationsDirectory, filename));

    await expect(getMigrationStatus(resources)).rejects.toThrow(
      "applied migrations that are missing from the repository",
    );
    await expect(applyMigrations(resources)).rejects.toThrow(
      "applied migrations that are missing from the repository",
    );
  });

  it("reports an understandable connection refusal without exposing credentials", async () => {
    const resources = requireTestResources();
    const closedPort = await reserveAndReleaseLoopbackPort();
    const refusedUrl = new URL(resources.databaseUrl);
    refusedUrl.port = String(closedPort);
    refusedUrl.username = "connection_test";
    refusedUrl.password = "must-not-appear";

    let connectionError;

    try {
      await getMigrationStatus({
        ...resources,
        databaseUrl: refusedUrl.toString(),
      });
    } catch (error) {
      connectionError = error;
    }

    expect(connectionError).toBeInstanceOf(Error);
    const message =
      connectionError instanceof Error
        ? connectionError.message
        : String(connectionError);
    expect(message).toMatch(/connect|ECONNREFUSED/iu);
    expect(message).not.toContain("must-not-appear");
    expect(message).not.toContain("postgresql://");
  });

  it("serializes concurrent runners so a migration is applied once", async () => {
    await writeMigrations({
      "000001_concurrent.sql": `
        SELECT pg_sleep(0.2);
        CREATE TABLE concurrent_once (id INTEGER PRIMARY KEY);
        INSERT INTO concurrent_once (id) VALUES (1);
      `,
    });
    const resources = requireTestResources();

    const results = await Promise.all([
      applyMigrations(resources),
      applyMigrations(resources),
    ]);

    expect(results.map((result) => result.length).sort()).toEqual([0, 1]);
    await withDatabaseClient(resources.databaseUrl, async (client) => {
      const result = await client.query("SELECT count(*)::integer AS count FROM concurrent_once");
      const history = await client.query(
        "SELECT count(*)::integer AS count FROM public.kastur_schema_migrations",
      );

      expect(result.rows).toEqual([{ count: 1 }]);
      expect(history.rows).toEqual([{ count: 1 }]);
    });
  });
});
