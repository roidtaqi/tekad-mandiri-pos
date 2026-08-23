import { createContext, useContext } from "react";
import type { AuthContextResponse } from "@kastur/contracts";

export const AuthContext = createContext<AuthContextResponse | null>(null);

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("AuthContext is not available outside the Back Office runtime.");
  }
  return ctx;
}
