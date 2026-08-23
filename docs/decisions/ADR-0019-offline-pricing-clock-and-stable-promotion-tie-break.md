# ADR-0019: Offline pricing clock trust and stable promotion tie-break

Status: Accepted  
Date: 2026-08-23

## Context

GAP-004 fixes promotion precedence as highest explicit priority, greatest
customer benefit, earliest creation time, then stable Promotion ID. It does not
state which direction wins for the final ID comparison. GAP-017 makes server
time authoritative and requires an untrusted device clock to retain the
last-known active price rather than guessing a scheduled activation, but leaves
the material clock-drift threshold as an implementation choice.

Both details must be identical on every POS for deterministic offline pricing.

## Decision

- For a full promotion tie, compare canonical lowercase Promotion UUID strings
  in ascending lexicographic order; the smallest ID wins.
- At every successful bootstrap or pull, record server time, local applied time,
  and their offset atomically with the sync cursor.
- Treat an absolute sampled offset of at most five minutes as `TRUSTED`.
  Anything greater is `CLOCK_UNTRUSTED`.
- With trusted metadata, estimate current server time as local time plus the
  recorded offset and resolve cached effective periods against that estimate.
- With untrusted metadata, resolve only as of the latest observed server time.
  Future or expired schedules are not guessed; the last-known applicable base
  price is retained and the cart snapshot records `CLOCK_UNTRUSTED`.
- Cache immutable active and scheduled Price Versions together. Selecting a new
  effective version affects only a newly created line; an existing line keeps
  its pricing snapshot unless an explicit future reprice command is introduced.

## Consequences

Promotion selection is stable across devices even under a complete business
tie. A badly configured clock cannot silently activate a scheduled price. A POS
whose clock differs materially may continue selling with the last server-known
price and produces an explicit trust snapshot for review rather than fabricating
time authority.

The five-minute threshold is an operational implementation setting, not a new
pricing policy. Changing it requires an ADR and regression evidence for
scheduled-price activation and offline fallback.
