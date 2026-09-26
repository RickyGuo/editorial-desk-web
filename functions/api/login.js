import { hashPassword, randomHex, sessionCookie, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }

  var key = (body.username || "").trim().toLowerCase();
  var password = body.password || "";
  if (!key || !password) return json({ error: "missing_fields" }, { status: 400 });

  var account = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(key).first();
  if (!account) return json({ error: "not_found" }, { status: 404 });

  var hash = await hashPassword(password, account.salt);
  if (hash !== account.password_hash) return json({ error: "wrong_password" }, { status: 401 });

  var token = randomHex(32);
  var now = new Date().toISOString();
  var expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(token, key, now, expires).run();

  return json(
    { id: key, username: account.username },
    { headers: { "Set-Cookie": sessionCookie(token, 30 * 24 * 3600) } }
  );
}
