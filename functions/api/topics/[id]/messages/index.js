import { getSessionAccount, getTopicAccess, json } from "../../../../_lib/auth.js";

export async function onRequestGet({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });
  var access = await getTopicAccess(env, params.id, account.id);
  if (!access.topic) return json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) return json({ error: "access_denied", status: access.status }, { status: 403 });

  var res = await env.DB.prepare(
    "SELECT id, author_id, author_name, text, created_at FROM messages WHERE topic_id = ? ORDER BY created_at DESC LIMIT 200"
  ).bind(params.id).all();
  return json({ messages: res.results || [] });
}

export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });
  var access = await getTopicAccess(env, params.id, account.id);
  if (!access.topic) return json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) return json({ error: "access_denied", status: access.status }, { status: 403 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var text = (body.text || "").trim();
  if (!text) return json({ error: "missing_text" }, { status: 400 });

  var id = crypto.randomUUID();
  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO messages (id, topic_id, author_id, author_name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, params.id, account.id, account.username, text, now).run();

  return json({ id: id, author_id: account.id, author_name: account.username, text: text, created_at: now });
}
