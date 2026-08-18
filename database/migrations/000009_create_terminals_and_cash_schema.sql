-- 000009_create_terminals_and_cash_schema.sql
-- M4-001 Cash Ledger & Terminals

CREATE TABLE core.terminals (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES core.locations(id) ON DELETE RESTRICT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT terminals_business_id_code_key UNIQUE (business_id, code),
    CONSTRAINT terminals_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE SCHEMA IF NOT EXISTS cash;

CREATE TABLE cash.shifts (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES core.locations(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES core.terminals(id) ON DELETE RESTRICT,
    cashier_user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    shift_number TEXT NOT NULL,
    status TEXT NOT NULL,
    opening_cash NUMERIC(20,4) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    closing_started_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    forced_closed_by UUID REFERENCES identity.users(id) ON DELETE RESTRICT,
    force_close_reason TEXT,
    review_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT shifts_status_check CHECK (status IN ('OPEN', 'CLOSING', 'CLOSED', 'FORCED_CLOSED')),
    CONSTRAINT shifts_review_status_check CHECK (review_status IN ('UNREVIEWED', 'REVIEWED', 'REQUIRES_FOLLOW_UP'))
);

-- one OPEN/CLOSING shift per terminal
CREATE UNIQUE INDEX shifts_active_terminal_idx 
ON cash.shifts (business_id, terminal_id) 
WHERE status IN ('OPEN', 'CLOSING');

CREATE TABLE cash.cash_movements (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES core.businesses(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES core.locations(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES core.terminals(id) ON DELETE RESTRICT,
    shift_id UUID NOT NULL REFERENCES cash.shifts(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL,
    amount NUMERIC(20,4) NOT NULL,
    direction TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id UUID NOT NULL,
    reason_code TEXT,
    notes TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    device_id UUID REFERENCES identity.devices(id) ON DELETE RESTRICT,
    correlation_id UUID,
    CONSTRAINT cash_movements_amount_check CHECK (amount >= 0),
    CONSTRAINT cash_movements_direction_check CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT cash_movements_type_check CHECK (movement_type IN ('OPENING_BALANCE', 'CASH_SALE', 'CASH_IN', 'CASH_OUT', 'CASH_REFUND', 'CASH_REVERSAL', 'SAFE_DROP')),
    CONSTRAINT cash_movements_source_key UNIQUE (business_id, source_type, source_id)
);

CREATE TABLE cash.shift_closing_snapshots (
    id UUID NOT NULL PRIMARY KEY,
    shift_id UUID NOT NULL REFERENCES cash.shifts(id) ON DELETE RESTRICT,
    opening_cash NUMERIC(20,4) NOT NULL,
    cash_sales NUMERIC(20,4) NOT NULL,
    cash_in NUMERIC(20,4) NOT NULL,
    cash_out NUMERIC(20,4) NOT NULL,
    cash_refunds NUMERIC(20,4) NOT NULL,
    expected_cash NUMERIC(20,4) NOT NULL,
    actual_cash NUMERIC(20,4),
    actual_cash_verified BOOLEAN NOT NULL,
    variance NUMERIC(20,4),
    variance_type TEXT,
    reason TEXT,
    transaction_count INTEGER NOT NULL,
    void_count INTEGER NOT NULL,
    refund_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    CONSTRAINT shift_closing_snapshots_shift_key UNIQUE (shift_id),
    CONSTRAINT shift_closing_snapshots_variance_type_check CHECK (variance_type IN ('MATCHED', 'SHORT', 'OVER') OR variance_type IS NULL)
);

CREATE TABLE cash.shift_reconciliations (
    id UUID NOT NULL PRIMARY KEY,
    shift_id UUID NOT NULL REFERENCES cash.shifts(id) ON DELETE RESTRICT,
    reason_type TEXT NOT NULL,
    expected_cash_delta NUMERIC(20,4) NOT NULL,
    notes TEXT,
    source_type TEXT NOT NULL,
    source_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES identity.users(id) ON DELETE RESTRICT
);
