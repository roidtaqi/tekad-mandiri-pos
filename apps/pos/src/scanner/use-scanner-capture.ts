import { useEffect, useRef } from "react";

export type ScannerCaptureResult<T> =
  | { type: "SUCCESS"; barcode: string; payload: T }
  | { type: "FAILURE"; barcode: string; error: string };

export interface UseScannerCaptureOptions<T> {
  /**
   * The lookup boundary function called when a scan terminates.
   * Expected to throw if the product is not found, or return the payload.
   */
  onLookup: (barcode: string) => Promise<T>;
  
  /**
   * Called with the result of the lookup.
   */
  onResult?: (result: ScannerCaptureResult<T>) => void;
  
  /**
   * The key that indicates a scan stream is complete. Defaults to "Enter".
   */
  terminator?: string;
  
  /**
   * Maximum time between keystrokes to be considered part of the same scan.
   * A physical scanner usually sends characters very quickly (<20ms).
   * Defaults to 50ms.
   */
  timeoutMs?: number;
  
  /**
   * Whether the scanner listener is active.
   */
  enabled?: boolean;
}

export function useScannerCapture<T>({
  onLookup,
  onResult,
  terminator = "Enter",
  timeoutMs = 50,
  enabled = true,
}: UseScannerCaptureOptions<T>) {
  const buffer = useRef("");
  const lastKeyTime = useRef(0);
  const isProcessing = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not capture if the user is typing in an input element
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      const now = Date.now();

      // Reset buffer if the gap between keystrokes is too large
      if (now - lastKeyTime.current > timeoutMs) {
        buffer.current = "";
      }
      lastKeyTime.current = now;

      if (e.key === terminator) {
        const barcode = buffer.current;
        buffer.current = "";

        if (barcode && !isProcessing.current) {
          // Prevent default navigation/form submission side effects on terminator
          e.preventDefault(); 
          
          isProcessing.current = true;
          
          onLookup(barcode)
            .then((payload) => {
              onResult?.({ type: "SUCCESS", barcode, payload });
            })
            .catch((err: any) => {
              onResult?.({ type: "FAILURE", barcode, error: err.message ?? "Unknown error" });
            })
            .finally(() => {
              // Scanner becomes ready again
              isProcessing.current = false;
            });
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Collect printable characters
        buffer.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onLookup, onResult, terminator, timeoutMs]);
}
