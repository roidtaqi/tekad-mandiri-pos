# Kastur Retail System — PRD v2
## Product Requirements Document — Foundation

**Status:** Draft / Source of Truth  
**Product:** Kastur Retail System  
**Target:** Toko retail/sembako dengan kemampuan penjualan eceran dan grosir  
**Product Model:** Satu ecosystem, dua workspace teknis  
**Workspace:** Kastur Back Office + Kastur POS

---

# 1. Product Vision

Kastur adalah sistem operasional retail yang membantu pemilik toko menjalankan aktivitas utama bisnis dari pengadaan barang hingga transaksi penjualan, dengan fokus pada:

- kemudahan penggunaan,
- akurasi harga,
- kontrol modal dan margin,
- pencatatan stok,
- purchasing,
- approval harga,
- transaksi kasir,
- auditability,
- dan kemampuan bekerja secara offline.

Kastur ditujukan terutama untuk:

- toko sembako,
- toko kelontong modern,
- minimarket kecil–menengah,
- general retail,

yang dapat melakukan penjualan:

- retail/eceran,
- semi-grosir,
- grosir,

tanpa membutuhkan mode aplikasi yang berbeda.

---

# 2. Product Principles

Kastur v2 harus mengikuti prinsip berikut:

### Operational First

Setiap workspace mengutamakan pekerjaan utama penggunanya.

### Task-Oriented UX

Navigasi dibangun berdasarkan pekerjaan pengguna, bukan berdasarkan struktur database.

### Low Cognitive Load

Pengguna tidak perlu memahami arsitektur teknis aplikasi untuk menjalankan pekerjaan.

### Predictable

Interaksi, tombol, navigasi, status, dan workflow harus konsisten.

### Auditability

Perubahan penting harus dapat diketahui:

- siapa,
- kapan,
- apa yang berubah,
- dari nilai apa,
- menjadi nilai apa,
- dan mengapa.

### Offline-First

Operasi yang aman dilakukan secara offline harus tetap tersedia.

### Progressive Complexity

Fitur kompleks hanya muncul ketika dibutuhkan.

### No Unnecessary Approval

Approval hanya digunakan jika memberikan kontrol bisnis nyata.

---

# 3. Product Architecture

Kastur adalah **satu product ecosystem** dengan dua workspace teknis:

## Kastur Back Office

Digunakan untuk:

- Product Master
- Supplier
- Purchasing
- Costing
- Pricing
- Pricing Calculator
- Price Proposal
- Approval
- Inventory Management
- Reports
- Settings

Pengguna utama:

- Owner
- Admin

---

## Kastur POS

Digunakan untuk:

- transaksi penjualan,
- payment,
- shift,
- cash movement,
- pelanggan,
- transaction history,
- operasional kasir.

Pengguna:

- Owner
- Admin
- Cashier

---

# 4. Shared Platform

Walaupun Back Office dan POS dapat tetap berupa aplikasi/deployment teknis yang berbeda, keduanya harus menggunakan satu business platform.

Shared domains:

### Identity

- User
- Role
- Permission

### Inventory

- Stock Movement
- Stock Balance Projection
- Stock Opname
- Adjustment

### Audit

- business activity history,
- sensitive changes,
- approvals,
- overrides.

Kedua workspace harus menggunakan vocabulary dan identifier yang konsisten.

---

# 5. System of Record

## Back Office Owns

### Catalog

- Product
- SKU
- Category
- Brand
- Supplier
- Product Unit
- Unit Conversion
- Barcode

### Purchasing

- Purchase
- Purchase Item
- Receiving
- Purchase Cost
- Landed Cost
- Cost History

### Pricing

- Pricing Reference Cost
- Margin Rules
- Retail Pricing
- Wholesale Pricing
- Price Tier
- Price Recommendation
- Price Proposal
- Approval
- Price Version
- Effective Date
- Price History

---

## POS Owns

- Transaction
- Transaction Item
- Payment
- Refund
- Void
- Shift
- Cash Movement
- Receipt
- Customer Transaction Activity
- Cashier Activity

---

## Shared Inventory Domain Owns

- Stock Movement Ledger
- Stock Quantity
- Inventory Adjustment
- Stock Opname
- inventory location context.

Stock balance must be derived from inventory movements.

Stock must never silently change without an auditable inventory event.

---

# 6. User Roles

Kastur v2 initially contains three roles.

## Owner

Owner acts as business controller.

Primary responsibilities:

- oversee business performance,
- control pricing,
- approve price proposals,
- manage margin policy,
- monitor purchasing,
- view costs,
- view profitability,
- manage users,
- manage warehouse/inventory activity,
- review audit history.

Owner has authority to directly change prices.

Owner does not require self-approval.

---

## Admin

Admin acts as Back Office Operator.

Primary responsibilities:

- Product Master
- Supplier
- Purchasing
- Receiving
- Cost recording
- Inventory operations
- Price Proposal
- Pricing Calculator
- Operational Reports

Admin may create and review Price Proposals.

Admin may not approve their own Price Proposal.

---

## Cashier

Cashier acts as Sales Operator.

Primary workspace:

**POS**

Responsibilities:

- selling products,
- payment,
- customer selection,
- shift operations,
- permitted transaction history.

Cashier should not see:

- supplier cost,
- margin,
- profitability,
- purchasing,
- pricing policies,
- sensitive inventory configuration.

---

# 7. Authorization Model

Roles are presets.

Actual authorization must use:

User  
→ Role  
→ Permissions

Do not encode critical business authorization exclusively using checks such as:

`role == OWNER`

Future roles must be addable without redesigning the application.

Potential future roles:

- Purchasing
- Warehouse Staff
- Supervisor
- Store Manager

These roles are **not part of current MVP**.

---

# 8. Landing Experience

The first useful screen must depend on the user's job.

## Owner

Back Office:

Dashboard / business overview.

## Admin

Back Office:

operational Back Office workspace.

## Cashier

POS:

directly to selling screen.

Cashier should not be forced through Dashboard before using POS.

---

# 9. Target Commerce Model

Kastur is:

**Retail-first, wholesale-capable.**

Wholesale is not a separate mode.

Do not create:

`Retail Transaction`

versus:

`Wholesale Transaction`

as separate primary flows.

Instead, wholesale behavior comes from:

- selling unit,
- quantity,
- applicable pricing tier.

---

# 10. Product Model

One Product may contain multiple Product Units.

Example:

**Indomie Goreng**

Base Unit:

PCS

Selling Units:

- PCS
- PACK
- CARTON

Example conversion:

1 PACK = 5 PCS

1 CARTON = 40 PCS

---

# 11. Base Unit

Every inventory-tracked Product must have one canonical:

**Base Stock Unit**

Inventory movements are recorded in base-unit quantity.

Example:

Sale:

2 CARTON

Conversion:

1 CARTON = 40 PCS

Inventory Movement:

-80 PCS

---

# 12. Product Unit

A Product Unit may contain:

- unit name,
- abbreviation,
- conversion factor,
- barcode,
- selling availability,
- purchasing availability,
- pricing configuration.

Product Unit and Price Tier are separate concepts.

---

# 13. Barcode

Barcode must preferably identify:

**Product Unit**

not merely Product.

Example:

Product:

Aqua 600 ml

PCS barcode:

Barcode A

CARTON barcode:

Barcode B

Scanning Barcode B should immediately identify the CARTON unit.

---

# 14. Pricing Tier

Price Tier determines selling price according to quantity.

Example:

Indomie / PCS

1+  
Rp3.500

10+  
Rp3.300

40+  
Rp3.100

Example:

Indomie / CARTON

1+  
Rp120.000

5+  
Rp115.000

Price Tier must support future effective-date versioning.

---

# 15. POS Price Resolution

Cashier must not manually choose:

Retail / Wholesale.

Preferred flow:

Scan/Search Product  
→ Select Unit if needed  
→ Quantity  
→ System resolves applicable active price.

Example:

Qty 2 PCS

→ Rp3.500 / pcs

Qty 12 PCS

→ Rp3.300 / pcs

UI may display:

**Harga grosir diterapkan**

without forcing an additional workflow.

---

# 16. Purchasing

Purchasing is primarily performed by Admin and monitored by Owner.

Initial purchasing flow should remain lightweight.

Supplier  
→ Items  
→ Quantity  
→ Purchase Unit  
→ Purchase Price  
→ Discount / Tax / Additional Acquisition Cost  
→ Receive  
→ Inventory + Cost Updated

Do not initially implement full enterprise procurement workflows such as:

- RFQ,
- complex approval chains,
- three-way matching,
- accounts payable.

---

# 17. Purchase Units

Admin may purchase using non-base units.

Example:

Buy:

10 CARTON

Conversion:

1 CARTON = 40 PCS

Inventory receipt:

+400 PCS

Admin should not be forced to manually convert the quantity.

---

# 18. Purchase Cost

Purchase Price is not necessarily the final inventory cost.

Kastur must support:

**Landed Cost**

Conceptually:

Purchase Price  
− Purchase Discount  
+ Relevant Tax  
+ Allocated Freight  
+ Direct Acquisition Cost

= Landed Cost

General operating expenses such as:

- rent,
- salary,
- electricity,
- internet

must not automatically be added to inventory acquisition cost.

---

# 19. Cost Model

Kastur must distinguish at least two cost concepts.

## Inventory Valuation Cost

Recommended default:

**Moving Weighted Average Cost**

Used for:

- inventory valuation,
- COGS,
- gross profit,
- stock value.

---

## Pricing Reference Cost

Used for future selling-price decisions.

Recommended default:

**Latest Valid Landed / Replacement Cost**

Pricing Reference Cost does not necessarily equal Weighted Average Cost.

---

# 20. Cost History

Cost must not merely be overwritten.

Kastur should retain history including:

- supplier,
- purchase,
- date,
- purchase unit,
- quantity,
- purchase cost,
- landed cost,
- cost per base unit.

Manual cost changes should be exceptional and auditable.

---

# 21. Initial Cost

During onboarding, users may have existing inventory without historical Purchasing records.

Kastur therefore supports:

- Initial Stock
- Initial Cost

as opening data.

After normal Purchasing begins, Purchasing should become the primary source of cost.

---

# 22. Pricing Calculator

Pricing Calculator is the primary feature explicitly preserved from the previous application.

The v2 Calculator evolves into a:

**Pricing Decision Tool**

Core capabilities:

- Pricing Reference Cost
- Target Margin
- Tax treatment
- Recommended Price
- Rounding
- Profit
- Actual Margin
- Current Price comparison
- Retail tiers
- Wholesale tiers
- Floor Price warnings

Core pricing formula:

Recommended Selling Price  
=  
Pricing Reference Cost / (1 − Target Margin)

---

# 23. Calculator Independence

Pricing Calculator may be used independently for simulation.

Running a calculation must not automatically change Active Selling Price.

Possible next actions:

For Admin:

Calculator  
→ Use as Proposal

For Owner:

Calculator  
→ Apply Price  
→ Validate / Warning  
→ Effective Date

---

# 24. Margin

Margin means margin from selling price, not markup on cost.

Conceptually:

Profit  
= Selling Price − Cost

Margin  
= Profit / Selling Price

Margin Rules may eventually exist at different scopes, but v2 should avoid unnecessary hierarchy unless needed by the final business rules.

---

# 25. Rounding

Pricing Calculator must retain configurable rounding behavior.

Existing behavior is a reference candidate and must be verified during implementation audit.

Rounding must be deterministic and reusable by:

- calculator,
- price proposal,
- pricing recommendation.

---

# 26. Price Governance

There are two principal paths.

## Admin Price Proposal

Admin  
→ Create Proposal  
→ Review  
→ Pending Owner Approval  
→ Owner Approves / Edits / Rejects  
→ Owner sets Effective Date  
→ Scheduled / Active

Admin cannot activate their own proposed price.

---

## Owner Direct Price Change

Owner  
→ Enter/Edit Price  
→ System Analysis  
→ Warning if necessary  
→ Owner Confirms  
→ Effective Date  
→ Scheduled / Active

Owner does not perform self-approval.

---

# 27. Review vs Approval

Review and Approval are separate business actions.

Review may be performed by:

- Admin
- Owner

Approval may only be performed by:

- Owner

Owner may edit the proposed price while approving.

The system must preserve:

- original proposal,
- proposed by,
- proposed price,
- final approved price,
- approved by,
- timestamps.

---

# 28. Price Warning

Owner remains allowed to override pricing recommendations.

However the system should warn when:

- margin falls below target,
- margin falls below configured minimum,
- selling price falls near/below cost,
- price change is unusually large,
- replacement cost changed significantly.

Warnings do not automatically block Owner unless a future business rule explicitly requires it.

Overrides must be auditable.

---

# 29. Price Effective Date

Every approved/direct price change must have an Effective Date.

Options include:

- Effective Now
- Scheduled

Historical price records must not be overwritten.

---

# 30. Price Versioning

Price must be versioned.

Example:

Version 1  
Rp12.500  
Valid until August 16

Version 2  
Rp14.000  
Effective August 17

Historical transactions remain linked to their sale-time price snapshot.

---

# 31. Price Set

When one Product has multiple retail/wholesale tiers, the proposal should preferably be treated as a coherent:

**Price Set**

Owner should be able to review the price structure together.

Example:

Retail: Rp3.500  
10+ PCS: Rp3.300  
40+ PCS: Rp3.100

instead of requiring unrelated approval workflows for every tier.

---

# 32. Transaction Snapshot

Transaction Item must preserve sale-time commercial facts.

At minimum:

- Product ID
- Product name snapshot
- Product Unit ID
- Product Unit snapshot
- quantity
- conversion snapshot where required
- applied pricing tier/reference
- selling price snapshot
- discount snapshot
- tax snapshot where applicable
- cost snapshot

Changing current Product/Cost/Price later must not rewrite historical transactions.

---

# 33. Inventory Ledger

Inventory must use an auditable stock movement ledger.

Movement examples:

- INITIAL_STOCK
- PURCHASE_RECEIPT
- SALE
- RETURN
- ADJUSTMENT
- OPNAME_ADJUSTMENT

Every inventory change must have:

- Product
- Location
- Quantity
- Movement Type
- Reference
- Timestamp
- Actor where applicable.

---

# 34. Stock Opname

Stock Opname compares:

System Quantity  
vs  
Physical Quantity

Difference creates:

**OPNAME_ADJUSTMENT**

Stock Opname must not simply overwrite an inventory balance.

---

# 35. Single Store Scope

Kastur v2 currently targets:

**one business with one active store location.**

Multi-outlet UI is not required.

Do not implement:

- outlet selector,
- inter-store transfer,
- area manager,
- outlet-specific pricing,
- consolidated multi-store reports.

---

# 36. Location-Aware Foundation

Although UX is single-store, inventory and transactional schema should be location-aware where appropriate.

Concept:

Company  
→ Default Store Location

Current UI automatically operates against the default location.

No location selection is required for normal users.

Future location types may include:

- STORE
- WAREHOUSE

without making Warehouse a current MVP feature.

---

# 37. Pricing Scope

Current price should be company/store default.

Do not implement store-specific pricing overrides now.

The architecture should not make future overrides impossible.

---

# 38. Offline Strategy

Both workspaces are expected to remain usable during realistic connectivity disruptions.

Offline-first does not mean every operation must be globally finalized offline.

Operations should be categorized as:

- fully local/offline-safe,
- local draft,
- pending synchronization,
- online-authoritative.

Financial and inventory operations require idempotency and reconciliation.

---

# 39. Synchronization Principle

The user should not need to understand synchronization architecture.

Avoid making technical sync management a primary workflow.

Normal synchronization should happen automatically.

Manual sync may exist as troubleshooting/recovery functionality.

UI should communicate operational states such as:

- Offline
- Syncing
- Synced
- Pending
- Failed

without exposing unnecessary infrastructure concepts.

---

# 40. Design System Strategy

Kastur v2 design system starts conceptually from zero.

The previous visual system is not authoritative.

Design must derive from:

- user role,
- task frequency,
- device,
- risk,
- operational context.

Existing components may be migrated only after evaluation.

---

# 41. UI Architecture Principle

No page should exist merely because a database entity exists.

Example:

Category  
Brand  
Supplier  
Unit

do not automatically require four independent primary navigation items.

Supporting entities should appear contextually where appropriate.

---

# 42. Navigation Principle

Navigation must be:

- role-oriented,
- task-oriented,
- predictable,
- shallow.

Avoid flows that repeatedly jump users back to a generic Home/POS screen.

Browser/system Back should normally return users to their previous meaningful context.

Custom history replacement must only be used when justified.

---

# 43. Existing Code Strategy

Existing code is reference material.

Every existing component/service falls into one of:

### KEEP

Matches new requirements.

### ADAPT

Has sound logic but requires interface/domain changes.

### REPLACE

Behavior conflicts with PRD.

### REMOVE

No longer useful.

Do not rewrite healthy code without reason.

Do not preserve poor UX merely because it already exists.

---

# 44. Protected Legacy Capability

The only old capability explicitly designated as mandatory to preserve is:

**Pricing Calculator core logic**

Even this capability may receive:

- redesigned UI,
- better naming,
- improved workflow,
- stronger integration,

provided calculation correctness is preserved or improved.

---

# 45. Non-Goals — Current Version

Not currently required:

- Full ERP accounting
- General Ledger
- Accounts Payable
- Multi-outlet management
- Warehouse staff role
- Warehouse rack/bin management
- Complex procurement approval
- Supplier bidding
- Advanced logistics
- Demand forecasting
- Automatic reorder engine
- Customer-specific contract pricing
- Enterprise franchise management

These may be reconsidered later.

---

# 46. Core End-to-End Business Flow

The primary Kastur business cycle is:

Supplier  
↓  
Purchasing  
↓  
Receiving  
↓  
Inventory  
↓  
Cost Update  
↓  
Pricing Analysis  
↓  
Price Proposal / Owner Direct Change  
↓  
Owner Decision  
↓  
Effective Price  
↓  
POS  
↓  
Sale  
↓  
Payment  
↓  
Inventory Consumption  
↓  
Reporting  
↓  
Owner Decision

---

# 47. Primary Success Criteria

Kastur v2 is successful when:

1. Cashier can complete sales rapidly without understanding Back Office complexity.
2. Admin can perform purchasing and pricing preparation without unnecessary Owner intervention.
3. Owner can identify meaningful changes requiring attention.
4. Cost changes do not silently destroy margins.
5. Selling prices do not change without intended Owner authority.
6. Retail and wholesale selling work in one POS flow.
7. Multi-unit products do not corrupt inventory.
8. Historical transactions remain historically accurate.
9. Inventory changes can be explained through movement history.
10. Navigation follows the user's task instead of database/application structure.
11. Offline connectivity problems do not unnecessarily stop store operations.
12. Existing healthy calculation/domain code can be reused without forcing the old UX into the new product.

---

# 48. Reference Dataset

The existing legacy product list will be used as a reference dataset during:

- Product Catalog design,
- unit normalization,
- barcode modeling,
- pricing migration,
- opening inventory design,
- and import/migration planning.

Legacy spreadsheet structure is not automatically considered the new database schema.

Actual Kastur v2 schema must be derived from business concepts defined by this PRD.

---

# 49. Source-of-Truth Rule

When conflicts exist between:

1. old UI,
2. old code structure,
3. old navigation,
4. old data representation,

and this approved PRD:

**the approved Kastur v2 product/domain definition takes precedence.**

Existing implementation is evidence and reference, not the final product specification.