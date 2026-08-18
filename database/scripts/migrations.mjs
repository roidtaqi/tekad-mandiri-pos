// @ts-check

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { Client } from "pg";

const MIGRATION_FILE_PATTERN =
  /^(?<version>[0-9]{6})_(?<description>[a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const ALLOWED_NON_MIGRATION_FILES = new Set(["README.md"]);
const HISTORY_TABLE_REGCLASS = "public.kastur_schema_migrations";
const MIGRATION_LOCK_ID = "7511667758337001";

export const canonicalMigrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

/**
 * @typedef {object} MigrationFile
 * @property {string} checksumSha256
 * @property {string} filename
 * @property {string} fullPath
 * @property {string} sql
 * @property {number} version
 * @property {string} versionText
 */

/**
 * @typedef {object} AppliedMigration
 * @property {Date} appliedAt
 * @property {string} checksumSha256
 * @property {string} filename
 * @property {number} version
 */

/**
 * @typedef {object} MigrationStatus
 * @property {Date | null} appliedAt
 * @property {string} checksumSha256
 * @property {string} filename
 * @property {"APPLIED" | "PENDING"} state
 * @property {number} version
 * @property {string} versionText
 */

/**
 * @typedef {object} MigrationOptions
 * @property {string} databaseUrl
 * @property {{info(message: string): void, warn?(message: string): void}} [logger]
 * @property {string} [migrationsDirectory]
 * @property {boolean} [silent]
 * @property {(line: string) => void} [writeStdout]
 * @property {(line: string) => void} [writeStderr]
 */

/**
 * @param {string} message
 * @param {unknown} [cause]
 */
function migrationError(message, cause) {
  return new Error(message, cause === undefined ? undefined : { cause });
}

/**
 * Return a useful error without ever echoing PostgreSQL credentials.
 *
 * @param {unknown} error
 * @param {string[]} [sensitiveValues]
 */
export function safeErrorMessage(error, sensitiveValues = []) {
  let message = error instanceof Error ? error.message : String(error);

  for (const sensitiveValue of sensitiveValues
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length)) {
    message = message.replaceAll(sensitiveValue, "[redacted DATABASE_URL]");
  }

  return message.replace(
    /postgres(?:ql)?:\/\/\S+/giu,
    "[redacted DATABASE_URL]",
  );
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [environment]
 */
export function requireDatabaseUrl(environment = process.env) {
  const databaseUrl = environment.DATABASE_URL?.trim();

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw migrationError(
      "DATABASE_URL is required for database migration operations; no default database is configured.",
    );
  }

  let parsed;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw migrationError(
      "DATABASE_URL must be a valid PostgreSQL connection URL.",
    );
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw migrationError(
      "DATABASE_URL must use the postgres: or postgresql: protocol.",
    );
  }

  if (
    parsed.hostname.length === 0 ||
    parsed.pathname === "" ||
    parsed.pathname === "/"
  ) {
    throw migrationError(
      "DATABASE_URL must identify an explicit PostgreSQL host and database.",
    );
  }

  const hostnameLabel = parsed.hostname.toLowerCase().split(".")[0];

  if (hostnameLabel?.endsWith("-pooler")) {
    throw migrationError(
      "DATABASE_URL must use a direct, unpooled PostgreSQL endpoint; Neon pooler hosts are not supported for migrations.",
    );
  }

  const forbiddenQueryOverrides = new Set([
    "database",
    "dbname",
    "host",
    "hostaddr",
    "password",
    "port",
    "user",
  ]);
  const configuredOverrides = [...parsed.searchParams.keys()]
    .map((key) => key.toLowerCase())
    .filter((key) => forbiddenQueryOverrides.has(key));

  if (configuredOverrides.length > 0) {
    throw migrationError(
      `DATABASE_URL must express its target and credentials in the URL authority, not query overrides (${[...new Set(configuredOverrides)].join(", ")}).`,
    );
  }

  return databaseUrl;
}

/**
 * Remove strings, quoted identifiers, dollar-quoted bodies, and comments while
 * preserving statement separators and unquoted SQL words.
 *
 * @param {string} sql
 * @param {string} filename
 */
function tokenizeMigrationSql(sql, filename) {
  /** @type {string[]} */
  const tokens = [];
  let index = 0;
  let word = "";

  const flushWord = () => {
    if (word.length > 0) {
      tokens.push(word.toUpperCase());
      word = "";
    }
  };

  while (index < sql.length) {
    const character = sql[index];
    const nextCharacter = sql[index + 1];

    if (character === "-" && nextCharacter === "-") {
      flushWord();
      index += 2;

      while (
        index < sql.length &&
        sql[index] !== "\n" &&
        sql[index] !== "\r"
      ) {
        index += 1;
      }

      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      flushWord();
      index += 2;
      let depth = 1;

      while (index < sql.length && depth > 0) {
        if (sql[index] === "/" && sql[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (sql[index] === "*" && sql[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }

      if (depth !== 0) {
        throw migrationError(
          `Migration contains an unterminated block comment: ${filename}`,
        );
      }

      continue;
    }

    if (character === "'" || character === '"') {
      const usesBackslashEscapes =
        character === "'" && word.toUpperCase() === "E";
      flushWord();
      const quote = character;
      index += 1;
      let terminated = false;

      while (index < sql.length) {
        if (sql[index] === quote && sql[index + 1] === quote) {
          index += 2;
        } else if (usesBackslashEscapes && sql[index] === "\\") {
          index += 2;
        } else if (sql[index] === quote) {
          index += 1;
          terminated = true;
          break;
        } else {
          index += 1;
        }
      }

      if (!terminated) {
        throw migrationError(
          `Migration contains an unterminated quoted value: ${filename}`,
        );
      }

      continue;
    }

    if (character === "$") {
      const previousCharacter = sql[index - 1];
      const hasOpeningBoundary =
        previousCharacter === undefined ||
        !/[A-Za-z0-9_$\u0080-\uFFFF]/u.test(previousCharacter);
      const delimiterMatch = hasOpeningBoundary
        ? /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(sql.slice(index))
        : null;

      if (delimiterMatch !== null) {
        flushWord();
        const delimiter = delimiterMatch[0];
        const closingIndex = sql.indexOf(delimiter, index + delimiter.length);

        if (closingIndex === -1) {
          throw migrationError(
            `Migration contains an unterminated dollar-quoted value: ${filename}`,
          );
        }

        index = closingIndex + delimiter.length;
        continue;
      }
    }

    if (character === ";") {
      flushWord();
      tokens.push(";");
      index += 1;
      continue;
    }

    if (character !== undefined && /[A-Za-z0-9_]/u.test(character)) {
      word += character;
    } else {
      flushWord();
    }

    index += 1;
  }

  flushWord();
  return tokens;
}

/**
 * The runner, not migration files, owns the transaction boundary. Reject every
 * PostgreSQL transaction-control form that could split, commit, roll back, or
 * otherwise interfere with the migration SQL + history-row transaction.
 *
 * @param {string} sql
 * @param {string} filename
 */
function validateRunnerOwnedTransaction(sql, filename) {
  const tokens = tokenizeMigrationSql(sql, filename);
  /** @type {string[]} */
  let statement = [];

  const validateStatement = () => {
    const [first, second] = statement;
    const forbiddenSingle = new Set([
      "ABORT",
      "BEGIN",
      "COMMIT",
      "END",
      "ROLLBACK",
      "SAVEPOINT",
    ]);
    const forbiddenPair =
      (first === "START" && second === "TRANSACTION") ||
      (first === "PREPARE" && second === "TRANSACTION") ||
      (first === "RELEASE" && second === "SAVEPOINT") ||
      (first === "SET" && second === "TRANSACTION");
    const forbiddenSessionTransaction =
      first === "SET" &&
      second === "SESSION" &&
      statement[2] === "CHARACTERISTICS" &&
      statement[3] === "AS" &&
      statement[4] === "TRANSACTION";

    if (
      (first !== undefined && forbiddenSingle.has(first)) ||
      forbiddenPair ||
      forbiddenSessionTransaction
    ) {
      throw migrationError(
        `Migration must not contain transaction-control statements; the runner owns the transaction boundary: ${filename}`,
      );
    }

    statement = [];
  };

  for (const token of tokens) {
    if (token === ";") {
      validateStatement();
    } else {
      statement.push(token);
    }
  }

  validateStatement();
}

/**
 * @param {string} [migrationsDirectory]
 * @returns {Promise<MigrationFile[]>}
 */
export async function discoverMigrations(
  migrationsDirectory = canonicalMigrationsDirectory,
) {
  let entries;

  try {
    entries = await readdir(migrationsDirectory, { withFileTypes: true });
  } catch (error) {
    throw migrationError(
      `Cannot read migration directory: ${migrationsDirectory}`,
      error,
    );
  }

  /** @type {MigrationFile[]} */
  const migrations = [];
  const versions = new Set();

  for (const entry of entries) {
    if (ALLOWED_NON_MIGRATION_FILES.has(entry.name) && entry.isFile()) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      throw migrationError(
        `Migration directory must not contain symbolic links: ${entry.name}`,
      );
    }

    if (!entry.isFile()) {
      throw migrationError(
        `Migration directory contains an unsupported entry: ${entry.name}`,
      );
    }

    const match = MIGRATION_FILE_PATTERN.exec(entry.name);

    if (match?.groups === undefined) {
      throw migrationError(
        `Invalid migration filename "${entry.name}"; expected 000001_lowercase_snake_case.sql.`,
      );
    }

    const versionText = match.groups.version;

    if (versionText === undefined) {
      throw migrationError(`Migration filename has no version: ${entry.name}`);
    }

    const version = Number.parseInt(versionText, 10);

    if (version === 0) {
      throw migrationError(
        `Migration version 000000 is reserved and cannot be used: ${entry.name}`,
      );
    }

    if (versions.has(version)) {
      throw migrationError(
        `Duplicate migration version ${versionText}: ${entry.name}`,
      );
    }

    versions.add(version);

    const fullPath = path.join(migrationsDirectory, entry.name);
    const bytes = await readFile(fullPath);
    let sql;

    try {
      sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      throw migrationError(
        `Migration must contain valid UTF-8 text: ${entry.name}`,
        error,
      );
    }

    if (sql.trim().length === 0) {
      throw migrationError(`Migration file is empty: ${entry.name}`);
    }

    validateRunnerOwnedTransaction(sql, entry.name);

    migrations.push({
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      filename: entry.name,
      fullPath,
      sql,
      version,
      versionText,
    });
  }

  return [...migrations].sort((left, right) => left.version - right.version);
}

/** @param {string} databaseUrl */
function createMigrationClient(databaseUrl) {
  return new Client({
    application_name: "kastur-schema-migrations",
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
  });
}

/** @param {Client} client */
async function historyTableExists(client) {
  const result = await client.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [HISTORY_TABLE_REGCLASS],
  );

  return result.rows[0]?.exists === true;
}

/** @param {Client} client */
async function ensureHistoryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.kastur_schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      filename TEXT NOT NULL UNIQUE,
      checksum_sha256 TEXT NOT NULL
        CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    )
  `);
}

/**
 * @param {Client} client
 * @returns {Promise<AppliedMigration[]>}
 */
async function readAppliedMigrations(client) {
  if (!(await historyTableExists(client))) {
    return [];
  }

  const result = await client.query(`
    SELECT version, filename, checksum_sha256, applied_at
    FROM public.kastur_schema_migrations
    ORDER BY version ASC
  `);

  return result.rows.map((row) => ({
    appliedAt: new Date(row.applied_at),
    checksumSha256: String(row.checksum_sha256),
    filename: String(row.filename),
    version: Number(row.version),
  }));
}

/**
 * @param {MigrationFile[]} migrations
 * @param {AppliedMigration[]} appliedMigrations
 */
export function validateAppliedPrefix(migrations, appliedMigrations) {
  if (appliedMigrations.length > migrations.length) {
    throw migrationError(
      "Migration history diverges: the database contains applied migrations that are missing from the repository.",
    );
  }

  for (const [index, applied] of appliedMigrations.entries()) {
    const expected = migrations[index];

    if (expected === undefined || applied.version !== expected.version) {
      throw migrationError(
        `Migration history diverges at version ${String(applied.version).padStart(6, "0")}; applied history must be an exact prefix of repository migrations.`,
      );
    }

    if (applied.filename !== expected.filename) {
      throw migrationError(
        `Migration history diverges at ${expected.versionText}: applied filename does not match the repository.`,
      );
    }

    if (applied.checksumSha256 !== expected.checksumSha256) {
      throw migrationError(
        `Migration history diverges at ${expected.filename}: checksum mismatch. Applied migrations are immutable.`,
      );
    }
  }
}

/** @param {Client} client */
async function acquireMigrationLock(client) {
  await client.query("SELECT pg_advisory_lock($1::bigint)", [
    MIGRATION_LOCK_ID,
  ]);
}

/** @param {Client} client */
async function releaseMigrationLock(client) {
  const result = await client.query(
    "SELECT pg_advisory_unlock($1::bigint) AS unlocked",
    [MIGRATION_LOCK_ID],
  );

  if (result.rows[0]?.unlocked !== true) {
    throw migrationError(
      "PostgreSQL reported that the migration advisory lock was not held during cleanup.",
    );
  }
}

/**
 * @template T
 * @param {string} databaseUrl
 * @param {(client: Client) => Promise<T>} operation
 * @param {{warn?(message: string): void}} logger
 * @returns {Promise<T>}
 */
async function withLockedClient(databaseUrl, operation, logger) {
  const client = createMigrationClient(databaseUrl);
  let connected = false;
  let locked = false;
  /** @type {T | undefined} */
  let operationResult;
  /** @type {Error | undefined} */
  let operationError;

  try {
    await client.connect();
    connected = true;
    await acquireMigrationLock(client);
    locked = true;
    operationResult = await operation(client);
  } catch (error) {
    operationError = migrationError(safeErrorMessage(error, [databaseUrl]));
  }

  /** @type {Error | undefined} */
  let cleanupError;

  if (locked) {
    await releaseMigrationLock(client).catch((error) => {
      cleanupError = migrationError(
        `Migration lock cleanup failed: ${safeErrorMessage(error, [databaseUrl])}`,
      );
    });
  }

  if (connected) {
    await client.end().catch((error) => {
      cleanupError ??= migrationError(
        `Database connection cleanup failed: ${safeErrorMessage(error, [databaseUrl])}`,
      );
    });
  }

  if (operationError !== undefined) {
    if (cleanupError !== undefined) {
      logger.warn?.(cleanupError.message);
    }

    throw operationError;
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }

  return /** @type {T} */ (operationResult);
}

/**
 * @param {MigrationOptions} options
 * @returns {Promise<MigrationFile[]>}
 */
export async function applyMigrations({
  databaseUrl,
  logger = console,
  migrationsDirectory = canonicalMigrationsDirectory,
}) {
  const explicitDatabaseUrl = requireDatabaseUrl({
    DATABASE_URL: databaseUrl,
  });
  const migrations = await discoverMigrations(migrationsDirectory);

  return withLockedClient(
    explicitDatabaseUrl,
    async (client) => {
      await ensureHistoryTable(client);
      const appliedMigrations = await readAppliedMigrations(client);
      validateAppliedPrefix(migrations, appliedMigrations);

      const pendingMigrations = migrations.slice(appliedMigrations.length);
      /** @type {MigrationFile[]} */
      const appliedNow = [];

      for (const migration of pendingMigrations) {
        await client.query("BEGIN");
        let commitAttempted = false;

        try {
          await client.query(migration.sql);
          await client.query(
            `
              INSERT INTO public.kastur_schema_migrations (
                version,
                filename,
                checksum_sha256
              )
              VALUES ($1, $2, $3)
            `,
            [
              migration.version,
              migration.filename,
              migration.checksumSha256,
            ],
          );
          commitAttempted = true;
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          const failureSummary = commitAttempted
            ? "failed while committing; the database outcome is uncertain. Check migration status before retrying the same immutable file"
            : "failed and was rolled back";
          throw migrationError(
            `Migration ${migration.filename} ${failureSummary}: ${safeErrorMessage(error)}`,
          );
        }

        appliedNow.push(migration);
        logger.info(`Applied migration ${migration.filename}.`);
      }

      if (appliedNow.length === 0) {
        logger.info("No pending migrations.");
      }

      return appliedNow;
    },
    logger,
  );
}

/**
 * @param {MigrationOptions} options
 * @returns {Promise<MigrationStatus[]>}
 */
export async function getMigrationStatus({
  databaseUrl,
  logger = console,
  migrationsDirectory = canonicalMigrationsDirectory,
}) {
  const explicitDatabaseUrl = requireDatabaseUrl({
    DATABASE_URL: databaseUrl,
  });
  const migrations = await discoverMigrations(migrationsDirectory);

  return withLockedClient(
    explicitDatabaseUrl,
    async (client) => {
      const appliedMigrations = await readAppliedMigrations(client);
      validateAppliedPrefix(migrations, appliedMigrations);

      return migrations.map((migration, index) => ({
        appliedAt: appliedMigrations[index]?.appliedAt ?? null,
        checksumSha256: migration.checksumSha256,
        filename: migration.filename,
        state: index < appliedMigrations.length ? "APPLIED" : "PENDING",
        version: migration.version,
        versionText: migration.versionText,
      }));
    },
    logger,
  );
}

/** @param {MigrationStatus[]} statuses */
export function formatMigrationStatus(statuses) {
  if (statuses.length === 0) {
    return "Migration status: no migration files found (0 applied, 0 pending).";
  }

  const appliedCount = statuses.filter(
    (migration) => migration.state === "APPLIED",
  ).length;
  const lines = statuses.map(
    (migration) => `${migration.state.padEnd(7)} ${migration.filename}`,
  );

  return [
    "Migration status:",
    ...lines,
    `Summary: ${appliedCount} applied, ${statuses.length - appliedCount} pending.`,
  ].join("\n");
}

async function runCli() {
  const command = process.argv[2];

  if (command !== "apply" && command !== "status" && command !== "check") {
    throw migrationError(
      "Unknown migration command. Use apply, status, or check.",
    );
  }

  if (command === "check") {
    const migrations = await discoverMigrations();
    console.log(
      `Validated ${migrations.length} deterministic migration file${migrations.length === 1 ? "" : "s"}.`,
    );
    return;
  }

  const databaseUrl = requireDatabaseUrl();

  if (command === "apply") {
    await applyMigrations({ databaseUrl });
    return;
  }

  if (command === "status") {
    console.log(formatMigrationStatus(await getMigrationStatus({ databaseUrl })));
    return;
  }

}

const entrypoint = process.argv[1];

if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(entrypoint)).href
) {
  runCli().catch((error) => {
    console.error(`Database migration failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  });
}
