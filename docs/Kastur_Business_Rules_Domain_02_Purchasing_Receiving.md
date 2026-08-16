# Kastur Retail System — Business Rules v1
## Domain 02: Purchasing & Receiving

**Status:** Draft for Approval  
**Depends on:** Product Catalog & Unit Management  
**Primary User:** Admin  
**Controller:** Owner

---

## 1. Tujuan domain

Purchasing harus menjawab empat fakta yang berbeda:

```text
Apa yang disepakati?
Apa yang ditagihkan?
Apa yang benar-benar datang?
Apa yang akhirnya diterima sebagai stok?
```

Keempatnya **tidak boleh dianggap selalu sama**.

Karena itu model utama Kastur adalah:

```text
AGREED
   ↓
INVOICED
   ↓
RECEIVED
   ↓
ACCEPTED
   ↓
POSTED
```

Perbedaan di antaranya menghasilkan discrepancy/integrity alert.

---

## 2. Purchase sebagai satu transaksi bisnis

Kita lock:

> **Satu Purchase = satu transaksi pembelian / satu nota supplier.**

Beberapa nota supplier berarti beberapa Purchase.

Satu Purchase boleh memiliki banyak Product/Purchase Item.

Contoh:

```text
Purchase PUR-000123
Supplier ABC

├── Indomie Goreng   10 CTN
├── Aqua 600 ml       5 CTN
└── Gula 1 kg        20 PCS
```

Tidak perlu menggabungkan beberapa invoice menjadi satu Purchase.

---

## 3. Purchase dapat dimulai sebelum invoice datang

Walaupun akhirnya satu Purchase merujuk satu nota, Purchase boleh dibuat sejak pemesanan.

Contohnya:

```text
Admin telepon Supplier A
↓
Sepakat harga dan barang
↓
Catat Pesanan
↓
Barang datang
↓
Invoice dicatat
```

Ini memungkinkan Kastur mempunyai:

```text
Agreed Snapshot
```

sebelum supplier dapat mengubah kondisi.

Jika pembelian dilakukan langsung tanpa pemesanan sebelumnya, Purchase boleh dibuat ketika invoice diterima.

Dalam kasus tersebut:

```text
Agreed Snapshot = unavailable
```

dan integrity check hanya menggunakan:

- invoice,
- receiving,
- historical supplier price,
- duplicate detection.

Jadi kita tidak memaksa semua toko menggunakan formal PO.

---

## 4. Purchase lifecycle

Aku merekomendasikan status:

```text
DRAFT
↓
ORDERED
↓
PARTIALLY_RECEIVED
↓
RECEIVED
↓
POSTED
```

Dengan alternatif:

```text
CANCELLED
```

Tidak setiap Purchase harus melewati `ORDERED`.

Contoh pembelian langsung:

```text
DRAFT
↓
RECEIVED
↓
POSTED
```

---

## 5. Status Purchase ≠ Integrity Status

Ini harus menjadi dua state machine berbeda.

### Purchase Status

Menjawab:

> Sudah sampai tahap mana transaksi pembelian?

```text
DRAFT
ORDERED
PARTIALLY_RECEIVED
RECEIVED
POSTED
CANCELLED
```

### Integrity Status

Menjawab:

> Apakah transaksi sesuai dengan yang diharapkan?

```text
CLEAR
WARNING
REVIEW_REQUIRED
DISPUTED
RESOLVED
```

Contoh:

```text
Purchase Status:
RECEIVED

Integrity Status:
REVIEW_REQUIRED
```

Valid.

Barang memang sudah datang, tetapi ada masalah harga/qty/bonus.

---

## 6. Owner tidak approve Purchase normal

Kita lock kembali:

```text
Admin
→ Create
→ Receive
→ Post
```

tidak membutuhkan Owner approval.

Owner bukan bottleneck.

Owner masuk ketika:

```text
Exception / anomaly
```

terjadi.

Misalnya:

- kenaikan harga signifikan,
- barang kurang,
- bonus hilang,
- duplicate invoice,
- biaya tambahan,
- kerusakan,
- supplier return belum diselesaikan.

Ini adalah:

> **exception-based supervision**

---

## 7. Purchase Item

Setiap Purchase Item minimal mencatat:

```text
product_id
product_unit_id

ordered_qty
free_qty_expected

agreed_unit_cost

invoice_qty
invoice_unit_cost

received_qty
accepted_qty

purchase_discount
allocated_discount
allocated_additional_cost

landed_cost
base_unit_cost
```

Nilai snapshot juga harus dipertahankan bila master data berubah kemudian.

---

## 8. Decimal quantity

Sesuai keputusan kita:

> Quantity menggunakan numeric decimal-capable representation dari awal.

Jangan desain database:

```text
quantity INTEGER
```

semata-mata karena kebanyakan produk memakai PCS.

Harus dapat merepresentasikan:

```text
0.5 KG
1.25 KG
2.75 L
```

meskipun UI default retail tetap mengoptimalkan integer quantity.

---

## 9. Purchasing Unit

Purchase boleh menggunakan Product Unit yang memiliki:

```text
can_purchase = true
```

Contoh:

```text
Base Unit:
PCS

Purchase:
10 CARTON

Conversion:
40 PCS / CARTON
```

Inventory receipt:

```text
+400 PCS
```

Admin tidak melakukan conversion manual.

---

## 10. Agreed Purchase Snapshot

Jika terdapat kesepakatan sebelum barang datang, simpan:

```text
Supplier
Product
Unit
Qty
Free Qty
Agreed Price
Discount
Tax
Freight
Other agreed costs
Expected delivery
Notes
```

Opsional:

```text
Supplier quotation number
Screenshot
Photo
Document attachment
WhatsApp reference
```

Kastur tidak perlu menjadikan attachment mandatory untuk semua transaksi.

---

## 11. Agreed Snapshot menjadi immutable reference

Setelah Purchase berubah dari:

```text
DRAFT
→ ORDERED
```

kesepakatan asli jangan diam-diam ditimpa.

Jika ada negosiasi baru:

```text
Original agreement
↓
Revision
```

harus dapat ditelusuri.

Tujuannya bukan menciptakan contract management, tetapi menjaga baseline integrity check.

---

## 12. Partial Receiving

Kastur wajib mendukung:

```text
Ordered:
10 CARTON

Delivery 1:
6 CARTON

Delivery 2:
4 CARTON
```

Setelah delivery pertama:

```text
PARTIALLY_RECEIVED
```

Setelah seluruh qty terpenuhi:

```text
RECEIVED
```

Setiap Receiving adalah business event sendiri.

---

## 13. Receiving record

Satu Purchase dapat memiliki:

```text
Purchase
├── Receipt 1
├── Receipt 2
└── Receipt N
```

Setiap Receipt mencatat:

```text
received_at
received_by
supplier
items
physical quantity
accepted quantity
rejected quantity
condition
notes
```

Ini lebih baik daripada hanya mempunyai:

```text
purchase.received = true
```

---

## 14. Physical Received vs Accepted

Ini perbedaan fundamental.

Misalnya:

```text
Datang:
10 CARTON

Rusak:
1 CARTON
```

Maka:

```text
received_qty = 10
accepted_qty = 9
rejected_qty = 1
```

Inventory normal hanya menerima:

```text
+9 CARTON equivalent
```

Barang rusak tidak otomatis menjadi sellable stock.

---

## 15. Short Delivery

Contoh:

```text
Expected:
10 CARTON

Received:
9 CARTON
```

Kastur menghasilkan:

```text
SHORT_DELIVERY
```

dengan:

```text
Expected      10
Received       9
Difference    -1
```

dan estimasi nilai finansial.

---

## 16. Over Delivery

Kebalikannya juga harus dideteksi.

```text
Expected:
10 CARTON

Received:
11 CARTON
```

Jangan otomatis menganggap 11 benar.

System:

```text
⚠ OVER DELIVERY
```

Admin kemudian menentukan apakah:

- memang bonus,
- perubahan order,
- salah kirim,
- harus dikembalikan.

---

## 17. Bonus/free goods

Bonus merupakan first-class data.

Jangan menyimpan:

```text
Beli 10 + bonus 1
```

sebagai:

```text
quantity = 11
```

Simpan:

```text
purchased_qty = 10
free_qty = 1
```

sehingga kita dapat mengetahui apakah supplier memenuhi janji bonus.

---

## 18. Bonus memengaruhi effective cost

Contoh:

```text
Paid:
10 CARTON × Rp100.000
= Rp1.000.000

Bonus:
1 CARTON

Physical Accepted:
11 CARTON
```

Effective acquisition cost:

```text
Rp1.000.000
÷ 11 CARTON
```

bukan dibagi 10.

Dengan begitu bonus benar-benar menurunkan effective unit cost.

---

## 19. Bonus discrepancy

Contoh:

```text
Expected Bonus:
2 CARTON

Received Bonus:
1 CARTON
```

System:

```text
⚠ BONUS_SHORTFALL
```

dan estimasi nilai bonus yang belum dipenuhi.

---

## 20. Invoice data

Purchase harus dapat menyimpan:

```text
invoice_number
invoice_date
invoice_total
invoice_attachment
invoice_notes
```

Invoice number tidak wajib secara universal karena supplier kecil mungkin menggunakan nota sederhana.

Tetapi jika diberikan, harus digunakan untuk duplicate detection.

---

## 21. Duplicate invoice hard check

Jika ditemukan:

```text
Supplier sama
+
Invoice Number sama
```

Kastur harus memblokir posting normal sampai user memeriksa duplicate tersebut.

Contoh:

```text
Supplier ABC
INV-00391
```

sudah ada.

Input lagi:

```text
INV-00391
```

→ strong duplicate alert.

---

## 22. Near duplicate detection

System juga menghasilkan warning bila terdapat pola:

```text
same supplier
same date
same amount
similar invoice
similar items
```

Contohnya:

```text
INV00123
```

dan:

```text
INV-00123
```

atau invoice number berbeda tetapi transaksi identik.

Near duplicate:

```text
WARNING
```

bukan otomatis tuduhan fraud.

---

## 23. Agreed Price vs Invoice Price

Contoh:

```text
Agreed:
Rp112.000

Invoice:
Rp116.000
```

System menghitung:

```text
Variance:
+Rp4.000

Variance %:
+3.57%
```

dan menandai perbedaannya.

---

## 24. Historical Price Comparison

Invoice price juga dibandingkan terhadap:

```text
Last Purchase Cost
Supplier Historical Average
Other Supplier Recent Cost
```

Contoh Owner view:

```text
Supplier A invoice       Rp116.000
Supplier A last          Rp110.000
Supplier A avg 90d       Rp111.800
Supplier B recent        Rp112.000
```

Tetapi Kastur tidak otomatis menyimpulkan supplier curang.

---

## 25. Cost anomaly thresholds

Kastur harus mendukung configurable warning threshold.

Contoh:

```text
Cost increase warning:
>= 5%

High cost anomaly:
>= 15%
```

Angka ini harus menjadi setting bisnis, bukan hard-coded rule permanen.

---

## 26. Discount per item

Purchase Item dapat mempunyai:

```text
discount_percent
```

atau:

```text
discount_amount
```

System menghitung net item cost.

---

## 27. Transaction-level discount

Purchase juga dapat mempunyai diskon keseluruhan.

Contoh:

```text
Subtotal
Rp5.000.000

Global Discount
Rp100.000
```

Diskon tersebut harus dialokasikan ke Purchase Items untuk landed cost.

---

## 28. Discount allocation

Untuk v2 aku merekomendasikan default allocation:

> **proporsional berdasarkan nilai item sebelum discount tambahan.**

Jangan sekadar membagi rata per SKU.

Contoh:

```text
Item A = 80% transaction value
Item B = 20%

Global discount Rp100.000

A receives Rp80.000
B receives Rp20.000
```

Ini lebih masuk akal secara costing.

---

## 29. Additional acquisition cost

Purchase dapat mempunyai:

- freight,
- loading/unloading,
- direct transport,
- insurance jika relevan,
- direct acquisition fees.

Tidak termasuk:

- salary,
- store rent,
- internet,
- general electricity.

---

## 30. Additional cost allocation

Default:

```text
PROPORTIONAL_BY_ITEM_VALUE
```

Tetapi architecture harus memungkinkan strategi lain kelak, misalnya:

```text
BY_QUANTITY
BY_WEIGHT
MANUAL
```

Untuk v2 tidak perlu membuat UI allocation engine yang rumit.

---

## 31. Unexpected Charge

Jika kesepakatan:

```text
Freight:
Rp0
```

tetapi invoice:

```text
Freight:
Rp50.000
```

Kastur menandai:

```text
UNEXPECTED_CHARGE
```

Admin dapat memberikan reason.

---

## 32. Landed Cost

Setelah invoice final:

```text
Net Purchase Cost
+ Allocated Acquisition Cost
```

menghasilkan:

```text
Landed Cost
```

kemudian dinormalisasi ke Base Unit.

---

## 33. Provisional cost pada partial receiving

Partial receiving menciptakan tantangan penting.

Barang bisa masuk hari ini sementara invoice final belum selesai.

Karena itu Kastur boleh menggunakan:

```text
PROVISIONAL_COST
```

berdasarkan harga terbaik yang tersedia:

1. invoice cost jika sudah diketahui,
2. agreed cost,
3. fallback cost terakhir jika benar-benar diperlukan.

---

## 34. Final cost reconciliation

Ketika Purchase kemudian `POSTED`:

```text
Provisional Cost
↓
Final Landed Cost
```

Jika berbeda, jangan rewrite stock movement lama diam-diam.

Buat:

```text
COST_REVALUATION / COST_RECONCILIATION
```

yang dapat diaudit.

Ini menjaga ledger tetap konsisten.

---

## 35. Posting Purchase

`POSTED` berarti commercial data Purchase sudah final untuk transaksi tersebut.

Setelah POSTED:

- invoice final,
- landed cost final,
- receiving accounted,
- inventory effect recorded,
- integrity check evaluated.

Payment tidak harus lunas agar Purchase dapat POSTED.

---

## 36. Payment Status terpisah

Payment status:

```text
UNPAID
PARTIALLY_PAID
PAID
```

bersifat independen dari:

```text
Purchase Status
```

Contoh:

```text
Purchase:
POSTED

Payment:
UNPAID
```

valid.

---

## 37. Payment record sederhana

Untuk v2 cukup:

```text
payment_date
amount
method
reference
notes
recorded_by
```

Metode misalnya:

```text
CASH
BANK_TRANSFER
OTHER
```

Belum ada Accounts Payable lengkap.

---

## 38. Payment amount validation

Total payment tidak boleh diam-diam melebihi outstanding purchase amount.

Jika terjadi overpayment:

```text
WARNING / explicit handling
```

dibutuhkan.

---

## 39. Posted Purchase immutability

Setelah:

```text
POSTED
```

jangan menyediakan generic:

```text
Edit Purchase
→ Save
```

untuk mengubah sejarah.

Koreksi harus menjadi event baru.

---

## 40. Purchase Correction

Kesalahan input setelah POSTED menggunakan:

```text
PURCHASE_CORRECTION
```

dan mencatat:

```text
Original value
Corrected value
Reason
Actor
Timestamp
Affected cost
Affected inventory
```

Tidak semua koreksi harus mengubah inventory.

Contoh:

```text
Invoice number typo
```

berbeda dengan:

```text
Quantity salah.
```

---

## 41. Supplier Return

Supplier Return harus merujuk Purchase/Receipt awal bila memungkinkan.

Minimal:

```text
supplier_id
purchase_id
purchase_item_id
product_id
product_unit_id
quantity
base_quantity
reason
cost_reference
returned_at
returned_by
```

---

## 42. Return quantity validation

Qty retur tidak boleh melebihi qty yang secara bisnis masih dapat direferensikan sebagai barang diterima dari Purchase tersebut.

System harus memperhitungkan return sebelumnya.

---

## 43. Supplier Return Inventory Effect

Contoh:

```text
Return:
1 CARTON

1 CARTON = 40 PCS
```

Stock Movement:

```text
SUPPLIER_RETURN
-40 PCS
```

---

## 44. Supplier claim settlement

Supplier Return memiliki settlement status:

```text
PENDING_CREDIT
CREDIT_RECEIVED
REPLACED
REFUNDED
WRITTEN_OFF
```

Ini memungkinkan Owner mengetahui return yang belum diselesaikan supplier.

---

## 45. Replacement

Jika supplier mengganti barang:

```text
Return 1 CARTON
↓
Replacement 1 CARTON
```

harus menjadi business event terpisah.

Inventory:

```text
SUPPLIER_RETURN      -40
SUPPLIER_REPLACEMENT +40
```

Jangan menghapus return pertama.

---

## 46. Outstanding Supplier Claims

Owner harus dapat melihat:

```text
Supplier Claims

Supplier A
Pending Rp450.000

Supplier B
Pending Rp120.000
```

dan umur claim:

```text
3 days
14 days
30+ days
```

Ini salah satu kontrol terhadap kebocoran supplier.

---

## 47. Damaged goods

Receiving dapat mengklasifikasikan barang:

```text
ACCEPTED
DAMAGED
WRONG_ITEM
OTHER_REJECTED
```

Barang rejected tidak otomatis menjadi available inventory.

---

## 48. Product substitution

Jika supplier mengirim Product/Unit berbeda dari order:

```text
Expected:
Product A / CARTON 40

Received:
Product B
```

atau conversion berbeda, Receiving harus meminta explicit resolution.

Tidak boleh otomatis mengganti order line.

---

## 49. Unit conversion discrepancy

Jika order snapshot:

```text
1 CARTON = 40 PCS
```

dan barang aktual ternyata:

```text
1 CARTON = 36 PCS
```

system menandai:

```text
UNIT_CONFIGURATION_MISMATCH
```

Admin tidak boleh sembarang mengubah historical Product Unit conversion hanya supaya receipt terlihat cocok.

---

## 50. Integrity Checks

Setiap Purchase menjalankan checks seperti:

```text
Invoice duplicate?
Quantity match?
Price match?
Bonus match?
Discount match?
Unexpected charge?
Wrong product?
Wrong unit?
Damaged delivery?
Cost anomaly?
```

---

## 51. Purchase Integrity Result

Contoh:

```text
PUR-000123

✓ Invoice unique
✓ Product correct
⚠ Price mismatch
⚠ Missing bonus
✓ Quantity received
✓ Discount correct
```

dengan:

```text
Estimated Financial Exposure
Rp175.000
```

---

## 52. Estimated Financial Exposure

Untuk discrepancies yang dapat dihitung, Kastur sebaiknya menghitung estimasi nilai.

Contoh:

```text
Missing quantity     Rp112.000
Missing bonus        Rp100.000
Extra charge          Rp25.000
```

Total:

```text
Potential Difference
Rp237.000
```

Ini membantu Owner memprioritaskan kasus.

---

## 53. Owner Exception Queue

Owner tidak perlu membuka seluruh Purchase.

Dashboard/Back Office menyediakan:

```text
Perlu Ditinjau
```

berisi misalnya:

```text
5 Purchase anomalies
2 Supplier claims overdue
3 Cost increases > 10%
1 Possible duplicate invoice
```

---

## 54. Exception resolution

Owner dapat:

```text
ACKNOWLEDGE
ACCEPT_EXCEPTION
DISPUTE
RESOLVE
```

Contoh:

```text
Price increased 7%

Owner:
Accept Exception

Reason:
"Supplier confirmed new official price."
```

Integrity history tetap tersimpan.

---

## 55. Admin dapat memberikan explanation

Admin boleh mencatat:

```text
Explanation
Supporting attachment
Supplier confirmation
```

tetapi Admin tidak boleh menghapus anomaly history.

---

## 56. Supplier comparison

Untuk Product/Unit tertentu:

```text
Supplier A
Latest Cost

Supplier B
Latest Cost

Supplier C
Latest Cost
```

Kastur dapat menampilkan:

```text
Lowest Recent
Last Purchased
Historical Trend
```

tetapi tidak otomatis mengganti supplier.

---

## 57. Supplier performance

Supplier profile dapat menghitung indikator seperti:

```text
Purchases
Purchase Value
Price Discrepancies
Quantity Discrepancies
Missing Bonuses
Damaged Deliveries
Outstanding Claims
```

Nama yang digunakan:

> **Supplier Reliability**

bukan `Fraud Score`.

---

## 58. Supplier anomaly tidak sama dengan fraud

Ini menjadi explicit product rule:

> Kastur mendeteksi penyimpangan dan risiko transaksi, bukan menentukan secara otomatis bahwa supplier melakukan kecurangan.

UI menggunakan:

```text
Perlu Ditinjau
Selisih Ditemukan
Kemungkinan Duplikat
```

bukan:

```text
Supplier Curang
Fraud Detected
```

---

## 59. Sensitive Supplier Changes

Jika kelak supplier memiliki:

```text
Bank Account
Payment Details
```

perubahan data sensitif seperti rekening harus mempunyai:

```text
audit
+
Owner verification
```

Admin tidak boleh diam-diam mengganti destination payment account.

---

## 60. Audit Purchasing

Minimal audit:

```text
Purchase created
Agreement recorded
Purchase changed
Receipt created
Purchase posted
Cost finalized
Integrity anomaly generated
Integrity exception resolved
Payment recorded
Correction created
Supplier Return created
Claim resolved
```

Setiap event:

```text
Actor
Timestamp
Entity
Action
Before/After where relevant
Reason
```

---

## 61. Inventory integration

Receiving yang accepted membuat:

```text
PURCHASE_RECEIPT
```

pada Shared Inventory Ledger.

Contoh:

```text
10 CARTON
× 40 PCS

→ +400 PCS
```

Rejected goods tidak masuk stock normal.

---

## 62. Pricing integration

Setelah final landed cost tersedia:

```text
Purchase
↓
Final Cost
↓
Cost History
↓
Pricing Reference Cost evaluation
↓
Margin evaluation
```

Jika margin aktif bermasalah:

```text
PRICE_REVIEW_RECOMMENDED
```

Tetapi Purchase **tidak langsung mengubah selling price**.

---

## 63. Cashier tidak mengakses Purchasing

Cashier tidak mempunyai akses terhadap:

- supplier,
- invoice,
- purchase cost,
- landed cost,
- purchase anomalies,
- supplier pricing.

POS hanya menerima business data yang dibutuhkan untuk sales.

---

## 64. Non-goals Purchasing v2

Belum dibangun:

- RFQ
- tender supplier
- complex purchase approval hierarchy
- accounts payable ledger penuh
- general ledger
- automatic supplier selection
- automated bank payments
- three-way accounting reconciliation ERP penuh
- procurement contracts
- supplier portal

---

## 65. Definition of Done

Purchasing Domain dianggap memenuhi requirement ketika kasus-kasus berikut dapat ditangani:

### Normal purchase

```text
10 CARTON ordered
10 CARTON received
Invoice matches
→ CLEAR
```

### Partial receiving

```text
10 ordered
6 received
4 later
```

### Short delivery

```text
10 invoice
9 received
→ discrepancy
```

### Bonus

```text
Buy 10 + Free 1
```

### Missing bonus

```text
Expected 1
Received 0
→ discrepancy
```

### Price mismatch

```text
Agreed 100k
Invoice 105k
```

### Damaged product

```text
10 physical
9 accepted
1 rejected
```

### Duplicate invoice

```text
same supplier + invoice
→ strong warning/block
```

### Purchase on credit

```text
POSTED
UNPAID
```

### Supplier return

```text
Return stock
→ pending credit
→ later resolved
```

### Cost reconciliation

```text
Provisional receiving cost
→ final landed cost
→ audited reconciliation
```

---

# Core invariant Domain 02

> **Kastur tidak menganggap pesanan, invoice, barang yang datang, barang yang diterima, dan pembayaran sebagai fakta yang sama. Masing-masing dicatat secara independen lalu direkonsiliasi.**

Flow final:

```text
SUPPLIER
   ↓
AGREEMENT
   ↓
PURCHASE
   ↓
PARTIAL / FULL RECEIVING
   ↓
PHYSICAL VALIDATION
   ↓
INVOICE
   ↓
INTEGRITY CHECK
   ├───────────────┐
   ↓               ↓
 CLEAR         DISCREPANCY
   ↓               ↓
POST           OWNER REVIEW
   │               ↓
   │          RESOLUTION
   │
   ├── Inventory
   ├── Cost History
   ├── Payment Status
   └── Pricing Evaluation
```
