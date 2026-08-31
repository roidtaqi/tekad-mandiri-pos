-- 000030_create_identity_password_credentials.sql
-- Dedicated password credential storage decoupled from identity.users and identity.sessions.
-- Uses standard PBKDF2-SHA256 with per-user cryptographically random salt.

CREATE TABLE IF NOT EXISTS identity.password_credentials (
    user_id UUID NOT NULL PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    algorithm TEXT NOT NULL CHECK (algorithm IN ('PBKDF2_SHA256')),
    iterations INT NOT NULL DEFAULT 100000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

