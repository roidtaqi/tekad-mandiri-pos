import { createContext, useContext } from "react";
import { CatalogGateway } from "./gateway";

export const CatalogContext = createContext<CatalogGateway | null>(null);

export function useCatalogGateway() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("CatalogGateway not provided");
  return ctx;
}
