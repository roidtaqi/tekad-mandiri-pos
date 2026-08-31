// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FirstRunSetup } from "./FirstRunSetup";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FirstRunSetup Component", () => {
  it("submits setup token via X-Kastur-Setup-Token header only (not in JSON body)", async () => {
    let capturedRequest: RequestInit | undefined;

    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = init;
      return Response.json(
        {
          business_id: "biz-1",
          business_name: "Toko Kastur",
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

    fireEvent.change(screen.getByLabelText(/Kunci Inisialisasi Server/i), {
      target: { value: "railway-secret-setup-key" },
    });

    fireEvent.change(screen.getByLabelText(/Nama Bisnis \/ Toko/i), {
      target: { value: "Toko Berkah Utama" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Inisialisasi & Buat Toko/i }));

    // 1. Verify header has X-Kastur-Setup-Token
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(capturedRequest).toBeDefined();
    const headers = new Headers(capturedRequest?.headers);
    expect(headers.get("x-kastur-setup-token")).toBe("railway-secret-setup-key");

    // 2. Verify JSON body does NOT contain setup_token
    const body = JSON.parse(String(capturedRequest?.body)) as Record<string, unknown>;
    expect(body.setup_token).toBeUndefined();
    expect(body.business_name).toBe("Toko Berkah Utama");

    // 3. Verify success screen shows the POS session code and actions
    expect(await screen.findByText(/Toko Berhasil Diinisialisasi!/i)).toBeDefined();
    expect(screen.getByText("secret-session-token-32-chars-long")).toBeDefined();
    expect(screen.getByRole("button", { name: /Salin Kode Sesi POS/i })).toBeDefined();

    // 4. Click "Masuk ke Back Office Sekarang" triggers onComplete with session secret
    fireEvent.click(screen.getByRole("button", { name: /Masuk ke Back Office Sekarang/i }));
    expect(onComplete).toHaveBeenCalledWith("secret-session-token-32-chars-long");
  });
});

