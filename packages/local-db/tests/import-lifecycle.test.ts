import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("module lifecycle", () => {
  it("does not open IndexedDB on import or construction", async () => {
    const indexedDB = new IDBFactory();
    vi.stubGlobal("indexedDB", indexedDB);
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);
    vi.resetModules();

    const localDatabase = await import("@kastur/local-db");

    expect(await indexedDB.databases()).toEqual([]);

    const pos = localDatabase.createPosLocalDatabase();
    const backoffice = localDatabase.createBackOfficeLocalDatabase();

    expect(pos.isOpen()).toBe(false);
    expect(backoffice.isOpen()).toBe(false);
    expect(await indexedDB.databases()).toEqual([]);

    pos.close();
    backoffice.close();
  });
});
