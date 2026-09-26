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

CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_checklists_topic ON checklists(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_items_checklist ON checklist_items(checklist_id, order_num);
CREATE INDEX IF NOT EXISTS idx_polls_topic ON polls(topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes(poll_id);
