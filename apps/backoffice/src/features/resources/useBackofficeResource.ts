import { useCallback, useEffect, useState } from "react";

import type { BackofficeResource } from "../../runtime/resource-gateway";
import { useBackofficeRuntime } from "../../runtime/RuntimeContext";

export type ResourceState<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly error: unknown; readonly status: "error" }
  | { readonly data: T; readonly status: "success" };

export function useBackofficeResource<T>(
  resource: BackofficeResource,
  enabled = true,
): ResourceState<T> & { readonly retry: () => void } {
  const { resourceGateway } = useBackofficeRuntime();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ status: "idle" });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void resourceGateway
      .get<T>(resource, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ data, status: "success" });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ error, status: "error" });
        }
      });

    return () => controller.abort();
  }, [enabled, resource, resourceGateway, revision]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  return { ...state, retry };
}
