CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE core.businesses (
    id UUID NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    currency_code CHAR(3) NOT NULL DEFAULT 'IDR',
    timezone TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT businesses_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE core.locations (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    is_default BOOLEAN NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT locations_business_id_fkey FOREIGN KEY (business_id) REFERENCES core.businesses(id) ON DELETE RESTRICT,
    CONSTRAINT locations_business_id_code_key UNIQUE (business_id, code),
    CONSTRAINT locations_type_check CHECK (type IN ('STORE', 'WAREHOUSE')),
    CONSTRAINT locations_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE UNIQUE INDEX locations_default_idx ON core.locations (business_id) WHERE is_default = TRUE;
