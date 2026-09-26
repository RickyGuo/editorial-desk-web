import { getSessionAccount, json } from "../../../../_lib/auth.js";

export async function onRequestGet({ params, env }) {
  var res = await env.DB.prepare(
    "SELECT account_id, nickname, joined_at FROM members WHERE topic_id = ?"
  ).bind(params.id).all();
  return json({ members: res.results || [] });
}

export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var nickname = (body.nickname || "").trim();
  if (!nickname) return json({ error: "missing_nickname" }, { status: 400 });

  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO members (topic_id, account_id, nickname, joined_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(topic_id, account_id) DO UPDATE SET nickname = excluded.nickname"
  ).bind(params.id, account.id, nickname, now).run();

  return json({ ok: true });
}
