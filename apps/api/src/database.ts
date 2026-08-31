import { Client } from "pg";

export interface SqlQueryResult<TRow = Readonly<Record<string, unknown>>> {
  readonly rowCount: number;
  readonly rows: TRow[];
}

export interface SqlExecutor {
  query<TRow = Readonly<Record<string, unknown>>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<TRow>>;
}

export interface RequestDatabase extends SqlExecutor {
  close(): Promise<void>;
  transaction<TResult>(
    operation: (executor: SqlExecutor) => Promise<TResult>,
  ): Promise<TResult>;
}

export interface ApiEnvironment {
  readonly ALLOWED_ORIGINS?: string;
  readonly DATABASE_URL?: string;
  readonly HYPERDRIVE?: { readonly connectionString: string };
  readonly KASTUR_SETUP_TOKEN?: string;
  /** Server-only ECDSA P-256 private JWK used to sign offline authority. */
  readonly OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK?: string;
  readonly OFFLINE_AUTH_SIGNING_KEY_ID?: string;
}

export class DatabaseConfigurationError extends Error {
  readonly code = "DATABASE_NOT_CONFIGURED";

  constructor() {
    super(
      "Configure the HYPERDRIVE binding (production) or DATABASE_URL secret (local development).",
    );
    this.name = "DatabaseConfigurationError";
  }
}

function resolveConnectionString(environment: ApiEnvironment): string {
  const connectionString =
    environment.HYPERDRIVE?.connectionString ??
    environment.DATABASE_URL?.trim();

  if (connectionString === undefined || connectionString.length === 0) {
    throw new DatabaseConfigurationError();
  }

  return connectionString;
}

/**
 * One lazily connected PostgreSQL client scoped to one Worker request.
 * The Worker composition root always closes it in a finally block.
 */
export class PgRequestDatabase implements RequestDatabase {
  readonly #connectionString: string;
  #client: Client | null = null;
  #transactionActive = false;

  constructor(environment: ApiEnvironment) {
    this.#connectionString = resolveConnectionString(environment);
  }

  async #getClient(): Promise<Client> {
    if (this.#client !== null) {
      return this.#client;
    }

    const client = new Client({ connectionString: this.#connectionString });
    await client.connect();
    this.#client = client;
    return client;
  }

  async query<TRow = Readonly<Record<string, unknown>>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<TRow>> {
    const client = await this.#getClient();
    const result = await client.query(text, [...values]);

    return {
      rowCount: result.rowCount ?? 0,
      rows: result.rows as TRow[],
    };
  }

  async transaction<TResult>(
    operation: (executor: SqlExecutor) => Promise<TResult>,
  ): Promise<TResult> {
    if (this.#transactionActive) {
      throw new Error("Nested PostgreSQL transactions are not supported.");
    }

    const client = await this.#getClient();
    this.#transactionActive = true;
    await client.query("BEGIN");

    try {
      const result = await operation(this);
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      this.#transactionActive = false;
    }
  }

  async close(): Promise<void> {
    const client = this.#client;
    this.#client = null;

    if (client !== null) {
      await client.end();
    }
  }
}
