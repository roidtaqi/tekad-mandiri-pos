import { Route, Routes } from "react-router-dom";

import { Heading, Stack, Surface, Text } from "@kastur/ui";

function PlaceholderShell() {
  return (
    <main className="ks-root app-shell" aria-labelledby="app-title">
      <Surface
        className="app-shell__surface"
        elevation={1}
        padding="spacious"
      >
        <Stack align="center" gap={3}>
          <Text as="span" size="caption" tone="muted" weight="bold">
            Kastur Retail System
          </Text>
          <Heading id="app-title" level={1} size="display">
            Kastur POS
          </Heading>
          <Text tone="secondary">Fondasi aplikasi siap.</Text>
        </Stack>
      </Surface>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<PlaceholderShell />} />
    </Routes>
  );
}
