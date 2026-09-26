import { getSessionAccount, json } from "../../../../../../_lib/auth.js";

// PATCH: { action: "claim" | "unclaim" | "done" }
// Relay rule: an item can only be claimed once every item before it (lower
// order_num, same checklist) is done. Enforced here too, not just client-side.
export async function onRequestPatch({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var action = body.action;

  var item = await env.DB.prepare(
    "SELECT id, checklist_id, order_num, status, assignee_id FROM checklist_items WHERE id = ? AND checklist_id = ? AND topic_id = ?"
  ).bind(params.itemId, params.checklistId, params.id).first();
  if (!item) return json({ error: "not_found" }, { status: 404 });

  var now = new Date().toISOString();

  if (action === "claim") {
    if (item.status !== "pending") return json({ error: "not_pending" }, { status: 409 });
    var blocker = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM checklist_items WHERE checklist_id = ? AND order_num < ? AND status != 'done'"
    ).bind(item.checklist_id, item.order_num).first();
    if (blocker && blocker.c > 0) return json({ error: "locked" }, { status: 409 });

    await env.DB.prepare(
      "UPDATE checklist_items SET status = 'active', assignee_id = ?, assignee_name = ?, claimed_at = ? WHERE id = ?"
    ).bind(account.id, account.username, now, item.id).run();
    return json({ ok: true, status: "active", assignee_id: account.id, assignee_name: account.username, claimed_at: now });
  }

  if (action === "unclaim") {
    if (item.status !== "active") return json({ error: "not_active" }, { status: 409 });
    if (item.assignee_id !== account.id) return json({ error: "forbidden" }, { status: 403 });
    await env.DB.prepare(
      "UPDATE checklist_items SET status = 'pending', assignee_id = NULL, assignee_name = NULL, claimed_at = NULL WHERE id = ?"
    ).bind(item.id).run();
    return json({ ok: true, status: "pending" });
  }

  if (action === "done") {
    if (item.status !== "active") return json({ error: "not_active" }, { status: 409 });
    if (item.assignee_id !== account.id) return json({ error: "forbidden" }, { status: 403 });
    await env.DB.prepare(
      "UPDATE checklist_items SET status = 'done', done_at = ? WHERE id = ?"
    ).bind(now, item.id).run();
    return json({ ok: true, status: "done", done_at: now });
  }

  return json({ error: "bad_action" }, { status: 400 });
}

// DELETE: remove an item — restricted to the topic's creator (moderation).
export async function onRequestDelete({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });
  if (topic.created_by !== account.id) return json({ error: "forbidden" }, { status: 403 });

  await env.DB.prepare(
    "DELETE FROM checklist_items WHERE id = ? AND checklist_id = ? AND topic_id = ?"
  ).bind(params.itemId, params.checklistId, params.id).run();
  return json({ ok: true });
}
