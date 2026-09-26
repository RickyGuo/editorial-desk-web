import { getSessionAccount, json } from "../../_lib/auth.js";

export async function onRequestGet({ env }) {
  var res = await env.DB.prepare(
    "SELECT id, name, description, created_by, created_at FROM topics ORDER BY created_at ASC"
  ).all();
  return json({ topics: res.results || [] });
}

export async function onRequestPost({ request, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var name = (body.name || "").trim();
  if (!name) return json({ error: "missing_name" }, { status: 400 });
  var description = (body.description || "").trim();

  var id = crypto.randomUUID();
  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO topics (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, description, account.id, now).run();

  return json({ id: id, name: name, description: description, created_by: account.id, created_at: now });
}
