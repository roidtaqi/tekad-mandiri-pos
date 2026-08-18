-- 000019_create_legacy_id_map.sql

CREATE TABLE core.legacy_id_map (
  id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES core.businesses(id),
  source_system TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  new_entity_id UUID NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT legacy_id_map_pkey PRIMARY KEY (id),
  CONSTRAINT legacy_id_map_unique UNIQUE (business_id, source_system, entity_type, legacy_id)
);
