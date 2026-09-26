import { getSessionAccount, json } from "../../../../../_lib/auth.js";

// POST: { option_id }. Casting the same option again un-votes (toggle).
export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var optionId = body.option_id;
  if (!optionId) return json({ error: "missing_option" }, { status: 400 });

  var poll = await env.DB.prepare(
    "SELECT id, options, closed FROM polls WHERE id = ? AND topic_id = ?"
  ).bind(params.pollId, params.id).first();
  if (!poll) return json({ error: "not_found" }, { status: 404 });
  if (poll.closed) return json({ error: "poll_closed" }, { status: 409 });

  var options;
  try { options = JSON.parse(poll.options); } catch (e) { options = []; }
  if (!options.some(function (o) { return o.id === optionId; })) return json({ error: "bad_option" }, { status: 400 });

  var existing = await env.DB.prepare(
    "SELECT option_id FROM votes WHERE poll_id = ? AND voter_id = ?"
  ).bind(params.pollId, account.id).first();

  if (existing && existing.option_id === optionId) {
    await env.DB.prepare("DELETE FROM votes WHERE poll_id = ? AND voter_id = ?").bind(params.pollId, account.id).run();
    return json({ ok: true, my_vote: null });
  }

  var now = new Date().toISOString();
  var id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO votes (id, poll_id, topic_id, option_id, voter_id, voter_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(poll_id, voter_id) DO UPDATE SET option_id = excluded.option_id, voter_name = excluded.voter_name, updated_at = excluded.updated_at"
  ).bind(id, params.pollId, params.id, optionId, account.id, account.username, now).run();

  return json({ ok: true, my_vote: optionId });
}
