export interface ActorContext {
  readonly business_id: string;
  readonly user_id: string;
  readonly permissions: ReadonlySet<string>;
}

export interface SqlExecutor {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[], rowCount?: number | null }>;
}
