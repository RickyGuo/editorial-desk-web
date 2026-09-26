import { getSessionAccount, hashPassword, json } from "../../_lib/auth.js";

// GET: current user's access status for this topic, with no side effects.
export async function onRequestGet({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare(
    "SELECT id, access_mode, created_by FROM topics WHERE id = ?"
  ).bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });

  if (topic.access_mode === "public" || topic.created_by === account.id) {
    return json({ status: "approved" });
  }
  var req = await env.DB.prepare(
    "SELECT status FROM join_requests WHERE topic_id = ? AND account_id = ?"
  ).bind(params.id, account.id).first();
  return json({ status: req ? req.status : "none" });
}

// POST: request access to a restricted topic.
//   password mode: body.password, checked against the stored hash; correct
//     password immediately grants "approved" access (no manual review needed).
//   approval mode: creates (or re-creates, after a rejection) a "pending"
//     request for the topic's creator to review.
export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare(
    "SELECT id, access_mode, created_by, join_password_salt, join_password_hash FROM topics WHERE id = ?"
  ).bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });

  if (topic.access_mode === "public" || topic.created_by === account.id) {
    return json({ status: "approved" });
  }

  var now = new Date().toISOString();

  if (topic.access_mode === "password") {
    var body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
    var password = (body.password || "").trim();
    if (!password) return json({ error: "missing_password" }, { status: 400 });
    var hash = await hashPassword(password, topic.join_password_salt);
    if (hash !== topic.join_password_hash) return json({ error: "wrong_join_password" }, { status: 403 });

    var id1 = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO join_requests (id, topic_id, account_id, account_name, status, created_at, decided_at) VALUES (?, ?, ?, ?, 'approved', ?, ?) " +
      "ON CONFLICT(topic_id, account_id) DO UPDATE SET status = 'approved', decided_at = excluded.decided_at"
    ).bind(id1, params.id, account.id, account.username, now, now).run();
    return json({ status: "approved" });
  }

  if (topic.access_mode === "approval") {
    var existing = await env.DB.prepare(
      "SELECT status FROM join_requests WHERE topic_id = ? AND account_id = ?"
    ).bind(params.id, account.id).first();
    if (existing && existing.status === "approved") return json({ status: "approved" });
    if (existing && existing.status === "pending") return json({ status: "pending" });

    var id2 = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO join_requests (id, topic_id, account_id, account_name, status, created_at, decided_at) VALUES (?, ?, ?, ?, 'pending', ?, NULL) " +
      "ON CONFLICT(topic_id, account_id) DO UPDATE SET status = 'pending', account_name = excluded.account_name, created_at = excluded.created_at, decided_at = NULL"
    ).bind(id2, params.id, account.id, account.username, now).run();
    return json({ status: "pending" });
  }

  return json({ error: "bad_access_mode" }, { status: 400 });
}
