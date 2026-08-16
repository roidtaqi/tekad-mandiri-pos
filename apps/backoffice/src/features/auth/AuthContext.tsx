import { createContext, useContext } from "react";
import type { AuthContextResponse } from "@kastur/contracts";

export const AuthContext = createContext<AuthContextResponse | null>(null);

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  // For safety in untested environments, we can return null if not provided
  return ctx;
}
