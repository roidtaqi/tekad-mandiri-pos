import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import UiShowcase from "./UiShowcase";

describe("development-only UI showcase", () => {
  it("identifies itself as neutral development tooling", () => {
    const markup = renderToStaticMarkup(<UiShowcase />);

    expect(markup).toContain("KASTUR_UI_SHOWCASE_DEV_ONLY");
    expect(markup).toContain("Etalase Fondasi UI");
    expect(markup).toContain("Ini bukan layar bisnis Kastur");
  });
});
