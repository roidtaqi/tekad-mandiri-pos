// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FirstRunSetup } from "./FirstRunSetup";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FirstRunSetup Component", () => {
  it("submits setup token via X-Kastur-Setup-Token header and owner password, then logs in seamlessly", async () => {
    let capturedRequest: RequestInit | undefined;

    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = init;
      return Response.json(
        {
          business_id: "biz-1",
          business_name: "Toko Tekad Mandiri",
          session_secret: "secret-session-token-32-chars-long",
          terminal_name: "Kasir 1",
        },
        { status: 201 },
      );
    });

    vi.stubGlobal("fetch", mockFetch);

    const onComplete = vi.fn();

    render(
      <FirstRunSetup
        apiBaseUrl="https://api.kastur.test"
        onComplete={onComplete}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^Kunci Aktivasi/i), {
      target: { value: "railway-secret-setup-key" },
    });

    fireEvent.change(screen.getByLabelText(/Nama Bisnis \/ Toko/i), {
      target: { value: "Toko Berkah Utama" },
    });

    fireEvent.change(screen.getByLabelText(/Password Pemilik/i), {
      target: { value: "Password123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Inisialisasi & Masuk ke Back Office/i }));

    // 1. Verify header has X-Kastur-Setup-Token and credentials include
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.credentials).toBe("include");
    const headers = new Headers(capturedRequest?.headers);
    expect(headers.get("x-kastur-setup-token")).toBe("railway-secret-setup-key");

    // 2. Verify JSON body does NOT contain setup_token and DOES contain owner_password
    const body = JSON.parse(String(capturedRequest?.body)) as Record<string, unknown>;
    expect(body.setup_token).toBeUndefined();
    expect(body.business_name).toBe("Toko Berkah Utama");
    expect(body.owner_password).toBe("Password123!");

    // 3. Verify onComplete is triggered without raw secret
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith();
    });
  });
});
