CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.users (
    id UUID NOT NULL PRIMARY KEY,
    display_name TEXT NOT NULL,
    email TEXT NULL,
    phone TEXT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
);

CREATE TABLE identity.business_memberships (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NOT NULL,
    user_id UUID NOT NULL,
    status TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT memberships_business_id_fkey FOREIGN KEY (business_id) REFERENCES core.businesses(id) ON DELETE RESTRICT,
    CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE RESTRICT,
    CONSTRAINT memberships_business_user_key UNIQUE (business_id, user_id),
    CONSTRAINT memberships_status_check CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'INACTIVE'))
);

CREATE TABLE identity.roles (
    id UUID NOT NULL PRIMARY KEY,
    business_id UUID NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_system BOOLEAN NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT roles_business_id_fkey FOREIGN KEY (business_id) REFERENCES core.businesses(id) ON DELETE RESTRICT,
    CONSTRAINT roles_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE UNIQUE INDEX roles_global_code_idx ON identity.roles (code) WHERE business_id IS NULL;
CREATE UNIQUE INDEX roles_business_code_idx ON identity.roles (business_id, code) WHERE business_id IS NOT NULL;

CREATE TABLE identity.permissions (
    id UUID NOT NULL PRIMARY KEY,
    code TEXT NOT NULL,
    description TEXT NULL,
    risk_level TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT permissions_code_key UNIQUE (code)
);

CREATE TABLE identity.role_permissions (
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES identity.roles(id) ON DELETE RESTRICT,
    CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES identity.permissions(id) ON DELETE RESTRICT
);

CREATE TABLE identity.membership_roles (
    membership_id UUID NOT NULL,
    role_id UUID NOT NULL,
    is_primary BOOLEAN NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID NULL,
    PRIMARY KEY (membership_id, role_id),
    CONSTRAINT membership_roles_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES identity.business_memberships(id) ON DELETE RESTRICT,
    CONSTRAINT membership_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES identity.roles(id) ON DELETE RESTRICT,
    CONSTRAINT membership_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES identity.users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX membership_roles_primary_idx ON identity.membership_roles (membership_id) WHERE is_primary = TRUE;

CREATE TABLE identity.permission_overrides (
    id UUID NOT NULL PRIMARY KEY,
    membership_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    effect TEXT NOT NULL,
    reason TEXT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT permission_overrides_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES identity.business_memberships(id) ON DELETE RESTRICT,
    CONSTRAINT permission_overrides_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES identity.permissions(id) ON DELETE RESTRICT,
    CONSTRAINT permission_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES identity.users(id) ON DELETE RESTRICT,
    CONSTRAINT permission_overrides_effect_check CHECK (effect IN ('GRANT', 'REVOKE')),
    CONSTRAINT permission_overrides_membership_permission_key UNIQUE (membership_id, permission_id)
);

-- Seed built-in system roles
INSERT INTO identity.roles (id, business_id, code, name, is_system, status)
VALUES 
    ('11111111-1111-4111-8111-111111111111', NULL, 'OWNER', 'Owner', TRUE, 'ACTIVE'),
    ('22222222-2222-4222-8222-222222222222', NULL, 'ADMIN', 'Admin', TRUE, 'ACTIVE'),
    ('33333333-3333-4333-8333-333333333333', NULL, 'CASHIER', 'Cashier', TRUE, 'ACTIVE');
