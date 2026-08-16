import * as authClient from "@kastur/auth-client";
import * as config from "@kastur/config";
import { SYSTEM_HEALTH_PATH } from "@kastur/contracts";
import * as domain from "@kastur/domain";
import * as localDb from "@kastur/local-db";
import * as observability from "@kastur/observability";
import * as syncClient from "@kastur/sync-client";
import * as ui from "@kastur/ui";
import { describe, expect, it } from "vitest";

describe("shared workspace boundaries", () => {
  it("resolves every shared package through its public entry point", () => {
    const packageModules = [
      authClient,
      config,
      domain,
      localDb,
      observability,
      syncClient,
      ui,
    ];

    expect(packageModules).toHaveLength(7);
    expect(SYSTEM_HEALTH_PATH).toBe("/api/v1/system/health");
  });
});
