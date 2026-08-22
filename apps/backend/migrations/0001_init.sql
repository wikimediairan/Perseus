CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  wikimedia_user_id   TEXT UNIQUE,
  wikimedia_username  TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  weekly_credit       REAL NOT NULL DEFAULT 0,
  low_usage_weeks     INTEGER NOT NULL DEFAULT 0,
  full_usage_weeks    INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX idx_users_wikimedia_user_id
  ON users(wikimedia_user_id);

CREATE INDEX idx_users_status
  ON users(status);


CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE INDEX idx_sessions_user_id
  ON sessions(user_id);


CREATE TABLE usage_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  cost       REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_usage_events_user_created
  ON usage_events(user_id, created_at);


CREATE TABLE credit_transactions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL, -- INITIAL | INCREASE | RELEASE
  amount     REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_credit_transactions_user_id
  ON credit_transactions(user_id);


CREATE TABLE credit_queue (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  requested_amount REAL NOT NULL,
  created_at       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' -- pending | processed
);

CREATE INDEX idx_credit_queue_status
  ON credit_queue(status);


CREATE TABLE admins (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  created_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id)
);


CREATE TABLE auth_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0
);


CREATE TABLE desktop_auth_codes (
  code_hash   TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  redeemed_at TEXT
);

CREATE INDEX idx_desktop_auth_codes_user_id
  ON desktop_auth_codes(user_id);
