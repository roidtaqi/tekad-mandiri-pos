import { describe, expect, it, vi } from "vitest";

import { fetchAuthContext, revokePosSession } from "./auth-api.js";

describe("POS auth API", () => {
  it("binds context and logout requests to the personal session, device, and terminal", async () => {
    const calls: Array<{ readonly init?: RequestInit; readonly url: string }> = [];
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      calls.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      if (String(input).endsWith("/context")) {
        return new Response(
          JSON.stringify({
            data: {
              user: { id: "user-1", display_name: "Kasir" },
              membership: { business_id: "business-1", status: "ACTIVE" },
              primary_role: "CASHIER",
              permissions: ["workspace.pos.access"],
              authorization_version: 1,
              offline_valid_until: "2026-08-24T00:00:00.000Z",
              default_location_id: "location-1",
              server_time: "2026-08-23T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(null, { status: 204 });
    });

    await fetchAuthContext(
      "https://api.example.test",
      "personal-bearer",
      "device-1",
      "terminal-1",
      fetchImplementation,
    );
    await revokePosSession(
      "https://api.example.test",
      "personal-bearer",
      "device-1",
      "terminal-1",
      fetchImplementation,
    );

    expect(calls.map(({ url }) => url)).toEqual([
      "https://api.example.test/api/v1/auth/context",
      "https://api.example.test/api/v1/auth/logout",
    ]);
    for (const { init } of calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer personal-bearer");
      expect(headers.get("X-Kastur-Device-Id")).toBe("device-1");
      expect(headers.get("X-Terminal-Id")).toBe("terminal-1");
    }
    expect(calls[1]?.init?.method).toBe("POST");
    expect(calls[1]?.init?.keepalive).toBe(true);
  });
});
