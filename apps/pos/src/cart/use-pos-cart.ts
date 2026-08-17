import { useState, useCallback, useMemo } from "react";
import {
  Cart,
  CartTotals,
  createCart,
  addItem,
  setLineQuantity,
  removeLine,
  clearCart,
  calculateCartTotals,
} from "@kastur/domain";
import type { ProductLookupResult } from "@kastur/local-db";
import type { ScannerCaptureResult } from "../scanner/use-scanner-capture.js";

export function usePosCart(businessId: string) {
  const [cart, setCart] = useState<Cart>(() => createCart(businessId));

  const addScannedItem = useCallback((result: ScannerCaptureResult<ProductLookupResult>) => {
    if (result.type === "SUCCESS") {
      setCart(prev => addItem(prev, result.payload, "1"));
    }
  }, []);

  const changeQuantity = useCallback((lineKey: string, quantity: string) => {
    setCart(prev => setLineQuantity(prev, lineKey, quantity));
  }, []);

  const remove = useCallback((lineKey: string) => {
    setCart(prev => removeLine(prev, lineKey));
  }, []);

  const clear = useCallback(() => {
    setCart(prev => clearCart(prev));
  }, []);

  const totals: CartTotals = useMemo(() => calculateCartTotals(cart), [cart]);

  return {
    cart,
    totals,
    addScannedItem,
    changeQuantity,
    remove,
    clear,
  };
}
