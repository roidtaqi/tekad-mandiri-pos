import { hasCachedPermission } from "@kastur/auth-client";
import { Link } from "react-router-dom";
import { EmptyState, Heading, Stack, Surface, Text } from "@kastur/ui";

import { useAuthContext } from "../auth/AuthContext";

export function SettingsPage() {
  const authContext = useAuthContext();
  const canReadUsers = hasCachedPermission(authContext, "user.read");
  const canReadTerminals = hasCachedPermission(authContext, "settings.read");

  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Heading level={1} size="h1">
          Settings
        </Heading>
        <Text tone="secondary">Akses pengguna dan terminal bisnis.</Text>
      </Stack>

      {!canReadUsers && !canReadTerminals ? (
        <EmptyState
          description="Sesi Anda tidak memiliki izin user.read atau settings.read."
          title="Akses Ditolak"
        />
      ) : (
        <div className="settings-grid">
          {canReadUsers ? (
            <Link className="settings-link" to="/settings/users">
              <Surface elevation={1} padding="spacious">
                <Heading level={2} size="h2">
                  User Access
                </Heading>
                <Text tone="secondary">Lihat membership, peran, status, dan sesi pengguna.</Text>
              </Surface>
            </Link>
          ) : null}
          {canReadTerminals ? (
            <Link className="settings-link" to="/settings/terminals">
              <Surface elevation={1} padding="spacious">
                <Heading level={2} size="h2">
                  Terminal
                </Heading>
                <Text tone="secondary">Lihat terminal, lokasi, status, dan shift aktif.</Text>
              </Surface>
            </Link>
          ) : null}
        </div>
      )}
    </Stack>
  );
}
