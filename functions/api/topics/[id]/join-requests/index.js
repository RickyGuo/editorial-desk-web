import { getSessionAccount, json } from "../../../_lib/auth.js";

// GET: list join requests for this topic. Creator-only.
export async function onRequestGet({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });
  if (topic.created_by !== account.id) return json({ error: "forbidden" }, { status: 403 });

  var rows = (await env.DB.prepare(
    "SELECT id, account_id, account_name, status, created_at, decided_at FROM join_requests WHERE topic_id = ? ORDER BY created_at ASC"
  ).bind(params.id).all()).results || [];

  return json({ requests: rows });
}
