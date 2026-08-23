import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasCachedPermission } from "@kastur/auth-client";
import type { AuthContextResponse } from "@kastur/contracts";
import { Button, EmptyState, Spinner } from "@kastur/ui";

import { AuthContext } from "../features/auth/AuthContext";
import { SessionEntry } from "../features/auth/SessionEntry";
import { HttpCatalogGateway } from "../features/catalog/HttpCatalogGateway";
import { fetchAuthContext } from "./auth-api";
import {
  AuthenticatedHttpClient,
  HttpError,
  type FetchImplementation,
} from "./http";
import { HttpBackofficeResourceGateway } from "./resource-gateway";
import { HttpBackofficeCommandGateway } from "./command-gateway";
import { RuntimeContext, type BackofficeRuntime } from "./RuntimeContext";
import {
  clearSessionBearer,
  normalizeSessionBearer,
  readSessionBearer,
  SessionInputError,
  type SessionStorageLike,
  writeSessionBearer,
} from "./session";

export interface BackofficeRuntimeOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImplementation?: FetchImplementation;
  readonly sessionStorage?: SessionStorageLike;
}

interface ActiveSession {
  readonly authContext: AuthContextResponse;
  readonly bearer: string;
  readonly client: AuthenticatedHttpClient;
}

type SessionState =
  | { readonly status: "checking" }
  | {
      readonly errorMessage?: string;
      readonly retryBearer?: string;
      readonly status: "signed-out";
    }
  | { readonly active: ActiveSession; readonly status: "active" };

export interface BackofficeCompositionRootProps {
  readonly children: ReactNode;
  readonly options?: BackofficeRuntimeOptions;
}

function browserSessionStorage(): SessionStorageLike {
  return window.sessionStorage;
}

function publicSessionError(error: unknown): string {
  if (error instanceof SessionInputError || error instanceof HttpError) {
    return error.message;
  }
  return "Sesi tidak dapat diverifikasi. Silakan coba lagi.";
}

export function BackofficeCompositionRoot({
  children,
  options = {},
}: BackofficeCompositionRootProps) {
  const storage = options.sessionStorage ?? browserSessionStorage();
  const initialBearerRef = useRef<string | null>(readSessionBearer(storage));
  const generationRef = useRef(0);
  const [state, setState] = useState<SessionState>({ status: "checking" });

  const verify = useCallback(
    async (input: string, persist: boolean) => {
      const generation = ++generationRef.current;
      setState({ status: "checking" });

      let bearer: string;
      try {
        bearer = normalizeSessionBearer(input);
      } catch (error: unknown) {
        if (generation === generationRef.current) {
          setState({ errorMessage: publicSessionError(error), status: "signed-out" });
        }
        return;
      }

      const client = new AuthenticatedHttpClient({
        bearer,
        ...(options.apiBaseUrl === undefined ? {} : { apiBaseUrl: options.apiBaseUrl }),
        ...(options.fetchImplementation === undefined
          ? {}
          : { fetchImplementation: options.fetchImplementation }),
      });

      try {
        const authContext = await fetchAuthContext(client);
        if (persist) {
          writeSessionBearer(storage, bearer);
        }
        if (generation === generationRef.current) {
          setState({ active: { authContext, bearer, client }, status: "active" });
        }
      } catch (error: unknown) {
        if (error instanceof HttpError && error.status === 401) {
          clearSessionBearer(storage);
        }
        if (generation === generationRef.current) {
          setState({
            errorMessage: publicSessionError(error),
            ...(error instanceof HttpError && error.code === "NETWORK_ERROR"
              ? { retryBearer: bearer }
              : {}),
            status: "signed-out",
          });
        }
      }
    },
    [options.apiBaseUrl, options.fetchImplementation, storage],
  );

  useEffect(() => {
    const initialBearer = initialBearerRef.current;
    if (initialBearer === null) {
      setState({ status: "signed-out" });
      return;
    }
    void verify(initialBearer, false);
  }, [verify]);

  if (state.status === "checking") {
    return (
      <main className="ks-root session-screen">
        <Spinner label="Memverifikasi sesi Back Office" />
      </main>
    );
  }

  if (state.status === "signed-out") {
    return (
      <SessionEntry
        {...(state.errorMessage === undefined ? {} : { errorMessage: state.errorMessage })}
        {...(state.retryBearer === undefined
          ? {}
          : { onRetry: () => void verify(state.retryBearer!, false) })}
        onSubmit={(bearer) => void verify(bearer, true)}
      />
    );
  }

  return (
    <ActiveRuntime
      active={state.active}
      onLogout={() => {
        generationRef.current += 1;
        clearSessionBearer(storage);
        setState({ status: "signed-out" });
        void state.active.client.postVoid("/api/v1/auth/logout").catch(() => undefined);
      }}
    >
      {children}
    </ActiveRuntime>
  );
}

function ActiveRuntime({
  active,
  children,
  onLogout,
}: {
  readonly active: ActiveSession;
  readonly children: ReactNode;
  readonly onLogout: () => void;
}) {
  const runtime = useMemo<BackofficeRuntime>(
    () => ({
      authContext: active.authContext,
      catalogGateway: new HttpCatalogGateway(active.client),
      commandGateway: new HttpBackofficeCommandGateway(active.client, active.authContext),
      httpClient: active.client,
      logout: onLogout,
      resourceGateway: new HttpBackofficeResourceGateway(active.client),
    }),
    [active, onLogout],
  );

  if (!hasCachedPermission(active.authContext, "workspace.backoffice.access")) {
    return (
      <main className="ks-root session-screen">
        <EmptyState
          action={<Button onClick={onLogout}>Keluar</Button>}
          description="Sesi ini tidak memiliki izin workspace.backoffice.access."
          title="Akses Back Office ditolak"
        />
      </main>
    );
  }

  return (
    <RuntimeContext.Provider value={runtime}>
      <AuthContext.Provider value={active.authContext}>{children}</AuthContext.Provider>
    </RuntimeContext.Provider>
  );
}
