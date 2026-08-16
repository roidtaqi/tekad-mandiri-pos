# Kastur Retail System — Business Rules v1
## Domain 01: Product Catalog & Unit Management

**Status:** Draft for Approval  
**Depends on:** Kastur PRD v2  
**Applies to:** Kastur Back Office + Kastur POS  
**Primary Owners:** Owner, Admin

---

# 1. Purpose

Product Catalog adalah sumber kebenaran untuk identitas barang yang digunakan oleh:

- Purchasing
- Inventory
- Pricing
- POS
- Reporting
- Customer Return
- Supplier Return

Satu barang bisnis harus memiliki satu identitas Product yang konsisten di seluruh Kastur.

Product tidak boleh diduplikasi hanya karena:

- dijual dalam satuan berbeda,
- memiliki beberapa barcode,
- memiliki harga retail dan grosir,
- dibeli dari supplier berbeda,
- atau memiliki harga beli berbeda.

---

# 2. Product Identity Rule

Satu produk merepresentasikan satu barang dagang yang secara bisnis dianggap sama.

Contoh:

**Indomie Goreng 85g**

adalah satu Product.

Jangan membuat:

- Indomie Goreng PCS
- Indomie Goreng Pack
- Indomie Goreng Karton
- Indomie Goreng Grosir

sebagai Product yang berbeda.

Semua harus berada di bawah satu Product.

Concept:

```text
Product
Indomie Goreng 85g
│
├── PCS
├── PACK
└── CARTON
```

---

# 3. Product Master Minimum Data

Product minimal memiliki:

- Product ID
- SKU
- Product Name
- Category
- Brand nullable
- Description nullable
- Base Unit
- Track Inventory
- Active Status
- Created At
- Updated At

Recommended future-ready fields:

- image
- notes
- default supplier nullable
- tax classification nullable

Do not require optional fields simply to create a Product.

---

# 4. Product ID

Product must have an immutable internal identifier.

Prefer:

UUID

or another durable generated identifier.

Product ID must never depend on:

- product name,
- SKU,
- barcode,
- supplier code.

Changing those values must not change Product identity.

---

# 5. SKU

SKU is the human/business identifier for Product.

Example:

```text
IND-MIE-GRG-85
```

SKU should:

- be unique within the business,
- be editable with audit history,
- not be used as database primary key.

SKU may be:

- manually entered,
- automatically generated.

If empty during Product creation, Kastur may generate one automatically.

---

# 6. Product Name

Product Name should describe the actual retail item.

Recommended structure:

```text
Brand + Product + Variant + Size
```

Example:

```text
Indomie Mi Instan Goreng 85g
```

Avoid embedding unit packaging into the Product name if it is represented through Product Unit.

Avoid:

```text
Indomie Goreng Karton Isi 40
```

when CARTON is only a selling/purchasing unit.

---

# 7. Product Variant Boundary

A different physical product characteristic should normally become a separate Product.

Example:

```text
Indomie Goreng 85g
Indomie Soto 70g
```

are separate Products.

Likewise:

```text
Aqua 600ml
Aqua 1500ml
```

are separate Products.

But:

```text
Aqua 600ml PCS
Aqua 600ml CARTON
```

are the same Product with different Product Units.

---

# 8. Category

Each Product must belong to one primary Category.

Examples:

- Mie Instan
- Minuman
- Susu
- Snack
- Bumbu
- Perawatan Rumah
- Personal Care

Category must not determine inventory or pricing behavior automatically unless explicitly configured.

Category is primarily used for:

- organization,
- search,
- reporting,
- future pricing rules.

---

# 9. Brand

Brand is separate from Product Name.

Example:

```text
Brand:
Indomie

Product:
Mi Instan Goreng 85g
```

Brand may be optional.

Do not force Brand for products without meaningful branded identity.

---

# 10. Product Status

Product supports:

```text
ACTIVE
INACTIVE
```

Inactive Product:

- cannot normally be added to new POS transactions,
- remains visible in historical transactions,
- remains visible in purchase and inventory history,
- must not be physically deleted merely because it is discontinued.

Historical references must remain valid.

---

# 11. Track Inventory

Every Product has:

```text
track_inventory
```

Boolean.

Examples:

```text
Indomie Goreng
track_inventory = true
```

```text
Biaya Kirim
track_inventory = false
```

If `track_inventory = false`:

- POS may sell it,
- no stock deduction occurs,
- Stock Opname ignores it,
- Purchasing stock receipt is normally not applicable.

---

# 12. Base Unit

Every inventory-tracked Product must have exactly one:

**Base Stock Unit**

Example:

```text
Product:
Indomie Goreng

Base Unit:
PCS
```

Base Unit is the canonical unit for:

- stock ledger,
- inventory balance,
- stock opname,
- stock valuation quantity,
- normalized cost.

Base Unit should normally represent the smallest practical inventory quantity.

---

# 13. Base Unit Immutability

Changing Base Unit after inventory activity exists is a high-risk operation.

Once Product has:

- stock movements,
- completed purchases,
- completed sales,

Base Unit must not be freely changed.

If a Base Unit correction is necessary, Kastur should use a controlled migration/correction workflow rather than a normal Product edit.

---

# 14. Product Unit

A Product can have one or many Product Units.

Example:

```text
Indomie Goreng

PCS
PACK
CARTON
```

Product Unit may be:

- selling unit,
- purchasing unit,
- both.

---

# 15. Product Unit Data

Each Product Unit should contain:

- Product Unit ID
- Product ID
- Unit Name
- Unit Code
- Conversion Factor
- Can Sell
- Can Purchase
- Active Status

Optional:

- label
- preferred display name

Example:

```text
Unit Name:
Carton

Unit Code:
CTN

Conversion Factor:
40
```

---

# 16. Conversion Factor

Conversion Factor always means:

> how many Base Units are contained in one Product Unit.

Example:

```text
Base Unit:
PCS

PACK:
5 PCS

CARTON:
40 PCS
```

Stored conceptually as:

```text
PCS    = 1
PACK   = 5
CARTON = 40
```

Do not store reciprocal conversion values as independent business truth.

---

# 17. Inventory Conversion Rule

All stock-changing events must eventually normalize quantity to Base Unit.

Example purchase:

```text
10 CARTON
```

with:

```text
1 CARTON = 40 PCS
```

produces:

```text
+400 PCS
```

Example sale:

```text
2 PACK
```

with:

```text
1 PACK = 5 PCS
```

produces:

```text
-10 PCS
```

---

# 18. Conversion Snapshot

Completed business transactions should preserve the Product Unit conversion that applied at transaction time where historical reconstruction requires it.

Example Transaction Item:

```text
Unit:
CARTON

Conversion Snapshot:
40 PCS

Qty:
2

Base Qty:
80 PCS
```

If Product Unit conversion changes later, historical transactions must remain correct.

---

# 19. Conversion Change Safety

Changing:

```text
1 CARTON = 40 PCS
```

to:

```text
1 CARTON = 48 PCS
```

must not retroactively alter:

- historical sales,
- historical purchases,
- stock movements,
- COGS,
- reports.

New conversion applies only to future business events after the change becomes effective.

---

# 20. Product Unit Status

A Product Unit can be inactive without deleting Product history.

Example:

Product previously sold as:

```text
PACK
```

but store stops using PACK.

PACK can become:

```text
INACTIVE
```

while historical transactions still display PACK correctly.

---

# 21. Barcode Ownership

Barcode should normally belong to:

**Product Unit**

rather than Product directly.

Example:

```text
Aqua 600ml

PCS
Barcode: 899xxxx001

CARTON
Barcode: 899xxxx099
```

Scanning either barcode identifies:

- Product
- Product Unit

immediately.

---

# 22. Multiple Barcodes

One Product Unit may support more than one barcode when operationally necessary.

Examples:

- manufacturer barcode,
- old packaging barcode,
- supplier barcode,
- internal store barcode.

Architecture should therefore support:

```text
Product Unit
↓
Barcodes[]
```

rather than enforcing exactly one barcode forever.

---

# 23. Barcode Uniqueness

One active barcode must resolve deterministically to one active Product Unit within the same business.

Do not permit one barcode to simultaneously identify two sellable Product Units.

If duplicate barcode is detected:

- block save,
- identify the conflicting Product,
- allow user to resolve it.

---

# 24. Barcode Is Not Product Identity

Changing a barcode must not create a new Product automatically.

Barcode is an identifier for operational lookup, not Product identity.

---

# 25. Internal Barcode

Kastur should remain capable of generating an internal barcode for Product Units that do not have a manufacturer barcode.

This does not need advanced label printing in the first phase, but schema must not assume all barcodes originate externally.

---

# 26. Selling Unit

Product Units with:

```text
can_sell = true
```

may appear in POS.

Example:

```text
PCS       sellable
PACK      sellable
CARTON    sellable
```

A purchasing-only unit does not need to appear to Cashier.

---

# 27. Purchasing Unit

Product Units with:

```text
can_purchase = true
```

may be used in Purchasing.

Example:

```text
PCS       sellable
PACK      sellable
CARTON    sellable + purchasable
```

or:

```text
SACK
purchasable only
```

when applicable.

---

# 28. Selling Unit and Purchase Unit Independence

A unit does not have to serve both purposes.

Example:

Store purchases:

```text
1 CASE = 100 PCS
```

but only sells:

```text
PCS
PACK
```

`CASE` may therefore be:

```text
can_purchase = true
can_sell = false
```

---

# 29. Unit Pricing Independence

Each Product Unit has its own pricing configuration.

Example:

```text
PCS:
Rp3.500

CARTON:
Rp120.000
```

Do not assume:

```text
CARTON price
=
PCS price × conversion factor
```

The pricing engine may calculate recommendations, but Active Price remains separately governed.

---

# 30. Pricing Tier Independence

Product Unit and Price Tier are different concepts.

Example:

```text
Unit:
PCS

Price tiers:
1+       Rp3.500
10+      Rp3.300
40+      Rp3.100
```

versus:

```text
Unit:
CARTON

Price tiers:
1+       Rp120.000
5+       Rp115.000
```

Do not automatically apply PCS tier rules to CARTON purchases.

---

# 31. Cross-Unit Pricing Rule

Conversion Factor is used for:

- inventory,
- cost normalization,
- reporting.

Conversion Factor must NOT automatically combine quantities for pricing across Product Units.

Example:

```text
1 CARTON = 40 PCS
```

does not mean buying 1 CARTON automatically qualifies for:

```text
PCS 40+ price tier
```

CARTON pricing is resolved using CARTON's own active Price Set.

---

# 32. Mixed Unit Cart

POS may contain the same Product with different Product Units.

Example:

```text
2 CARTON
+
5 PCS
```

These are distinct cart lines for pricing purposes.

Inventory impact may normalize to:

```text
2 × 40 + 5
=
85 PCS
```

but pricing remains unit-specific.

---

# 33. Quantity Precision

Product Unit must support quantity precision appropriate to the product.

For current retail/sembako target, default is whole-number quantities.

Example:

```text
1 PCS
2 CARTON
```

Architecture should avoid making decimal quantity impossible forever because future products may use:

- KG
- GRAM
- LITER
- METER

However decimal selling behavior is not required to become a major v2 UX feature unless actual catalog data needs it.

---

# 34. Cost Normalization

Purchase cost entered in a Purchase Unit must be normalized to Base Unit Cost.

Example:

```text
Purchase:
1 CARTON

Cost:
Rp112.000

Conversion:
40 PCS
```

Normalized cost:

```text
Rp2.800 / PCS
```

This normalized value becomes input for inventory costing.

---

# 35. Product Supplier Relationship

One Product may be purchased from multiple Suppliers.

Do not bind Product permanently to exactly one Supplier.

Concept:

```text
Product
├── Supplier A
├── Supplier B
└── Supplier C
```

A default/preferred supplier may optionally be defined.

Historical purchases determine actual supplier cost history.

---

# 36. Supplier-Specific Codes

Architecture may support future supplier-specific item codes.

Do not misuse Kastur SKU as supplier SKU.

Conceptually:

```text
Product SKU:
Kastur internal identity

Supplier SKU:
Supplier-specific reference
```

Supplier-specific codes are optional and not required for initial Product creation.

---

# 37. Duplicate Product Prevention

When creating Product, Kastur should warn about possible duplicates based on:

- same/similar name,
- same barcode,
- same Brand + size,
- same SKU.

Hard-block:

- duplicate active barcode,
- duplicate business SKU.

Potential duplicate names should trigger warning rather than automatic rejection.

---

# 38. Product Merge

Do not implement casual Product merge in normal Product editing.

Merging Products after transactions exist can affect:

- inventory,
- sales,
- cost history,
- price history.

If Product merge is implemented later, it must be a specialized migration operation with complete audit trail.

---

# 39. Product Deletion

A Product with historical references must not be hard-deleted through normal UI.

Use:

```text
INACTIVE
```

instead.

Hard delete may only be allowed for records that have never participated in meaningful business events, subject to implementation rules.

---

# 40. Product Creation — Admin

Admin may create Product.

Expected simplified flow:

```text
Tambah Produk
↓
Nama Produk
↓
Kategori
↓
Brand optional
↓
Base Unit
↓
Barcode optional
↓
Additional Units optional
↓
Save
```

Do not require pricing before Product can exist.

Do not require supplier before Product can exist.

Do not require purchasing data before Product can exist.

---

# 41. Product Creation Progressive Disclosure

Basic creation should remain fast.

Advanced settings such as:

- multiple units,
- multiple barcodes,
- pricing tiers,
- supplier relation,
- inventory settings

should be accessible without overwhelming the first form.

Preferred UX:

```text
Basic Product
↓
Save
↓
Product Detail
│
├── Units & Barcode
├── Pricing
├── Purchasing
├── Inventory
└── History
```

---

# 42. Product Detail as Context Hub

Product Detail should become the primary contextual workspace for one Product.

It may provide access to:

- General Information
- Units & Barcodes
- Current Price
- Price History
- Purchase Cost
- Purchase History
- Stock
- Stock Movement
- Sales History

according to permission.

This is preferable to forcing users to navigate between unrelated top-level pages to understand one Product.

---

# 43. Owner Product Permissions

Owner may:

- create,
- update,
- deactivate,
- manage Product Units,
- manage Barcode,
- review cost,
- manage pricing,
- see history.

Sensitive changes remain audited.

---

# 44. Admin Product Permissions

Admin may:

- create Product,
- update Product master data,
- manage Product Units,
- manage Barcode,
- manage supplier relationship,
- perform Purchasing-related catalog work.

Admin pricing behavior remains subject to Price Proposal rules.

---

# 45. Cashier Product Access

Cashier should receive only operational Product data necessary for POS:

- Product Name
- Product Unit
- Barcode
- Active Selling Price
- Availability/status
- basic stock indication if enabled.

Cashier does not need:

- supplier cost,
- landed cost,
- margin,
- supplier history,
- pricing rules.

---

# 46. Product Search

Back Office Product search should support at minimum:

- Product Name
- SKU
- Barcode

Useful filters:

- Category
- Brand
- Active / Inactive
- Inventory tracked / non-inventory

Search should tolerate partial text.

---

# 47. POS Product Search

POS lookup prioritizes speed.

Search sources:

1. Barcode exact match
2. Product Name
3. SKU

Barcode exact match should resolve Product Unit immediately.

---

# 48. Reference Dataset Migration

Legacy product spreadsheets must not dictate the domain model.

During import, legacy columns should be mapped into the Product Catalog domain.

Potential mappings:

```text
Kode Barang
→ SKU

Nama Barang
→ Product Name

Kategori
→ Category

Brand
→ Brand

Satuan
→ Product Unit

Isi
→ Conversion Factor

Barcode
→ Product Unit Barcode

Harga Beli
→ Opening / Initial Cost

Harga Jual
→ Opening Price Version

Stok
→ Opening Stock
```

Actual mapping must be confirmed against the real spreadsheet structure.

---

# 49. Import Validation

Product import should validate:

- duplicate SKU,
- duplicate Barcode,
- invalid Conversion Factor,
- missing Product Name,
- invalid Base Unit,
- negative invalid quantities,
- malformed numeric prices.

Import must produce:

```text
Imported
Skipped
Failed
```

results with row-level error explanations.

Do not silently discard invalid rows.

---

# 50. Opening Data Rule

When migrating an existing store:

Product history before Kastur may be unavailable.

Kastur may accept:

- Opening Product
- Opening Selling Price
- Opening Stock
- Opening Cost

These should be clearly marked as:

```text
OPENING / INITIAL
```

rather than pretending they originated from a normal Purchase or Price Proposal.

---

# 51. Audit Requirements

Audit Product changes including at minimum:

- Product created
- Product deactivated/reactivated
- SKU changed
- Product Unit added/changed/deactivated
- Conversion changed
- Barcode added/removed
- Track Inventory changed when allowed

Audit entry should identify:

- actor,
- timestamp,
- entity,
- action,
- previous value where relevant,
- new value where relevant.

---

# 52. Future Expiry / Lot Readiness

Current Product Catalog does not require:

- lot number,
- batch number,
- manufacture date,
- expiry date.

However Product identity must remain compatible with future:

```text
Product
↓
Inventory Lot
```

Inventory Lot may later represent:

- batch_number
- received_at
- manufactured_at
- expired_at
- quantity

Product Unit and Product must not need fundamental redesign to add this capability.

---

# 53. Current Non-Goals

Do not currently implement:

- Product bundles/kits
- complex manufacturing BOM
- serialized inventory
- lot tracking UI
- expiry tracking UI
- product variants under one configurable parent
- inter-store product overrides
- store-specific Product availability
- customer-specific Product catalog

These may be evaluated later.

---

# 54. Core Invariants

The following rules must always remain true:

1. One physical commercial item is represented by one Product identity.
2. Different packaging units do not create duplicate Products.
3. Every inventory Product has exactly one Base Unit.
4. Product Unit Conversion always resolves to Base Unit.
5. Historical conversions cannot be rewritten retroactively.
6. Barcode identifies a Product Unit.
7. One active Barcode cannot ambiguously identify multiple Product Units.
8. Product Unit and Price Tier are separate concepts.
9. Inventory conversion does not automatically dictate pricing.
10. Completed historical transactions retain Product/Unit snapshots.
11. Product history survives Product deactivation.
12. Stock changes never occur simply because Product master data changes.

---

# 55. Definition of Done — Product Catalog Domain

Product Catalog design is considered ready when Kastur can correctly represent:

### Simple Retail Product

```text
Gula Pasir 1kg
PCS
```

### Multi-Unit Product

```text
Indomie Goreng

PCS
PACK = 5 PCS
CARTON = 40 PCS
```

### Multiple Barcode Product

```text
PCS → Barcode A
CARTON → Barcode B
```

### Retail + Wholesale Product

```text
PCS:
1+ / 10+ / 40+

CARTON:
1+ / 5+
```

### Purchase in Carton / Sell in Pieces

```text
Purchase:
10 CARTON

Inventory:
+400 PCS

Sale:
3 PCS

Inventory:
-3 PCS
```

### Non-Inventory Product

```text
Biaya Kirim
track_inventory = false
```

without creating false stock movements.

---

# 56. Domain Rule Summary

The canonical Product Catalog model is:

```text
PRODUCT
│
├── Category
├── Brand
├── SKU
├── Track Inventory
│
└── PRODUCT UNITS
    │
    ├── Base Unit
    │
    ├── Selling Unit
    │
    ├── Purchasing Unit
    │
    ├── Conversion Factor
    │
    └── BARCODE(S)
```

Connected domains:

```text
Product
├── Suppliers
├── Purchases
├── Cost History
├── Price Sets
├── Stock Movements
└── Transactions
```

Product is the stable identity.

Unit defines how the Product is packaged/transacted.

Barcode identifies the operational unit.

Pricing defines what that unit costs to the customer.

Inventory always normalizes physical quantity to Base Unit.