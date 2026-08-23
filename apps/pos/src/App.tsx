import { Heading, Spinner } from "@kastur/ui";

import { SessionEntry } from "./auth/SessionEntry.js";
import { PosRoutes } from "./routes/PosRoutes.js";
import {
  PosRuntimeProvider,
  type PosRuntimeDependencies,
  usePosRuntime,
} from "./runtime/PosRuntimeProvider.js";

function PosApplication() {
  const runtime = usePosRuntime();
  if (runtime.status === "INITIALIZING" && runtime.operational === null) {
    return (
      <main className="pos-splash" aria-labelledby="pos-splash-title">
        <Spinner label="Membuka database lokal" size="large" />
        <Heading id="pos-splash-title" level={1}>Kastur POS</Heading>
      </main>
    );
  }

  if (runtime.operational === null) return <SessionEntry />;
  const locked = runtime.status !== "READY";
  return (
    <>
      <div
        aria-hidden={locked || undefined}
        className={locked ? "pos-runtime is-locked" : "pos-runtime"}
      >
        <PosRoutes
          key={`${runtime.operational.business.id}:${runtime.operational.auth.user.id}`}
        />
      </div>
      {locked ? <SessionEntry overlay /> : null}
    </>
  );
}

export function App({
  runtimeDependencies,
}: {
  readonly runtimeDependencies?: PosRuntimeDependencies;
}) {
  return (
    <PosRuntimeProvider
      {...(runtimeDependencies === undefined ? {} : { dependencies: runtimeDependencies })}
    >
      <PosApplication />
    </PosRuntimeProvider>
  );
}
