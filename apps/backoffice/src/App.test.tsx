// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("Back Office shell", () => {
  it("renders the application identity", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText("Kastur Back Office")).toBeDefined();
  });

  it("production /products boundary does not spin indefinitely without runtime", async () => {
    render(
      <MemoryRouter initialEntries={["/products"]}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Katalog belum terhubung ke runtime aplikasi.")).toBeDefined();
    });
  });
});
