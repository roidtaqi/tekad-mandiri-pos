export interface SecurityConfig {
  readonly session_timeout_ms: number;
  readonly max_login_attempts: number;
  readonly lockout_duration_ms: number;
  readonly password_min_length: number;
  readonly password_require_mixed_case: boolean;
  readonly password_require_numbers: boolean;
  readonly password_require_symbols: boolean;
  readonly cors_allowed_origins: ReadonlyArray<string>;
  readonly csp_directives: Record<string, ReadonlyArray<string>>;
  readonly rate_limit_window_ms: number;
  readonly rate_limit_max_requests: number;
}

export const defaultSecurityConfig: SecurityConfig = {
  session_timeout_ms: 1000 * 60 * 60 * 24, // 24 hours
  max_login_attempts: 5,
  lockout_duration_ms: 1000 * 60 * 15, // 15 minutes
  password_min_length: 8,
  password_require_mixed_case: true,
  password_require_numbers: true,
  password_require_symbols: true,
  cors_allowed_origins: [],
  csp_directives: {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'"],
    "font-src": ["'self'"],
    "object-src": ["'none'"],
    "media-src": ["'self'"],
    "frame-ancestors": ["'none'"],
  },
  rate_limit_window_ms: 1000 * 60, // 1 minute
  rate_limit_max_requests: 100,
};
