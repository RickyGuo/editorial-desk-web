import { getSessionAccount, json } from "../../../../../_lib/auth.js";

// POST: toggle a poll's open/closed state. Restricted to the poll's creator
// or the topic's creator (moderation).
export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var poll = await env.DB.prepare(
    "SELECT id, created_by, closed FROM polls WHERE id = ? AND topic_id = ?"
  ).bind(params.pollId, params.id).first();
  if (!poll) return json({ error: "not_found" }, { status: 404 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  var canModerate = poll.created_by === account.id || (topic && topic.created_by === account.id);
  if (!canModerate) return json({ error: "forbidden" }, { status: 403 });

  var newClosed = poll.closed ? 0 : 1;
  await env.DB.prepare("UPDATE polls SET closed = ? WHERE id = ?").bind(newClosed, poll.id).run();
  return json({ ok: true, closed: !!newClosed });
}
