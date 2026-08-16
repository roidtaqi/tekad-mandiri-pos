import { Route, Routes } from "react-router-dom";

function PlaceholderShell() {
  return (
    <main className="app-shell" aria-labelledby="app-title">
      <p className="eyebrow">Kastur Retail System</p>
      <h1 id="app-title">Kastur POS</h1>
      <p className="status">Fondasi aplikasi siap.</p>
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
