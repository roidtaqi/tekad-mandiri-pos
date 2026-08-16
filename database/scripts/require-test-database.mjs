// @ts-check

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (testDatabaseUrl === undefined || testDatabaseUrl.length === 0) {
  console.error(
    "TEST_DATABASE_URL is required for the isolated PostgreSQL migration tests.",
  );
  process.exitCode = 1;
} else {
  let parsed;

  try {
    parsed = new URL(testDatabaseUrl);
  } catch {
    console.error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
    process.exitCode = 1;
  }

  if (
    parsed !== undefined &&
    parsed.protocol !== "postgres:" &&
    parsed.protocol !== "postgresql:"
  ) {
    console.error("TEST_DATABASE_URL must use the PostgreSQL URL protocol.");
    process.exitCode = 1;
  }
}
