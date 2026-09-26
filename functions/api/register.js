import { hashPassword, randomHex, sessionCookie, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }

  var rawUsername = (body.username || "").trim();
  var email = (body.email || "").trim();
  var password = body.password || "";
  var key = rawUsername.toLowerCase();

  if (!/^[a-z0-9_-]{3,20}$/.test(key)) return json({ error: "invalid_username" }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "invalid_email" }, { status: 400 });
  if (password.length < 6) return json({ error: "weak_password" }, { status: 400 });

  var existing = await env.DB.prepare("SELECT id FROM accounts WHERE id = ?").bind(key).first();
  if (existing) return json({ error: "username_taken" }, { status: 409 });

  var salt = randomHex(16);
  var hash = await hashPassword(password, salt);
  var now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO accounts (id, username, email, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(key, rawUsername, email, salt, hash, now).run();

  var token = randomHex(32);
  var expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(token, key, now, expires).run();

  return json(
    { id: key, username: rawUsername },
    { headers: { "Set-Cookie": sessionCookie(token, 30 * 24 * 3600) } }
  );
}
