import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { AuthContextResponse } from "@kastur/contracts";
import {
  createPosLocalDatabase,
  type LocalShiftRecord,
  type PosLocalDatabase,
} from "@kastur/local-db";
import {
  createBearerAuthProvider,
  HttpSyncGateway,
  SyncHttpError,
  SyncOrchestrator,
  SyncTransportError,
} from "@kastur/sync-client";

import {
  enrollDeviceApi,
  fetchAuthContext,
  PosAuthApiError,
  revokePosSession,
} from "./auth-api.js";
import { readPosRuntimeConfig, type PosRuntimeConfig } from "./config.js";
import {
  canDiscardHistoricalCredential,
  drainRecoveryOutbox,
} from "./recovery.js";
import {
  PosLocalSyncStoreAdapter,
  ProjectionRequiresBootstrapError,
} from "./sync-store-adapter.js";
import {
  cacheOperationalSession,
  clearCachedSession,
  clearSessionBearer,
  getOrCreateDeviceId,
  markCachedSessionRecoveryOnly,
  readCachedSession,
  readSessionBearer,
  readTerminalId,
  unlockCachedSession,
  unlockCachedSessionForRecovery,
  validateCachedSession,
  validateCachedRecoverySession,
  writeSessionBearer,
  writeTerminalId,
  trustedOperationTimestamp,
} from "./storage.js";
import type {
  PosOperationalContext,
  RuntimeStatus,
  RuntimeSyncState,
} from "./types.js";
import {
  completeReturnOnline,
  searchReturnableSalesOnline,
  type CompleteReturnOnlineResult,
  type CompleteReturnPayload,
  type ReturnableSaleDetail,
} from "../returns/return-api.js";

const defaultSyncState: RuntimeSyncState = {
  status: "IDLE",
  pendingCount: 0,
  retryableCount: 0,
  requiresReviewCount: 0,
  message: "Belum ada sinkronisasi pada sesi ini.",
  lastSuccessAt: null,
};

export interface PosRuntimeDependencies {
  readonly config?: PosRuntimeConfig;
  readonly createDatabase?: () => PosLocalDatabase;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

export interface ConnectSessionInput {
  readonly bearer: string;
  readonly terminalId?: string;
}

export interface SubmitReturnInput {
  readonly commandId: string;
  readonly correlationId: string;
  readonly payload: CompleteReturnPayload;
}

export interface RecoverOutboxInput {
  readonly approverBearer: string;
  readonly reason: string;
}

export interface PosRuntimeValue {
  readonly status: RuntimeStatus;
  readonly error: string | null;
  readonly database: PosLocalDatabase;
  readonly deviceId: string;
  readonly terminalId: string;
  readonly online: boolean;
  readonly operational: PosOperationalContext | null;
  readonly activeShift: LocalShiftRecord | null;
  readonly sync: RuntimeSyncState;
  readonly recoveryRequired: boolean;
  connect(input: ConnectSessionInput): Promise<void>;
  getOperationTimestamp(): string;
  quickLock(): void;
  recoverOutbox(input: RecoverOutboxInput): Promise<void>;
  signOut(): Promise<void>;
  runSync(): Promise<void>;
  refreshOperationalState(): Promise<void>;
  searchReturnableSales(query: string): Promise<readonly ReturnableSaleDetail[]>;
  completeReturn(input: SubmitReturnInput): Promise<CompleteReturnOnlineResult>;
}

const PosRuntimeContext = createContext<PosRuntimeValue | null>(null);

function messageFromError(error: unknown): string {
  if (error instanceof PosAuthApiError || error instanceof SyncHttpError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Operasi POS gagal.";
}

function isNetworkFailure(error: unknown): boolean {
  return (
    (error instanceof SyncTransportError && error.kind === "NETWORK") ||
    (error instanceof TypeError && /fetch|network|failed/u.test(error.message.toLowerCase()))
  );
}

function isControlledRecoveryFailure(error: unknown): boolean {
  return (
    error instanceof PosAuthApiError &&
    new Set([
      "SESSION_INVALID",
      "DEVICE_REVOKED",
      "MEMBERSHIP_INACTIVE",
      "PERMISSION_DENIED",
    ]).has(error.code)
  );
}

function terminalAwareFetch(
  fetchImplementation: typeof fetch,
  terminalId: string,
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Terminal-Id", terminalId);
    return fetchImplementation(input, { ...init, headers });
  };
}

interface SyncRuntime {
  readonly adapter: PosLocalSyncStoreAdapter;
  readonly orchestrator: SyncOrchestrator;
}

export function PosRuntimeProvider({
  children,
  dependencies = {},
}: {
  readonly children: ReactNode;
  readonly dependencies?: PosRuntimeDependencies;
}) {
  const config = useMemo(
    () => dependencies.config ?? readPosRuntimeConfig(),
    [dependencies.config],
  );
  const fetchImplementation = dependencies.fetch ?? fetch;
  const now = useMemo(
    () => dependencies.now ?? (() => new Date()),
    [dependencies.now],
  );
  const [database] = useState(() =>
    dependencies.createDatabase?.() ?? createPosLocalDatabase(),
  );
  const [deviceId] = useState(getOrCreateDeviceId);
  const [terminalId, setTerminalId] = useState(readTerminalId);
  const [status, setStatus] = useState<RuntimeStatus>("INITIALIZING");
  const [error, setError] = useState<string | null>(null);
  const [operational, setOperational] = useState<PosOperationalContext | null>(null);
  const [activeShift, setActiveShift] = useState<LocalShiftRecord | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [sync, setSync] = useState<RuntimeSyncState>(defaultSyncState);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const syncRuntimeRef = useRef<SyncRuntime | null>(null);
  const syncingRef = useRef(false);

  const createSyncRuntime = useCallback(
    (businessId: string, selectedTerminalId: string): SyncRuntime => {
      const adapter = new PosLocalSyncStoreAdapter(database, deviceId);
      const gateway = new HttpSyncGateway({
        baseUrl: config.apiBaseUrl,
        client: "pos",
        clientVersion: config.clientVersion,
        clientSchemaVersion: 1,
        deviceId,
        authProvider: createBearerAuthProvider(() => {
          const bearer = readSessionBearer();
          if (bearer === null) {
            throw new SyncTransportError(
              "NETWORK",
              "Sesi dikunci; command tetap tersimpan untuk percobaan berikutnya.",
            );
          }
          return bearer;
        }),
        fetch: terminalAwareFetch(fetchImplementation, selectedTerminalId),
      });
      return {
        adapter,
        orchestrator: new SyncOrchestrator({
          gateway,
          store: adapter,
          businessId,
          deviceId,
          clientSchemaVersion: 1,
        }),
      };
    },
    [config.apiBaseUrl, config.clientVersion, database, deviceId, fetchImplementation],
  );

  const loadOperationalState = useCallback(
    async (context: PosOperationalContext): Promise<void> => {
      const [shift, outbox] = await Promise.all([
        database.shifts.getActiveShift(
          context.business.id,
          context.location.id,
          deviceId,
        ),
        database.sync.getOutboxSummary(context.business.id),
      ]);
      setActiveShift(shift);
      setSync((current) => ({
        ...current,
        pendingCount: outbox.unresolved,
        retryableCount: outbox.failed_retryable,
        requiresReviewCount: outbox.requires_review,
      }));
    },
    [database, deviceId],
  );

  const refreshOperationalState = useCallback(async (): Promise<void> => {
    if (operational !== null) await loadOperationalState(operational);
  }, [loadOperationalState, operational]);

  const connect = useCallback(
    async ({ bearer, terminalId: requestedTerminalId }: ConnectSessionInput): Promise<void> => {
      const cleanBearer = bearer.trim();
      const cleanTerminalId = requestedTerminalId?.trim() ?? "";
      if (cleanBearer === "") {
        setStatus("ERROR");
        setError("Sesi pengguna wajib diisi.");
        return;
      }

      setStatus("CONNECTING");
      setError(null);
      writeSessionBearer(cleanBearer);
      if (cleanTerminalId !== "") {
        writeTerminalId(cleanTerminalId);
        setTerminalId(cleanTerminalId);
      }
      const cached = readCachedSession();

      try {
        let auth: AuthContextResponse;
        try {
          auth = await fetchAuthContext(
            config.apiBaseUrl,
            cleanBearer,
            deviceId,
            cleanTerminalId === "" ? undefined : cleanTerminalId,
            fetchImplementation,
          );
        } catch (fetchErr: unknown) {
          if (
            fetchErr instanceof PosAuthApiError &&
            fetchErr.status === 403 &&
            fetchErr.code === "DEVICE_BINDING_REQUIRED"
          ) {
            await enrollDeviceApi(
              config.apiBaseUrl,
              cleanBearer,
              deviceId,
              "POS Terminal",
              undefined,
              fetchImplementation,
            );
            auth = await fetchAuthContext(
              config.apiBaseUrl,
              cleanBearer,
              deviceId,
              cleanTerminalId === "" ? undefined : cleanTerminalId,
              fetchImplementation,
            );
          } else {
            throw fetchErr;
          }
        }
        if (!auth.permissions.includes("workspace.pos.access")) {
          throw new PosAuthApiError(
            "Pengguna tidak memiliki izin workspace.pos.access.",
            403,
            "PERMISSION_DENIED",
          );
        }
        const effectiveTerminalId = cleanTerminalId !== "" ? cleanTerminalId : "";
        const runtime = createSyncRuntime(auth.membership.business_id, effectiveTerminalId);
        await runtime.orchestrator.bootstrap();
        const context = runtime.adapter.getLatestBootstrapContext();
        if (context === null) {
          throw new Error("Bootstrap tidak mengembalikan konteks terminal.");
        }
        if (cleanTerminalId !== "" && context.terminal.id !== cleanTerminalId) {
          throw new Error("Bootstrap tidak mengembalikan terminal yang dipilih.");
        }
        writeTerminalId(context.terminal.id);
        setTerminalId(context.terminal.id);
        if (
          config.offlineAuthorizationVerification !== null &&
          context.auth.offline_authorization !== undefined
        ) {
          await cacheOperationalSession(
            cleanBearer,
            context,
            deviceId,
            config.offlineAuthorizationVerification,
            now().toISOString(),
          );
        } else {
          clearCachedSession();
        }
        syncRuntimeRef.current = runtime;
        setOperational(context);
        await loadOperationalState(context);
        setRecoveryRequired(false);
        setStatus("READY");
        setSync((current) => ({
          ...current,
          status: "IDLE",
          message: "Data awal POS siap. Antrean lokal tetap tersimpan.",
        }));
      } catch (onlineError: unknown) {
        if (
          isControlledRecoveryFailure(onlineError) &&
          cached !== null &&
          config.offlineAuthorizationVerification !== null
        ) {
          markCachedSessionRecoveryOnly(cached);
          try {
            const recoveryContext = await unlockCachedSessionForRecovery(
              cleanBearer,
              cleanTerminalId,
              deviceId,
              cached,
              config.offlineAuthorizationVerification,
            );
            clearSessionBearer();
            syncRuntimeRef.current = null;
            const summary = await database.sync.getOutboxSummary(
              recoveryContext.business.id,
            );
            if (canDiscardHistoricalCredential(summary)) {
              clearCachedSession();
              setOperational(null);
              setActiveShift(null);
              setRecoveryRequired(false);
              setStatus("SIGNED_OUT");
              setError("Akses perangkat telah dicabut dan tidak ada fakta lokal tertunda.");
            } else {
              setOperational(recoveryContext);
              await loadOperationalState(recoveryContext);
              setRecoveryRequired(true);
              setStatus("LOCKED");
              setError(
                "Akses perangkat dicabut. Fakta lokal dikunci dan memerlukan persetujuan recovery dari Owner aktif.",
              );
            }
            return;
          } catch (recoveryError: unknown) {
            clearSessionBearer();
            syncRuntimeRef.current = null;
            setRecoveryRequired(true);
            setStatus("LOCKED");
            setError(`Pemulihan outbox belum berhasil: ${messageFromError(recoveryError)}`);
            return;
          }
        }
        if (
          isNetworkFailure(onlineError) &&
          cached !== null &&
          config.offlineAuthorizationVerification !== null
        ) {
          try {
            const context = await unlockCachedSession(
              cleanBearer,
              cleanTerminalId,
              deviceId,
              cached,
              config.offlineAuthorizationVerification,
              now(),
            );
            syncRuntimeRef.current = createSyncRuntime(
              context.business.id,
              cleanTerminalId,
            );
            setOperational(context);
            await loadOperationalState(context);
            setStatus("READY");
            setSync((current) => ({
              ...current,
              status: "OFFLINE",
              message: "Berjalan dengan izin dan data lokal yang masih berlaku.",
            }));
            return;
          } catch (offlineError: unknown) {
            clearSessionBearer();
            setStatus("ERROR");
            setError(messageFromError(offlineError));
            return;
          }
        }

        clearSessionBearer();
        setStatus("ERROR");
        setError(messageFromError(onlineError));
      }
    },
    [
      config.apiBaseUrl,
      config.offlineAuthorizationVerification,
      createSyncRuntime,
      deviceId,
      fetchImplementation,
      loadOperationalState,
      now,
    ],
  );

  const quickLock = useCallback(() => {
    clearSessionBearer();
    syncRuntimeRef.current = null;
    setStatus("LOCKED");
    setError(null);
  }, []);

  const getOperationTimestamp = useCallback((): string => {
    if (status !== "READY" || operational === null) {
      throw new Error("Sesi POS tidak aktif; operasi lokal diblokir.");
    }
    try {
      return trustedOperationTimestamp(now());
    } catch (clockError: unknown) {
      clearSessionBearer();
      syncRuntimeRef.current = null;
      setStatus("LOCKED");
      setError(messageFromError(clockError));
      throw clockError;
    }
  }, [now, operational, status]);

  const recoverOutbox = useCallback(
    async ({ approverBearer, reason }: RecoverOutboxInput): Promise<void> => {
      const cleanApproverBearer = approverBearer.trim();
      const cleanReason = reason.trim();
      const cached = readCachedSession();
      if (
        !recoveryRequired ||
        cached === null ||
        cached.access_state !== "RECOVERY_ONLY" ||
        cached.recovery_cause !== "AUTHORITY_REVOKED" ||
        operational === null
      ) {
        setError("Tidak ada konteks recovery terkontrol yang aktif.");
        return;
      }
      if (!online) {
        setError("Recovery memerlukan koneksi online ke server.");
        return;
      }
      if (cleanApproverBearer === "" || cleanReason.length < 10 || cleanReason.length > 500) {
        setError("Sesi approver dan alasan recovery 10–500 karakter wajib diisi.");
        return;
      }

      setStatus("CONNECTING");
      setError(null);
      try {
        await database.sync.authorizeRecoveryRetry(operational.business.id);
        const adapter = new PosLocalSyncStoreAdapter(database, deviceId);
        const gateway = new HttpSyncGateway({
          baseUrl: config.apiBaseUrl,
          client: "backoffice",
          clientVersion: config.clientVersion,
          clientSchemaVersion: 1,
          deviceId,
          authProvider: createBearerAuthProvider(() => cleanApproverBearer),
          fetch: fetchImplementation,
          recoveryApproval: { reason: cleanReason },
        });
        const orchestrator = new SyncOrchestrator({
          gateway,
          store: adapter,
          businessId: operational.business.id,
          deviceId,
          clientSchemaVersion: 1,
          now,
        });
        const result = await drainRecoveryOutbox(
          () => orchestrator.pushPending(),
          () => database.sync.getOutboxSummary(operational.business.id),
        );
        if (canDiscardHistoricalCredential(result.summary)) {
          clearSessionBearer();
          clearCachedSession();
          syncRuntimeRef.current = null;
          setOperational(null);
          setActiveShift(null);
          setRecoveryRequired(false);
          setSync(defaultSyncState);
          setStatus("SIGNED_OUT");
          setError(
            `${result.accepted + result.accepted_with_review} fakta lokal dipulihkan; perangkat tetap tidak berwenang.`,
          );
          return;
        }
        await loadOperationalState(operational);
        setStatus("LOCKED");
        setError(
          "Recovery belum tuntas. Fakta yang ditolak tetap dipertahankan untuk peninjauan.",
        );
      } catch (recoveryError: unknown) {
        await loadOperationalState(operational).catch(() => undefined);
        setStatus("LOCKED");
        setError(`Recovery terkontrol gagal: ${messageFromError(recoveryError)}`);
      }
    },
    [
      config.apiBaseUrl,
      config.clientVersion,
      database,
      deviceId,
      fetchImplementation,
      loadOperationalState,
      now,
      online,
      operational,
      recoveryRequired,
    ],
  );

  const completeReturn = useCallback(
    async (input: SubmitReturnInput): Promise<CompleteReturnOnlineResult> => {
      if (status !== "READY" || operational === null || !online) {
        throw new Error("Return memerlukan koneksi online dan sesi POS aktif.");
      }
      const bearer = readSessionBearer();
      if (bearer === null) throw new Error("Sesi pengguna terkunci.");
      return completeReturnOnline({
        apiBaseUrl: config.apiBaseUrl,
        bearer,
        deviceId,
        terminalId: operational.terminal.id,
        locationId: operational.location.id,
        authorizationVersion: operational.auth.authorization_version,
        commandId: input.commandId,
        correlationId: input.correlationId,
        payload: input.payload,
        fetchImplementation,
      });
    },
    [config.apiBaseUrl, deviceId, fetchImplementation, online, operational, status],
  );

  const searchReturnableSales = useCallback(
    async (query: string): Promise<readonly ReturnableSaleDetail[]> => {
      if (status !== "READY" || operational === null || !online) {
        throw new Error("Pencarian transaksi Return memerlukan koneksi online dan sesi POS aktif.");
      }
      const bearer = readSessionBearer();
      if (bearer === null) throw new Error("Sesi pengguna terkunci.");
      return searchReturnableSalesOnline({
        apiBaseUrl: config.apiBaseUrl,
        bearer,
        deviceId,
        terminalId: operational.terminal.id,
        query,
        fetchImplementation,
      });
    },
    [config.apiBaseUrl, deviceId, fetchImplementation, online, operational, status],
  );

  const signOut = useCallback(async (): Promise<void> => {
    if (operational !== null) {
      const outbox = await database.sync.getOutboxSummary(operational.business.id);
      if (!canDiscardHistoricalCredential(outbox)) {
        setError(
          `Keluar diblokir: ${outbox.unresolved} fakta lokal belum aman di server. Sinkronkan atau gunakan Kunci Cepat.`,
        );
        return;
      }
    }
    const bearer = readSessionBearer();
    if (bearer !== null && terminalId !== "") {
      void revokePosSession(
        config.apiBaseUrl,
        bearer,
        deviceId,
        terminalId,
        fetchImplementation,
      ).catch(() => undefined);
    }
    clearSessionBearer();
    clearCachedSession();
    syncRuntimeRef.current = null;
    setOperational(null);
    setActiveShift(null);
    setSync(defaultSyncState);
    setRecoveryRequired(false);
    setStatus("SIGNED_OUT");
    setError(null);
  }, [
    config.apiBaseUrl,
    database.sync,
    deviceId,
    fetchImplementation,
    operational,
    terminalId,
  ]);

  const runSync = useCallback(async (): Promise<void> => {
    const runtime = syncRuntimeRef.current;
    if (runtime === null || operational === null || status !== "READY") return;
    if (!online) {
      setSync((current) => ({
        ...current,
        status: "OFFLINE",
        message: "Offline. Transaksi aman di perangkat dan akan dicoba lagi.",
      }));
      return;
    }
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSync((current) => ({ ...current, status: "SYNCING", message: "Sinkronisasi berjalan…" }));

    try {
      const result = await runtime.orchestrator.synchronize();
      if (result.pull.status === "FAILED") {
        const failure = result.pull.failure;
        if (failure.error_code === "SYNC_PROTOCOL_ERROR") {
          await runtime.orchestrator.bootstrap();
          const refreshed = runtime.adapter.getLatestBootstrapContext();
          if (refreshed === null) throw new Error("Bootstrap pemulihan tidak lengkap.");
          const bearer = readSessionBearer();
          if (bearer !== null) {
            if (
              config.offlineAuthorizationVerification !== null &&
              refreshed.auth.offline_authorization !== undefined
            ) {
              await cacheOperationalSession(
                bearer,
                refreshed,
                deviceId,
                config.offlineAuthorizationVerification,
                now().toISOString(),
              );
            } else {
              clearCachedSession();
            }
          }
          setOperational(refreshed);
          await loadOperationalState(refreshed);
          setSync((current) => ({
            ...current,
            status: "IDLE",
            message: "Data master diperbarui ulang secara atomik.",
            lastSuccessAt: now().toISOString(),
          }));
          return;
        }
        setSync((current) => ({
          ...current,
          status: failure.error_code === "NETWORK_UNKNOWN_RESULT" ? "OFFLINE" : "ERROR",
          message: failure.message,
        }));
      } else {
        const reviewCount =
          result.push.accepted_with_review + result.push.requires_review;
        const acknowledgementFailure =
          result.pull.acknowledgement.status === "FAILED"
            ? result.pull.acknowledgement.failure
            : null;
        setSync((current) => ({
          ...current,
          status:
            reviewCount > 0 || result.push.failed_retryable > 0
              ? "ERROR"
              : acknowledgementFailure === null
                ? "IDLE"
                : acknowledgementFailure.error_code === "NETWORK_UNKNOWN_RESULT"
                  ? "OFFLINE"
                  : "ERROR",
          message:
            reviewCount > 0
              ? `${reviewCount} command memerlukan peninjauan Back Office.`
              : result.push.failed_retryable > 0
                ? `${result.push.failed_retryable} command menunggu percobaan sinkronisasi ulang.`
                : acknowledgementFailure !== null
                  ? `Data sudah diterapkan lokal, tetapi ACK server gagal: ${acknowledgementFailure.message}`
              : "Sinkronisasi selesai.",
          lastSuccessAt:
            acknowledgementFailure === null ? now().toISOString() : current.lastSuccessAt,
        }));
      }
      await loadOperationalState(operational);
    } catch (syncError: unknown) {
      if (syncError instanceof ProjectionRequiresBootstrapError) {
        try {
          await runtime.orchestrator.bootstrap();
          const refreshed = runtime.adapter.getLatestBootstrapContext();
          if (refreshed === null) throw new Error("Bootstrap pemulihan tidak lengkap.");
          const bearer = readSessionBearer();
          if (
            bearer !== null &&
            config.offlineAuthorizationVerification !== null &&
            refreshed.auth.offline_authorization !== undefined
          ) {
            await cacheOperationalSession(
              bearer,
              refreshed,
              deviceId,
              config.offlineAuthorizationVerification,
              now().toISOString(),
            );
          } else {
            clearCachedSession();
          }
          setOperational(refreshed);
          await loadOperationalState(refreshed);
          setSync((current) => ({
            ...current,
            status: "IDLE",
            message: "Data master diperbarui ulang secara atomik.",
            lastSuccessAt: now().toISOString(),
          }));
        } catch (bootstrapError: unknown) {
          setSync((current) => ({
            ...current,
            status: isNetworkFailure(bootstrapError) ? "OFFLINE" : "ERROR",
            message: messageFromError(bootstrapError),
          }));
        }
      } else {
        setSync((current) => ({
          ...current,
          status: isNetworkFailure(syncError) ? "OFFLINE" : "ERROR",
          message: messageFromError(syncError),
        }));
      }
    } finally {
      syncingRef.current = false;
    }
  }, [
    config.offlineAuthorizationVerification,
    deviceId,
    loadOperationalState,
    now,
    online,
    operational,
    status,
  ]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        await database.open();
        if (disposed) return;
        const cached = readCachedSession();
        const bearer = readSessionBearer();
        if (cached !== null) {
          if (config.offlineAuthorizationVerification === null) {
            clearSessionBearer();
            setError(
              "Kunci verifikasi offline belum dikonfigurasi. Cache dan outbox dipertahankan; pulihkan konfigurasi sebelum melanjutkan.",
            );
            setStatus("ERROR");
            return;
          }
          const cachedContext =
            cached.access_state === "RECOVERY_ONLY"
              ? await validateCachedRecoverySession(
                  cached.operational.terminal.id,
                  deviceId,
                  cached,
                  config.offlineAuthorizationVerification,
                )
              : await validateCachedSession(
                  cached.operational.terminal.id,
                  deviceId,
                  cached,
                  config.offlineAuthorizationVerification,
                  now(),
                );
          setOperational(cachedContext);
          setRecoveryRequired(cached.recovery_cause === "AUTHORITY_REVOKED");
          setTerminalId(cached.operational.terminal.id);
          await loadOperationalState(cachedContext);
          if (bearer !== null) {
            await connect({ bearer, terminalId: cached.operational.terminal.id });
          } else if (!disposed) {
            setStatus("LOCKED");
          }
        } else {
          setStatus("SIGNED_OUT");
        }
      } catch (initializationError: unknown) {
        if (!disposed) {
          setError(messageFromError(initializationError));
          setStatus("ERROR");
        }
      }
    })();
    return () => {
      disposed = true;
      database.close();
    };
  }, [
    config.offlineAuthorizationVerification,
    connect,
    database,
    deviceId,
    loadOperationalState,
    now,
  ]);

  useEffect(() => {
    const onlineListener = () => setOnline(true);
    const offlineListener = () => setOnline(false);
    window.addEventListener("online", onlineListener);
    window.addEventListener("offline", offlineListener);
    return () => {
      window.removeEventListener("online", onlineListener);
      window.removeEventListener("offline", offlineListener);
    };
  }, []);

  useEffect(() => {
    if (status !== "READY" || operational === null) return;
    let timerId: number | undefined;
    const lockWhenExpired = () => {
      const expiresAt = new Date(operational.auth.offline_valid_until).getTime();
      const remaining = expiresAt - now().getTime();
      if (Number.isFinite(remaining) && remaining > 0) {
        timerId = window.setTimeout(lockWhenExpired, Math.min(remaining, 2_147_000_000));
        return;
      }
      clearSessionBearer();
      syncRuntimeRef.current = null;
      setStatus("LOCKED");
      setError("Izin offline sudah kedaluwarsa. Sambungkan perangkat untuk masuk kembali.");
    };
    lockWhenExpired();
    return () => {
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [now, operational, status]);

  useEffect(() => {
    if (status !== "READY" || !online) return;
    void runSync();
    const interval = window.setInterval(() => void runSync(), 30_000);
    return () => window.clearInterval(interval);
  }, [online, runSync, status]);

  const value = useMemo<PosRuntimeValue>(
    () => ({
      status,
      error,
      database,
      deviceId,
      terminalId,
      online,
      operational,
      activeShift,
      sync,
      recoveryRequired,
      connect,
      getOperationTimestamp,
      quickLock,
      recoverOutbox,
      signOut,
      runSync,
      refreshOperationalState,
      searchReturnableSales,
      completeReturn,
    }),
    [
      activeShift,
      connect,
      completeReturn,
      database,
      deviceId,
      error,
      online,
      operational,
      quickLock,
      recoverOutbox,
      recoveryRequired,
      refreshOperationalState,
      runSync,
      searchReturnableSales,
      signOut,
      status,
      sync,
      terminalId,
      getOperationTimestamp,
    ],
  );

  return <PosRuntimeContext.Provider value={value}>{children}</PosRuntimeContext.Provider>;
}

export function usePosRuntime(): PosRuntimeValue {
  const value = useContext(PosRuntimeContext);
  if (value === null) throw new Error("usePosRuntime harus berada di PosRuntimeProvider.");
  return value;
}

/** Test seam for focused route/component tests without opening IndexedDB. */
export function PosRuntimeValueProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: PosRuntimeValue;
}) {
  return <PosRuntimeContext.Provider value={value}>{children}</PosRuntimeContext.Provider>;
}
