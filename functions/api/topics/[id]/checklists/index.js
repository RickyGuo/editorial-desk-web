import { getSessionAccount, getTopicAccess, json } from "../../../../_lib/auth.js";

// GET: list checklists for a topic, each with its ordered items.
export async function onRequestGet({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });
  var access = await getTopicAccess(env, params.id, account.id);
  if (!access.topic) return json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) return json({ error: "access_denied", status: access.status }, { status: 403 });

  var checklists = (await env.DB.prepare(
    "SELECT id, title, created_by, created_at FROM checklists WHERE topic_id = ? ORDER BY created_at ASC"
  ).bind(params.id).all()).results || [];

  var items = (await env.DB.prepare(
    "SELECT id, checklist_id, text, order_num, status, assignee_id, assignee_name, claimed_at, done_at, created_at " +
    "FROM checklist_items WHERE topic_id = ? ORDER BY order_num ASC"
  ).bind(params.id).all()).results || [];

  var byChecklist = {};
  items.forEach(function (it) {
    (byChecklist[it.checklist_id] = byChecklist[it.checklist_id] || []).push(it);
  });
  checklists.forEach(function (c) { c.items = byChecklist[c.id] || []; });

  return json({ checklists: checklists });
}

// POST: create a checklist, optionally seeded with an ordered list of item texts.
export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });
  var access = await getTopicAccess(env, params.id, account.id);
  if (!access.topic) return json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) return json({ error: "access_denied", status: access.status }, { status: 403 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var title = (body.title || "").trim();
  if (!title) return json({ error: "missing_title" }, { status: 400 });
  var itemTexts = Array.isArray(body.items) ? body.items.map(function (t) { return (t || "").trim(); }).filter(Boolean) : [];

  var id = crypto.randomUUID();
  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO checklists (id, topic_id, title, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, params.id, title, account.id, now).run();

  var items = [];
  for (var i = 0; i < itemTexts.length; i++) {
    var itemId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO checklist_items (id, checklist_id, topic_id, text, order_num, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)"
    ).bind(itemId, id, params.id, itemTexts[i], i, now).run();
    items.push({ id: itemId, checklist_id: id, text: itemTexts[i], order_num: i, status: "pending", created_at: now });
  }

  return json({ id: id, title: title, created_by: account.id, created_at: now, items: items });
}
