import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasCachedPermission } from "@kastur/auth-client";
import type { AuthContextResponse } from "@kastur/contracts";
import { Button, EmptyState, Spinner } from "@kastur/ui";

import { AuthContext } from "../features/auth/AuthContext";
import { FirstRunSetup } from "../features/auth/FirstRunSetup";
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

const defaultApiBaseUrl =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env !== "undefined" &&
  typeof import.meta.env.VITE_API_BASE_URL === "string" &&
  import.meta.env.VITE_API_BASE_URL.trim() !== ""
    ? import.meta.env.VITE_API_BASE_URL.trim()
    : undefined;

export interface BackofficeRuntimeOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImplementation?: FetchImplementation;
}

interface ActiveSession {
  readonly authContext: AuthContextResponse;
  readonly client: AuthenticatedHttpClient;
}

type SessionState =
  | { readonly status: "checking" }
  | {
      readonly errorMessage?: string | undefined;
      readonly status: "signed-out";
    }
  | { readonly active: ActiveSession; readonly status: "active" };

export interface BackofficeCompositionRootProps {
  readonly children: ReactNode;
  readonly options?: BackofficeRuntimeOptions;
}

function publicSessionError(error: unknown): string {
  if (error instanceof HttpError) {
    return error.message;
  }
  return "Akun tidak dapat diverifikasi. Silakan coba lagi.";
}

export function BackofficeCompositionRoot({
  children,
  options = {},
}: BackofficeCompositionRootProps) {
  const effectiveApiBaseUrl = options.apiBaseUrl ?? defaultApiBaseUrl;
  const generationRef = useRef(0);
  const [state, setState] = useState<SessionState>({ status: "checking" });
  const [setupRequired, setSetupRequired] = useState(false);
  const [showManualLogin, setShowManualLogin] = useState(false);

  const client = useMemo(
    () =>
      new AuthenticatedHttpClient({
        ...(effectiveApiBaseUrl === undefined ? {} : { apiBaseUrl: effectiveApiBaseUrl }),
        ...(options.fetchImplementation === undefined
          ? {}
          : { fetchImplementation: options.fetchImplementation }),
      }),
    [effectiveApiBaseUrl, options.fetchImplementation],
  );

  const checkAuth = useCallback(async () => {
    const generation = ++generationRef.current;
    setState({ status: "checking" });

    try {
      const authContext = await fetchAuthContext(client);
      if (generation === generationRef.current) {
        setState({ active: { authContext, client }, status: "active" });
      }
    } catch (error: unknown) {
      if (generation === generationRef.current) {
        setState({
          errorMessage:
            error instanceof HttpError && (error.status === 401 || error.status === 403)
              ? undefined
              : publicSessionError(error),
          status: "signed-out",
        });

        // Check if first-run setup is required
        const rawBase = effectiveApiBaseUrl ?? "";
        const baseUrl =
          rawBase.trim() === ""
            ? ""
            : rawBase.endsWith("/")
              ? rawBase.slice(0, -1)
              : rawBase;
        const statusUrl = `${baseUrl}/api/v1/system/setup/status`;
        const fetchImpl = options.fetchImplementation ?? fetch;
        fetchImpl(statusUrl, { headers: { Accept: "application/json" } })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: unknown) => {
            if (
              typeof data === "object" &&
              data !== null &&
              "initialized" in data &&
              (data as { initialized: boolean }).initialized === false
            ) {
              setSetupRequired(true);
            }
          })
          .catch(() => undefined);
      }
    }
  }, [client, effectiveApiBaseUrl, options.fetchImplementation]);

  const login = useCallback(
    async ({ email, password }: { readonly email: string; readonly password: string }) => {
      const generation = ++generationRef.current;
      setState({ status: "checking" });

      const rawBase = effectiveApiBaseUrl ?? "";
      const baseUrl =
        rawBase.trim() === ""
          ? ""
          : rawBase.endsWith("/")
            ? rawBase.slice(0, -1)
            : rawBase;
      const loginUrl = `${baseUrl}/api/v1/auth/login`;
      const fetchImpl = options.fetchImplementation ?? fetch;

      try {
        const response = await fetchImpl(loginUrl, {
          body: JSON.stringify({ client: "backoffice", email, password }),
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Kastur-Client": "backoffice",
          },
          method: "POST",
        });

        const body = (await response.json().catch(() => null)) as {
          readonly error?: { readonly message?: string };
        } | null;

        if (!response.ok) {
          throw new HttpError(
            response.status,
            "CREDENTIALS_INVALID",
            body?.error?.message ?? "Email atau password tidak sesuai.",
          );
        }

        const authContext = await fetchAuthContext(client);
        if (generation === generationRef.current) {
          setState({ active: { authContext, client }, status: "active" });
        }
      } catch (error: unknown) {
        if (generation === generationRef.current) {
          setState({
            errorMessage: publicSessionError(error),
            status: "signed-out",
          });
        }
      }
    },
    [client, effectiveApiBaseUrl, options.fetchImplementation],
  );

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (state.status === "checking") {
    return (
      <main className="ks-root session-screen">
        <Spinner label="Memverifikasi akun..." />
      </main>
    );
  }

  if (state.status === "signed-out") {
    if (setupRequired && !showManualLogin) {
      return (
        <FirstRunSetup
          apiBaseUrl={effectiveApiBaseUrl}
          onCancel={() => setShowManualLogin(true)}
          onComplete={() => void checkAuth()}
        />
      );
    }

    return (
      <SessionEntry
        errorMessage={state.errorMessage}
        onLogin={(credentials) => void login(credentials)}
      />
    );
  }

  return (
    <ActiveRuntime
      active={state.active}
      onLogout={() => {
        generationRef.current += 1;
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
          description="Akun ini tidak memiliki akses ke Back Office."
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
