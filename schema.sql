-- Run this once in the Cloudflare dashboard: D1 -> your database -> Console,
-- paste this whole file and execute. No CLI needed.
--
-- NOTE for an already-running database (created before the topic-access-control
-- feature): CREATE TABLE IF NOT EXISTS below will NOT add the new access_mode /
-- join_password_* columns to an existing "topics" table -- SQLite only adds
-- columns via ALTER TABLE. See README.md's "一次性升级" section for the
-- one-time ALTER TABLE statements to run separately, once, on an existing DB.
-- A brand-new database gets everything from this file in one pass.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,          -- normalized (lowercase) username, used as the account id everywhere
  username TEXT UNIQUE NOT NULL,-- original casing, for display
  email TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
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
  created_at TEXT NOT NULL,
  access_mode TEXT NOT NULL DEFAULT 'public',  -- public | password | approval
  join_password_salt TEXT,
  join_password_hash TEXT,
  title_prefix TEXT NOT NULL DEFAULT '',
  mask_title INTEGER NOT NULL DEFAULT 0
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
  style TEXT NOT NULL DEFAULT '',
  media_id TEXT,
  media_type TEXT,
  media_layout TEXT NOT NULL DEFAULT 'bottom',
  annotations TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- image | video
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  storage TEXT NOT NULL DEFAULT 'd1',       -- d1 | r2
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_chunks (
  media_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (media_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  text TEXT NOT NULL,
  order_num INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | active | done
  assignee_id TEXT,
  assignee_name TEXT,
  claimed_at TEXT,
  done_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL,        -- JSON array of {id, text}
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  voter_name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (poll_id, voter_id)
);

CREATE TABLE IF NOT EXISTS join_requests (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at TEXT NOT NULL,
  decided_at TEXT,
  UNIQUE (topic_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_media_topic ON media_files(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_checklists_topic ON checklists(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_items_checklist ON checklist_items(checklist_id, order_num);
CREATE INDEX IF NOT EXISTS idx_polls_topic ON polls(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_topic ON join_requests(topic_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_account ON join_requests(account_id);
