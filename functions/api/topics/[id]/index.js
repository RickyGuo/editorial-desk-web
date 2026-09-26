import { getSessionAccount, json } from "../../_lib/auth.js";

// PATCH: rename a topic / change its description. Restricted to the
// topic's creator (the same "moderator" role used for message deletion).
export async function onRequestPatch({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });
  if (topic.created_by !== account.id) return json({ error: "forbidden" }, { status: 403 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }

  var updates = [];
  var values = [];
  if (typeof body.name === "string") {
    var name = body.name.trim();
    if (!name) return json({ error: "missing_name" }, { status: 400 });
    updates.push("name = ?");
    values.push(name);
  }
  if (typeof body.description === "string") {
    updates.push("description = ?");
    values.push(body.description.trim());
  }
  if (!updates.length) return json({ error: "nothing_to_update" }, { status: 400 });

  values.push(params.id);
  var stmt = env.DB.prepare("UPDATE topics SET " + updates.join(", ") + " WHERE id = ?");
  await stmt.bind.apply(stmt, values).run();

  var updated = await env.DB.prepare(
    "SELECT id, name, description, created_by, created_at FROM topics WHERE id = ?"
  ).bind(params.id).first();
  return json(updated);
}
