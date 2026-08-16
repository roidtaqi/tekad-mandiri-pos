import { ReactNode } from "react";
import { AuthContextResponse } from "@kastur/contracts";
import { CatalogGateway } from "./gateway";
import { EmptyState } from "@kastur/ui";
import { AuthContext } from "../auth/AuthContext";
import { CatalogContext } from "./CatalogContext";

export interface CatalogWorkspaceProps {
  authContext: AuthContextResponse | null;
  catalogGateway: CatalogGateway | null;
  children: ReactNode;
}

export function CatalogWorkspace({ authContext, catalogGateway, children }: CatalogWorkspaceProps) {
  if (!authContext || !catalogGateway) {
    return (
      <EmptyState 
        title="Katalog belum terhubung ke runtime aplikasi." 
        description="Runtime produksi belum dikonfigurasi." 
      />
    );
  }

  return (
    <AuthContext.Provider value={authContext}>
      <CatalogContext.Provider value={catalogGateway}>
        {children}
      </CatalogContext.Provider>
    </AuthContext.Provider>
  );
}
