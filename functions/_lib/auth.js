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

// Returns { id, username } for a valid, unexpired session cookie, else null.
export async function getSessionAccount(request, env) {
  var cookies = parseCookies(request);
  var token = cookies.session;
  if (!token) return null;
  var row = await env.DB.prepare(
    "SELECT s.account_id AS id, a.username AS username " +
    "FROM sessions s JOIN accounts a ON a.id = s.account_id " +
    "WHERE s.token = ? AND s.expires_at > ?"
  ).bind(token, new Date().toISOString()).first();
  return row || null;
}

export function json(data, init) {
  var headers = Object.assign({ "Content-Type": "application/json" }, (init && init.headers) || {});
  return new Response(JSON.stringify(data), Object.assign({}, init || {}, { headers: headers }));
}
