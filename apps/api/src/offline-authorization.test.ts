import { describe, expect, it } from "vitest";

import type { AuthenticatedRequestContext } from "./auth.js";
import {
  issueOfflineAuthorizationGrant,
  verifyOfflineAuthorizationGrant,
} from "./offline-authorization.js";

function context(): AuthenticatedRequestContext {
  return {
    authorization: {
      authorization_version: 7,
      default_location_id: "20000000-0000-4000-8000-000000000001",
      membership: {
        business_id: "10000000-0000-4000-8000-000000000001",
        status: "ACTIVE",
      },
      offline_valid_until: "2026-08-24T00:00:00.000Z",
      permissions: ["transaction.complete", "workspace.pos.access"],
      primary_role: "CASHIER",
      server_time: "2026-08-23T00:00:00.000Z",
      user: {
        display_name: "Kasir Satu",
        id: "30000000-0000-4000-8000-000000000001",
      },
    },
    device_id: "40000000-0000-4000-8000-000000000001",
    membership_id: "50000000-0000-4000-8000-000000000001",
    selected_terminal_id: "60000000-0000-4000-8000-000000000001",
    session_id: "70000000-0000-4000-8000-000000000001",
  };
}

describe("offline authorization signature", () => {
  it("issues a verifiable device/terminal-bound grant and rejects tampering", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    if (!("privateKey" in pair)) throw new Error("Expected an asymmetric key pair.");
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const environment = {
      OFFLINE_AUTH_SIGNING_KEY_ID: "offline-test-1",
      OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK: JSON.stringify(privateJwk),
    };
    const grant = await issueOfflineAuthorizationGrant(environment, context());

    expect(grant).toMatchObject({
      device_id: context().device_id,
      key_id: "offline-test-1",
      terminal_id: context().selected_terminal_id,
    });
    await expect(verifyOfflineAuthorizationGrant(environment, grant)).resolves.toBe(true);
    await expect(
      verifyOfflineAuthorizationGrant(environment, {
        ...grant,
        authorization: {
          ...grant?.authorization,
          permissions: ["pricing.approve", "workspace.pos.access"],
        },
      }),
    ).resolves.toBe(false);
  });

  it("does not issue an offline grant when the signing key is intentionally absent", async () => {
    await expect(issueOfflineAuthorizationGrant({}, context())).resolves.toBeUndefined();
  });
});
