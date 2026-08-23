/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PosNavigation } from "./PosNavigation.js";

describe("POS navigation", () => {
  it("renders only the five approved primary destinations", () => {
    render(<MemoryRouter initialEntries={["/kasir"]}><PosNavigation /></MemoryRouter>);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Kasir", "Tertahan", "Transaksi", "Retur", "Shift",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/kasir", "/tertahan", "/transaksi", "/retur", "/shift",
    ]);
  });
});
