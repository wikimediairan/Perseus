-- Perseus Toolforge backend — initial schema.
-- MariaDB 10.6+ / MySQL 8+.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(128) NOT NULL PRIMARY KEY,
  applied_at  DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id                  CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  wikimedia_user_id   VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  username            VARCHAR(255) NOT NULL,
  created_at          DATETIME(3) NOT NULL,
  updated_at          DATETIME(3) NOT NULL,
  UNIQUE KEY uq_users_wikimedia_id (wikimedia_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id     CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash  CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  revoked_at  DATETIME(3) NULL,
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash   CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  origin       VARCHAR(255) NOT NULL,
  created_at   DATETIME(3) NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  consumed_at  DATETIME(3) NULL,
  KEY idx_oauth_states_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gadget_codes (
  code_hash   CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id     CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  origin      VARCHAR(255) NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  expires_at  DATETIME(3) NOT NULL,
  redeemed_at DATETIME(3) NULL,
  KEY idx_gadget_codes_user (user_id),
  KEY idx_gadget_codes_expiry (expires_at),
  CONSTRAINT fk_gadget_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jobs (
  id                   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id              CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status               VARCHAR(16) NOT NULL,
  source_wiki          VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_title         VARCHAR(255) NOT NULL,
  source_page_id       BIGINT UNSIGNED NOT NULL,
  source_revision_id   BIGINT UNSIGNED NOT NULL,
  source_url           VARCHAR(1000) NOT NULL,
  target_wiki          VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  selection_json       LONGTEXT NOT NULL,
  sections_json        LONGTEXT NOT NULL,
  source_html          LONGTEXT NULL,
  total_chunks         INT UNSIGNED NOT NULL DEFAULT 0,
  completed_chunks     INT UNSIGNED NOT NULL DEFAULT 0,
  failed_chunks        INT UNSIGNED NOT NULL DEFAULT 0,
  total_units          INT UNSIGNED NOT NULL DEFAULT 0,
  translated_units     INT UNSIGNED NOT NULL DEFAULT 0,
  progress             TINYINT UNSIGNED NOT NULL DEFAULT 0,
  stage                VARCHAR(32) NOT NULL,
  error_code           VARCHAR(64) NULL,
  error_message        TEXT NULL,
  result_wikitext      LONGTEXT NULL,
  result_meta_json     LONGTEXT NULL,
  warnings_json        LONGTEXT NOT NULL,
  created_at           DATETIME(3) NOT NULL,
  started_at           DATETIME(3) NULL,
  completed_at         DATETIME(3) NULL,
  expires_at           DATETIME(3) NULL,
  cancel_requested_at  DATETIME(3) NULL,
  lease_owner          VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_expires_at     DATETIME(3) NULL,
  active_slot          TINYINT GENERATED ALWAYS AS (
    CASE
      WHEN status IN ('queued', 'running', 'retrying', 'cancelling') THEN 1
      ELSE NULL
    END
  ) STORED,
  UNIQUE KEY uq_jobs_one_active_per_user (user_id, active_slot),
  KEY idx_jobs_user_created (user_id, created_at),
  KEY idx_jobs_status_lease (status, lease_expires_at),
  KEY idx_jobs_source_lookup (user_id, source_wiki, source_title, target_wiki, created_at),
  KEY idx_jobs_expiry (status, expires_at),
  CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_chunks (
  id             CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  job_id         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  chunk_id       VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ordinal        INT UNSIGNED NOT NULL,
  status         VARCHAR(16) NOT NULL,
  fingerprint    CHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  units_json     LONGTEXT NOT NULL,
  translated_json LONGTEXT NULL,
  usage_json     TEXT NULL,
  attempts       INT UNSIGNED NOT NULL DEFAULT 0,
  last_error     TEXT NULL,
  created_at     DATETIME(3) NOT NULL,
  updated_at     DATETIME(3) NOT NULL,
  UNIQUE KEY uq_job_chunks_id (job_id, chunk_id),
  KEY idx_job_chunks_order (job_id, ordinal),
  KEY idx_job_chunks_status (job_id, status),
  CONSTRAINT fk_job_chunks_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id      CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  level       VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  message     TEXT NOT NULL,
  data_json   TEXT NULL,
  created_at  DATETIME(3) NOT NULL,
  KEY idx_job_events_job_id (job_id, id),
  CONSTRAINT fk_job_events_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
