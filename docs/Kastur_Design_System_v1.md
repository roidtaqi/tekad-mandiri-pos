# Kastur Retail System — Design System v1

**Status:** Approved Baseline / Ready for Screen Specification  
**Depends on:** Information Architecture v1 + System Architecture v1 + API & Sync Contract v1  
**Scope:** Kastur Back Office + Kastur POS  
**Design Direction:** Modern Operational Retail  
**Theme Strategy:** Light-first, Dark-ready  
**Brand Strategy:** Brand-neutral foundation  
**UI Language:** Bahasa Indonesia  
**Internal Terminology:** English  
**Localization:** i18n-ready

---

# 1. Locked Product Experience Decisions

## 1.1 Back Office Device Strategy

Primary:

```text
Laptop / Desktop
```

Secondary:

```text
Tablet
Mobile / HP
```

Rule:

> Back Office is desktop-first, not desktop-only.

The design may use higher information density on large screens, but no core operational flow may become unusable on tablet/phone.

---

## 1.2 POS Device Strategy

Primary:

```text
Laptop / PC
Mouse
Keyboard
Barcode Scanner
```

Secondary:

```text
Tablet
Mobile / HP
Touchscreen
```

Rule:

> POS must be scanner-and-keyboard efficient first, while remaining touch-safe.

The UI must not assume every cashier uses touch.

---

## 1.3 Visual Character

Locked direction:

```text
Modern
Operational
Clean
Calm
Precise
Professional
Low cognitive load
```

Avoid:

```text
Playful consumer-app visual language
Decorative dashboard overload
Legacy accounting-software stiffness
Overuse of gradients
Excessive glassmorphism
Tiny dense enterprise controls
Oversized tablet-only UI
```

---

## 1.4 Theme

v1:

```text
Light-first
```

System architecture:

```text
Dark-ready
```

Dark mode does not need to ship in first production release.

All semantic tokens must therefore use abstraction:

```text
surface
text
border
accent
success
warning
danger
info
```

instead of hardcoded component-specific colors.

---

## 1.5 Brand

Foundation:

```text
Brand-neutral
```

Brand identity can later override:

```text
logo
primary accent
secondary accent
brand typography if appropriate
illustration style
```

without rebuilding component architecture.

---

## 1.6 Language

UI:

```text
Bahasa Indonesia
```

Examples:

```text
Ringkasan
Perlu Ditinjau
Terima Barang
Buat Proposal
Tutup Shift
Selesaikan Pembayaran
```

Code/internal:

```text
overview
attention
receiveGoods
priceProposal
closeShift
completePayment
```

All visible copy should be localization-ready.

---

# 2. Design Principles

## DS-P01 — Operational Clarity

Every screen should answer:

```text
What am I looking at?
What state is it in?
What should I do next?
What happens if I continue?
```

---

## DS-P02 — Task Before Decoration

Visual hierarchy is determined by user task priority.

Never add visual weight solely to make a screen look sophisticated.

---

## DS-P03 — Progressive Disclosure

Show:

```text
essential information first
```

then:

```text
secondary detail
advanced controls
audit/history
```

only when needed.

---

## DS-P04 — Predictability

Same pattern should mean the same thing everywhere.

Examples:

```text
Primary action location
Status badge semantics
Danger confirmation
Filter pattern
Record header
Table interaction
Keyboard shortcut behavior
```

---

## DS-P05 — Exception Without Panic

Warnings should be visible without turning normal operational screens into error-heavy interfaces.

Use severity semantics consistently.

---

## DS-P06 — High-Speed POS

Cashier workflows prioritize:

```text
scan
quantity
payment
completion
receipt
```

over secondary metadata.

---

## DS-P07 — Dense but Readable Back Office

Back Office can display more data than POS.

Density must support comparison and operational review without becoming cramped.

---

## DS-P08 — Keyboard as First-Class Input

POS and data-heavy Back Office flows must not require mouse-only interaction.

---

## DS-P09 — Touch-Safe Fallback

Controls used on tablet/mobile must retain adequate touch targets and spacing.

---

## DS-P10 — Historical Trust

Completed records should visually communicate immutability.

Correction actions must look like new business events, not ordinary edit forms.

---

# 3. Design Token Architecture

Recommended layers:

```text
Primitive Tokens
↓
Semantic Tokens
↓
Component Tokens
↓
Brand Overrides
```

Avoid direct hardcoded styling in feature screens.

---

# 4. Color Token Strategy

Exact brand colors intentionally not locked.

Use semantic roles.

## 4.1 Neutral Scale

Conceptual:

```text
neutral-0
neutral-50
neutral-100
neutral-200
neutral-300
neutral-400
neutral-500
neutral-600
neutral-700
neutral-800
neutral-900
neutral-950
```

Use for:

```text
background
surface
borders
secondary text
primary text
disabled states
```

---

## 4.2 Semantic Accent

```text
accent-subtle
accent-muted
accent
accent-strong
accent-contrast
```

Brand layer will later supply exact accent hue.

---

## 4.3 Status Colors

Semantic categories:

```text
success
warning
danger
info
neutral
```

Each requires:

```text
subtle background
border
foreground
strong foreground
```

Never communicate status using color alone.

Always pair with:

```text
text
icon
shape/status label
```

---

# 5. Status Semantics

## Success

Use for:

```text
Completed
Posted
Paid
Synced
Active
Resolved
Matched
```

## Warning

Use for:

```text
Low Stock
Negative Stock allowed
Cost Pending
Stale data
Small cash variance
Needs attention
```

## Danger

Use for:

```text
Critical
Failed
Blocked
Void
Rejected
Permission denied
Destructive action
```

## Info

Use for:

```text
Scheduled
Draft context
Syncing
Informational notices
```

## Neutral

Use for:

```text
Inactive
Cancelled
Superseded
Closed historical states
```

---

# 6. Exception Severity Visual Contract

Business severity:

```text
INFO
WARNING
REVIEW_REQUIRED
CRITICAL
```

UI labels in Indonesian:

```text
INFO             → Informasi
WARNING          → Peringatan
REVIEW_REQUIRED  → Perlu Ditinjau
CRITICAL         → Kritis
```

Critical should be visually prominent but not use flashing/animation.

---

# 7. Typography

## 7.1 Typeface Strategy

Brand-neutral v1 should use a highly legible modern sans-serif.

Preferred characteristics:

```text
clear numerals
tabular number support
excellent small-size legibility
neutral personality
broad language support
```

Implementation can use a system-font stack first.

Recommended conceptual stack:

```css
font-family:
Inter,
ui-sans-serif,
system-ui,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
sans-serif;
```

If Inter is bundled later, licensing/deployment should be handled appropriately.

---

# 8. Typography Scale

Recommended baseline:

```text
Display      32 / 40
H1           28 / 36
H2           22 / 30
H3           18 / 26
Body Large   16 / 24
Body         14 / 22
Body Small   13 / 20
Caption      12 / 18
Micro        11 / 16
```

Font weights:

```text
400 Regular
500 Medium
600 Semibold
700 Bold
```

Avoid overusing bold.

---

# 9. Numeric Typography

Operational figures should use:

```text
tabular numerals
```

where comparison matters.

Examples:

```text
Rp12.500
100.000 PCS
20,00%
08:32
```

Recommended:

```css
font-variant-numeric: tabular-nums;
```

---

# 10. Monetary Display

Default IDR UI:

```text
Rp12.500
Rp1.250.000
-Rp20.000
```

Do not show internal database precision such as:

```text
Rp12.500,0000
```

unless in specialized accounting/export context.

---

# 11. Quantity Display

Examples:

```text
12 PCS
1,5 KG
0,75 L
```

Display precision should follow unit configuration/business relevance.

Avoid trailing insignificant zeros.

---

# 12. Spacing System

Base unit:

```text
4px
```

Recommended scale:

```text
0    0
1    4
2    8
3    12
4    16
5    20
6    24
8    32
10   40
12   48
16   64
20   80
```

---

# 13. Border Radius

Operational system should not look overly soft.

Recommended:

```text
xs   4px
sm   6px
md   8px
lg   12px
xl   16px
full 9999px
```

Typical:

```text
Input      8px
Button     8px
Card       12px
Modal      12–16px
Badge      full or 6px depending context
```

---

# 14. Elevation

Use sparingly.

Preferred hierarchy:

```text
Level 0 — page
Level 1 — raised panel / sticky controls
Level 2 — dropdown/popover
Level 3 — modal/dialog
```

Most Back Office cards should rely on:

```text
surface contrast + border
```

rather than heavy shadows.

---

# 15. Page Background Hierarchy

Recommended:

```text
Application background
↓
Page surface
↓
Panel/card surface
↓
Interactive elevated layer
```

Avoid putting every content group inside a card.

---

# 16. Responsive Breakpoints

Conceptual:

```text
sm   640
md   768
lg   1024
xl   1280
2xl  1536
```

Behavior matters more than exact values.

---

# 17. Back Office Layout

Desktop:

```text
Persistent Sidebar
Top Utility Bar
Main Content
```

Tablet:

```text
Collapsible Sidebar / Drawer
Top Bar
Main Content
```

Mobile:

```text
Compact Top Bar
Navigation Drawer
Single-column content
```

Back Office does not need bottom-tab navigation unless later usability testing proves necessary.

---

# 18. Back Office Content Width

Do not force all data-heavy screens into a narrow centered column.

Use:

```text
fluid operational width
```

with practical maximums for forms/text-heavy pages.

Tables may span full available content width.

---

# 19. POS Layout — Desktop

Recommended conceptual layout:

```text
┌─────────────────────────────────────────────────────┐
│ Shift / Sync / Cashier / utility                    │
├────────────────────────────┬────────────────────────┤
│ Product Search / Catalog   │ Cart                   │
│                            │                        │
│                            │                        │
├────────────────────────────┴────────────────────────┤
│ Context / shortcut / payment action                 │
└─────────────────────────────────────────────────────┘
```

Desktop POS prioritizes:

```text
fast scanning
visible cart
minimal navigation changes
```

---

# 20. POS Layout — Tablet

Recommended:

```text
Product/Search area
+
Persistent or easily accessible Cart
```

Possible responsive pattern:

```text
split view landscape
stacked/cart drawer portrait
```

---

# 21. POS Layout — Mobile

Mobile is supported, not the primary optimization target.

Recommended:

```text
Search / Scan
↓
Product Results
↓
Persistent Cart Summary Bar
↓
Cart / Checkout full-screen flow
```

Do not attempt to preserve dense desktop split-layout on narrow screens.

---

# 22. Navigation — Back Office

Primary sidebar:

```text
Ringkasan
Perlu Ditinjau
Produk
Pembelian
Stok
Harga
Penjualan
Laporan
Pengaturan
```

Rules:

```text
icon + label
clear selected state
no icon-only primary navigation on desktop
```

---

# 23. Navigation — POS

Primary:

```text
Kasir
Tertahan
Transaksi
Retur
Shift
```

Desktop may use:

```text
top or side navigation
```

depending Screen Specification.

Must remain immediately reachable.

---

# 24. Record Header Pattern

Major detail pages share:

```text
Breadcrumb
Primary identity
Status
Key metadata
Critical warning
Primary contextual action
Secondary actions
```

Example:

```text
Pembelian / PUR-00129

PUR-00129
Supplier ABC

[POSTED] [PERLU DITINJAU]

Rp12.500.000
Terakhir diterima 16 Agu 2026

[Retur Supplier] [•••]
```

---

# 25. Page Header Pattern

Top-level pages:

```text
Title
Short context
Primary action
Optional secondary actions
```

Avoid large marketing-style hero headers.

---

# 26. Buttons

Variants:

```text
Primary
Secondary
Tertiary
Danger
Ghost
Icon
```

## Primary

One dominant action per local context.

Examples:

```text
Simpan
Terima Barang
Selesaikan Pembayaran
Post Pembelian
Setujui Harga
```

## Danger

Use only for destructive/high-risk transitions:

```text
Void Transaksi
Nonaktifkan User
Batalkan
```

Danger styling should not be used merely for `Cancel` dialog navigation.

---

# 27. Button Sizes

Back Office:

```text
Small    32px
Default  36–40px
Large    44px
```

POS primary controls:

```text
44–52px
```

Touch-critical action minimum:

```text
44×44px
```

---

# 28. Keyboard Focus

Every interactive component must have a visible focus state.

Never remove focus outline without replacement.

Keyboard order should follow visual/task order.

---

# 29. Keyboard Shortcuts — POS

Screen specifications should reserve common shortcuts.

Conceptual:

```text
F2 / shortcut → Search Product
F4            → Payment
Esc           → Close secondary overlay
Enter         → Confirm focused action
Ctrl/Cmd+K    → Search where appropriate
```

Exact shortcuts should be finalized later and avoid browser/OS conflicts.

Barcode scanner input must not be disrupted by global shortcuts.

---

# 30. Barcode Scanner Interaction

Scanner acts as keyboard input.

POS should:

```text
recognize rapid barcode sequence
submit on scanner terminator
resolve exact barcode
add line
return focus to scan-ready state
```

No modal after every successful scan.

Unknown barcode:

```text
small clear feedback
manual search option
focus remains operational
```

---

# 31. Forms

Form hierarchy:

```text
Required
Optional
Advanced
Review / Confirmation
```

Use persistent labels.

Do not use placeholder as the only label.

---

# 32. Input Heights

Default:

```text
40px Back Office
44px touch-priority
```

POS:

```text
44–48px minimum
```

---

# 33. Numeric Inputs

For:

```text
price
quantity
cash
margin
discount
```

Rules:

```text
right-align numeric text where comparison benefits
clear unit/currency suffix/prefix
locale-aware display
store clean decimal value internally
```

---

# 34. Quantity Stepper

Useful in POS:

```text
[-] 2 [+]
```

but keyboard entry remains available.

For large wholesale quantities, direct numeric input is essential.

---

# 35. Currency Input

Display:

```text
Rp
```

separate from raw numeric value.

Typing:

```text
12500
```

may display:

```text
Rp12.500
```

without moving cursor unpredictably.

---

# 36. Search Input

Primary search pattern:

```text
Search icon
Persistent label/placeholder
Clear action
Keyboard focus
```

Examples:

```text
Cari nama, SKU, atau barcode
Cari nomor transaksi
Cari supplier
```

---

# 37. Tables — Back Office

Tables are first-class components.

Must support:

```text
sticky header where useful
column alignment
sorting
filtering
responsive overflow
empty/loading/error states
row navigation
keyboard focus
```

Do not turn every desktop table into large cards.

---

# 38. Table Alignment

Recommended:

```text
Text          left
Date/time     left
Status        left/center
Quantity      right
Money         right
Percentage    right
Actions       right
```

---

# 39. Table Density

Back Office default:

```text
comfortable-compact
```

Recommended row height:

```text
44–48px
```

Optional dense mode later:

```text
36–40px
```

Do not ship ultra-dense mode before real need.

---

# 40. Responsive Tables

Tablet:

```text
horizontal scroll or prioritized columns
```

Mobile:

Convert to:

```text
structured list rows
```

only when horizontal table becomes unusable.

Do not hide critical data silently.

---

# 41. Row Click vs Action

Clicking row:

```text
opens Detail
```

Row action menu:

```text
•••
```

contains secondary contextual actions.

High-risk actions should not live as easy accidental row-click targets.

---

# 42. Filters

Pattern:

```text
Search
Quick filters
Advanced filters
Active filter chips
Clear all
```

Example:

```text
[Semua] [Draft] [Perlu Ditinjau] [Posted]
```

---

# 43. Date Range

Reports/history use a standardized date-range control.

Default timezone:

```text
Business Timezone
```

Display timezone context if ambiguity matters.

---

# 44. Status Badge

Status badge contains:

```text
semantic color
label
optional icon
```

Avoid excessive pills for ordinary metadata.

Use badges only for state/important classifications.

---

# 45. Alerts

Levels:

```text
Info
Warning
Review Required
Critical
```

Inline record alert anatomy:

```text
icon
title
short explanation
impact if relevant
recommended action
```

---

# 46. Toasts

Use for lightweight confirmation:

```text
Produk disimpan
Draft proposal dibuat
Sinkronisasi selesai
```

Do not use toast as the sole vehicle for:

```text
critical failure
permission denial requiring action
data-loss risk
conflict resolution
```

---

# 47. Dialogs

Use dialog for:

```text
high-impact confirmation
short focused form
irreversible/destructive transition
```

Do not use modal for every normal CRUD action.

---

# 48. Confirmation Dialog

High-risk dialog should show:

```text
What will happen
What cannot be undone
Impact
Reason input if required
Primary confirmation
Safe cancel
```

Example:

```text
Void transaksi Rp850.000?
```

not:

```text
Are you sure?
```

---

# 49. Drawer / Side Panel

Good for:

```text
quick detail
filters
secondary edit
cart on tablet
```

Not appropriate for complex multi-step workflows.

---

# 50. Multi-Step Flows

Use explicit step workflow only when sequence matters.

Examples:

```text
Import
Purchase Posting Review
Return
Shift Close
```

Do not create a wizard for simple Product creation.

---

# 51. Cards

Cards should group coherent content.

Avoid dashboard with dozens of equal cards.

Priority:

```text
critical/summary metrics
attention
next actions
```

---

# 52. KPI Cards

Use only for metrics that help a decision.

Anatomy:

```text
Label
Value
Context/change
Optional link
```

No decorative charts inside every KPI card.

---

# 53. Charts

Charts are secondary to operational data.

Use when they answer:

```text
trend
comparison
distribution
```

Never use a chart when a number/table communicates more clearly.

---

# 54. Empty States

Operational empty state should be actionable.

Examples:

```text
Belum ada pembelian.
[Buat Pembelian]
```

```text
Tidak ada item yang perlu ditinjau.
Semua exception saat ini sudah ditangani.
```

Avoid whimsical illustrations by default.

---

# 55. Loading States

Prefer:

```text
skeleton
inline progress
button progress
```

Avoid blocking full-page spinners when cached/local data exists.

---

# 56. Offline State

Global status indicator:

```text
Online
Offline
Menyinkronkan
Ada data belum tersinkron
Perlu tindakan
```

Offline must not look like application failure.

---

# 57. POS Offline Indicator

Small but persistent.

Example:

```text
Offline · 3 transaksi belum tersinkron
```

Cashier normal flow remains usable.

---

# 58. Sync Error

If local business data safe:

```text
Data tersimpan di perangkat.
Sinkronisasi akan dicoba kembali.
```

This message should not imply sale failed.

---

# 59. Conflict UX

Mutable conflict UI must compare:

```text
Perubahan di perangkat ini
vs
Versi terbaru di server
```

and clearly identify resolution action.

Never silently choose.

---

# 60. Immutable Record UX

Completed records should not show an ordinary:

```text
Edit
```

button.

Use explicit:

```text
Koreksi
Retur
Void
Reversal
```

depending domain.

---

# 61. Permission UX

Unavailable action:

Preferred:

```text
hidden when irrelevant
```

or disabled with explanation when understanding is useful.

Example:

```text
Setujui Harga
Hanya Owner yang dapat menyetujui harga.
```

Server enforcement remains mandatory.

---

# 62. Owner Override UX

Override must visibly distinguish:

```text
normal confirmation
```

from:

```text
policy override
```

Require:

```text
warning
reason
impact
permission
```

---

# 63. POS Cart Design

Each line should prioritize:

```text
Product Name
Unit
Qty
Effective Unit Price
Line Total
Pricing reason if non-standard
```

Secondary:

```text
stock warning
promotion label
manual discount
```

Never show:

```text
Cost
Margin
Floor Price
```

to Cashier.

---

# 64. POS Cart Visual Density

Desktop cart should fit many common basket lines without excessive scrolling.

Recommended line height:

```text
52–64px
```

depending included controls.

---

# 65. POS Totals

Visual hierarchy:

```text
Subtotal
Diskon
Pajak if applicable
----------------
TOTAL
```

TOTAL must be visually dominant.

---

# 66. POS Payment Screen

Primary hierarchy:

```text
Amount Due
Payment Method
Amount / QR status
Remaining
Complete
```

Cash payment should optimize common tender amounts.

---

# 67. Quick Cash Buttons

Optional:

```text
Uang Pas
Rp10.000
Rp20.000
Rp50.000
Rp100.000
```

only when appropriate to total/local operations.

Direct keyboard input remains available.

---

# 68. Split Payment UX

Display:

```text
Total
Already Paid
Remaining
```

Each payment appears as a line.

Example:

```text
Cash      Rp40.000
QRIS      Rp60.000
------------------
Remaining Rp0
```

Completion enabled only when settled.

---

# 69. Receipt Result

After sale:

```text
Payment successful / transaction completed
Transaction number
Total
Change if cash
Print / reprint
New transaction
```

New transaction should be the fastest next action.

---

# 70. Return UX

Return flow must visually differentiate:

```text
Return reason
Disposition
Refund
```

Do not conflate:

```text
Barang kembali ke stok
```

with:

```text
Dana dikembalikan
```

---

# 71. Return Disposition Labels

Use explicit language:

```text
Kembali ke Stok
Tidak Kembali ke Stok
```

Add explanation when needed.

---

# 72. Refund Pending UX

Composite message:

```text
Barang sudah diterima
Pengembalian dana sedang diproses
```

Never show generic `Selesai` without refund state.

---

# 73. Shift UX

Active shift header:

```text
Cashier
Opened At
Terminal
Sync state
```

Primary shift tasks:

```text
Kas Masuk
Kas Keluar
Safe Drop
Tutup Shift
```

---

# 74. Shift Close UX

Sequence:

```text
Review
↓
Count Cash
↓
Expected vs Actual
↓
Variance
↓
Reason if required
↓
Confirm Close
```

Avoid exposing calculated Expected Cash prematurely if business later decides blind-count policy.

This remains a Screen Specification decision.

---

# 75. Purchasing Detail UX

Purchase should visually compare:

```text
Disepakati
Ditagihkan
Diterima
Diterima sebagai stok
```

Difference should be immediately legible.

---

# 76. Purchasing Integrity Comparison

Recommended tabular comparison:

```text
Item
Agreed
Invoice
Received
Accepted
Variance
```

Highlight only meaningful variances.

---

# 77. Receiving UX

Receiving input row should prioritize:

```text
Expected
Previously Received
Receive Now
Accepted
Rejected
Remaining
```

Barcode-assisted receiving may be added later without changing layout principles.

---

# 78. Pricing UX

Pricing decisions should always provide context:

```text
Current Cost
Pricing Reference Cost
Current Price
Current Margin
Target Margin
Floor
Recommendation
Proposed Price
Resulting Margin
```

But reveal secondary calculations progressively on small screens.

---

# 79. Pricing Calculator

Two visual modes:

```text
Quick
Product
```

Result hierarchy:

```text
Recommended Price
Floor
Actual Margin
Profit
Difference vs Current
Warnings
```

---

# 80. Below-Floor Warning

Must be prominent.

Example:

```text
Harga ini berada di bawah batas margin minimum.
```

Owner override action separated from normal save/publish.

---

# 81. Inventory UX

Stock views should distinguish:

```text
In Stock
Low Stock
Out of Stock
Negative
Non-inventory
```

Use text/icon in addition to color.

---

# 82. Stock Adjustment UX

Before confirmation show:

```text
Current Stock
Adjustment
Resulting Stock
Estimated Value Impact
Reason
```

---

# 83. Stock Opname UX

Counting mode prioritizes:

```text
Product
System Snapshot if policy allows visibility
Physical Count
Movement During Count
Recount Recommendation
```

Count input should be keyboard friendly.

---

# 84. Attention Queue UX

List priority:

```text
Severity
What happened
Impact
Source
Age
Status
```

Owner should be able to triage without opening every record.

---

# 85. Attention Detail

Show:

```text
Summary
Why it matters
Financial/quantity impact
Source record
Evidence/context
Recommended action
Acknowledge / Resolve / Dismiss
```

---

# 86. Back Office Dashboard

Dashboard should not become a BI wall.

Top level:

```text
Business health
Today/current period
Important attention
Operational next actions
```

Avoid:

```text
12 charts
20 KPI cards
decorative trend tiles
```

---

# 87. Accessibility

Minimum:

```text
WCAG-aligned contrast
keyboard navigation
visible focus
semantic form labels
screen-reader accessible status
non-color-only meaning
reduced-motion compatible
```

Target level should be AA where practical.

---

# 88. Touch Target

Interactive target minimum:

```text
44×44px
```

for touch-critical contexts.

Desktop table icon actions may visually be smaller but interaction area should remain accessible.

---

# 89. Motion

Use minimal functional motion:

```text
drawer open
dialog transition
toast
loading
cart line feedback
```

Duration:

```text
fast
subtle
non-blocking
```

No ornamental page transitions.

---

# 90. Reduced Motion

Respect:

```css
prefers-reduced-motion
```

Core state transitions must not depend on animation.

---

# 91. Icons

Use one consistent icon family.

Current legacy stack already uses Lucide; it is a good candidate to retain.

Rules:

```text
icons support labels
primary navigation uses icon + text
do not invent multiple icon styles
```

---

# 92. Icon-Only Controls

Allowed when familiar and tooltipped/accessible:

```text
close
more
search
scan
print
```

Avoid ambiguous icon-only business actions.

---

# 93. Language Style

Bahasa Indonesia should be:

```text
clear
short
operational
natural
```

Prefer:

```text
Terima Barang
Tutup Shift
Buat Proposal
Kembali ke Stok
```

Avoid unnecessarily formal/legal language in routine actions.

---

# 94. Status Copy

Use human-facing labels.

Internal:

```text
PENDING_APPROVAL
```

UI:

```text
Menunggu Persetujuan
```

Internal:

```text
REVIEW_REQUIRED
```

UI:

```text
Perlu Ditinjau
```

---

# 95. Error Copy

Error message should answer:

```text
What happened?
What can user do?
Is data safe?
```

Example:

```text
Perubahan belum dapat disimpan karena produk ini sudah diperbarui di perangkat lain.
Tinjau versi terbaru sebelum mencoba lagi.
```

---

# 96. Destructive Copy

Use explicit object/action.

Good:

```text
Void Transaksi
Nonaktifkan Produk
Batalkan Proposal
```

Avoid:

```text
Hapus
OK
Ya
```

without context.

---

# 97. Date & Time Formatting

UI:

```text
16 Agu 2026
16 Agu 2026, 13.22
Hari ini, 13.22
```

Relative format may be used for recent operational context.

Historical exports retain explicit timestamps/timezone.

---

# 98. Loading from Local Cache

If cached data exists:

```text
show cached data immediately
```

then update status subtly.

Avoid waiting for cloud before rendering.

---

# 99. Stale Data Indicator

For sensitive stale master data:

```text
Terakhir diperbarui 12 menit lalu
```

only when operationally relevant.

Do not clutter every list row with sync timestamps.

---

# 100. Desktop Density Modes

v1 should ship one well-chosen default.

Possible future setting:

```text
Comfortable
Compact
```

Do not add density customization before actual user need.

---

# 101. Design System Component Inventory

## Foundation

```text
Typography
Color tokens
Spacing
Radius
Elevation
Grid
Responsive helpers
```

## Inputs

```text
Button
IconButton
TextInput
SearchInput
NumberInput
CurrencyInput
QuantityInput
Select
Combobox
Checkbox
Radio
Switch
TextArea
DatePicker
DateRange
```

## Data Display

```text
Badge
StatusBadge
Metric
Table
DataList
DescriptionList
Timeline
Money
Quantity
Percentage
EmptyState
Skeleton
```

## Feedback

```text
Alert
InlineMessage
Toast
Progress
OfflineIndicator
SyncIndicator
ConflictBanner
```

## Overlay

```text
Dialog
ConfirmationDialog
Drawer
Popover
DropdownMenu
Tooltip
```

## Navigation

```text
Sidebar
POSNav
TopBar
Breadcrumb
Tabs
Pagination
Command/Search launcher
```

## Operational

```text
RecordHeader
PageHeader
FilterBar
QuickFilter
AttentionItem
PricingSummary
StockStatus
PaymentMethodSelector
CartLine
CartSummary
Keypad/QuickCash
ShiftSummary
```

---

# 102. Shared vs App-Specific Components

Shared package:

```text
Button
Input
Table
Badge
Dialog
Alert
RecordHeader
FilterBar
Status
Money
Quantity
Navigation primitives
```

POS-specific:

```text
CartLine
ScannerCapture
PaymentPanel
QuickCash
POSProductResult
POSShiftBar
```

Back Office-specific:

```text
CommercialSummary
IntegrityComparison
PricingDecisionPanel
OpnameGrid
AttentionQueue
```

Do not force all specialized components into a generic shared component.

---

# 103. Design Token Naming

Recommended semantic naming:

```text
color.bg.canvas
color.bg.surface
color.bg.subtle

color.text.primary
color.text.secondary
color.text.muted
color.text.inverse

color.border.default
color.border.strong

color.action.primary
color.action.primaryHover

color.status.success
color.status.warning
color.status.danger
color.status.info
```

Avoid:

```text
blue500
gray200
```

inside feature UI.

Primitive tokens may still exist underneath.

---

# 104. Dark-Ready Rule

Feature components must not hardcode:

```text
white background
black text
gray border
```

They consume semantic tokens.

This keeps future dark mode possible.

---

# 105. Brand Override Contract

Future branding layer may define:

```text
brand.logo
brand.accent
brand.accentContrast
brand.favicon
brand.appName
```

without changing business component behavior.

---

# 106. Responsive Behavior Categories

Each component should declare:

```text
FIXED
FLUID
COLLAPSE
STACK
OVERFLOW
DRAWER
HIDE_SECONDARY
```

Example:

```text
Table → OVERFLOW / mobile DataList
Sidebar → COLLAPSE
POS Cart → DRAWER on narrow portrait
Record Header actions → COLLAPSE into menu
```

---

# 107. Mobile Priority Rule

When space reduces:

Keep:

```text
identity
status
primary action
critical warning
essential number
```

Move secondary information into:

```text
detail
accordion
secondary tab
overflow
```

---

# 108. POS Mobile Priority

Keep visible:

```text
scan/search
cart count
total
checkout
```

Secondary:

```text
stock detail
promotion explanation
customer
held cart metadata
```

---

# 109. Back Office Mobile Priority

Back Office mobile is primarily suitable for:

```text
review
lookup
quick approval
simple operational updates
attention triage
```

Complex bulk operations/import/table-heavy tasks may be easier on desktop but must remain accessible.

---

# 110. Primary Action Consistency

Desktop Back Office:

```text
top-right page/record header
```

Mobile:

```text
header or sticky bottom action when appropriate
```

POS:

```text
persistent task-local action
```

---

# 111. Sticky Actions

Appropriate for:

```text
Checkout
Complete Return
Post Opname
Approve Price
Close Shift
```

on long/narrow flows.

Avoid sticky action bars for ordinary read pages.

---

# 112. Save Behavior

Normal editable master forms:

```text
explicit Save
```

Do not auto-save high-impact business configuration silently.

Draft objects may auto-persist locally if clearly indicated.

---

# 113. Draft UX

Show:

```text
Draft tersimpan
```

when local/remote draft persistence occurs.

Never imply publication.

---

# 114. Online-Required Action UX

If action requires online:

When offline:

```text
button disabled or converted to "Simpan sebagai Draft"
```

with explanation.

Example:

```text
Harga dapat disiapkan saat offline, tetapi hanya dapat dipublikasikan saat online.
```

---

# 115. Permission + Offline Interaction

A disabled action must distinguish:

```text
No permission
```

from:

```text
Offline
```

and:

```text
Business validation
```

Avoid one generic disabled state with no explanation.

---

# 116. Critical Action Review Pattern

Used for:

```text
Price Publish
Purchase Post
Stock Adjustment
Return
Void
Shift Close
```

Review shows:

```text
business effect
financial effect
inventory effect
warnings
reason if needed
```

---

# 117. Design QA Checklist

Each screen should verify:

```text
[ ] Primary task obvious
[ ] One dominant primary action
[ ] Status readable without color alone
[ ] Keyboard usable
[ ] Touch-safe
[ ] Responsive
[ ] Offline state understandable
[ ] Permission behavior understandable
[ ] Loading/empty/error states defined
[ ] Destructive action explicit
[ ] No sensitive data exposed to wrong role
[ ] Historical records do not look normally editable
```

---

# 118. POS QA Checklist

```text
[ ] Scanner focus stable
[ ] Add-to-cart does not require network
[ ] Cart remains visible/easy to reach
[ ] Quantity fast by keyboard
[ ] Payment reachable quickly
[ ] Cash change immediately legible
[ ] Split payment understandable
[ ] Offline status does not block sale
[ ] Double-submit prevented
[ ] New transaction fast after completion
[ ] Touch controls remain ≥44px
```

---

# 119. Back Office QA Checklist

```text
[ ] High-density data remains readable
[ ] Filters/search preserved on return
[ ] Tables not converted to cards unnecessarily
[ ] Contextual actions available from record detail
[ ] Attention queue clearly prioritized
[ ] Cost/price/margin comparisons aligned
[ ] Purchasing agreed/invoice/received comparison clear
[ ] Stock movements traceable to source
[ ] Permission-protected actions explicit
```

---

# 120. Design Decisions Locked in v1

```text
DS-001 Back Office desktop-first responsive
DS-002 POS keyboard/mouse/barcode-scanner first
DS-003 POS remains touch-safe for tablet/mobile
DS-004 Modern Operational Retail visual direction
DS-005 Light-first
DS-006 Dark-ready semantic token architecture
DS-007 Brand-neutral foundation
DS-008 Bahasa Indonesia UI
DS-009 English internal terminology
DS-010 i18n-ready visible copy
DS-011 4px spacing base
DS-012 moderate operational radius
DS-013 restrained elevation
DS-014 tables first-class in Back Office
DS-015 scanner/keyboard first-class in POS
DS-016 minimum 44px touch target for touch-critical actions
DS-017 semantic status colors + text/icon
DS-018 exception severity visually standardized
DS-019 immutable records do not expose generic Edit
DS-020 offline is an operating mode, not error state
DS-021 data is shown from cache before waiting on cloud where safe
DS-022 one semantic component/token system shared across both apps
DS-023 app-specific specialized components allowed
DS-024 no dark mode shipping requirement in initial release
DS-025 branding may override tokens later without reworking UX
```

---

# 121. Intentionally Deferred to Screen Specification / Branding

```text
Exact primary accent color
Final logo
Final product wordmark
Exact desktop sidebar width
Exact POS split-pane proportions
Exact chart library
Exact shortcut key map
Exact dialog vs drawer for each screen
Exact printer interaction layout
Exact table column sets
Exact active-shift blind-count policy
Exact mobile navigation detail
Exact component library implementation
```

These are now safe to decide per-screen without reopening core system design.

---

# 122. Recommended Next Phase

Next:

```text
SCREEN / UX SPECIFICATIONS v1
```

Screen specification should define:

```text
Every Back Office page
Every POS page
Purpose
Actor
Entry point
Layout
Fields
Columns
States
Actions
Permissions
Keyboard behavior
Responsive behavior
Offline behavior
Empty/loading/error states
Cross-domain links
Acceptance criteria
```

Recommended sequence:

```text
1. Global Shell
2. Back Office Overview
3. Attention
4. Products
5. Purchasing
6. Inventory
7. Pricing
8. Sales Back Office
9. Reports
10. Settings
11. POS Sell
12. POS Payment
13. POS Transactions
14. POS Return
15. POS Shift
16. Sync/Conflict states
```

---

# Final Design System Principle

> **Kastur should look calm while doing complex work. Back Office must support high-information operational decisions without becoming visually oppressive; POS must optimize scan-to-payment speed without becoming touch-only. The system should use semantic, brand-neutral tokens so the visual identity can evolve later while interaction behavior, accessibility, and business-state meaning remain stable.**
