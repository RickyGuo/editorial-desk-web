-- Run this once in the Cloudflare dashboard: D1 -> your database -> Console,
-- paste this whole file and execute. No CLI needed.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,          -- normalized (lowercase) username, used as the account id everywhere
  username TEXT UNIQUE NOT NULL,-- original casing, for display
  email TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  topic_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (topic_id, account_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
