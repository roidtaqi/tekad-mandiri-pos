# Kastur Retail System — Business Rules v1
## Domain 04: Pricing, Margin & Price Governance

**Status:** Draft for Approval  
**Depends on:** Domain 01 Product Catalog, Domain 02 Purchasing & Receiving, Domain 03 Costing & Inventory Valuation  
**Primary Users:** Owner, Admin  
**Consumed by:** Back Office, POS, Reporting

---

## 1. Tujuan domain

Pricing harus menjawab pertanyaan berikut secara konsisten:

```text
Berapa harga jual yang direkomendasikan?
Berapa margin aktual pada harga sekarang?
Berapa harga minimum yang masih diperbolehkan?
Harga tier mana yang berlaku?
Apakah promo sedang aktif?
Siapa yang boleh mengubah harga?
Kapan harga baru mulai berlaku?
Kenapa harga berubah?
```

Karena itu Kastur tidak boleh menyimpan harga jual sebagai satu angka sederhana seperti:

```text
product.price
```

tanpa versioning, governance, dan rule source yang jelas.

---

## 2. Pricing Reference Cost

Pricing menggunakan:

```text
Pricing Reference Cost
```

yang berasal dari Domain 03.

Default:

```text
Latest Valid Landed / Replacement Cost
```

bukan Moving Weighted Average Cost.

Inventory Valuation Cost dan Pricing Reference Cost adalah dua konsep berbeda.

---

## 3. Margin definition

Kastur menggunakan margin terhadap selling price.

Formula:

```text
Profit
=
Selling Price - Pricing Reference Cost
```

```text
Margin
=
Profit / Selling Price
```

Bukan markup terhadap cost.

---

## 4. Recommended Selling Price

Formula dasar:

```text
Recommended Selling Price
=
Pricing Reference Cost / (1 - Target Margin)
```

Contoh:

```text
Cost:
Rp10.000

Target Margin:
20%

Recommended Raw Price:
Rp12.500
```

Rounding diterapkan setelah perhitungan raw recommendation.

---

## 5. Margin Rule Hierarchy

Untuk v2 hierarchy margin dibuat sederhana:

```text
Business Default
↓
Category Override
↓
Product Unit Override
```

Rule paling spesifik yang valid menang.

Jangan membawa hierarchy lama seperti:

```text
Brand
Supplier
```

sebagai margin source default pada v2.

---

## 6. Business Default Margin

Setiap business mempunyai default target margin.

Contoh:

```text
Default Target Margin:
20%
```

Produk tanpa override menggunakan nilai ini.

---

## 7. Category Margin Override

Category boleh mempunyai override.

Contoh:

```text
Business Default:
20%

Category "Minuman":
25%
```

Semua Product Unit dalam category tersebut menggunakan 25% kecuali memiliki Product Unit override.

---

## 8. Product Unit Margin Override

Product Unit adalah level margin paling spesifik dalam v2.

Contoh:

```text
Indomie Goreng

PCS
Target Margin = 20%

CARTON
Target Margin = 10%
```

Retail dan grosir boleh mempunyai margin target berbeda tanpa membuat Product terpisah.

---

## 9. Supplier bukan Margin Rule Source

Supplier memengaruhi:

```text
Cost
```

tetapi tidak secara langsung menentukan:

```text
Target Margin
```

Supplier cost history dapat memicu pricing review, tetapi supplier identity bukan margin hierarchy pada v2.

---

## 10. Brand bukan Margin Rule Source

Brand boleh digunakan untuk reporting/filtering, tetapi bukan default margin rule source pada v2.

Jika kebutuhan bisnis nyata muncul nanti, hierarchy dapat diperluas.

---

## 11. Minimum Margin

Selain Target Margin, Kastur mendukung:

```text
Minimum Margin
```

Minimum Margin digunakan untuk menghitung:

```text
Floor Price
```

Target Margin dan Minimum Margin adalah dua rule berbeda.

---

## 12. Floor Price

Formula dasar:

```text
Floor Price
=
Pricing Reference Cost / (1 - Minimum Margin)
```

Contoh:

```text
Cost:
Rp10.000

Minimum Margin:
5%

Floor Price Raw:
Rp10.526,315...
```

Rounding guard kemudian memastikan harga final tidak berada di bawah floor secara tidak sengaja.

---

## 13. Recommended Price vs Floor Price

Kastur harus membedakan:

```text
Recommended Price
```

dan:

```text
Floor Price
```

Recommended Price adalah target bisnis normal.

Floor Price adalah guardrail minimum.

Contoh:

```text
Pricing Reference Cost   Rp10.000
Floor Price              Rp10.600
Recommended Price        Rp12.500
```

---

## 14. Owner Floor Override

Owner boleh menetapkan harga di bawah Floor Price.

Tetapi wajib melewati:

```text
Warning
↓
Explicit Confirmation
↓
Override Reason
↓
Audit
```

Contoh:

```text
⚠ Harga berada di bawah minimum margin.

Minimum Margin: 5%
Resulting Margin: -2%
```

Owner tetap dapat melanjutkan.

---

## 15. Admin Proposal Below Floor

Admin boleh membuat proposal harga di bawah Floor Price.

Proposal harus ditandai:

```text
HIGH_RISK
```

atau equivalent warning state.

Admin tidak dapat mengaktifkannya sendiri.

Hanya Owner yang dapat menyetujuinya.

---

## 16. Cost Change Does Not Auto-Create Proposal

Ketika Pricing Reference Cost berubah:

```text
New Cost
↓
Margin Re-evaluation
↓
PRICE_REVIEW_RECOMMENDED
```

Kastur tidak otomatis menciptakan Price Proposal.

Admin atau Owner memilih apakah perubahan harga diperlukan.

---

## 17. Price Review Recommendation

System dapat menghasilkan signal:

```text
PRICE_REVIEW_RECOMMENDED
```

karena:

- cost naik,
- cost turun,
- current margin turun,
- current margin naik signifikan,
- price berada di bawah Floor Price,
- supplier replacement cost berubah besar.

Signal bukan approval workflow.

---

## 18. Pricing Calculator Roles

Pricing Calculator mempunyai dua mode:

### Quick Calculator

Simulasi bebas tanpa Product.

### Product Pricing

Menggunakan:

- Pricing Reference Cost,
- current active price,
- Target Margin,
- Minimum Margin,
- current tiers,
- Price History.

---

## 19. Quick Calculator

Quick Calculator tidak memerlukan Product.

Contoh input:

```text
Cost
Target Margin
Minimum Margin
Tax Treatment
Rounding Rule
```

Output:

```text
Recommended Price
Floor Price
Profit
Actual Margin
```

Quick Calculator tidak mengubah business data.

---

## 20. Product Pricing Calculator

Product Pricing mode mengambil data actual Product Unit.

Contoh:

```text
Product:
Indomie Goreng

Unit:
PCS

Pricing Reference Cost:
Rp2.775

Current Price:
Rp3.300

Target Margin:
20%
```

System menghitung recommendation dan perbandingan harga aktif.

---

## 21. Calculator Never Activates Price Automatically

Rule fundamental:

```text
Calculator
→ Recommendation
```

bukan:

```text
Calculator
→ Active Price
```

Untuk Admin:

```text
Calculator
→ Use as Proposal
```

Untuk Owner:

```text
Calculator
→ Apply Price
→ Validation
→ Effective Date
```

---

## 22. Rounding Rule

Rounding tidak boleh hardcoded hanya ke Rp1.000.

Kastur mendukung configurable rules seperti:

```text
NONE
NEAREST_100
UP_TO_100
NEAREST_500
UP_TO_500
NEAREST_1000
UP_TO_1000
```

Business memilih default.

---

## 23. Rounding Rule Scope

Default rounding berlaku pada business level.

Architecture dapat mendukung override di masa depan tanpa menjadikannya requirement utama v2.

---

## 24. Rounding Determinism

Rounding service harus deterministik.

Input yang sama menghasilkan output yang sama di:

```text
Calculator
Price Proposal
Owner Direct Change
Batch Pricing
Reports
```

Tidak boleh ada formula rounding berbeda antar screen.

---

## 25. Rounding vs Floor Price

Rounding tidak boleh menghasilkan harga final di bawah Floor Price secara tidak sengaja.

Jika:

```text
Raw Floor:
Rp10.526

Rounded Candidate:
Rp10.500
```

maka system harus:

- memilih valid rounded value berikutnya, atau
- memberi explicit warning jika user memilih harga di bawah floor.

---

## 26. Tax Treatment

Pricing mendukung:

```text
NO_PPN
TAX_INCLUDED
TAX_EXCLUDED
```

Tax configuration harus konsisten dengan Pricing Calculator dan POS.

---

## 27. Margin Uses Correct Net Revenue

Margin tidak boleh salah karena tax dianggap profit.

Jika selling price termasuk tax, margin engine harus menggunakan revenue basis yang benar sesuai tax configuration.

Tax accounting penuh bukan scope v2.

---

## 28. Product Unit Pricing

Setiap Product Unit mempunyai pricing configuration sendiri.

Contoh:

```text
PCS
Price Set A

CARTON
Price Set B
```

Harga CARTON tidak otomatis sama dengan:

```text
PCS Price × Conversion
```

---

## 29. Price Tier

Satu Product Unit dapat memiliki beberapa quantity tiers.

Contoh:

```text
PCS

1+      Rp3.500
10+     Rp3.300
40+     Rp3.100
```

Price Tier menentukan harga berdasarkan quantity pada Product Unit yang sama.

---

## 30. Cross-Unit Tier Prohibition

Quantity conversion tidak digunakan untuk qualification antar-unit.

Contoh:

```text
1 CARTON = 40 PCS
```

tidak berarti:

```text
1 CARTON
```

otomatis menggunakan:

```text
PCS 40+ tier
```

CARTON mempunyai Price Tier sendiri.

---

## 31. Same-Unit Quantity Aggregation

Jika cart mempunyai beberapa line dengan Product Unit yang sama, effective quantity untuk tier harus digabungkan.

Contoh:

```text
5 PCS
+
7 PCS
```

effective quantity:

```text
12 PCS
```

Tier 10+ berlaku.

POS sebaiknya menggabungkan line yang identik sejak awal bila memungkinkan.

---

## 32. Mixed Unit Cart

Contoh:

```text
5 PCS
+
1 CARTON
```

Pricing tetap terpisah.

PCS quantity tidak digabung dengan CARTON quantity untuk tier resolution.

Inventory impact tetap dinormalisasi ke Base Unit.

---

## 33. Price Set

Perubahan harga satu Product sebaiknya dikelola sebagai satu:

```text
Price Set
```

Contoh:

```text
Indomie Goreng

PCS
1+     Rp3.500
10+    Rp3.300
40+    Rp3.100

CARTON
1+     Rp120.000
5+     Rp115.000
```

Owner dapat menilai hubungan antarharga secara bersama.

---

## 34. Price Set Consistency

Kastur dapat memberikan warning jika struktur harga tampak tidak konsisten.

Contoh:

```text
CARTON price
> 40 × PCS retail price
```

atau tier grosir menghasilkan effective unit price yang lebih mahal dari tier retail tertentu.

Warning bukan automatic block.

---

## 35. Admin Price Proposal

Admin dapat:

```text
Create Price Proposal
Edit Draft Proposal
Review Proposal
Submit for Owner Approval
```

Admin tidak dapat:

```text
Approve
Activate
```

proposal sendiri.

---

## 36. Proposal Data

Price Proposal minimal menyimpan:

```text
product_id
product_unit_id
pricing_reference_cost
target_margin
minimum_margin
current_price
recommended_price
proposed_price
proposal_reason
created_by
created_at
```

Jika tiers:

```text
tier_definition
tier_current_price
tier_proposed_price
```

juga dipertahankan.

---

## 37. Review Permission

Review boleh dilakukan oleh:

```text
Owner
Admin
```

Review bukan Approval.

---

## 38. Approval Permission

Hanya:

```text
Owner
```

yang dapat:

```text
APPROVE
REJECT
EDIT_AND_APPROVE
```

Price Proposal.

---

## 39. Owner Edit During Approval

Owner boleh mengubah proposal sebelum approval.

Contoh:

```text
Admin Proposed:
Rp14.000

Owner Final:
Rp13.500
```

Audit menyimpan keduanya.

---

## 40. Proposal Audit

Minimal simpan:

```text
Proposed By
Proposed At
Original Proposed Price
Reviewed By
Reviewed At
Approved By
Approved At
Final Approved Price
Reason / Notes
```

---

## 41. Owner Direct Price Change

Owner boleh mengubah harga tanpa self-approval.

Flow:

```text
Owner Edit
↓
Pricing Analysis
↓
Validation
↓
Warning if needed
↓
Confirm
↓
Effective Date
↓
New Price Version
```

---

## 42. Owner Direct Change Still Audited

Walaupun tidak membutuhkan Approval, Owner Direct Change harus menyimpan:

```text
changed_by
previous_price
new_price
pricing_reference_cost
resulting_margin
warnings
override_reason if applicable
effective_from
```

---

## 43. Effective Date

Setiap harga baru harus memiliki:

```text
effective_from
```

User choice:

```text
Effective Now
Schedule
```

Owner menentukan Effective Date untuk harga yang membutuhkan authority.

---

## 44. Price Version

Harga tidak di-overwrite.

Gunakan versioning.

Contoh:

```text
Price V1
Rp12.500
2026-08-01 → 2026-08-16

Price V2
Rp14.000
2026-08-17 →
```

Historical transaction tetap memakai snapshot harga saat sale.

---

## 45. No Overlapping Active Price Versions

Untuk kombinasi:

```text
Product Unit
+
Price Tier
```

tidak boleh terdapat dua Active Price Version pada waktu yang sama.

System mengelola:

```text
effective_from
effective_until
```

secara konsisten.

---

## 46. Scheduled Price

Approved price dengan future Effective Date mempunyai state:

```text
SCHEDULED
```

Saat waktunya tercapai:

```text
SCHEDULED
→ ACTIVE
```

secara otomatis.

---

## 47. Scheduled Price Replacement

Owner boleh mengganti harga scheduled sebelum aktif.

Harga scheduled lama menjadi:

```text
CANCELLED
```

atau:

```text
SUPERSEDED
```

Tidak dihapus.

---

## 48. Price Lifecycle

Recommended technical lifecycle:

```text
DRAFT
IN_REVIEW
PENDING_APPROVAL
APPROVED
SCHEDULED
ACTIVE
SUPERSEDED
```

Alternate end states:

```text
REJECTED
CANCELLED
```

UX tidak wajib menampilkan seluruh technical status.

---

## 49. Batch Price Proposal

Kastur v2 mendukung batch proposal.

Contoh:

```text
Supplier menaikkan cost 20 Product
↓
Admin pilih affected products
↓
Generate Pricing Recommendations
↓
Create Batch Proposal
```

Owner tidak perlu membuat workflow satu Product satu waktu.

---

## 50. Batch Proposal Item Independence

Satu Batch Proposal dapat berisi banyak Price Set.

Owner dapat:

```text
Approve All
Approve Selected
Edit Selected
Reject Selected
```

Item lain tetap memiliki status sendiri.

---

## 51. Batch Proposal Risk Visibility

Batch review harus memprioritaskan anomaly.

Contoh:

```text
20 Items

12 normal
5 margin below target
2 below floor
1 cost increase > 25%
```

Owner dapat fokus pada high-risk items.

---

## 52. Promotion

Promotion masuk scope Kastur v2 sebagai konsep terpisah dari Active Base Price.

Contoh:

```text
Base Price:
Rp10.000

Promotion:
Rp8.500
17–20 Aug
```

Setelah promo berakhir:

```text
Base Price tetap Rp10.000
```

---

## 53. Promotion Does Not Replace Base Price

Jangan membuat promo dengan cara:

```text
ubah Active Price
↓
ubah kembali nanti
```

Promotion adalah layer pricing sementara.

---

## 54. Promotion Scope v2

Promotion sederhana dapat mendukung:

```text
Product Unit
Fixed Promotional Price
Percentage Discount
Start Date
End Date
```

Advanced promotion seperti bundle kompleks atau buy-X-get-Y belum wajib.

---

## 55. Promotion Validation

Promotion harus dianalisis terhadap:

```text
Floor Price
Minimum Margin
```

Jika promo di bawah Floor Price:

```text
Warning + appropriate authority
```

dibutuhkan.

---

## 56. Manual Discount ≠ Promotion ≠ Price Tier

Ketiganya merupakan konsep berbeda.

```text
Price Tier
→ otomatis karena quantity

Promotion
→ otomatis karena campaign/time rule

Manual Discount
→ tindakan user dengan permission
```

Reporting dan transaction snapshot harus dapat membedakannya.

---

## 57. POS Price Resolution Order

Default resolution:

```text
Active Base Price
↓
Applicable Quantity Tier
↓
Applicable Promotion
↓
Authorized Manual Discount
↓
Final Selling Price
```

Setiap layer harus dapat dijelaskan.

---

## 58. Promotion Conflict

Jika beberapa Promotion berpotensi berlaku bersamaan, v2 harus menggunakan deterministic policy.

Recommended default:

```text
One best applicable promotion per line
```

berdasarkan configured priority/effective benefit.

Do not stack promotions automatically unless explicitly allowed.

---

## 59. Manual Discount Authority

Manual Discount menggunakan permissions/limit.

Contoh:

```text
Cashier:
max_discount_percent = 5%
```

Owner dapat mempunyai:

```text
discount.override
```

---

## 60. Manual Discount Below Floor

Jika manual discount menghasilkan final price di bawah Floor Price:

- Cashier normal tidak boleh melanjutkan,
- user dengan override permission dapat melanjutkan,
- reason + audit wajib.

---

## 61. Cart Price Snapshot

Saat Product Unit masuk cart, POS menyimpan pricing snapshot.

Minimal:

```text
base_price
tier_price
promotion
manual_discount
final_unit_price
pricing_version/reference
```

Jika price version berubah setelah cart sudah dibuat, line tidak boleh berubah diam-diam.

---

## 62. New Cart Uses New Effective Price

Harga baru berlaku untuk cart/line baru setelah Effective Date.

Transaksi/cart yang sudah mempunyai snapshot tidak direprice diam-diam kecuali user secara eksplisit meminta refresh/reprice sesuai rule POS.

---

## 63. Transaction Pricing Snapshot

Completed Transaction Item menyimpan:

```text
product_id
product_unit_id
qty
base_price_snapshot
tier_snapshot
promotion_snapshot
manual_discount_snapshot
final_price_snapshot
cost_snapshot
```

Historical transaction tidak berubah ketika pricing rules berubah kemudian.

---

## 64. Price History

Owner/Admin harus dapat melihat:

```text
Price History
```

dengan:

```text
Old Price
New Price
Effective Date
Source
Proposal / Owner Direct
Changed By
Pricing Reference Cost
Margin Result
Reason
```

---

## 65. Pricing Source

Setiap Active Price harus dapat menjawab:

```text
Kenapa harga ini menjadi aktif?
```

Possible sources:

```text
OPENING_PRICE
OWNER_DIRECT
ADMIN_PROPOSAL_APPROVED
BATCH_PROPOSAL_APPROVED
```

Promotion tetap mempunyai source/version sendiri.

---

## 66. Opening Price

Saat migrasi/onboarding:

```text
Opening Selling Price
```

boleh dibuat tanpa historical approval.

Source:

```text
OPENING_PRICE
```

Setelah onboarding, normal governance berlaku.

---

## 67. Price Change Warning

Warning dapat muncul karena:

```text
Margin below target
Margin below minimum
Price below cost
Price below Floor Price
Large percentage change
Cost anomaly
Tier inconsistency
Promotion below floor
```

Warning adalah decision support.

---

## 68. Large Price Change Threshold

System dapat mempunyai configurable threshold.

Contoh:

```text
Price change warning:
>= 10%

High change:
>= 25%
```

Bukan hardcoded permanent values.

---

## 69. Current Margin

Current Margin harus dihitung menggunakan:

```text
Current Effective Selling Price
```

dan:

```text
Current Pricing Reference Cost
```

untuk pricing decision.

Historical gross margin menggunakan historical transaction cost snapshot.

---

## 70. Margin Change Detection

Contoh:

```text
Current Active Price:
Rp12.500

Old Cost:
Rp10.000
Margin:
20%

New Cost:
Rp11.000
Current Margin:
12%
```

System menghasilkan:

```text
PRICE_REVIEW_RECOMMENDED
```

---

## 71. Cost Decrease Pricing Opportunity

Jika cost turun:

```text
Current margin meningkat
```

Kastur dapat menunjukkan:

```text
Pricing Opportunity
```

Owner bebas:

- mempertahankan harga,
- menurunkan harga,
- menjalankan Promotion.

Tidak otomatis menurunkan harga.

---

## 72. Pricing Alerts Are Not Price Changes

Alert hanya memberi informasi.

```text
Alert
≠ Proposal
≠ Approval
≠ Active Price
```

Ini harus dipertahankan secara domain dan UI.

---

## 73. POS Does Not Calculate Business Margin Rules

POS boleh menjalankan price resolution dari published pricing data.

POS tidak bertanggung jawab menentukan:

```text
Target Margin
Pricing Reference Cost
Recommended Price
Approval
```

Back Office/Pricing Domain adalah authority.

---

## 74. Published Price

POS hanya menggunakan price yang:

```text
ACTIVE
```

atau Promotion yang valid pada transaction time.

Draft/Proposal/Scheduled-future price tidak boleh bocor ke normal POS sale sebelum waktunya.

---

## 75. Offline Pricing

Karena POS offline-first, POS harus memiliki cached published pricing data.

Cache harus menyimpan:

```text
Price Version
Effective From
Tier Rules
Promotion Window
```

agar price resolution tetap deterministik ketika offline.

---

## 76. Scheduled Price Offline Edge Case

Jika POS offline melewati waktu aktivasi scheduled price, client harus menggunakan pricing data yang sudah berhasil disinkronkan sebelumnya.

System harus mampu menandai:

```text
Pricing data may be stale
```

jika update harga belum diterima.

Detail sync conflict ditangani di architecture/sync domain.

---

## 77. Pricing Cache Must Be Versioned

Jangan hanya cache:

```text
current_price = 3500
```

Cache harus dapat mengidentifikasi:

```text
price_version_id
effective_from
```

untuk audit transaksi offline.

---

## 78. Pricing Permission Examples

Recommended permissions:

```text
pricing.read
pricing.calculate
pricing.proposal.create
pricing.proposal.review
pricing.approve
pricing.direct_change
pricing.override_floor
pricing.rule.manage
promotion.manage
discount.override
```

Role hanya menjadi preset.

---

## 79. Owner Authority

Owner memiliki authority untuk:

- approve price proposal,
- reject proposal,
- edit-and-approve,
- direct price change,
- set Effective Date,
- override Floor Price,
- manage pricing policy,
- manage Promotion.

Semua tetap auditable.

---

## 80. Admin Authority

Admin dapat:

- menggunakan Calculator,
- melihat current pricing/cost sesuai permission,
- membuat Proposal,
- membuat Batch Proposal,
- review Proposal,
- menyiapkan Promotion draft jika permission diberikan.

Admin tidak dapat mengaktifkan Price Proposal sendiri.

---

## 81. Cashier Authority

Cashier:

- menggunakan published price,
- menerima automatic tier,
- menerima automatic promotion,
- menggunakan manual discount hanya dalam limit permission.

Cashier tidak melihat:

- Pricing Reference Cost,
- Target Margin,
- Minimum Margin,
- proposal,
- supplier cost.

---

## 82. Pricing Audit

Minimal audited events:

```text
Margin Rule Changed
Minimum Margin Changed
Rounding Rule Changed
Price Proposal Created
Proposal Reviewed
Proposal Approved
Proposal Rejected
Owner Direct Price Changed
Price Scheduled
Price Activated
Scheduled Price Cancelled/Superseded
Promotion Created
Promotion Activated
Promotion Ended
Floor Override
Manual Discount Override
```

---

## 83. No Silent Overwrite

Tidak boleh terdapat:

```text
Edit Product
Price = new value
Save
```

yang menimpa pricing history.

Semua perubahan harga merupakan explicit pricing event/version.

---

## 84. Price History Independence

Mengubah:

```text
Product Name
Category
Brand
Unit Label
```

tidak mengubah historical pricing economics.

Transaction dan Price History mempertahankan snapshot/reference yang diperlukan.

---

## 85. Reporting Requirements

Pricing Domain harus menyediakan data untuk:

```text
Current Price
Price History
Current Margin
Margin vs Target
Products Below Target Margin
Products Below Floor
Price Changes
Promotion Performance
Discount Usage
Batch Proposal Status
```

---

## 86. Promotion Reporting

Promotion harus dapat menjawab:

```text
Sales under promotion
Discount value
Gross profit under promotion
Units sold
Promotion period
```

tanpa mengubah base Price History menjadi kacau.

---

## 87. Tier Reporting

Reporting dapat membedakan penjualan:

```text
Retail/Base Tier
Wholesale Tier
```

berdasarkan applied tier snapshot.

Tidak perlu menciptakan Transaction Type "Retail/Grosir".

---

## 88. Price Set Historical Integrity

Jika tier structure berubah:

```text
1+
10+
40+
```

menjadi:

```text
1+
12+
48+
```

historical transaction tetap menunjukkan tier yang berlaku saat itu.

---

## 89. Tier Effective Versioning

Perubahan quantity threshold juga merupakan pricing version change.

Jangan hanya versioning nominal harga.

Snapshot harus mempertahankan:

```text
minimum_qty
unit_price
effective period
```

---

## 90. Invalid Tier Prevention

Dalam satu Product Unit Price Set:

minimum quantity tiers harus:

- unik,
- terurut,
- tidak overlap secara ambigu.

Contoh valid:

```text
1+
10+
40+
```

---

## 91. Tier Price Warning

System dapat memperingatkan bila:

```text
higher quantity
```

menghasilkan harga per unit lebih tinggi dari tier sebelumnya.

Tidak selalu hard block karena Owner mungkin mempunyai alasan khusus.

---

## 92. Promotion Date Validation

Promotion harus mempunyai:

```text
start_at
end_at
```

dengan:

```text
end_at > start_at
```

Open-ended promotion hanya jika explicitly supported.

---

## 93. Promotion vs Scheduled Base Price

Jika Promotion melintasi perubahan Base Price:

Promotion tetap menjadi layer sendiri.

System harus mengevaluasi promotion result terhadap Base Price/Cost yang berlaku pada waktu transaksi.

---

## 94. Floor Evaluation at Transaction Time

Untuk manual discount/Promotion yang memerlukan guard:

Floor evaluation menggunakan pricing policy/cost context yang relevan saat action dibuat.

Historical transaction menyimpan hasil akhirnya dan warning/override reference jika ada.

---

## 95. Non-goals Pricing v2

Belum termasuk:

- customer-specific contract pricing,
- loyalty member pricing,
- dynamic AI pricing,
- competitor automatic repricing,
- cross-unit automatic tier conversion,
- complex bundle promotions,
- buy-X-get-Y engine kompleks,
- coupon marketplace integration,
- franchise/store-specific pricing,
- multi-currency pricing.

Architecture jangan menutup kemungkinan fitur tersebut di masa depan.

---

## 96. Core Invariants

Kita lock:

1. Pricing menggunakan Pricing Reference Cost, bukan MWA.
2. Margin berarti profit / selling price.
3. Margin hierarchy v2 adalah `Business Default → Category → Product Unit`.
4. Target Margin dan Minimum Margin adalah rule berbeda.
5. Floor Price adalah guardrail minimum.
6. Owner dapat override Floor Price dengan warning, reason, dan audit.
7. Admin tidak dapat approve harga sendiri.
8. Cost change hanya menghasilkan review recommendation, bukan automatic price change.
9. Rounding configurable dan deterministik.
10. Rounding tidak boleh diam-diam melanggar Floor Price.
11. Product Unit pricing berdiri sendiri.
12. Cross-unit quantity tidak digabung untuk tier qualification.
13. Same-unit quantity digabung untuk tier qualification.
14. Price changes selalu versioned.
15. Effective Date ditentukan secara eksplisit.
16. Tidak ada overlapping active price version untuk Product Unit + Tier yang sama.
17. Promotion terpisah dari Base Price.
18. Price Tier, Promotion, dan Manual Discount adalah tiga konsep berbeda.
19. POS menggunakan published pricing, bukan menghitung margin policy sendiri.
20. Transaction selalu menyimpan pricing snapshot.
21. Calculator tidak pernah mengaktifkan harga secara otomatis.
22. Batch proposal didukung untuk operational efficiency.
23. Price History tidak pernah di-overwrite.
24. Owner Direct Change tetap mempunyai audit trail.
25. Historical transaction tidak berubah ketika pricing policy berubah.

---

## 97. Definition of Done

Pricing Domain dianggap memenuhi requirement bila dapat menangani kasus berikut.

### Normal Pricing

```text
Cost:
Rp10.000

Target Margin:
20%

Recommended:
Rp12.500
```

### Category Override

```text
Default:
20%

Category:
25%

Product Unit without override:
uses 25%
```

### Product Unit Override

```text
PCS:
20%

CARTON:
10%
```

### Floor Price

```text
Minimum Margin:
5%

Price below floor:
Warning / authority required
```

### Admin Proposal

```text
Admin
→ Proposal
→ Owner Approval
→ Effective Date
→ Active
```

### Owner Direct Change

```text
Owner
→ Edit
→ Warning
→ Confirm
→ Effective Date
→ Active
```

tanpa self-approval.

### Scheduled Price

```text
Approved today
Effective next Monday
→ SCHEDULED
→ ACTIVE at effective time
```

### Batch Proposal

```text
20 affected products
→ generate recommendations
→ one batch review
→ approve selected
```

### Quantity Tier

```text
PCS:

1+   Rp3.500
10+  Rp3.300
40+  Rp3.100
```

### Same-unit Aggregation

```text
5 PCS + 7 PCS
→ effective qty 12 PCS
→ 10+ tier
```

### Cross-unit Independence

```text
1 CARTON = 40 PCS

1 CARTON
≠ automatic PCS 40+ tier
```

### Promotion

```text
Base Price:
Rp10.000

Promo:
Rp8.500
17–20 Aug

21 Aug:
Base Price remains Rp10.000
```

### Manual Discount

```text
Automatic Tier
→ Promotion
→ authorized Manual Discount
→ Final Price
```

### Price Versioning

```text
V1 Rp12.500
V2 Rp14.000

Historical sale under V1 remains Rp12.500
```

### Cost Increase

```text
Cost increases
→ current margin drops
→ PRICE_REVIEW_RECOMMENDED
```

tanpa automatic selling-price change.

---

# Core invariant Domain 04

> **Kastur memperlakukan harga sebagai keputusan bisnis yang versioned dan governed, bukan sebagai field yang dapat di-overwrite. Pricing menggunakan replacement-oriented cost, margin policy, floor guard, quantity tier, promotion, dan authority yang jelas. Admin mengusulkan; Owner memutuskan; POS hanya mengeksekusi harga yang telah dipublikasikan.**

Flow utama:

```text
Pricing Reference Cost
↓
Margin Rules
↓
Calculator / Recommendation
↓
Price Proposal OR Owner Direct Change
↓
Validation + Floor Guard
↓
Owner Decision
↓
Effective Date
↓
Price Version
↓
Published Pricing
↓
POS Price Resolution
│
├── Quantity Tier
├── Promotion
└── Manual Discount
↓
Transaction Price Snapshot
