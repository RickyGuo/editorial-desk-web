import { getSessionAccount, withSchema, json } from "../../../../_lib/auth.js";

// GET: list join requests for this topic. Creator-only.
export async function onRequestGet({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });
  if (topic.created_by !== account.id) return json({ error: "forbidden" }, { status: 403 });

  var rows = await withSchema(env, async function () {
    return (await env.DB.prepare(
      "SELECT jr.id, jr.account_id, jr.account_name, jr.status, jr.created_at, jr.decided_at, COALESCE(a.bio, '') AS account_bio " +
      "FROM join_requests jr LEFT JOIN accounts a ON a.id = jr.account_id " +
      "WHERE jr.topic_id = ? ORDER BY jr.created_at ASC"
    ).bind(params.id).all()).results || [];
  });

  return json({ requests: rows });
}
