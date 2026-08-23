import { ReactNode } from "react";
import { AuthContextResponse } from "@kastur/contracts";
import { CatalogGateway } from "./gateway";
import { AuthContext } from "../auth/AuthContext";
import { CatalogContext } from "./CatalogContext";

export interface CatalogWorkspaceProps {
  authContext: AuthContextResponse;
  catalogGateway: CatalogGateway;
  children: ReactNode;
}

export function CatalogWorkspace({ authContext, catalogGateway, children }: CatalogWorkspaceProps) {
  return (
    <AuthContext.Provider value={authContext}>
      <CatalogContext.Provider value={catalogGateway}>
        {children}
      </CatalogContext.Provider>
    </AuthContext.Provider>
  );
}
