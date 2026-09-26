import { getSessionAccount, json } from "../../../../../../_lib/auth.js";

// POST: append a new item to the end of a checklist.
export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var text = (body.text || "").trim();
  if (!text) return json({ error: "missing_text" }, { status: 400 });

  var checklist = await env.DB.prepare(
    "SELECT id FROM checklists WHERE id = ? AND topic_id = ?"
  ).bind(params.checklistId, params.id).first();
  if (!checklist) return json({ error: "not_found" }, { status: 404 });

  var maxRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(order_num), -1) AS m FROM checklist_items WHERE checklist_id = ?"
  ).bind(params.checklistId).first();
  var orderNum = (maxRow ? maxRow.m : -1) + 1;

  var id = crypto.randomUUID();
  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO checklist_items (id, checklist_id, topic_id, text, order_num, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)"
  ).bind(id, params.checklistId, params.id, text, orderNum, now).run();

  return json({ id: id, checklist_id: params.checklistId, text: text, order_num: orderNum, status: "pending", created_at: now });
}
