import { getSessionAccount, json } from "../../../../_lib/auth.js";

// Moderation: only the topic's creator can delete a message in it.
export async function onRequestDelete({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });
  if (topic.created_by !== account.id) return json({ error: "forbidden" }, { status: 403 });

  await env.DB.prepare("DELETE FROM messages WHERE id = ? AND topic_id = ?").bind(params.msgId, params.id).run();
  return json({ ok: true });
}
