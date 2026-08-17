import { useRef } from "react";
import { useReactToPrint } from "react-to-print";

export function useReceiptPrinter() {
  const receiptRef = useRef<HTMLDivElement>(null);

  const print = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: "Receipt",
    // We swallow errors so they don't crash the POS flow
    onPrintError: (error) => {
      console.error("Print failed:", error);
    },
  });

  return {
    receiptRef,
    print,
  };
}
