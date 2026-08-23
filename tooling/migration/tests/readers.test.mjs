import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseMigrationManifest } from "../manifest.mjs";
import { parseCsv, readCatalogCsv, readIntegratedPosJson, readInventoryPricingJson } from "../readers.mjs";
import { parseLosslessJson } from "../support.mjs";

const fixtures = new URL("./fixtures/", import.meta.url);

test("inventory JSON reader keeps authoritative decimal literals as strings", async () => {
  const text = await readFile(new URL("inventory-pricing.json", fixtures), "utf8");
  const source = readInventoryPricingJson(parseLosslessJson(text), "inventory-main");

  assert.equal(source.products[0].units[0].cost, "12.34000001");
  assert.equal(source.products[0].units[0].price, "20.25");
  assert.equal(source.products[0].units[0].conversion_to_base, "1");
  assert.equal(source.issues.length, 0);
});

test("integrated POS reader reports and discards credentials, roles, sync state, and history", async () => {
  const text = await readFile(new URL("integrated-pos.json", fixtures), "utf8");
  const source = readIntegratedPosJson(parseLosslessJson(text), "pos-main");

  assert.deepEqual(source.excluded, {
    credential_records: 1,
    user_records: 1,
    role_records: 1,
    sync_state_records: 1,
    operational_history_records: 1,
  });
  assert.equal(source.products[0].stock[0].quantity, "5.5");
  assert.equal(JSON.stringify(source).includes("1234"), false);
  assert.equal(JSON.stringify(source).includes("legacy-sync"), false);
});

test("CSV reader supports quoted values and preserves decimal strings", () => {
  const source = readCatalogCsv(
    'product_id,sku,name,unit_id,unit_name,conversion_to_base,manual_cost,active_selling_price,barcode\n"p,1",SKU-1,"Teh, Manis",u-1,pcs,1.00000000,7.1000,10.5000,8991\n',
    "sheet",
  );

  assert.equal(source.products[0].legacy_product_id, "p,1");
  assert.equal(source.products[0].name, "Teh, Manis");
  assert.equal(source.products[0].units[0].cost, "7.1");
  assert.equal(source.products[0].units[0].price, "10.5");
});

test("CSV parser rejects duplicate headers", () => {
  assert.throws(() => parseCsv("sku,sku\nA,B\n"), /duplicate headers/u);
});

test("manifest requires explicit migration policies and rejects credential material", () => {
  assert.throws(
    () => parseMigrationManifest({ schema_version: 1, pin: "1234" }),
    /forbidden/u,
  );
});
