import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalMigrationsDirectory,
  discoverMigrations,
  formatMigrationStatus,
  getMigrationStatus,
  requireDatabaseUrl,
  safeErrorMessage,
  validateAppliedPrefix,
} from "../scripts/migrations.mjs";

/** @type {string[]} */
const temporaryDirectories = [];

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "kastur-migrations-unit-"));
  temporaryDirectories.push(directory);
  return directory;
}

/**
 * @param {Record<string, string>} files
 */
async function createMigrationDirectory(files) {
  const directory = await createTemporaryDirectory();

  for (const [filename, contents] of Object.entries(files)) {
    await writeFile(path.join(directory, filename), contents, "utf8");
  }

  return directory;
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (!path.basename(directory).startsWith("kastur-migrations-unit-")) {
      throw new Error(`Refusing to remove unexpected test path: ${directory}`);
    }

    await rm(directory, { force: true, recursive: true });
  }
});

describe("migration discovery", () => {
  it("discovers valid SQL files in numeric order with stable checksums", async () => {
    const directory = await createMigrationDirectory({
      "000003_third_step.sql": "SELECT 3;\n",
      "000001_first_step.sql": "SELECT 1;\n",
      "000002_second_step.sql": "SELECT 2;\n",
      "README.md": "documentation only",
    });

    const firstDiscovery = await discoverMigrations(directory);
    const secondDiscovery = await discoverMigrations(directory);

    expect(firstDiscovery.map(({ filename }) => filename)).toEqual([
      "000001_first_step.sql",
      "000002_second_step.sql",
      "000003_third_step.sql",
    ]);
    expect(firstDiscovery.map(({ checksumSha256 }) => checksumSha256)).toEqual(
      secondDiscovery.map(({ checksumSha256 }) => checksumSha256),
    );
    expect(firstDiscovery[0]?.checksumSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it.each([
    ["000000_reserved.sql", "SELECT 1;", "000000 is reserved"],
    ["1_short.sql", "SELECT 1;", "Invalid migration filename"],
    ["000001-Mixed.sql", "SELECT 1;", "Invalid migration filename"],
    ["000001_empty.sql", "  \n", "Migration file is empty"],
    ["notes.txt", "not sql", "Invalid migration filename"],
  ])("rejects an unsafe entry named %s", async (filename, contents, message) => {
    const directory = await createMigrationDirectory({ [filename]: contents });

    await expect(discoverMigrations(directory)).rejects.toThrow(message);
  });

  it("rejects duplicate numeric versions", async () => {
    const directory = await createMigrationDirectory({
      "000001_first.sql": "SELECT 1;",
      "000001_second.sql": "SELECT 2;",
    });

    await expect(discoverMigrations(directory)).rejects.toThrow(
      "Duplicate migration version 000001",
    );
  });

  it("rejects symbolic-link migrations", async () => {
    const directory = await createTemporaryDirectory();
    const targetDirectory = await createTemporaryDirectory();
    const target = path.join(targetDirectory, "target.sql");
    await writeFile(target, "SELECT 1;", "utf8");
    await symlink(target, path.join(directory, "000001_link.sql"));

    await expect(discoverMigrations(directory)).rejects.toThrow(
      "Migration directory must not contain symbolic links",
    );
  });

  it.each([
    "ABORT;",
    "BEGIN;",
    "COMMIT;",
    "END;",
    "PREPARE TRANSACTION 'kastur';",
    "RELEASE SAVEPOINT kastur;",
    "ROLLBACK;",
    "SAVEPOINT kastur;",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;",
    "SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE;",
    "START TRANSACTION;",
  ])("rejects runner-owned transaction control: %s", async (sql) => {
    const directory = await createMigrationDirectory({
      "000001_transaction_control.sql": sql,
    });

    await expect(discoverMigrations(directory)).rejects.toThrow(
      "runner owns the transaction boundary",
    );
  });

  it("does not mistake comments, quoted values, or procedural bodies for transaction control", async () => {
    const directory = await createMigrationDirectory({
      "000001_quoted_words.sql": `
        -- COMMIT; ROLLBACK;
        /* BEGIN; /* nested ABORT; */ END; */
        SELECT 'COMMIT; ROLLBACK;', "BEGIN" FROM (VALUES (1)) AS value("BEGIN");
        SELECT E'escaped quote: \\' and COMMIT remains text';
        DO $body$ BEGIN RAISE NOTICE 'ROLLBACK'; END $body$;
      `,
    });

    await expect(discoverMigrations(directory)).resolves.toHaveLength(1);
  });

  it("detects transaction control after a standard string containing a backslash", async () => {
    const directory = await createMigrationDirectory({
      "000001_backslash_then_commit.sql": "SELECT '\\'; COMMIT;",
    });

    await expect(discoverMigrations(directory)).rejects.toThrow(
      "runner owns the transaction boundary",
    );
  });

  it("does not pair a dollar tag attached to an identifier across a real rollback", async () => {
    const directory = await createMigrationDirectory({
      "000001_identifier_dollar_tag.sql": `
        SELECT 1 AS foo$tag$;
        ROLLBACK;
        SELECT $tag$body$tag$ AS foo$tag$;
      `,
    });

    await expect(discoverMigrations(directory)).rejects.toThrow(
      "runner owns the transaction boundary",
    );
  });

  it("ends a line comment at CR before validating transaction control", async () => {
    const directory = await createMigrationDirectory({
      "000001_cr_comment.sql": "-- comment\rROLLBACK;",
    });

    await expect(discoverMigrations(directory)).rejects.toThrow(
      "runner owns the transaction boundary",
    );
  });

  it("validates the canonical directory contains the domain migration", async () => {
    const migrations = await discoverMigrations(canonicalMigrationsDirectory);
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0]?.filename).toBe("000001_create_core_businesses_locations.sql");
  });
});

describe("migration configuration and history validation", () => {
  it("requires an explicit, database-specific PostgreSQL URL", () => {
    expect(() => requireDatabaseUrl({})).toThrow(
      "DATABASE_URL is required",
    );
    expect(() => requireDatabaseUrl({ DATABASE_URL: "not-a-url" })).toThrow(
      "valid PostgreSQL connection URL",
    );
    expect(() =>
      requireDatabaseUrl({ DATABASE_URL: "https://db.example/kastur" }),
    ).toThrow("postgres: or postgresql:");
    expect(() =>
      requireDatabaseUrl({ DATABASE_URL: "postgresql://db.example" }),
    ).toThrow("explicit PostgreSQL host and database");
    expect(() =>
      requireDatabaseUrl({
        DATABASE_URL:
          "postgresql://user@ep-kastur-pooler.ap-southeast-1.aws.neon.tech/kastur",
      }),
    ).toThrow("direct, unpooled PostgreSQL endpoint");
    expect(() =>
      requireDatabaseUrl({
        DATABASE_URL:
          "postgresql://user@db.example/kastur?host=other.example",
      }),
    ).toThrow("not query overrides (host)");

    expect(
      requireDatabaseUrl({
        DATABASE_URL: "postgresql://user:password@db.example/kastur",
      }),
    ).toBe("postgresql://user:password@db.example/kastur");
  });

  it("does not let the programmatic status API fall back to pg defaults", async () => {
    await expect(
      getMigrationStatus({ databaseUrl: "" }),
    ).rejects.toThrow("DATABASE_URL is required");
  });

  it("redacts connection URLs from operational errors", () => {
    expect(
      safeErrorMessage(
        new Error(
          "connect failed for postgresql://admin:top-secret@db.example/kastur",
        ),
      ),
    ).toBe("connect failed for [redacted DATABASE_URL]");

    const quotedCredentialUrl =
      "postgresql://admin:sec'ret@db.example/kastur";
    const redacted = safeErrorMessage(
      new Error(`connect failed for ${quotedCredentialUrl} after retry`),
      [quotedCredentialUrl],
    );

    expect(redacted).toBe("connect failed for [redacted DATABASE_URL] after retry");
    expect(redacted).not.toContain("sec'ret");
    expect(
      safeErrorMessage(
        new Error(`connect failed for ${quotedCredentialUrl} after retry`),
      ),
    ).toBe("connect failed for [redacted DATABASE_URL] after retry");
  });

  it("requires applied history to be the exact checksummed file prefix", async () => {
    const directory = await createMigrationDirectory({
      "000001_first.sql": "SELECT 1;",
      "000003_third.sql": "SELECT 3;",
    });
    const migrations = await discoverMigrations(directory);
    const first = migrations[0];

    expect(first).toBeDefined();
    const appliedFirst = {
      appliedAt: new Date("2026-08-16T00:00:00Z"),
      checksumSha256: first?.checksumSha256 ?? "",
      filename: first?.filename ?? "",
      version: first?.version ?? 0,
    };

    expect(() => validateAppliedPrefix(migrations, [appliedFirst])).not.toThrow();
    expect(() =>
      validateAppliedPrefix(migrations, [
        { ...appliedFirst, checksumSha256: "0".repeat(64) },
      ]),
    ).toThrow("checksum mismatch");
    expect(() =>
      validateAppliedPrefix(migrations, [
        { ...appliedFirst, filename: "000001_renamed.sql" },
      ]),
    ).toThrow("applied filename does not match");
    expect(() =>
      validateAppliedPrefix(migrations, [
        { ...appliedFirst, version: 2 },
      ]),
    ).toThrow("exact prefix");
  });

  it("formats applied and pending visibility", () => {
    expect(
      formatMigrationStatus([
        {
          appliedAt: new Date("2026-08-16T00:00:00Z"),
          checksumSha256: "a".repeat(64),
          filename: "000001_first.sql",
          state: "APPLIED",
          version: 1,
          versionText: "000001",
        },
        {
          appliedAt: null,
          checksumSha256: "b".repeat(64),
          filename: "000002_second.sql",
          state: "PENDING",
          version: 2,
          versionText: "000002",
        },
      ]),
    ).toContain("Summary: 1 applied, 1 pending.");
    expect(formatMigrationStatus([])).toContain("0 applied, 0 pending");
  });
});

describe("bootstrap script schema validation", () => {
  it("ensures bootstrap-business.mjs inserts into catalog.categories without stale code column", async () => {
    const bootstrapScriptPath = fileURLToPath(
      new URL("../scripts/bootstrap-business.mjs", import.meta.url),
    );
    const content = await readFile(bootstrapScriptPath, "utf8");

    expect(content).toContain("INSERT INTO catalog.categories (id, business_id, name, status)");
    expect(content).not.toContain("INSERT INTO catalog.categories (id, business_id, code, name, status)");
  });
});
