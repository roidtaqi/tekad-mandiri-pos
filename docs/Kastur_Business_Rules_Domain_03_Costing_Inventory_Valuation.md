# Kastur Retail System — Business Rules v1
## Domain 03: Costing & Inventory Valuation

**Status:** Draft for Approval  
**Depends on:** Domain 01 Product Catalog, Domain 02 Purchasing & Receiving  
**Primary Users:** Owner, Admin  
**Consumed by:** Inventory, Pricing, POS, Reporting

---

## 1. Tujuan domain

Costing harus menjawab beberapa pertanyaan yang berbeda:

```text
Berapa nilai stok saat ini?
Berapa COGS transaksi?
Berapa modal pembelian terakhir?
Berapa cost yang seharusnya menjadi dasar pricing?
Kenapa cost berubah?
```

Karena itu Kastur tidak mempunyai satu angka generik bernama `product.cost`.

Minimal ada dua konsep:

```text
Inventory Valuation Cost
→ Moving Weighted Average Cost

Pricing Reference Cost
→ Latest Valid Landed / Replacement Cost
```

Keduanya boleh berbeda.

---

## 2. Base-unit costing

Seluruh cost inventory dinormalisasi ke **Base Unit** Product.

Contoh:

```text
Purchase:
1 CARTON = Rp112.000

Conversion:
1 CARTON = 40 PCS

Base Unit Cost:
Rp2.800 / PCS
```

Purchase Unit tetap dipertahankan sebagai historical snapshot, tetapi costing engine bekerja menggunakan base quantity.

---

## 3. Internal cost precision

Cost internal tidak boleh dibulatkan terlalu dini.

Contoh:

```text
Rp103.000 / 36
= Rp2.861,111111...
```

Kastur menyimpan decimal precision yang cukup tinggi.

UI boleh menampilkan:

```text
Rp2.861
```

tetapi calculation engine menggunakan nilai presisi.

Rule:

> **Display rounding tidak mengubah stored cost.**

---

## 4. Moving Weighted Average Cost

Inventory Valuation Cost menggunakan:

**Moving Weighted Average (MWA)**.

Concept:

```text
Current Inventory Value
+
Incoming Inventory Value
────────────────────────
Current Qty + Incoming Qty
```

menghasilkan average cost baru.

Contoh:

```text
Existing:
100 PCS @ Rp2.500
Value = Rp250.000

New Receipt:
400 PCS @ Rp2.775
Value = Rp1.110.000

Total:
500 PCS
Rp1.360.000

New Average Cost:
Rp2.720
```

---

## 5. Average cost berubah karena inventory value event

Weighted Average Cost tidak boleh berubah hanya karena user membuka/edit Product.

Perubahan berasal dari business event yang sah, misalnya:

```text
PURCHASE_RECEIPT
COST_RECONCILIATION
CUSTOMER_RETURN
SUPPLIER_RETURN
STOCK_ADJUSTMENT
MANUAL_COST_ADJUSTMENT
```

Setiap perubahan harus dapat dilacak.

---

## 6. Purchase Receipt Cost

Receiving yang masuk inventory menggunakan landed cost terbaik yang tersedia.

Jika Purchase sudah final:

```text
FINAL_LANDED_COST
```

digunakan.

Jika invoice belum final:

```text
PROVISIONAL_COST
```

boleh digunakan.

---

## 7. Provisional Cost

Urutan fallback:

```text
1. Known invoice cost
2. Agreed purchase cost
3. Last valid cost
```

Fallback nomor 3 hanya digunakan jika data sebelumnya benar-benar belum tersedia.

Record harus mengetahui:

```text
cost_status = PROVISIONAL
```

agar tidak dianggap final.

---

## 8. Final Cost Reconciliation

Ketika invoice/Purchase difinalisasi:

```text
PROVISIONAL_COST
↓
FINAL_LANDED_COST
```

Jika berbeda, jangan rewrite event sebelumnya.

Buat:

```text
COST_RECONCILIATION
```

Contoh:

```text
Received 100 PCS
Provisional = Rp2.500
Final       = Rp2.600

Difference:
Rp100 × 100
= Rp10.000 inventory revaluation
```

---

## 9. Landed Cost

Landed Cost berasal dari:

```text
Gross Purchase Cost
− Item Discount
− Allocated Transaction Discount
+ Non-Recoverable Tax
+ Allocated Direct Acquisition Cost
```

Tidak memasukkan:

```text
Salary
Rent
Internet
General electricity
Marketing
General overhead
```

---

## 10. Bonus quantity

Free goods menambah physical quantity tetapi tidak menambah purchase consideration.

Contoh:

```text
Buy 10 CARTON
Free 1 CARTON

Paid:
Rp1.000.000

Accepted:
11 CARTON
```

Cost efektif:

```text
Rp1.000.000 / 11
```

kemudian dinormalisasi ke base unit.

---

## 11. Discount allocation

Global purchase discount dialokasikan ke Purchase Items.

Default strategy:

```text
PROPORTIONAL_BY_PRE_DISCOUNT_VALUE
```

Allocation result menjadi bagian dari landed cost calculation.

---

## 12. Additional acquisition cost

Default allocation untuk freight/direct acquisition cost:

```text
PROPORTIONAL_BY_ITEM_VALUE
```

Architecture tetap membuka kemungkinan:

```text
BY_QUANTITY
BY_WEIGHT
MANUAL
```

tanpa harus mengimplementasikan seluruh UI-nya sekarang.

---

## 13. Recoverable Tax

Tax yang dapat dikreditkan/recoverable:

```text
→ bukan inventory cost
```

Tax yang tidak dapat dikreditkan:

```text
→ masuk landed cost
```

Kastur v2 cukup menyediakan business configuration sederhana.

Tidak membangun full tax accounting.

---

## 14. Pricing Reference Cost

Pricing Reference Cost menggunakan default:

```text
Latest Valid Landed / Replacement Cost
```

bukan Weighted Average Cost.

Alasannya:

> Harga jual harus mempertimbangkan biaya mengganti stok saat ini, bukan hanya biaya historis stok lama.

---

## 15. Cost separation

Contoh:

```text
Weighted Average Cost:
Rp10.500

Latest Landed Cost:
Rp12.000
```

Maka:

```text
Inventory / COGS
→ Rp10.500

Pricing Analysis
→ Rp12.000
```

Ini bukan discrepancy.

Ini expected behavior.

---

## 16. Pricing Reference Cost source

Urutan sumber:

```text
1. Latest valid final landed cost
2. Valid replacement/manual reference cost
3. Last known valid landed cost
4. Initial cost during onboarding
```

System harus mengetahui sumbernya.

Contoh:

```text
Pricing Reference Cost
Rp12.000

Source:
Purchase PUR-00129
Supplier ABC
16 Aug 2026
```

---

## 17. Cost history

Jangan simpan hanya:

```text
product.current_cost
```

tanpa history.

Kastur harus dapat menunjukkan:

```text
01 Aug  Rp10.000
05 Aug  Rp10.400
12 Aug  Rp11.200
16 Aug  Rp12.000
```

dengan source event masing-masing.

---

## 18. COGS transaction snapshot

Ketika Sale terjadi, Transaction Item menyimpan:

```text
cost_snapshot
cost_method
cost_source/reference
```

Minimal historical transaction harus tetap mampu mempertahankan:

```text
Selling Price
COGS
Gross Profit
Margin
```

meskipun current cost berubah di masa depan.

---

## 19. Sale dengan stok normal

Jika stok mencukupi:

```text
Current MWA:
Rp2.720

Sell:
5 PCS
```

COGS:

```text
5 × Rp2.720
```

Sale mengurangi quantity dan inventory value.

Weighted average cost dari inventory yang tersisa tidak berubah hanya karena sale biasa.

---

## 20. Negative stock diperbolehkan

Sesuai policy yang kita lock:

```text
Stock:
2 PCS

Sale:
5 PCS

Result:
-3 PCS
```

Sale tetap boleh berjalan jika business policy mengizinkan.

Cashier mendapat warning.

Negative inventory menjadi discrepancy yang terlihat.

---

## 21. Negative-stock provisional COGS

Ketika sale membuat stock negatif, gunakan:

```text
LAST_VALID_AVERAGE_COST
```

sebagai provisional COGS.

Contoh:

```text
Last valid MWA:
Rp2.500

Sell:
5 PCS

Provisional COGS:
Rp12.500
```

Jangan membiarkan average-cost formula berjalan secara naif terhadap negative quantity.

---

## 22. Negative stock tidak merusak MWA

Jika inventory berada:

```text
-3 PCS
```

kemudian purchase:

```text
10 PCS @ Rp2.800
```

jangan menghitung:

```text
(-3 × old value + 10 × new value) / 7
```

secara naive.

Bagian negative stock diperlakukan sebagai **unresolved consumption** yang harus direkonsiliasi.

---

## 23. Negative-stock reconciliation

Contoh:

```text
Negative Sale:
3 PCS
Provisional Cost:
Rp2.500

New Receipt:
Rp2.800
```

Actual replacement cost untuk 3 PCS tersebut:

```text
3 × Rp2.800
```

Difference:

```text
Rp300 × 3
= Rp900
```

Kastur membuat:

```text
COGS_RECONCILIATION
+Rp900
```

terhadap penjualan terkait.

---

## 24. Reconciliation tidak mengubah transaksi diam-diam

Historical sale tetap menyimpan:

```text
Original provisional COGS
```

dan reconciliation event.

Laporan final dapat menghitung:

```text
Final COGS
=
Original COGS
+ Reconciliation
```

Audit dapat menjelaskan perubahan.

---

## 25. Multiple negative sales

Jika beberapa transaction mengonsumsi stok negatif sebelum next receipt, reconciliation dialokasikan secara deterministik.

Rekomendasi:

```text
FIFO BY TRANSACTION TIME
```

untuk unresolved negative quantities.

Contoh:

```text
Sale A → -2
Sale B → -3

Receipt +4
```

empat unit incoming menutup:

```text
Sale A: 2
Sale B: 2
```

tersisa:

```text
Sale B: 1 unresolved
```

---

## 26. Negative inventory remains operational alert

Cost reconciliation tidak berarti negative inventory dianggap normal.

Owner/Admin tetap harus melihat:

```text
Negative Stock Products
```

untuk opname/correction.

---

## 27. Customer Return

Customer Return harus merujuk transaction item asli.

Jika item kembali menjadi sellable inventory:

```text
CUSTOMER_RETURN
+ quantity
```

Inventory cost menggunakan:

```text
original transaction cost_snapshot
```

bukan current cost.

---

## 28. Customer Return reverses original economics

Contoh sale:

```text
Sell Price:
Rp4.000

Cost Snapshot:
Rp2.800
```

Return 1 PCS:

Inventory masuk kembali dengan:

```text
Rp2.800
```

sehingga secara ekonomi return membalik transaksi asli.

---

## 29. Customer Return — not restocked

Jika disposition:

```text
NOT_RESTOCKED
```

karena:

- rusak,
- terbuka,
- tidak layak jual,

tidak ada positive sellable stock movement.

Refund tetap terjadi sesuai Sales/Return domain.

---

## 30. Stock adjustment — shortage

Contoh opname:

```text
System:
100 PCS

Physical:
95 PCS

Variance:
-5 PCS
```

Cost:

```text
current valid MWA
```

Inventory value adjustment:

```text
-5 × current MWA
```

diklasifikasikan sebagai:

```text
INVENTORY_LOSS
```

---

## 31. Stock adjustment — surplus

Contoh:

```text
System:
95 PCS

Physical:
100 PCS

Variance:
+5 PCS
```

Masuk menggunakan current valid MWA secara default.

Diklasifikasikan:

```text
INVENTORY_GAIN
```

Bukan menggunakan Pricing Reference Cost.

---

## 32. No-cost stock surplus edge case

Jika tidak ada valid inventory cost, misalnya onboarding/produk baru:

Kastur harus meminta explicit cost/reference atau menggunakan controlled fallback.

Jangan menciptakan:

```text
cost = 0
```

diam-diam untuk stock bernilai ekonomi.

---

## 33. Supplier Return

Supplier Return merujuk original Purchase/Receipt bila tersedia.

Financial claim menggunakan:

```text
original landed cost
```

dari inventory yang dikembalikan.

---

## 34. Supplier Return inventory valuation

Inventory keluar harus tetap direkonsiliasi terhadap costing engine.

Kastur menyimpan:

```text
return_reference_cost
original_receipt_cost
inventory_cost_effect
```

agar perbedaan dapat diaudit bila MWA saat return berbeda dari original purchase cost.

---

## 35. Supplier Return claim

Contoh:

```text
Original Purchase Cost:
Rp2.800

Current MWA:
Rp2.900
```

Return claim terhadap supplier:

```text
Rp2.800
```

karena itu adalah nilai commercial relation dengan Purchase awal.

Inventory valuation effect dapat berbeda dan harus direkonsiliasi oleh costing engine.

---

## 36. Supplier Replacement

Jika supplier mengganti barang:

```text
SUPPLIER_RETURN
↓
SUPPLIER_REPLACEMENT
```

replacement inventory mempunyai cost berdasarkan settlement/reference dari claim.

Tidak boleh terlihat seperti purchase baru yang dibayar ulang.

---

## 37. Manual Cost Adjustment

Manual Cost Adjustment tersedia sebagai exception.

Permission khusus:

```text
cost.adjust
```

Bukan semua Admin otomatis harus mendapatkannya jika kelak permission diperketat.

---

## 38. Manual adjustment wajib mempunyai reason

Contoh:

```text
Old Cost:
Rp10.000

New Cost:
Rp10.500

Reason:
"Opening cost migration correction"
```

Record:

```text
Actor
Timestamp
Reason
Before
After
Affected Product
Affected inventory/value
```

---

## 39. Tidak ada direct overwrite

UI tidak boleh menyediakan konsep generik:

```text
Edit modal
Rp10.000 → Rp12.000
Save
```

tanpa business event.

Yang benar:

```text
Manual Cost Adjustment
```

atau source event lain.

---

## 40. Initial Cost

Pada onboarding:

```text
Opening Stock:
100 PCS

Opening Cost:
Rp10.000
```

membentuk:

```text
INITIAL_INVENTORY
INITIAL_COST
```

Ini boleh menjadi starting Weighted Average Cost dan initial Pricing Reference Cost sampai Purchase history tersedia.

---

## 41. Opening cost tidak berpura-pura menjadi Purchase

Historical source:

```text
OPENING_BALANCE
```

bukan fake Supplier/Purchase.

---

## 42. Cost Correction setelah Purchase Posted

Jika Purchase final ternyata salah:

```text
Original landed:
Rp2.800

Corrected:
Rp2.750
```

Purchase Correction menghasilkan:

```text
COST_RECONCILIATION
```

yang menyesuaikan inventory value/COGS yang terdampak.

Tidak overwrite history.

---

## 43. Sold inventory before cost correction

Jika sebagian barang sudah terjual sebelum Purchase cost diperbaiki, reconciliation harus dapat memengaruhi:

```text
Inventory Value
+
COGS already recognized
```

secara proporsional/traceable.

Kastur tidak boleh hanya mengubah cost stok yang tersisa dan mengabaikan unit yang sudah terjual.

---

## 44. Cost event ledger

Aku merekomendasikan secara konseptual adanya:

```text
COST EVENTS
```

seperti:

```text
INITIAL_COST
PURCHASE_COST
COST_RECONCILIATION
COGS_RECONCILIATION
MANUAL_COST_ADJUSTMENT
RETURN_COST_EFFECT
STOCK_VARIANCE_COST
```

Ini terpisah secara konseptual dari Stock Movement walaupun satu business event dapat menghasilkan keduanya.

---

## 45. Inventory value

Concept:

```text
Inventory Value
=
sum of inventory quantity × valuation basis
```

Tetapi reporting sebaiknya berasal dari costing ledger/state yang konsisten, bukan menghitung ulang secara sembarang dari current Product record.

---

## 46. Inventory quantity dan inventory value berbeda

Inventory Ledger menjawab:

```text
Berapa unit?
```

Costing menjawab:

```text
Berapa nilainya?
```

Keduanya berhubungan tetapi bukan entity yang sama.

Ini penting untuk menjaga separation of concerns.

---

## 47. Pricing tidak mengubah inventory cost

Jika Owner mengubah selling price:

```text
Rp15.000
→ Rp17.000
```

tidak ada perubahan pada:

```text
Weighted Average Cost
Inventory Value
COGS
```

Selling Price dan Cost adalah domain terpisah.

---

## 48. Pricing Reference update

Final landed cost baru dapat memperbarui:

```text
Pricing Reference Cost
```

dan menghasilkan:

```text
PRICE_REVIEW_RECOMMENDED
```

tetapi tidak mengaktifkan harga jual otomatis.

---

## 49. Cost decrease juga harus terlihat

Bukan hanya kenaikan cost.

Contoh:

```text
Old replacement cost:
Rp12.000

New:
Rp10.500
```

Owner dapat melihat peluang:

```text
Margin meningkat
Potential competitive price adjustment
```

tetapi tidak diwajibkan menurunkan harga.

---

## 50. Cost anomaly

Costing integration dengan Purchasing Integrity dapat menghasilkan:

```text
Cost +3%
Cost +12%
Cost +35%
```

berdasarkan threshold setting.

Anomaly adalah:

```text
review signal
```

bukan automatic rejection.

---

## 51. Supplier cost comparison

Costing mempertahankan cost berdasarkan:

```text
Product
Product Unit
Supplier
Date
Purchase
```

sehingga Back Office dapat membandingkan supplier.

Comparison tidak otomatis memengaruhi Weighted Average Cost sampai actual inventory diterima.

---

## 52. Quotation bukan inventory cost

Harga yang hanya ditawarkan supplier:

```text
Quotation
Rp100.000
```

tidak boleh mengubah MWA.

Hanya actual accepted inventory/commercial adjustment yang memengaruhi valuation.

Quotation boleh digunakan sebagai analytical comparison.

---

## 53. Agreed Cost vs Actual Cost

Agreed purchase price dapat menjadi:

```text
provisional reference
```

tetapi final landed cost menjadi authoritative actual acquisition cost setelah posting.

---

## 54. Future lot costing readiness

Current v2 tidak menjalankan lot costing.

Tetapi schema jangan membuat impossible untuk masa depan memiliki:

```text
Inventory Lot
├── qty
├── landed_cost
└── expiry
```

Current authoritative cost method tetap Moving Weighted Average.

---

## 55. Decimal quantities and costs

Semua calculation harus mendukung kombinasi seperti:

```text
0.75 KG
@ Rp18.450,375 / KG
```

Tanpa coercion ke integer.

Money display mengikuti currency rules.

Internal math menggunakan decimal arithmetic, bukan floating-point binary yang tidak terkontrol.

---

## 56. Currency

Current business scope:

```text
IDR
```

Architecture sebaiknya tidak menyebarkan hardcoded string `"Rp"` ke calculation engine.

Currency formatting berada di presentation layer/configuration.

Multi-currency belum menjadi requirement v2.

---

## 57. Cost calculation determinism

Calculation service harus deterministik.

Input sama menghasilkan output sama.

Tidak boleh terdapat formula cost berbeda antara:

```text
Purchasing screen
Product screen
Reporting
Pricing Calculator
```

Gunakan shared domain service/rules.

---

## 58. Historical immutability

Perubahan master data seperti:

```text
Product Name
Unit Label
Supplier Name
```

tidak mengubah historical cost economics.

Snapshot/reference yang diperlukan harus dipertahankan.

---

## 59. Owner visibility

Owner harus dapat melihat pada Product:

```text
Current Stock
Inventory Average Cost
Inventory Value

Latest Landed Cost
Pricing Reference Cost

Previous Cost
Cost Change %

Current Selling Price
Current Margin
```

Tanpa perlu membuka beberapa halaman tidak terkait.

---

## 60. Admin visibility

Admin dapat melihat operational costing yang diperlukan untuk:

- Purchasing
- Receiving
- Cost correction
- Pricing proposal

sesuai permission.

Cashier tidak melihat costing.

---

## 61. Audit

Minimum audited events:

```text
Initial Cost Created
Purchase Cost Calculated
Provisional Cost Used
Final Cost Reconciled
Manual Cost Adjustment
Negative Stock COGS Reconciliation
Customer Return Cost
Supplier Return Cost
Stock Variance Cost
Pricing Reference Changed
```

---

## 62. Reporting implications

Costing domain harus dapat menghasilkan sumber data untuk:

```text
COGS
Gross Profit
Gross Margin
Inventory Value
Inventory Gain/Loss
Cost Trend
Supplier Cost Trend
Cost Reconciliation
```

Tanpa full accounting/general ledger.

---

## 63. Tidak membangun full accounting

Costing Kastur adalah **operational retail costing**, bukan accounting suite.

Tidak masuk scope:

```text
General Ledger
Journal Entries UI
Balance Sheet
AP accounting
Tax ledger
Financial accounting close
```

Namun data harus cukup baik untuk diekspor/integrasikan kelak.

---

## 64. Core invariants

Kita lock:

1. **Inventory valuation menggunakan Moving Weighted Average.**
2. **Pricing Reference menggunakan Latest Valid Landed/Replacement Cost.**
3. Cost selalu dinormalisasi ke Base Unit.
4. Internal cost menggunakan decimal precision.
5. Sale normal memakai current valid MWA sebagai COGS.
6. Negative-stock sale memakai provisional last-valid MWA.
7. Negative stock direkonsiliasi ketika replacement inventory tersedia.
8. Customer Return memakai cost snapshot transaksi asli.
9. Stock Opname memakai inventory valuation cost, bukan pricing cost.
10. Supplier claim merujuk original commercial cost.
11. Cost history tidak di-overwrite.
12. Manual cost change selalu menjadi explicit audited event.
13. Selling-price change tidak mengubah cost.
14. Supplier quotation tidak mengubah inventory valuation.
15. Purchase final cost dapat memicu pricing review tetapi tidak mengubah selling price otomatis.

---

## 65. Definition of Done

Domain Costing dianggap memenuhi requirement jika benar untuk kasus berikut.

### Standard purchase

```text
100 PCS @ Rp2.500
+ 100 PCS @ Rp3.000

MWA:
Rp2.750
```

### Bonus

```text
Buy 10
Free 1

Cost distributed over 11 units.
```

### Partial receiving

```text
Provisional cost
→ Final landed cost
→ reconciliation
```

### Sale

```text
Sell using current MWA
→ COGS snapshot preserved.
```

### Negative Stock

```text
Stock 2
Sell 5
→ -3

Use provisional COGS
→ future receipt
→ COGS reconciliation
```

### Customer Return

```text
Original cost Rp2.800
Current cost Rp3.100

Return restock
→ Rp2.800
```

### Stock Opname

```text
Physical shortage
→ Inventory Loss based on MWA.
```

### Supplier Return

```text
Return item
→ commercial claim linked to original purchase cost.
```

### Purchase Correction

```text
Posted cost incorrect
→ Cost Reconciliation
→ history preserved.
```

### Pricing Reference

```text
MWA = Rp10.500
Latest Landed = Rp12.000

Inventory uses Rp10.500
Pricing uses Rp12.000.
```

---

# Core invariant Domain 03

> **Kastur memisahkan nilai historis persediaan dari biaya untuk mengganti barang saat ini. Inventory menggunakan Moving Weighted Average, sedangkan Pricing menggunakan Latest Valid Landed/Replacement Cost. Semua perubahan cost berasal dari business event yang dapat diaudit, bukan overwrite manual.**

Flow domain:

```text
Product
↓
Purchasing
↓
Receiving
↓
Landed Cost
↓
Inventory Valuation
↓
Pricing Reference
```
