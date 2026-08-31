-- 000029_require_owner_approved_offline_recovery.sql
-- Recovery of facts from a revoked POS is a critical, explicitly approved
-- import. It must never be authorized by the revoked historical bearer alone.

INSERT INTO identity.permissions (id, code, risk_level, description) VALUES
(
  '44444444-4444-4444-8444-000000000095',
  'sync.recovery.import',
  'CRITICAL',
  'Approve a controlled import of signed offline facts from a revoked POS context.'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT '11111111-1111-4111-8111-111111111111', p.id
FROM identity.permissions p
WHERE p.code = 'sync.recovery.import'
ON CONFLICT DO NOTHING;
