// @ts-check

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrations.mjs";

const configuredAdminUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithPostgres = configuredAdminUrl === undefined ? describe.skip : describe;

/** @type {Client | undefined} */
let adminClient;
/** @type {string | undefined} */
let childDatabaseName;
/** @type {string | undefined} */
let childDatabaseUrl;
/** @type {Client | undefined} */
let client;

function requireSafeAdminUrl() {
  if (configuredAdminUrl === undefined || configuredAdminUrl.length === 0) {
    throw new Error("TEST_DATABASE_URL is required for database integration tests.");
  }
  return new URL(configuredAdminUrl);
}

/** @param {string} databaseName */
function quoteGeneratedDatabaseName(databaseName) {
  if (!/^kastur_migration_test_[0-9a-f]{32}$/u.test(databaseName)) {
    throw new Error(`Refusing unsafe generated database name: ${databaseName}`);
  }
  return `"${databaseName}"`;
}

function requireChildDatabaseUrl() {
  if (childDatabaseUrl === undefined) {
    throw new Error("childDatabaseUrl is not initialized.");
  }
  return childDatabaseUrl;
}

const EXPECTED_PERMISSIONS = [
  { o: '000000000001', c: 'workspace.backoffice.access', r: 'LOW', d: 'Access the Back Office workspace.' },
  { o: '000000000002', c: 'workspace.pos.access', r: 'LOW', d: 'Access the POS workspace.' },
  { o: '000000000003', c: 'product.read', r: 'LOW', d: 'Read product master data.' },
  { o: '000000000004', c: 'product.create', r: 'MEDIUM', d: 'Create products.' },
  { o: '000000000005', c: 'product.update', r: 'MEDIUM', d: 'Update mutable product master data.' },
  { o: '000000000006', c: 'product.deactivate', r: 'HIGH', d: 'Deactivate products and stop future selling availability.' },
  { o: '000000000007', c: 'product.unit.manage', r: 'MEDIUM', d: 'Manage product units and conversions.' },
  { o: '000000000008', c: 'product.barcode.manage', r: 'MEDIUM', d: 'Manage product barcodes.' },
  { o: '000000000009', c: 'product.supplier.manage', r: 'MEDIUM', d: 'Manage product-to-supplier associations.' },
  { o: '000000000010', c: 'purchase.read', r: 'LOW', d: 'Read purchasing records.' },
  { o: '000000000011', c: 'purchase.create', r: 'MEDIUM', d: 'Create purchase drafts.' },
  { o: '000000000012', c: 'purchase.update_draft', r: 'MEDIUM', d: 'Update purchase drafts.' },
  { o: '000000000013', c: 'purchase.receive', r: 'MEDIUM', d: 'Record physical goods receiving.' },
  { o: '000000000014', c: 'purchase.post', r: 'HIGH', d: 'Post/finalize purchases authoritatively.' },
  { o: '000000000015', c: 'purchase.correct', r: 'HIGH', d: 'Perform controlled purchase corrections.' },
  { o: '000000000016', c: 'supplier.read', r: 'LOW', d: 'Read supplier master data.' },
  { o: '000000000017', c: 'supplier.create', r: 'MEDIUM', d: 'Create suppliers.' },
  { o: '000000000018', c: 'supplier.update', r: 'MEDIUM', d: 'Update supplier master data.' },
  { o: '000000000019', c: 'supplier.return.create', r: 'MEDIUM', d: 'Create supplier returns.' },
  { o: '000000000020', c: 'supplier.claim.resolve', r: 'HIGH', d: 'Resolve supplier claims or discrepancies.' },
  { o: '000000000021', c: 'cost.read', r: 'HIGH', d: 'Read cost and valuation data.' },
  { o: '000000000022', c: 'cost.adjust', r: 'HIGH', d: 'Perform controlled manual cost adjustments.' },
  { o: '000000000023', c: 'cost.history.read', r: 'HIGH', d: 'Read cost history.' },
  { o: '000000000024', c: 'cost.reconciliation.read', r: 'HIGH', d: 'Read costing reconciliation information.' },
  { o: '000000000025', c: 'pricing.read', r: 'LOW', d: 'Read selling-price data.' },
  { o: '000000000026', c: 'pricing.calculate', r: 'MEDIUM', d: 'Use pricing and margin calculation capabilities.' },
  { o: '000000000027', c: 'pricing.proposal.create', r: 'MEDIUM', d: 'Create price proposals.' },
  { o: '000000000028', c: 'pricing.proposal.review', r: 'MEDIUM', d: 'Review price proposals.' },
  { o: '000000000029', c: 'pricing.approve', r: 'HIGH', d: 'Approve price proposals for publication.' },
  { o: '000000000030', c: 'pricing.direct_change', r: 'CRITICAL', d: 'Perform direct Owner-level price changes.' },
  { o: '000000000031', c: 'pricing.override_floor', r: 'CRITICAL', d: 'Override floor-price protection.' },
  { o: '000000000032', c: 'pricing.rule.manage', r: 'HIGH', d: 'Manage pricing governance rules.' },
  { o: '000000000033', c: 'pricing.history.read', r: 'LOW', d: 'Read pricing history.' },
  { o: '000000000034', c: 'promotion.manage', r: 'HIGH', d: 'Create or manage promotions affecting selling price.' },
  { o: '000000000035', c: 'inventory.read', r: 'LOW', d: 'Read inventory balances.' },
  { o: '000000000036', c: 'inventory.adjust', r: 'HIGH', d: 'Post inventory adjustments.' },
  { o: '000000000037', c: 'inventory.opname.create', r: 'MEDIUM', d: 'Create stock-opname/count sessions.' },
  { o: '000000000038', c: 'inventory.opname.post', r: 'HIGH', d: 'Post stock-opname variances.' },
  { o: '000000000039', c: 'inventory.history.read', r: 'LOW', d: 'Read inventory movement history.' },
  { o: '000000000040', c: 'inventory.integrity.read', r: 'MEDIUM', d: 'Read inventory integrity diagnostics.' },
  { o: '000000000041', c: 'inventory.initial_stock.manage', r: 'HIGH', d: 'Manage controlled initial stock records.' },
  { o: '000000000042', c: 'pos.use', r: 'LOW', d: 'Use the POS selling workspace.' },
  { o: '000000000043', c: 'transaction.create', r: 'MEDIUM', d: 'Create sales transactions.' },
  { o: '000000000044', c: 'transaction.complete', r: 'MEDIUM', d: 'Complete sales transactions.' },
  { o: '000000000045', c: 'transaction.history.read', r: 'LOW', d: 'Read transaction history subject to policy scope.' },
  { o: '000000000046', c: 'transaction.void', r: 'HIGH', d: 'Void eligible completed transactions.' },
  { o: '000000000047', c: 'transaction.reprice', r: 'HIGH', d: 'Perform controlled transaction repricing.' },
  { o: '000000000048', c: 'discount.apply', r: 'MEDIUM', d: 'Apply discounts within normal policy limits.' },
  { o: '000000000049', c: 'discount.override', r: 'HIGH', d: 'Override normal discount limits.' },
  { o: '000000000050', c: 'receipt.reprint', r: 'LOW', d: 'Reprint transaction receipts.' },
  { o: '000000000051', c: 'customer.attach', r: 'LOW', d: 'Attach an existing customer context to a transaction.' },
  { o: '000000000052', c: 'shift.open', r: 'MEDIUM', d: 'Open an operational shift.' },
  { o: '000000000053', c: 'shift.close', r: 'MEDIUM', d: 'Close an operational shift.' },
  { o: '000000000054', c: 'shift.force_close', r: 'HIGH', d: 'Force-close a shift under exception conditions.' },
  { o: '000000000055', c: 'shift.read', r: 'LOW', d: 'Read shift information.' },
  { o: '000000000056', c: 'shift.review', r: 'MEDIUM', d: 'Review shift reconciliation and exceptions.' },
  { o: '000000000057', c: 'cash.read', r: 'HIGH', d: 'Read cash-control information.' },
  { o: '000000000058', c: 'cash.in', r: 'MEDIUM', d: 'Record authorized cash-in movements.' },
  { o: '000000000059', c: 'cash.out', r: 'HIGH', d: 'Record authorized cash-out movements.' },
  { o: '000000000060', c: 'cash.out.override', r: 'CRITICAL', d: 'Override normal cash-out controls.' },
  { o: '000000000061', c: 'cash.safe_drop', r: 'HIGH', d: 'Record a safe-drop cash movement.' },
  { o: '000000000062', c: 'payment.read', r: 'MEDIUM', d: 'Read payment records.' },
  { o: '000000000063', c: 'payment.record', r: 'MEDIUM', d: 'Record payments.' },
  { o: '000000000064', c: 'payment.reverse', r: 'HIGH', d: 'Reverse an existing payment through controlled flow.' },
  { o: '000000000065', c: 'payment.manual_confirm', r: 'HIGH', d: 'Manually confirm a payment when explicitly allowed.' },
  { o: '000000000066', c: 'refund.process', r: 'HIGH', d: 'Process an authorized refund.' },
  { o: '000000000067', c: 'refund.override_method', r: 'CRITICAL', d: 'Override normal refund-method controls.' },
  { o: '000000000068', c: 'user.read', r: 'MEDIUM', d: 'Read user identity and membership information.' },
  { o: '000000000069', c: 'user.create', r: 'HIGH', d: 'Create user identities or onboarding records.' },
  { o: '000000000070', c: 'user.update', r: 'HIGH', d: 'Update mutable user identity attributes.' },
  { o: '000000000071', c: 'user.deactivate', r: 'HIGH', d: 'Deactivate user access while preserving history.' },
  { o: '000000000072', c: 'role.read', r: 'LOW', d: 'Read role definitions and assignments.' },
  { o: '000000000073', c: 'role.assign', r: 'HIGH', d: 'Assign roles to business memberships.' },
  { o: '000000000074', c: 'role.manage', r: 'CRITICAL', d: 'Manage role definitions or role-governance configuration.' },
  { o: '000000000075', c: 'permission.read', r: 'LOW', d: 'Read the permission registry and effective grants.' },
  { o: '000000000076', c: 'permission.manage', r: 'CRITICAL', d: 'Manage permission definitions or privileged grants.' },
  { o: '000000000077', c: 'settings.read', r: 'LOW', d: 'Read business settings.' },
  { o: '000000000078', c: 'settings.update', r: 'HIGH', d: 'Update general business settings.' },
  { o: '000000000079', c: 'settings.pricing', r: 'HIGH', d: 'Change pricing-related settings.' },
  { o: '000000000080', c: 'settings.inventory', r: 'HIGH', d: 'Change inventory-related settings.' },
  { o: '000000000081', c: 'settings.payment', r: 'HIGH', d: 'Change payment-related settings.' },
  { o: '000000000082', c: 'settings.security', r: 'CRITICAL', d: 'Change security-sensitive settings.' },
  { o: '000000000083', c: 'settings.business', r: 'HIGH', d: 'Change core business-control settings.' },
  { o: '000000000084', c: 'audit.read', r: 'HIGH', d: 'Read broad audit history.' },
  { o: '000000000085', c: 'audit.export', r: 'HIGH', d: 'Export audit history.' },
  { o: '000000000086', c: 'audit.sensitive.read', r: 'HIGH', d: 'Read sensitive audit fields and events.' },
  { o: '000000000087', c: 'return.read', r: 'LOW', d: 'Read eligible Return records and history.' },
  { o: '000000000088', c: 'return.process', r: 'MEDIUM', d: 'Process a normal receipt-linked Return.' },
  { o: '000000000089', c: 'return.override_window', r: 'HIGH', d: 'Override the configured Return window with a reason.' },
  { o: '000000000090', c: 'return.no_receipt', r: 'HIGH', d: 'Process an exceptional Return without a linked receipt.' },
  { o: '000000000091', c: 'return.override_disposition', r: 'HIGH', d: 'Override normal Return disposition policy.' },
  { o: '000000000092', c: 'return.reject', r: 'MEDIUM', d: 'Reject a Return request with an auditable reason.' },
  { o: '000000000093', c: 'refund.override_amount', r: 'CRITICAL', d: 'Override the historically calculated refundable amount.' },
  { o: '000000000094', c: 'refund.reverse', r: 'CRITICAL', d: 'Reverse a completed Refund through a controlled event.' },
];

const ADMIN_EXCLUSIONS = new Set([
  'pricing.approve', 'pricing.direct_change', 'pricing.override_floor', 'pricing.rule.manage', 'promotion.manage',
  'discount.override', 'shift.force_close', 'cash.out.override', 'refund.override_method', 'user.deactivate',
  'role.assign', 'role.manage', 'permission.manage', 'settings.update', 'settings.pricing', 'settings.inventory',
  'settings.payment', 'settings.security', 'settings.business', 'audit.export', 'audit.sensitive.read',
  'refund.override_amount', 'refund.reverse'
]);

const CASHIER_INCLUSIONS = new Set([
  'workspace.pos.access', 'pos.use', 'transaction.create', 'transaction.complete', 'transaction.history.read',
  'payment.record', 'shift.open', 'shift.close', 'shift.read', 'receipt.reprint', 'discount.apply', 'customer.attach',
  'return.read', 'return.process', 'refund.process'
]);

describeWithPostgres("M1-002B: Permission Catalog and Built-in System Role Presets", () => {
  beforeAll(async () => {
    const adminUrl = requireSafeAdminUrl();
    adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();

    const databaseName = `kastur_migration_test_${randomUUID().replaceAll("-", "")}`;
    await adminClient.query(`CREATE DATABASE ${quoteGeneratedDatabaseName(databaseName)}`);
    adminUrl.pathname = `/${databaseName}`;

    childDatabaseName = databaseName;
    childDatabaseUrl = adminUrl.toString();

    // A. migration 000003 applies after 000001 and 000002.
    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied.length).toBeGreaterThan(0);
    expect(applied.map(a => a.filename)).toContain("000003_seed_permission_catalog_role_presets.sql");

    client = new Client({ connectionString: url });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
    if (adminClient && childDatabaseName) {
      await adminClient.query(`DROP DATABASE IF EXISTS ${quoteGeneratedDatabaseName(childDatabaseName)}`);
      await adminClient.end();
    }
  });

  it("B. migration history contains all three in correct order", async () => {
    const res = await client?.query(`SELECT filename FROM public.kastur_schema_migrations ORDER BY version ASC`);
    const filenames = res?.rows.map(r => r.filename) ?? [];
    const expectedPrefix = [
      "000001_create_core_businesses_locations.sql",
      "000002_create_identity_core_schema.sql",
      "000003_seed_permission_catalog_role_presets.sql",
      "000004_create_identity_devices_sessions_authorization_versions.sql",
      "000005_create_catalog_products_categories_brands.sql",
      "000006_create_product_units_barcodes.sql"
    ];
    expect(filenames.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);
  });

  it("C. permissions table contains exactly 94 rows", async () => {
    const res = await client?.query(`SELECT count(*) as count FROM identity.permissions`);
    expect(parseInt(res?.rows[0].count)).toBe(94);
  });

  it("D. every expected permission code exists exactly once", async () => {
    const res = await client?.query(`SELECT code FROM identity.permissions`);
    const dbCodes = new Set(res?.rows.map(r => r.code));
    for (const perm of EXPECTED_PERMISSIONS) {
      expect(dbCodes.has(perm.c)).toBe(true);
    }
    expect(dbCodes.size).toBe(94);
  });

  it("E. no unexpected permission code exists", async () => {
    const res = await client?.query(`SELECT code FROM identity.permissions`);
    const expectedCodes = new Set(EXPECTED_PERMISSIONS.map(p => p.c));
    for (const r of res?.rows ?? []) {
      expect(expectedCodes.has(r.code)).toBe(true);
    }
  });

  it("F. no *_limited duplicate permission variants exist", async () => {
    const res = await client?.query(`SELECT code FROM identity.permissions WHERE code LIKE '%_limited'`);
    expect(res?.rows.length).toBe(0);
  });

  it("G. every expected fixed UUID matches its catalog ordinal", async () => {
    const res = await client?.query(`SELECT id, code FROM identity.permissions`);
    const codeToId = new Map(res?.rows.map(r => [r.code, r.id]));
    for (const perm of EXPECTED_PERMISSIONS) {
      const expectedId = `44444444-4444-4444-8444-${perm.o}`;
      expect(codeToId.get(perm.c)).toBe(expectedId);
    }
  });

  it("H. permission #1 ID is correct", async () => {
    const res = await client?.query(`SELECT id FROM identity.permissions WHERE code = 'workspace.backoffice.access'`);
    expect(res?.rows[0].id).toBe('44444444-4444-4444-8444-000000000001');
  });

  it("I. permission #86 ID is correct", async () => {
    const res = await client?.query(`SELECT id FROM identity.permissions WHERE code = 'audit.sensitive.read'`);
    expect(res?.rows[0].id).toBe('44444444-4444-4444-8444-000000000086');
  });

  it("J. descriptions match the frozen seed catalog", async () => {
    const res = await client?.query(`SELECT code, description FROM identity.permissions`);
    const codeToDesc = new Map(res?.rows.map(r => [r.code, r.description]));
    for (const perm of EXPECTED_PERMISSIONS) {
      expect(codeToDesc.get(perm.c)).toBe(perm.d);
    }
  });

  it("K. risk levels match the frozen catalog", async () => {
    const res = await client?.query(`SELECT code, risk_level FROM identity.permissions`);
    const codeToRisk = new Map(res?.rows.map(r => [r.code, r.risk_level]));
    for (const perm of EXPECTED_PERMISSIONS) {
      expect(codeToRisk.get(perm.c)).toBe(perm.r);
    }
  });

  it("L. distribution is exactly: LOW 18, MEDIUM 28, HIGH 39, CRITICAL 9", async () => {
    const res = await client?.query(`SELECT risk_level, count(*) as count FROM identity.permissions GROUP BY risk_level`);
    const counts = new Map(res?.rows.map(r => [r.risk_level, parseInt(r.count)]));
    expect(counts.get('LOW')).toBe(18);
    expect(counts.get('MEDIUM')).toBe(28);
    expect(counts.get('HIGH')).toBe(39);
    expect(counts.get('CRITICAL')).toBe(9);
  });

  it("M. invalid risk_level is rejected by PostgreSQL", async () => {
    await expect(client?.query(`
      INSERT INTO identity.permissions (id, code, risk_level, description)
      VALUES ($1, 'test.invalid', 'INVALID', 'Desc')
    `, [randomUUID()])).rejects.toThrow();
  });

  it("N. existing OWNER role row remains unchanged", async () => {
    const res = await client?.query(`SELECT * FROM identity.roles WHERE id = '11111111-1111-4111-8111-111111111111'`);
    expect(res?.rows[0].code).toBe('OWNER');
    expect(res?.rows[0].is_system).toBe(true);
    expect(res?.rows[0].status).toBe('ACTIVE');
  });

  it("O. existing ADMIN role row remains unchanged", async () => {
    const res = await client?.query(`SELECT * FROM identity.roles WHERE id = '22222222-2222-4222-8222-222222222222'`);
    expect(res?.rows[0].code).toBe('ADMIN');
    expect(res?.rows[0].is_system).toBe(true);
    expect(res?.rows[0].status).toBe('ACTIVE');
  });

  it("P. existing CASHIER role row remains unchanged", async () => {
    const res = await client?.query(`SELECT * FROM identity.roles WHERE id = '33333333-3333-4333-8333-333333333333'`);
    expect(res?.rows[0].code).toBe('CASHIER');
    expect(res?.rows[0].is_system).toBe(true);
    expect(res?.rows[0].status).toBe('ACTIVE');
  });

  it("Q. exactly three system roles still exist: OWNER, ADMIN, CASHIER", async () => {
    const res = await client?.query(`SELECT code FROM identity.roles WHERE is_system = TRUE`);
    const codes = res?.rows.map(r => r.code).sort() ?? [];
    expect(codes).toEqual(['ADMIN', 'CASHIER', 'OWNER']);
  });

  it("R. no SUPERVISOR role exists", async () => {
    const res = await client?.query(`SELECT * FROM identity.roles WHERE code = 'SUPERVISOR'`);
    expect(res?.rows.length).toBe(0);
  });

  it("S. OWNER has exactly 94 role_permissions", async () => {
    const res = await client?.query(`SELECT count(*) as count FROM identity.role_permissions WHERE role_id = '11111111-1111-4111-8111-111111111111'`);
    expect(parseInt(res?.rows[0].count)).toBe(94);
  });

  it("T. OWNER has every permission", async () => {
    const res = await client?.query(`
      SELECT p.code FROM identity.permissions p
      JOIN identity.role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = '11111111-1111-4111-8111-111111111111'
    `);
    const ownerCodes = new Set(res?.rows.map(r => r.code));
    for (const perm of EXPECTED_PERMISSIONS) {
      expect(ownerCodes.has(perm.c)).toBe(true);
    }
  });

  it("U. ADMIN has exactly 71 role_permissions", async () => {
    const res = await client?.query(`SELECT count(*) as count FROM identity.role_permissions WHERE role_id = '22222222-2222-4222-8222-222222222222'`);
    expect(parseInt(res?.rows[0].count)).toBe(71);
  });

  it("V. ADMIN has every expected allowed permission", async () => {
    const res = await client?.query(`
      SELECT p.code FROM identity.permissions p
      JOIN identity.role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = '22222222-2222-4222-8222-222222222222'
    `);
    const adminCodes = new Set(res?.rows.map(r => r.code));
    for (const perm of EXPECTED_PERMISSIONS) {
      if (!ADMIN_EXCLUSIONS.has(perm.c)) {
        expect(adminCodes.has(perm.c)).toBe(true);
      }
    }
  });

  it("W. ADMIN lacks exactly the 23 excluded permissions", async () => {
    const res = await client?.query(`
      SELECT p.code FROM identity.permissions p
      JOIN identity.role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = '22222222-2222-4222-8222-222222222222'
    `);
    const adminCodes = new Set(res?.rows.map(r => r.code));
    for (const code of ADMIN_EXCLUSIONS) {
      expect(adminCodes.has(code)).toBe(false);
    }
  });

  it("X. specifically verify ADMIN lacks pricing.approve, etc.", async () => {
    const res = await client?.query(`
      SELECT p.code FROM identity.permissions p
      JOIN identity.role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = '22222222-2222-4222-8222-222222222222'
      AND p.code IN ('pricing.approve', 'pricing.direct_change', 'pricing.override_floor', 'role.manage', 'permission.manage', 'shift.force_close')
    `);
    expect(res?.rows.length).toBe(0);
  });

  it("Y. CASHIER has exactly 15 role_permissions", async () => {
    const res = await client?.query(`SELECT count(*) as count FROM identity.role_permissions WHERE role_id = '33333333-3333-4333-8333-333333333333'`);
    expect(parseInt(res?.rows[0].count)).toBe(15);
  });

  it("Z. CASHIER permission set exactly equals the locked 15-code set", async () => {
    const res = await client?.query(`
      SELECT p.code FROM identity.permissions p
      JOIN identity.role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = '33333333-3333-4333-8333-333333333333'
    `);
    const cashierCodes = new Set(res?.rows.map(r => r.code));
    expect(cashierCodes.size).toBe(CASHIER_INCLUSIONS.size);
    for (const code of CASHIER_INCLUSIONS) {
      expect(cashierCodes.has(code)).toBe(true);
    }
  });

  /**
   * @param {string} code
   * @param {boolean} expected
   */
  const checkCashierHas = async (code, expected) => {
    const res = await client?.query(`
      SELECT p.code FROM identity.permissions p
      JOIN identity.role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = '33333333-3333-4333-8333-333333333333' AND p.code = $1
    `, [code]);
    expect(res?.rows.length === 1).toBe(expected);
  };

  it("AA. CASHIER has workspace.pos.access", async () => {
    await checkCashierHas('workspace.pos.access', true);
  });

  it("AB. CASHIER does not have workspace.backoffice.access", async () => {
    await checkCashierHas('workspace.backoffice.access', false);
  });

  it("AC. CASHIER does not have cost.read", async () => {
    await checkCashierHas('cost.read', false);
  });

  it("AD. CASHIER does not have pricing.read", async () => {
    await checkCashierHas('pricing.read', false);
  });

  it("AE. CASHIER does not have inventory.adjust", async () => {
    await checkCashierHas('inventory.adjust', false);
  });

  it("AF. CASHIER does not have transaction.void", async () => {
    await checkCashierHas('transaction.void', false);
  });

  it("AG. CASHIER does not have discount.override", async () => {
    await checkCashierHas('discount.override', false);
  });

  it("AH. CASHIER does not have cash.read", async () => {
    await checkCashierHas('cash.read', false);
  });

  it("AI. CASHIER has normal refund.process authority", async () => {
    await checkCashierHas('refund.process', true);
  });

  it("AJ. CASHIER does not have user.read", async () => {
    await checkCashierHas('user.read', false);
  });

  it("AK. CASHIER does not have audit.read", async () => {
    await checkCashierHas('audit.read', false);
  });

  it("AL. no role_permission duplicates exist", async () => {
    const res = await client?.query(`
      SELECT role_id, permission_id, count(*) as count 
      FROM identity.role_permissions 
      GROUP BY role_id, permission_id 
      HAVING count(*) > 1
    `);
    expect(res?.rows.length).toBe(0);
  });

  it("AM. permission_overrides from M1-002A remains structurally intact", async () => {
    const res = await client?.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'identity' AND table_name = 'permission_overrides'
    `);
    expect(res?.rows.length).toBe(1);
  });

  it("AN. no M1-003 identity tables were added", async () => {
    const res = await client?.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'identity'
    `);
    const tables = res?.rows.map(r => r.table_name) ?? [];
    expect(tables).not.toContain("terminal_device_assignments");
    expect(tables).not.toContain("credentials");
  });

  it("AO. rerunning migrate applies nothing twice", async () => {
    const url = requireChildDatabaseUrl();
    const applied = await applyMigrations({ databaseUrl: url });
    expect(applied).toEqual([]);
  });
});
