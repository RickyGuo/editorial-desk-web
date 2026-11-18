// Shared helpers for every /functions/api/* route.
// D1 binding is expected to be named "DB" (set this in the Cloudflare Pages
// dashboard: Settings -> Functions -> D1 database bindings -> variable name "DB").

export function bytesToHex(bytes) {
  return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

export function hexToBytes(hex) {
  var out = new Uint8Array(hex.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function randomHex(byteLen) {
  var arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

// PBKDF2-SHA256, 100k iterations. Runs server-side only; a viewer never sees
// the password or this hash. Far stronger than hashing in a page anyone can
// read the source of.
export async function hashPassword(password, saltHex) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  var salt = hexToBytes(saltHex);
  var bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: 100000 },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export function parseCookies(request) {
  var header = request.headers.get("Cookie") || "";
  var out = {};
  header.split(";").forEach(function (part) {
    var idx = part.indexOf("=");
    if (idx === -1) return;
    var k = part.slice(0, idx).trim();
    var v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export function sessionCookie(token, maxAgeSeconds) {
  var attrs = ["session=" + token, "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
  if (typeof maxAgeSeconds === "number") attrs.push("Max-Age=" + maxAgeSeconds);
  return attrs.join("; ");
}

var _migrated = false;
var _migrationPromise = null;

export async function ensureMigrations(env) {
  if (_migrated) return;
  if (_migrationPromise) return _migrationPromise;
  _migrationPromise = (async function () {
    var statements = [
      "ALTER TABLE accounts ADD COLUMN bio TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE topics ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'public'",
      "ALTER TABLE topics ADD COLUMN join_password_salt TEXT",
      "ALTER TABLE topics ADD COLUMN join_password_hash TEXT",
      "ALTER TABLE topics ADD COLUMN title_prefix TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE topics ADD COLUMN mask_title INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE messages ADD COLUMN style TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE messages ADD COLUMN media_id TEXT",
      "ALTER TABLE messages ADD COLUMN media_type TEXT",
      "ALTER TABLE messages ADD COLUMN media_layout TEXT NOT NULL DEFAULT 'bottom'",
      "ALTER TABLE messages ADD COLUMN annotations TEXT NOT NULL DEFAULT ''",
      "CREATE TABLE IF NOT EXISTS join_requests (id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, account_id TEXT NOT NULL, account_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, decided_at TEXT, UNIQUE (topic_id, account_id))",
      "CREATE TABLE IF NOT EXISTS media_files (id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, uploader_id TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, chunk_count INTEGER NOT NULL, storage TEXT NOT NULL DEFAULT 'd1', created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS media_chunks (media_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (media_id, chunk_index))",
      "CREATE INDEX IF NOT EXISTS idx_join_requests_topic ON join_requests(topic_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_join_requests_account ON join_requests(account_id)",
      "CREATE INDEX IF NOT EXISTS idx_media_topic ON media_files(topic_id, created_at)"
    ];
    for (var i = 0; i < statements.length; i++) {
      try {
        await env.DB.prepare(statements[i]).run();
      } catch (e) {
        // Ignore duplicate column errors if already applied
      }
    }
    _migrated = true;
  })();
  try {
    await _migrationPromise;
  } finally {
    _migrationPromise = null;
  }
}

export async function withSchema(env, fn) {
  try {
    return await fn();
  } catch (e) {
    var causeMsg = e && e.cause ? String(e.cause.message || e.cause) : "";
    var msg = String((e && e.message) || e || "") + " " + causeMsg;
    if (!_migrated && (msg.indexOf("no such column") !== -1 || msg.indexOf("no such table") !== -1)) {
      await ensureMigrations(env);
      return await fn();
    }
    throw e;
  }
}

// Returns { id, username, bio } for a valid, unexpired session cookie, else null.
export async function getSessionAccount(request, env) {
  var cookies = parseCookies(request);
  var token = cookies.session;
  if (!token) return null;
  var row = await withSchema(env, function () {
    return env.DB.prepare(
      "SELECT s.account_id AS id, a.username AS username, COALESCE(a.bio, '') AS bio " +
      "FROM sessions s JOIN accounts a ON a.id = s.account_id " +
      "WHERE s.token = ? AND s.expires_at > ?"
    ).bind(token, new Date().toISOString()).first();
  });
  return row || null;
}

export function maskTitle(name) {
  var chars = Array.from((name || "").trim());
  var len = chars.length;
  if (len <= 1) return "*";
  if (len === 2) return chars[0] + "*";
  if (len === 3) return chars[0] + "*" + chars[2];
  if (len === 4) return chars[0] + "**" + chars[3];
  var keep = len >= 6 ? 2 : 1;
  return chars.slice(0, keep).join("") + "*".repeat(len - keep * 2) + chars.slice(len - keep).join("");
}

// Resolves whether `accountId` may see a topic's content.
// - public topics: always allowed
// - the topic's creator: always allowed
// - password/approval topics: allowed only once an 'approved' join_requests row exists
// Returns { topic, allowed, status } where status is 'approved' | 'pending' | 'rejected' | 'none'.
// topic is null (and allowed false) when the topic doesn't exist.
export async function getTopicAccess(env, topicId, accountId) {
  return withSchema(env, async function () {
    var topic = await env.DB.prepare(
      "SELECT id, name, description, created_by, created_at, access_mode, title_prefix, mask_title FROM topics WHERE id = ?"
    ).bind(topicId).first();
    if (!topic) return { topic: null, allowed: false, status: "not_found" };

    if (topic.access_mode === "public" || topic.created_by === accountId) {
      return { topic: topic, allowed: true, status: "approved" };
    }

    var req = await env.DB.prepare(
      "SELECT status FROM join_requests WHERE topic_id = ? AND account_id = ?"
    ).bind(topicId, accountId).first();
    var status = req ? req.status : "none";
    return { topic: topic, allowed: status === "approved", status: status };
  });
}

export function json(data, init) {
  var headers = Object.assign({ "Content-Type": "application/json" }, (init && init.headers) || {});
  return new Response(JSON.stringify(data), Object.assign({}, init || {}, { headers: headers }));
}
