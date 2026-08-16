# Kastur Retail System — Business Rules v1
## Domain 09: Customer, Return & Refund

**Status:** Draft for Approval  
**Depends on:** Domain 03 Costing & Inventory Valuation, Domain 05 Inventory & Stock Control, Domain 06 Sales & POS Transaction, Domain 07 Shift, Cash & Payment Control, Domain 08 Identity, Role, Permission & Audit  
**Primary Users:** Cashier, Admin, Owner  
**Consumed by:** POS, Inventory, Costing, Shift & Cash, Reporting, Audit

---

## 1. Tujuan domain

Customer, Return & Refund harus mampu menjawab secara konsisten:

```text
Transaksi mana yang dikembalikan?
Item mana yang dikembalikan?
Berapa quantity yang masih boleh diretur?
Apa alasan retur?
Apakah barang kembali menjadi stok?
Bagaimana COGS dibalik?
Berapa refund yang diberikan?
Metode refund apa yang digunakan?
Siapa yang mengotorisasi?
Apakah ada indikasi abuse/fraud?
```

Return dan Refund adalah **business events baru** yang mereferensikan transaksi asli.

Original sale tidak dihapus atau di-overwrite.

---

## 2. Return ≠ Void

Kastur membedakan:

```text
VOID
```

dan:

```text
CUSTOMER_RETURN
```

Void digunakan untuk pembatalan transaksi completed sesuai policy.

Return digunakan ketika customer mengembalikan sebagian/seluruh barang setelah transaksi selesai.

---

## 3. Partial Return didukung

Contoh:

```text
Original Sale:
5 PCS Indomie

Return:
2 PCS
```

Original transaction tetap menunjukkan:

```text
Sold:
5 PCS
```

Return event menunjukkan:

```text
Returned:
2 PCS
```

Net commercial result dapat dihitung dari keduanya.

---

## 4. Full Return didukung

Jika semua returnable quantity dikembalikan:

```text
Return Type:
FULL
```

Original sale tetap dipertahankan.

Jangan mengubah original transaction menjadi seolah-olah tidak pernah ada.

---

## 5. Return selalu mereferensikan original transaction

Preferred normal flow:

```text
Find Transaction
↓
Open Transaction
↓
Select Returnable Item
↓
Select Quantity
↓
Reason
↓
Disposition
↓
Refund
↓
Complete Return
```

---

## 6. Return item references original line

Setiap Return Item minimal mereferensikan:

```text
transaction_id
transaction_item_id
product_id
product_unit_id
original_qty
return_qty
```

---

## 7. Return quantity protection

Total quantity yang telah diretur tidak boleh melebihi original sold quantity.

Formula:

```text
Remaining Returnable Qty
=
Original Sold Qty
- Previous Completed Return Qty
```

---

## 8. Duplicate return prevention

Retry/sync tidak boleh menciptakan return ganda.

Setiap return mempunyai:

```text
return_id
```

yang stable/collision-resistant.

---

## 9. Return lifecycle

Recommended:

```text
DRAFT
↓
PENDING_CONFIRMATION
↓
COMPLETED
```

Alternative:

```text
CANCELLED
REJECTED
```

Jika approval workflow tertentu digunakan:

```text
PENDING_APPROVAL
```

dapat ditambahkan sebagai exception.

---

## 10. Return draft

DRAFT tidak mengubah:

- inventory,
- COGS,
- payment,
- cash drawer.

Efek bisnis terjadi saat return finalized/completed.

---

## 11. Return finalization boundary

Saat return completed:

```text
Return Record
+
Return Items
+
Inventory Effect
+
Cost Effect
+
Refund/Payment Effect
+
Audit
+
Sync Event
```

harus menjadi satu business commit sejauh technology memungkinkan.

---

## 12. Return reason wajib

Setiap return harus memiliki:

```text
reason_code
```

Optional:

```text
reason_note
```

---

## 13. Recommended return reasons

Minimal:

```text
WRONG_ITEM
DAMAGED
DEFECTIVE
EXPIRED
QUALITY_ISSUE
CUSTOMER_CHANGED_MIND
WRONG_QUANTITY
PRICE_DISPUTE
TRANSACTION_ERROR
OTHER
```

---

## 14. Reason ≠ disposition

Alasan return dan perlakuan inventory adalah dua konsep berbeda.

Contoh:

```text
Reason:
WRONG_ITEM

Disposition:
RESTOCK
```

atau:

```text
Reason:
DAMAGED

Disposition:
NOT_RESTOCKED
```

---

## 15. Return disposition

Minimal:

```text
RESTOCK
NOT_RESTOCKED
```

Future-ready:

```text
QUARANTINE
DAMAGED_STOCK
```

tanpa harus diimplementasikan sekarang.

---

## 16. RESTOCK

Jika barang masih layak dijual:

```text
Disposition:
RESTOCK
```

Inventory menghasilkan:

```text
CUSTOMER_RETURN +qty
```

---

## 17. NOT_RESTOCKED

Jika barang:

- rusak,
- terbuka,
- expired,
- tidak layak jual,

maka:

```text
Disposition:
NOT_RESTOCKED
```

tidak menghasilkan sellable inventory increase.

---

## 18. Return inventory uses Base Unit

Seperti Domain 05:

```text
Return:
2 CARTON

1 CARTON = 40 PCS
```

Jika RESTOCK:

```text
CUSTOMER_RETURN +80 PCS
```

---

## 19. Conversion snapshot

Return menggunakan conversion snapshot dari original transaction item.

Jangan menggunakan current Product Unit conversion jika sudah berubah.

---

## 20. Customer Return Cost

Jika RESTOCK, cost menggunakan:

```text
original transaction cost_snapshot
```

sesuai Domain 03.

Bukan current MWA.

---

## 21. Customer Return reverses original economics

Contoh:

```text
Original Sale:
Price Rp4.000
Cost  Rp2.800
```

Return 1 PCS:

```text
Inventory Restock Cost:
Rp2.800
```

sehingga COGS reversal mencerminkan transaksi asli.

---

## 22. Return after provisional COGS

Jika original sale menggunakan provisional negative-stock COGS:

Return harus merujuk original cost state.

Jika original transaction kemudian direkonsiliasi, return economics juga harus tetap konsisten melalui cost reconciliation logic.

---

## 23. Non-restocked return cost

Jika customer direfund tetapi barang tidak kembali ke sellable stock:

tidak ada inventory restock.

Cost effect harus dapat diklasifikasikan sebagai loss/write-off sesuai reporting operational.

---

## 24. Refund ≠ Return

Return menjelaskan barang.

Refund menjelaskan uang.

Satu Return dapat mempunyai satu atau lebih Refund records secara schema bila diperlukan.

---

## 25. Refund amount

Default refund amount berasal dari:

```text
actual amount paid attributable to returned item
```

bukan current selling price.

---

## 26. Refund uses historical selling economics

Jika original item dibeli dengan:

- tier price,
- promotion,
- manual discount,

refund menggunakan effective historical paid value.

Jangan refund berdasarkan harga aktif hari ini.

---

## 27. Refund discount allocation

Jika transaction-level discount sebelumnya dialokasikan ke line, refund menggunakan allocated historical discount snapshot.

---

## 28. Partial quantity refund

Contoh:

```text
Original:
10 PCS
Final line total:
Rp30.000

Return:
4 PCS
```

Refund proportional terhadap effective historical unit economics, subject to deterministic rounding.

---

## 29. Refund tax treatment

Refund harus membalik tax treatment sesuai original transaction.

Jangan menggunakan current tax setting jika sudah berubah.

---

## 30. Refund method default

Recommended:

> Refund menggunakan metode pembayaran original sejauh memungkinkan.

Contoh:

```text
Original:
CASH
→ Refund CASH

Original:
QRIS
→ Refund QRIS/provider flow
```

---

## 31. Refund method override

Jika refund harus menggunakan metode berbeda:

```text
refund.override_method
```

dibutuhkan sesuai policy.

Reason wajib.

---

## 32. Cash refund

Refund dengan CASH menghasilkan:

```text
Cash Drawer -
```

pada shift saat refund diproses.

---

## 33. Non-cash refund

Refund QRIS/Transfer tidak mengurangi physical cash drawer kecuali user secara explicit memilih cash override.

---

## 34. Refund today does not rewrite old shift

Jika original sale terjadi kemarin:

```text
Original Shift:
unchanged
```

Refund hari ini tercatat pada shift/payment activity hari ini.

---

## 35. Original sale remains historical

Historical sale tetap menunjukkan original payment.

Refund ditampilkan sebagai linked subsequent event.

---

## 36. Full refund status

Jika seluruh refundable monetary amount dikembalikan:

Transaction dapat memiliki derived state:

```text
REFUNDED_FULL
```

tetapi original sale record tidak dihapus.

---

## 37. Partial refund status

Jika hanya sebagian:

```text
REFUNDED_PARTIAL
```

derived/commercial state dapat ditampilkan.

---

## 38. Refund lifecycle

Recommended:

```text
PENDING
COMPLETED
FAILED
REVERSED
```

tergantung payment method/provider.

---

## 39. Failed refund

Failed refund tidak dianggap uang telah kembali ke customer.

Return business event dapat berada pada state exception sampai settlement terselesaikan.

---

## 40. Refund retry must be idempotent

Provider/network retry tidak boleh membuat customer menerima refund dua kali.

Gunakan stable:

```text
refund_id
idempotency_key
```

atau equivalent.

---

## 41. Return without customer identity

Customer record tidak wajib.

Return dapat dilakukan dengan original transaction reference walaupun sale adalah walk-in.

---

## 42. Customer identity optional

Jika customer terhubung pada original transaction:

return history dapat dikaitkan ke customer.

Tetapi tidak wajib untuk melakukan normal return.

---

## 43. Return window

Kastur harus mendukung configurable:

```text
return_window_days
```

atau policy equivalent.

Contoh:

```text
7 days
14 days
30 days
```

Tidak hardcoded.

---

## 44. Return window is policy, not data deletion

Transaksi lama tetap dapat dilihat.

Jika melewati return window:

```text
Normal return blocked/warned
```

tetapi Owner/Admin override dapat tersedia dengan reason.

---

## 45. Return outside window

Recommended:

```text
return.override_window
```

untuk supervisor/Owner.

Audit wajib.

---

## 46. No-receipt return

Normal return sebaiknya mencari original transaction.

Namun toko retail dapat menghadapi customer tanpa struk.

V2 dapat mendukung:

```text
NO_RECEIPT_RETURN
```

sebagai exception.

---

## 47. No-receipt return authority

No-receipt return tidak boleh menjadi normal Cashier path.

Recommended:

```text
return.no_receipt
→ Owner/Admin
```

atau supervisor permission.

---

## 48. No-receipt return pricing basis

Tanpa original transaction, Kastur tidak tahu historical paid price secara authoritative.

Karena itu system harus meminta controlled refund basis.

Recommended options:

```text
Current Active Price
Lowest Recent Selling Price
Manual Authorized Amount
No Cash Refund / Exchange Only
```

Policy dipilih business.

---

## 49. No-receipt return requires reason

Wajib:

```text
reason
actor
timestamp
product
quantity
refund basis
```

dan audit.

---

## 50. No-receipt return fraud risk

System harus menandai no-receipt return sebagai:

```text
HIGH_RISK_RETURN
```

untuk Owner review.

Bukan automatic fraud accusation.

---

## 51. Original receipt is not mandatory if transaction can be found

Customer tidak perlu membawa kertas receipt jika transaction dapat ditemukan melalui:

```text
Transaction Number
Date
Product
Customer
Payment Reference
```

---

## 52. Return search

Back Office/POS return search minimal:

```text
Transaction Number
Date
Product
Customer
Payment Reference if available
```

---

## 53. Barcode-assisted return

Saat transaction sudah dibuka, scan barcode dapat membantu menemukan matching transaction line.

Jangan return Product yang tidak ada pada original transaction tanpa explicit no-receipt/exception flow.

---

## 54. Returnable item visibility

Transaction detail harus menunjukkan:

```text
Sold Qty
Previously Returned Qty
Remaining Returnable Qty
```

---

## 55. Return reason per line

Dalam satu Return, tiap line dapat memiliki reason/disposition berbeda jika diperlukan.

Contoh:

```text
Item A:
WRONG_ITEM / RESTOCK

Item B:
DAMAGED / NOT_RESTOCKED
```

---

## 56. Bulk return

Satu Return dapat berisi beberapa transaction items dari satu original transaction.

V2 tidak perlu menggabungkan items dari multiple original transactions ke satu Return.

---

## 57. One return = one original transaction

Recommended v2 rule:

> Satu Customer Return mereferensikan satu original transaction.

Jika customer mengembalikan barang dari dua struk:

buat dua Return records.

Lebih sederhana untuk audit/refund.

---

## 58. Exchange

Exchange diperlakukan sebagai:

```text
Return
+
New Sale
```

bukan edit original transaction.

---

## 59. Exchange value difference

Contoh:

```text
Returned item value:
Rp20.000

New item:
Rp25.000
```

Customer membayar:

```text
Rp5.000
```

melalui new sale/payment.

---

## 60. Exchange with lower value

Jika new item lebih murah:

```text
Return/Refund
+
New Sale
```

selisih direfund sesuai policy.

---

## 61. Exchange inventory integrity

Returned item dan new sold item menghasilkan independent stock events.

Jangan mengganti Product ID pada original line.

---

## 62. Wrong cashier transaction correction

Jika cashier memasukkan item salah tetapi sale sudah completed:

Gunakan:

```text
Return/Void
+
New Sale
```

sesuai case.

Jangan edit original completed line.

---

## 63. Price dispute

Jika customer mengklaim harga rak berbeda:

Return reason dapat:

```text
PRICE_DISPUTE
```

Tetapi jika toko hanya memberikan price adjustment tanpa barang dikembalikan, gunakan dedicated transaction adjustment/refund flow bila diimplementasikan.

Jangan membuat fake stock return.

---

## 64. Refund without item return

Policy dapat mengizinkan goodwill/refund adjustment tertentu.

Ini bukan normal `RESTOCK` return.

Harus:

```text
NOT_RESTOCKED
```

atau dedicated refund-only event.

High-risk/permission controlled.

---

## 65. Refund-only event

Architecture dapat mendukung:

```text
REFUND_ONLY
```

untuk kasus seperti pricing correction.

Wajib mereferensikan original transaction dan reason.

---

## 66. Refund-only inventory effect

Tidak ada inventory movement jika barang tidak benar-benar kembali.

---

## 67. Damaged item returned

Jika item rusak dikembalikan:

```text
NOT_RESTOCKED
```

default.

Jika business ingin menyimpan damaged stock secara terpisah, future disposition:

```text
QUARANTINE
```

dapat ditambahkan.

---

## 68. Expired item return

Untuk current non-lot inventory:

```text
Reason = EXPIRED
Disposition = NOT_RESTOCKED
```

Expiry lot detail future-ready.

---

## 69. Customer-caused damage

Policy dapat menolak return jika damage disebabkan customer.

Kastur dapat record:

```text
REJECTED_RETURN
```

tanpa inventory/refund effect.

---

## 70. Return rejection

Jika return ditolak:

```text
Return Request
→ REJECTED
```

dan alasan dapat dicatat.

Tidak ada refund/stock effect.

---

## 71. Rejected return audit

Minimal:

```text
transaction
item
requested_qty
reason
rejected_by
rejection_reason
timestamp
```

---

## 72. Cashier return authority

Cashier dapat diberi:

```text
return.process
```

untuk normal in-window, receipt-linked return.

High-risk cases membutuhkan supervisor permission.

---

## 73. Return permissions

Recommended:

```text
return.read
return.process
return.override_window
return.no_receipt
return.override_disposition
return.reject
```

---

## 74. Refund permissions

Recommended:

```text
refund.process
refund.override_amount
refund.override_method
refund.reverse
```

---

## 75. Cashier default authority

Default Cashier:

- normal linked return sesuai policy,
- refund sesuai original method jika allowed,
- tidak no-receipt,
- tidak override window,
- tidak override amount.

Exact preset ditentukan Domain 08.

---

## 76. Admin authority

Admin dapat:

- review return,
- process higher-risk return,
- no-receipt jika permission,
- override return window jika permission.

---

## 77. Owner authority

Owner dapat:

- override policy,
- override refund method/amount,
- resolve dispute,
- review anomaly.

Semua tetap diaudit.

---

## 78. Refund amount override

Jika refund amount berbeda dari calculated historical value:

```text
refund.override_amount
```

dibutuhkan.

Wajib reason.

---

## 79. Over-refund prevention

Normal system harus mencegah:

```text
Total Refund
>
Maximum Refundable Amount
```

setelah memperhitungkan refund sebelumnya.

---

## 80. Maximum refundable amount

Conceptually:

```text
Remaining Refundable
=
Original Settled Amount
- Previous Completed Refunds
```

dengan allocation ke item yang konsisten.

---

## 81. Promotion return

Jika item dibeli saat promo:

refund memakai harga promo aktual yang dibayar.

Promotion yang sudah berakhir tidak relevan.

---

## 82. Tier return

Jika item dibeli pada quantity tier:

refund menggunakan historical tier/effective price snapshot.

---

## 83. Manual discount return

Manual discount yang sudah diberikan mengurangi refundable value.

Jangan refund seolah-olah customer membayar full base price.

---

## 84. Transaction-level discount return

Allocated transaction-level discount snapshot harus ikut diperhitungkan.

---

## 85. Return affects reporting

Reporting harus dapat memisahkan:

```text
Gross Sales
Returns
Refunds
Net Sales
```

---

## 86. Return date vs sale date

Return dicatat pada tanggal return event.

Jangan memindahkan return mundur ke sale date.

---

## 87. Historical profitability

Original sale dan subsequent return harus dapat direkonsiliasi dalam reporting.

Kastur tidak perlu menghapus gross sale; net reporting dapat mengurangi return/refund sesuai period policy.

---

## 88. COGS reversal reporting

RESTOCK return membalik COGS berdasarkan original cost snapshot.

NOT_RESTOCKED return dapat menghasilkan operational loss.

---

## 89. Return stock movement reference

`CUSTOMER_RETURN` movement harus mereferensikan:

```text
return_id
return_item_id
original_transaction_item_id
```

---

## 90. Refund payment reference

Refund record harus mereferensikan:

```text
return_id
original_transaction_id
original_payment_id if applicable
```

---

## 91. Return shift context

Return yang diproses di POS menyimpan:

```text
processed_by
shift_id
location_id
device_id
```

---

## 92. Refund cash shift impact

Cash refund masuk cash ledger shift yang memproses refund.

---

## 93. Offline return

Return dapat diproses offline hanya jika:

- original transaction tersedia secara lokal/cached, atau
- explicit high-risk offline policy tersedia.

Recommended default:

receipt-linked cached transaction return boleh offline.

---

## 94. Offline no-receipt return

Recommended default:

```text
offline_allowed = false
```

untuk no-receipt high-risk return.

Architecture dapat membuat policy configurable.

---

## 95. Offline refund method constraints

Refund method mengikuti capability:

```text
offline_allowed
```

Cash refund dapat offline.

Provider refund mungkin membutuhkan online.

---

## 96. Pending provider refund

Jika barang return sudah accepted tetapi provider refund belum selesai:

```text
Return:
COMPLETED / ACCEPTED

Refund:
PENDING
```

atau equivalent separation.

Owner/Admin harus melihat outstanding refunds.

---

## 97. Outstanding Refund Queue

System dapat menampilkan:

```text
Refund Pending
Refund Failed
Provider Confirmation Needed
```

agar customer settlement tidak terlupakan.

---

## 98. Sync status separate

Return business status dan sync status terpisah.

Contoh:

```text
Return:
COMPLETED

Sync:
PENDING
```

valid.

---

## 99. Return sync idempotency

Sync retry tidak boleh menggandakan:

- return record,
- stock restock,
- COGS reversal,
- refund,
- cash movement.

---

## 100. Refund duplicate provider reference

Jika same refund/provider reference sudah digunakan:

system menandai:

```text
POSSIBLE_DUPLICATE_REFUND
```

atau block sesuai confidence.

---

## 101. Return abuse indicators

Kastur dapat menghitung review signals seperti:

```text
High Return Frequency
High No-Receipt Return Frequency
Repeated Same Product Returns
High Refund Value
Repeated Cash Refund Override
```

---

## 102. Cashier return anomaly

Owner/Admin dapat melihat:

```text
Cashier A
15 Returns / 7 days

Store Average:
3
```

sebagai review signal.

---

## 103. Customer return anomaly

Jika Customer identity tersedia:

```text
Repeated returns
High return value
No-receipt pattern
```

dapat menjadi operational risk signal.

Jangan otomatis menyimpulkan fraud.

---

## 104. Product return anomaly

System dapat melihat:

```text
Product X
Return rate unusually high
Reason: DAMAGED
```

yang dapat menunjukkan quality/supplier issue.

---

## 105. Supplier-quality linkage future insight

Return reason patterns seperti:

```text
DAMAGED
DEFECTIVE
EXPIRED
```

dapat dikorelasikan dengan supplier/purchase history untuk reporting.

Tidak otomatis menyalahkan supplier.

---

## 106. Refund leakage control

Owner Attention dapat menampilkan:

```text
Refunds Above Threshold
No-Receipt Returns
Refund Method Overrides
Refund Amount Overrides
Repeated Returns by Cashier
```

---

## 107. Return amount threshold

Business setting dapat mempunyai:

```text
high_value_return_threshold
```

Contoh:

```text
Rp500.000
```

di atas threshold:

```text
REVIEW_REQUIRED
```

atau supervisor authority.

---

## 108. High quantity return

Threshold juga dapat berbasis quantity/percentage of transaction.

Contoh:

```text
Return > 80% of transaction value
```

→ review signal.

---

## 109. Return policy settings

Recommended configurable settings:

```text
return_window_days
receipt_required_by_default
allow_no_receipt_return
allow_cashier_return
high_value_return_threshold
refund_original_method_required
```

---

## 110. Return policy changes do not alter historical returns

Policy baru berlaku untuk future return decisions.

Historical completed return tidak dihitung ulang.

---

## 111. Customer history

Jika Customer identity digunakan, profile dapat menunjukkan:

```text
Transactions
Returns
Refunds
Net Spend
```

sesuai permission.

---

## 112. Customer is not required for fraud controls

Cashier/transaction-based anomaly tetap dapat dihitung tanpa Customer identity.

---

## 113. Receipt reprint for return

Return flow dapat reprint original receipt jika transaction ditemukan.

Reprint bukan return event.

---

## 114. Return receipt/document

Completed return dapat menghasilkan:

```text
Return Receipt
```

berisi:

```text
Return Number
Original Transaction Number
Items
Qty
Refund Amount
Refund Method
Reason
Processed By
```

---

## 115. Return number

Gunakan immutable technical:

```text
return_id
```

dan optional human-readable:

```text
RET-20260816-0001
```

---

## 116. Refund number

Refund dapat memiliki:

```text
refund_id
```

dan optional display reference.

---

## 117. Offline numbering

Seperti transaction, numbering tidak boleh membuat offline return gagal.

Gunakan collision-resistant IDs dan display-safe scheme.

---

## 118. Return timestamp

Simpan:

```text
created_at
completed_at
```

dan jika offline:

```text
synced_at
```

terpisah.

---

## 119. Return location

Return menyimpan:

```text
location_id
```

walaupun v2 single-store UX.

---

## 120. Cross-location return future readiness

Current v2 tidak perlu mengizinkan return di outlet berbeda.

Schema jangan menghalangi future policy.

---

## 121. Return of inactive Product

Jika Product sekarang INACTIVE tetapi original transaction valid:

Return tetap dapat diproses.

Historical Product identity tetap valid.

---

## 122. Return of changed Product Unit

Jika current Unit configuration berubah:

Return menggunakan original transaction snapshot.

---

## 123. Return of non-inventory Product

Untuk `track_inventory = false`:

Return/refund dapat terjadi.

Tidak ada stock movement.

---

## 124. Service refund

Non-inventory/service Product dapat memiliki refund-only behavior.

Disposition inventory tidak relevan.

---

## 125. Zero-price/free promotional item

Jika customer menerima free item:

refundable monetary amount dapat:

```text
Rp0
```

tetapi physical return dapat tetap diproses jika diperlukan.

---

## 126. Bundle promotion future caution

Complex bundle promotion belum scope Domain 04.

Jika ditambahkan nanti, return allocation harus deterministic.

Current v2 tidak perlu memecahkan bundle return kompleks.

---

## 127. Refund reversal

Jika refund record salah dan provider/business memungkinkan correction:

gunakan:

```text
REFUND_REVERSAL
```

atau explicit correction event.

Jangan edit completed refund.

---

## 128. Return reversal

Completed physical return tidak dibatalkan dengan delete.

Jika return salah, gunakan controlled reversal/correction.

Inventory/payment consequences harus dibalik secara eksplisit.

---

## 129. Return correction reason

Setiap reversal/correction wajib reason + authority.

---

## 130. No hard delete

Completed:

```text
Return
Refund
```

tidak hard-delete melalui normal UI.

---

## 131. Audit events

Minimal:

```text
Return Created
Return Completed
Return Rejected
No-Receipt Return
Return Window Override
Disposition Override
Refund Created
Refund Completed
Refund Failed
Refund Amount Override
Refund Method Override
Refund Reversed
Return Reversed
High-Risk Return Flagged
```

---

## 132. Audit fields

Untuk high-risk return/refund:

```text
actor
timestamp
original_transaction
returned_items
reason
disposition
refund_amount
refund_method
before/after if corrected
override_reason
device
shift
```

---

## 133. Owner visibility

Owner dapat melihat:

```text
Return Value
Refund Value
Return Rate
No-Receipt Returns
High-Value Returns
Cash Refunds
Overrides
Top Return Reasons
Product Return Rate
Cashier Return Activity
```

---

## 134. Admin visibility

Admin dapat melihat operational return/refund history dan exception sesuai permission.

---

## 135. Cashier visibility

Cashier melihat:

- returnable transaction details,
- own/current shift return activity,
- permitted return actions.

Cashier tidak melihat sensitive cost/margin.

---

## 136. Return reporting

Recommended reports:

```text
Returns by Date
Returns by Product
Returns by Reason
Returns by Cashier
Returns by Customer if available
Restocked vs Not Restocked
Refund by Method
Refund Overrides
No-Receipt Returns
```

---

## 137. Return rate

Concept:

```text
Return Rate
=
Returned Qty / Sold Qty
```

atau value-based equivalent.

Reporting harus jelas metric mana yang digunakan.

---

## 138. Net sales

Net Sales reporting dapat menggunakan:

```text
Gross Completed Sales
- Completed Refund/Return Value
```

sesuai reporting period policy.

---

## 139. Period timing

Return tanggal 20 untuk sale tanggal 10:

- sale tetap masuk period tanggal 10,
- return/refund masuk event period tanggal 20.

Aggregated monthly reports dapat menghitung net effect sesuai event date.

---

## 140. Cash vs commercial reporting

Return/refund commercial date dan actual provider settlement date dapat berbeda.

System harus mampu membedakannya jika provider async.

---

## 141. Return without refund

Ada kasus:

```text
Return accepted
→ exchange only
```

Refund amount dapat 0 jika customer memilih replacement/new sale.

Harus explicit, bukan missing data.

---

## 142. Refund without restock

Ada kasus:

```text
Refund
+
NOT_RESTOCKED
```

valid.

---

## 143. Restock without refund

Kasus tertentu seperti operational correction dapat menghasilkan stock return tanpa refund, tetapi bukan normal customer return.

Jika didukung, harus explicit reason/authority.

---

## 144. Return policy transparency

POS harus menunjukkan kepada Cashier mengapa action diblokir/warning:

```text
Return window expired
Remaining returnable qty = 0
No-receipt permission required
Refund amount exceeds maximum
```

---

## 145. No silent policy bypass

System tidak boleh otomatis mengabaikan return policy karena user adalah Owner.

Owner override harus explicit dan audited.

---

## 146. Return finalization idempotency

Double-click/tap tidak boleh membuat:

```text
2 stock restocks
2 refunds
```

Finalization command harus idempotent.

---

## 147. Atomicity

Return completion harus memastikan:

```text
Return
Inventory
Cost
Refund
Cash/Payment
Audit
```

tidak berhenti pada keadaan setengah committed secara local.

---

## 148. Error before return completion

Jika error sebelum commit:

```text
Return remains DRAFT
```

tanpa stock/refund final.

---

## 149. Error after local completion but before sync

Return tetap:

```text
COMPLETED
Sync = PENDING/FAILED
```

Jangan meminta cashier mengulangi return.

---

## 150. Core Invariants

Kita lock:

1. Return dan Void adalah konsep berbeda.
2. Partial dan Full Return didukung.
3. Normal Return selalu merujuk original transaction.
4. Return Item merujuk original transaction line.
5. Total return quantity tidak boleh melebihi sold quantity.
6. Return reason wajib.
7. Reason dan disposition adalah konsep berbeda.
8. RESTOCK menghasilkan `CUSTOMER_RETURN` inventory movement.
9. NOT_RESTOCKED tidak menambah sellable stock.
10. Return menggunakan original unit conversion snapshot.
11. Restock cost menggunakan original transaction cost snapshot.
12. Refund menggunakan historical amount paid, bukan current price.
13. Promotion/tier/manual discount historical tetap diperhitungkan.
14. Refund dan Return adalah event berbeda.
15. Refund default menggunakan original payment method.
16. Refund method override membutuhkan permission + reason.
17. Refund hari ini tidak mengubah original shift.
18. Completed sale tetap immutable.
19. Return window configurable.
20. Outside-window return membutuhkan override authority.
21. No-receipt return adalah high-risk exception.
22. Exchange = Return + New Sale.
23. Original transaction tidak diedit untuk exchange.
24. Refund-only event tidak menghasilkan stock movement.
25. Failed refund tidak dianggap settled.
26. Return dan Refund sync harus idempotent.
27. Business status dan Sync status terpisah.
28. Cash refund memengaruhi current refunding shift.
29. Historical return tidak berubah ketika policy berubah.
30. High-risk return signals bukan otomatis bukti fraud.
31. Completed Return/Refund tidak hard-delete.
32. Corrections menggunakan reversal/new events.
33. Cashier tidak melihat cost/margin.
34. Return finalization harus atomic secara local.
35. Owner override tetap explicit dan audited.

---

## 151. Definition of Done

Domain Customer, Return & Refund dianggap benar bila kasus berikut dapat ditangani.

### Partial Return

```text
Sold:
5 PCS

Return:
2 PCS

Remaining returnable:
3 PCS
```

### Full Return

```text
Sold:
5 PCS

Return:
5 PCS

Remaining:
0
```

### Restock

```text
Return:
2 PCS

Disposition:
RESTOCK

Inventory:
+2 PCS
```

### Damaged Return

```text
Return:
1 PCS

Disposition:
NOT_RESTOCKED

Inventory:
no increase
```

### Historical Cost

```text
Original Cost:
Rp2.800

Current Cost:
Rp3.100

Restock:
Rp2.800 basis
```

### Promotion Refund

```text
Current Price:
Rp12.000

Customer paid promo:
Rp10.000

Refund:
based on Rp10.000
```

### Quantity Tier Refund

```text
Original tier price:
Rp3.100

Current retail:
Rp3.500

Refund:
historical Rp3.100 basis
```

### Duplicate Return Protection

```text
Original qty:
5

Previous return:
3

New requested:
3

→ BLOCK
Remaining only 2
```

### Cash Refund

```text
Refund Rp20.000 CASH
→ current shift cash drawer -Rp20.000
```

### QRIS Refund

```text
Refund QRIS
→ no physical drawer decrease
```

### Refund Method Override

```text
Original QRIS
Refund CASH
→ override permission + reason
```

### Outside Return Window

```text
Policy:
7 days

Return day 10
→ normal blocked/warning
→ Owner override possible
```

### No-Receipt Return

```text
Original transaction not found
→ supervisor permission
→ controlled refund basis
→ HIGH_RISK_RETURN
→ audit
```

### Exchange

```text
Return Product A Rp20.000
New Sale Product B Rp25.000
Customer pays Rp5.000 difference
```

### Refund Without Restock

```text
Damaged Product
→ Refund
→ NOT_RESTOCKED
→ no inventory increase
```

### Offline Return

```text
Original cached transaction
→ cash refund offline
→ completed locally
→ sync pending
```

### Sync Retry

```text
same return retried
→ one return
→ one stock movement
→ one refund
```

### Return Anomaly

```text
Cashier return frequency unusually high
→ Owner Attention
→ no automatic fraud accusation
```

---

# Core invariant Domain 09

> **Kastur memperlakukan Customer Return sebagai business event baru yang mereferensikan transaksi asli, bukan sebagai edit terhadap penjualan historis. Barang, cost, dan uang direkonsiliasi secara terpisah: disposition menentukan inventory effect, original cost snapshot menentukan cost reversal, dan historical amount paid menentukan refund. Semua exception—terutama no-receipt, outside-window, dan refund override—harus explicit, permission-controlled, dan auditable.**

Flow utama:

```text
ORIGINAL COMPLETED SALE
          ↓
      RETURN LOOKUP
          ↓
   SELECT ITEM + QTY
          ↓
        REASON
          ↓
      DISPOSITION
     ┌────┴─────┐
     ↓          ↓
  RESTOCK   NOT_RESTOCKED
     ↓          ↓
INVENTORY +   NO STOCK +
     │          │
     └────┬─────┘
          ↓
   COST REVERSAL /
   LOSS TREATMENT
          ↓
       REFUND
   ┌──────┼──────┐
   ↓      ↓      ↓
 CASH   QRIS   TRANSFER
   ↓      ↓      ↓
SHIFT / PAYMENT LEDGER
          ↓
     RETURN COMPLETE
          ↓
         AUDIT
