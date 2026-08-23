import { createContext, useContext, type ReactNode } from "react";

import { usePosCart } from "../cart/use-pos-cart.js";
import { usePosRuntime } from "../runtime/PosRuntimeProvider.js";

type SellSessionValue = ReturnType<typeof usePosCart>;

const SellSessionContext = createContext<SellSessionValue | null>(null);

export function SellSessionProvider({ children }: { readonly children: ReactNode }) {
  const runtime = usePosRuntime();
  const businessId = runtime.operational?.business.id ?? "unavailable";
  const cart = usePosCart(businessId);
  return <SellSessionContext.Provider value={cart}>{children}</SellSessionContext.Provider>;
}

export function useSellSession(): SellSessionValue {
  const value = useContext(SellSessionContext);
  if (value === null) throw new Error("useSellSession harus berada di SellSessionProvider.");
  return value;
}
