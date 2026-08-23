-- 000021_complete_return_permissions_and_session_integrity.sql
-- D09 permission vocabulary plus secure opaque-session lookup integrity.

INSERT INTO identity.permissions (id, code, risk_level, description) VALUES
('44444444-4444-4444-8444-000000000087', 'return.read', 'LOW', 'Read eligible Return records and history.'),
('44444444-4444-4444-8444-000000000088', 'return.process', 'MEDIUM', 'Process a normal receipt-linked Return.'),
('44444444-4444-4444-8444-000000000089', 'return.override_window', 'HIGH', 'Override the configured Return window with a reason.'),
('44444444-4444-4444-8444-000000000090', 'return.no_receipt', 'HIGH', 'Process an exceptional Return without a linked receipt.'),
('44444444-4444-4444-8444-000000000091', 'return.override_disposition', 'HIGH', 'Override normal Return disposition policy.'),
('44444444-4444-4444-8444-000000000092', 'return.reject', 'MEDIUM', 'Reject a Return request with an auditable reason.'),
('44444444-4444-4444-8444-000000000093', 'refund.override_amount', 'CRITICAL', 'Override the historically calculated refundable amount.'),
('44444444-4444-4444-8444-000000000094', 'refund.reverse', 'CRITICAL', 'Reverse a completed Refund through a controlled event.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT '11111111-1111-4111-8111-111111111111', p.id
FROM identity.permissions p
WHERE p.code IN (
  'return.read', 'return.process', 'return.override_window', 'return.no_receipt',
  'return.override_disposition', 'return.reject', 'refund.override_amount',
  'refund.reverse'
)
ON CONFLICT DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT '22222222-2222-4222-8222-222222222222', p.id
FROM identity.permissions p
WHERE p.code IN (
  'return.read', 'return.process', 'return.override_window', 'return.no_receipt',
  'return.override_disposition', 'return.reject'
)
ON CONFLICT DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT '33333333-3333-4333-8333-333333333333', p.id
FROM identity.permissions p
WHERE p.code IN ('return.read', 'return.process', 'refund.process')
ON CONFLICT DO NOTHING;

ALTER TABLE identity.sessions
ADD CONSTRAINT sessions_secret_hash_key UNIQUE (session_secret_hash);

ALTER TABLE identity.sessions
ADD CONSTRAINT sessions_expiry_check CHECK (expires_at > issued_at);

CREATE INDEX sessions_active_user_business_idx
ON identity.sessions (user_id, business_id, expires_at DESC)
WHERE revoked_at IS NULL;
