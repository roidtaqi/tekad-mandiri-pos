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

export function usePosCart(businessId: string) {
  const [cart, setCart] = useState<Cart>(() => createCart(businessId));

  const addScannedItem = useCallback((result: ProductLookupResult) => {
    setCart(prev => addItem(prev, result, "1"));
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
