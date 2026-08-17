import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReceiptDocument } from "../src/receipt";
import type { ReceiptProps } from "../src/receipt";

describe("ReceiptDocument", () => {
  const mockProps: ReceiptProps = {
    transactionId: "TX-99",
    cashierName: "Budi",
    createdAt: "2026-08-18T10:00:00Z",
    storeName: "Toko Kastur",
    storeAddress: "Jl. Tes No 2",
    storePhone: "123",
    receiptFooter: "Makasih",
    items: [
      {
        name: "Item A",
        unitName: "Pcs",
        qty: "2.500000",
        price: "10000.0000",
        subtotal: "25000.0000",
        discount: "0",
      }
    ],
    subtotal: "25000.0000",
    discountTotal: "0",
    taxTotal: "0",
    total: "25000.0000",
    paid: "30000.0000",
    change: "5000.0000",
    payments: [{ method: "CASH", amount: "25000.0000" }],
    width: "58mm",
  };

  it("renders correctly with formatted values", () => {
    render(<ReceiptDocument {...mockProps} />);

    // Check store context
    expect(screen.getByText("Toko Kastur")).toBeTruthy();
    expect(screen.getByText("Jl. Tes No 2")).toBeTruthy();
    
    // Check fractional qty formatting (2.500000 -> 2,5)
    // Check money formatting (10000.0000 -> Rp 10.000 with nbps)
    expect(screen.getByText(/2,5\s*Pcs\s*x\s*Rp.*10\.000/)).toBeTruthy();
    expect(screen.getAllByText(/Rp.*25\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Rp.*30\.000/)).toBeTruthy(); // Paid
    expect(screen.getByText(/Rp\D*5\.000/)).toBeTruthy(); // Change
  });

  it("applies 80mm class when requested", () => {
    const { container } = render(<ReceiptDocument {...mockProps} width="80mm" />);
    expect((container.firstChild as HTMLElement).className).toContain("kastur-receipt-80");
  });
});
