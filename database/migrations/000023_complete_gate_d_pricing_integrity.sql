-- Gate D pricing publication and immutable Sale pricing snapshots.

ALTER TABLE pricing.promotions
  ADD CONSTRAINT promotions_status_check CHECK (
    status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED')
  ),
  ADD CONSTRAINT promotions_percent_value_check CHECK (
    promotion_type <> 'PERCENT_DISCOUNT' OR value <= 100
  ),
  ADD CONSTRAINT promotions_business_product_unit_fkey
    FOREIGN KEY (business_id, product_unit_id)
    REFERENCES catalog.product_units(business_id, id)
    ON DELETE RESTRICT;

ALTER TABLE sales.transaction_items
  ADD COLUMN tier_id_snapshot UUID
    REFERENCES pricing.price_tier_versions(id) ON DELETE RESTRICT,
  ADD COLUMN tier_min_qty_snapshot NUMERIC(20,6),
  ADD COLUMN promotion_type_snapshot TEXT,
  ADD COLUMN promotion_value_snapshot NUMERIC(20,4),
  ADD CONSTRAINT transaction_items_tier_snapshot_pair_check CHECK (
    (tier_id_snapshot IS NULL AND tier_min_qty_snapshot IS NULL)
    OR (tier_id_snapshot IS NOT NULL AND tier_min_qty_snapshot IS NOT NULL)
  ),
  ADD CONSTRAINT transaction_items_tier_min_qty_snapshot_check CHECK (
    tier_min_qty_snapshot IS NULL OR tier_min_qty_snapshot > 0
  ),
  ADD CONSTRAINT transaction_items_promotion_snapshot_pair_check CHECK (
    (
      promotion_id IS NULL
      AND promotion_type_snapshot IS NULL
      AND promotion_value_snapshot IS NULL
    )
    OR (
      promotion_id IS NOT NULL
      AND promotion_type_snapshot IS NOT NULL
      AND promotion_value_snapshot IS NOT NULL
    )
  ),
  ADD CONSTRAINT transaction_items_promotion_type_snapshot_check CHECK (
    promotion_type_snapshot IS NULL
    OR promotion_type_snapshot IN ('FIXED_PRICE', 'PERCENT_DISCOUNT', 'FIXED_DISCOUNT')
  ),
  ADD CONSTRAINT transaction_items_promotion_value_snapshot_check CHECK (
    promotion_value_snapshot IS NULL
    OR (
      promotion_value_snapshot >= 0
      AND (
        promotion_type_snapshot <> 'PERCENT_DISCOUNT'
        OR promotion_value_snapshot <= 100
      )
    )
  );
