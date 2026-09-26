import { getSessionAccount, json } from "../../../../_lib/auth.js";

// PATCH: { action: "approve" | "reject" }. Creator-only.
export async function onRequestPatch({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });
  if (topic.created_by !== account.id) return json({ error: "forbidden" }, { status: 403 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var action = body.action;
  if (action !== "approve" && action !== "reject") return json({ error: "bad_action" }, { status: 400 });

  var reqRow = await env.DB.prepare(
    "SELECT id FROM join_requests WHERE id = ? AND topic_id = ?"
  ).bind(params.reqId, params.id).first();
  if (!reqRow) return json({ error: "not_found" }, { status: 404 });

  var newStatus = action === "approve" ? "approved" : "rejected";
  var now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE join_requests SET status = ?, decided_at = ? WHERE id = ?"
  ).bind(newStatus, now, reqRow.id).run();

  return json({ ok: true, status: newStatus });
}
