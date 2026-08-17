CREATE SCHEMA IF NOT EXISTS sync;

-- 18.1 sync.idempotency_records
CREATE TABLE sync.idempotency_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL,
    command_type TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    result_code TEXT,
    result_entity_type TEXT,
    result_entity_id UUID,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    CONSTRAINT idempotency_records_business_command_key_key UNIQUE (business_id, command_type, idempotency_key)
);

-- 18.2 sync.change_feed
CREATE TABLE sync.change_feed (
    sequence BIGSERIAL PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
    location_id UUID REFERENCES core.locations(id) ON DELETE RESTRICT,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    change_type TEXT NOT NULL,
    entity_version BIGINT,
    payload JSONB,
    occurred_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    correlation_id UUID
);

CREATE INDEX change_feed_business_id_sequence_idx ON sync.change_feed (business_id, sequence);

-- 18.3 sync.device_sync_states
CREATE TABLE sync.device_sync_states (
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
    device_id UUID NOT NULL REFERENCES identity.devices(id) ON DELETE RESTRICT,
    last_ack_sequence BIGINT NOT NULL DEFAULT 0,
    last_push_at TIMESTAMPTZ,
    last_pull_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    pending_reported INTEGER,
    client_version TEXT,
    schema_version INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (business_id, device_id)
);

-- 18.4 sync.conflicts
CREATE TABLE sync.conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
    device_id UUID REFERENCES identity.devices(id) ON DELETE RESTRICT,
    conflict_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    local_version BIGINT,
    server_version BIGINT,
    local_value JSONB,
    server_value JSONB,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES identity.users(id) ON DELETE RESTRICT,
    resolution JSONB
);
