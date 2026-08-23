import { createContext, useContext } from "react";
import type { AuthContextResponse } from "@kastur/contracts";

import type { CatalogGateway } from "../features/catalog/gateway";
import type { AuthenticatedHttpClient } from "./http";
import type { BackofficeResourceGateway } from "./resource-gateway";
import type { BackofficeCommandGateway } from "./command-gateway";

export interface BackofficeRuntime {
  readonly authContext: AuthContextResponse;
  readonly catalogGateway: CatalogGateway;
  readonly commandGateway: BackofficeCommandGateway;
  readonly httpClient: AuthenticatedHttpClient;
  readonly logout: () => void;
  readonly resourceGateway: BackofficeResourceGateway;
}

export const RuntimeContext = createContext<BackofficeRuntime | null>(null);

export function useBackofficeRuntime(): BackofficeRuntime {
  const runtime = useContext(RuntimeContext);
  if (runtime === null) {
    throw new Error("Back Office runtime is not available outside its composition root.");
  }
  return runtime;
}
