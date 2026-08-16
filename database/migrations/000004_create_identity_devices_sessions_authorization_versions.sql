CREATE TABLE identity.devices (
  id UUID NOT NULL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  device_key TEXT NOT NULL,
  name TEXT NULL,
  platform TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'REVOKED')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (business_id, device_key)
);

CREATE TABLE identity.sessions (
  id UUID NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
  device_id UUID NULL REFERENCES identity.devices(id) ON DELETE RESTRICT,
  session_secret_hash TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  last_seen_at TIMESTAMPTZ NULL
);

CREATE TABLE identity.authorization_versions (
  membership_id UUID NOT NULL PRIMARY KEY REFERENCES identity.business_memberships(id) ON DELETE RESTRICT,
  version BIGINT NOT NULL DEFAULT 1,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
