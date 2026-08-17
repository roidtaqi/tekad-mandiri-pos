/** @vitest-environment happy-dom */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { useScannerCapture } from "./use-scanner-capture";

describe("useScannerCapture", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const triggerKey = (key: string, target?: HTMLElement) => {
    const event = new KeyboardEvent("keydown", { key });
    if (target) {
      Object.defineProperty(event, 'target', { value: target, enumerable: true });
    }
    window.dispatchEvent(event);
  };

  it("captures a character stream and calls onLookup and onResult", async () => {
    const onLookup = vi.fn().mockResolvedValue({ name: "Test Product" });
    const onResult = vi.fn();

    renderHook(() =>
      useScannerCapture({
        onLookup,
        onResult,
        terminator: "Enter",
      })
    );

    act(() => {
      triggerKey("1");
      triggerKey("2");
      triggerKey("3");
      triggerKey("Enter");
    });

    expect(onLookup).toHaveBeenCalledWith("123");
    
    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({
        type: "SUCCESS",
        barcode: "123",
        payload: { name: "Test Product" },
      });
    });
  });

  it("proves repeated completed captures independently emit the same result without being swallowed", async () => {
    const onLookup = vi.fn().mockResolvedValue({ name: "Product A" });
    const onResult = vi.fn();

    renderHook(() =>
      useScannerCapture({
        onLookup,
        onResult,
      })
    );

    act(() => {
      triggerKey("9");
      triggerKey("Enter");
    });

    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({
        type: "SUCCESS",
        barcode: "9",
        payload: { name: "Product A" },
      });
    });

    act(() => {
      triggerKey("9");
      triggerKey("Enter");
    });

    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(2);
      expect(onResult).toHaveBeenLastCalledWith({
        type: "SUCCESS",
        barcode: "9",
        payload: { name: "Product A" },
      });
    });
  });

  it("emits lightweight failure result for unknown barcode", async () => {
    const onLookup = vi.fn().mockRejectedValue(new Error("Not found"));
    const onResult = vi.fn();

    renderHook(() =>
      useScannerCapture({
        onLookup,
        onResult,
      })
    );

    act(() => {
      triggerKey("0");
      triggerKey("0");
      triggerKey("7");
      triggerKey("Enter");
    });

    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({
        type: "FAILURE",
        barcode: "007",
        error: "Not found",
      });
    });
  });

  it("preserves exact barcode including leading zeroes", async () => {
    const onLookup = vi.fn().mockResolvedValue(true);

    renderHook(() =>
      useScannerCapture({
        onLookup,
      })
    );

    act(() => {
      triggerKey("0");
      triggerKey("0");
      triggerKey("1");
      triggerKey("2");
      triggerKey("3");
      triggerKey("Enter");
    });

    expect(onLookup).toHaveBeenCalledWith("00123");
  });

  it("does not capture input when an input element is focused", () => {
    const onLookup = vi.fn();

    renderHook(() =>
      useScannerCapture({
        onLookup,
      })
    );

    const input = document.createElement("input");
    
    act(() => {
      triggerKey("1", input);
      triggerKey("Enter", input);
    });

    expect(onLookup).not.toHaveBeenCalled();
  });
});
