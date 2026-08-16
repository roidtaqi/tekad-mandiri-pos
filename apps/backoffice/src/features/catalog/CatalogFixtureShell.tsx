import { CatalogContext } from "./CatalogContext";
import { MockCatalogGateway } from "./MockCatalogGateway";
import CatalogRoutes from "./CatalogRoutes";
import { Surface, Stack, Text, Heading } from "@kastur/ui";
import { AuthContext } from "../auth/AuthContext";
import type { AuthContextResponse } from "@kastur/contracts";

const gateway = new MockCatalogGateway();

const mockAuthContext: AuthContextResponse = {
  user: { id: "dev-user", display_name: "Dev User" },
  membership: { business_id: "dev-business", status: "ACTIVE" },
  primary_role: "OWNER",
  permissions: ["product.read", "product.create"],
  authorization_version: 1,
  offline_valid_until: new Date(Date.now() + 86400000).toISOString(),
  default_location_id: "loc-1",
  server_time: new Date().toISOString()
};

export default function CatalogFixtureShell() {
  return (
    <AuthContext.Provider value={mockAuthContext}>
      <CatalogContext.Provider value={gateway}>
        <main className="ks-root app-shell" aria-labelledby="app-title">
          <Surface
            className="app-shell__surface"
            elevation={1}
            padding="spacious"
          >
            <Stack align="start" gap={4}>
              <Stack gap={1}>
                <Text as="span" size="caption" tone="muted" weight="bold">
                  Kastur Back Office
                </Text>
                <Heading id="app-title" level={1} size="display">
                  Produk active context (DEV)
                </Heading>
              </Stack>
              
              <CatalogRoutes />
            </Stack>
          </Surface>
        </main>
      </CatalogContext.Provider>
    </AuthContext.Provider>
  );
}
