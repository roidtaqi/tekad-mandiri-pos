import type { Server } from "node:http";

export interface NodeApiEnvironment {
  readonly ALLOWED_ORIGINS?: string;
  readonly DATABASE_URL?: string;
  readonly KASTUR_SETUP_TOKEN?: string;
  readonly NODE_ENV?: string;
  readonly OFFLINE_AUTH_SIGNING_KEY_ID?: string;
  readonly OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK?: string;
}

export const defaultApiEntryPath: string;

export function buildApiEnvironment(
  sourceEnv?: Record<string, string | undefined>,
): NodeApiEnvironment;

export function loadHandler(
  entryPath?: string,
): Promise<(request: Request, env: any, deps?: any) => Promise<Response>>;

export function createNodeHttpServer(
  handler: (request: Request, env: any, deps?: any) => Promise<Response>,
  environment?: Record<string, string | undefined>,
  dependencies?: any,
): Server;

