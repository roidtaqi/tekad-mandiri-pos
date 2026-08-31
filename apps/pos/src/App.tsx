import { Heading, Spinner } from "@kastur/ui";

import { SessionEntry } from "./auth/SessionEntry.js";
import { PosRoutes } from "./routes/PosRoutes.js";
import {
  PosRuntimeProvider,
  type PosRuntimeDependencies,
  usePosRuntime,
} from "./runtime/PosRuntimeProvider.js";

export function PosApplication() {
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
  if (runtime.status !== "READY") return <SessionEntry overlay />;
  return (
    <div className="pos-runtime">
      <PosRoutes
        key={`${runtime.operational.business.id}:${runtime.operational.auth.user.id}`}
      />
    </div>
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
