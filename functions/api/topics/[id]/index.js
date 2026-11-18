import { getSessionAccount, hashPassword, randomHex, withSchema, json } from "../../../_lib/auth.js";

// PATCH: rename a topic / change its description / change its access control.
// Restricted to the topic's creator (the same "moderator" role already used
// for message deletion).
// Body fields (all optional, only the ones present are changed):
//   name, description: strings
//   access_mode: "public" | "password" | "approval"
//   password: new join password, required when switching access_mode to "password"
export async function onRequestPatch({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });
  if (topic.created_by !== account.id) return json({ error: "forbidden" }, { status: 403 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }

  var sets = [];
  var values = [];

  if (typeof body.name === "string") {
    var name = body.name.trim();
    if (!name) return json({ error: "missing_name" }, { status: 400 });
    sets.push("name = ?"); values.push(name);
  }
  if (typeof body.description === "string") {
    sets.push("description = ?"); values.push(body.description.trim());
  }
  if (typeof body.title_prefix === "string") {
    sets.push("title_prefix = ?");
    values.push(Array.from(body.title_prefix.trim()).slice(0, 20).join(""));
  }
  if (typeof body.mask_title === "boolean") {
    sets.push("mask_title = ?");
    values.push(body.mask_title ? 1 : 0);
  }

  if (typeof body.access_mode === "string") {
    var mode = body.access_mode;
    if (mode !== "public" && mode !== "password" && mode !== "approval") {
      return json({ error: "bad_access_mode" }, { status: 400 });
    }
    sets.push("access_mode = ?"); values.push(mode);

    if (mode === "password") {
      var password = (body.password || "").trim();
      if (!password) return json({ error: "missing_join_password" }, { status: 400 });
      if (password.length < 4) return json({ error: "weak_join_password" }, { status: 400 });
      var saltHex = randomHex(16);
      var passwordHash = await hashPassword(password, saltHex);
      sets.push("join_password_salt = ?", "join_password_hash = ?");
      values.push(saltHex, passwordHash);
    } else {
      sets.push("join_password_salt = ?", "join_password_hash = ?");
      values.push(null, null);
    }
  }

  if (!sets.length) return json({ error: "nothing_to_update" }, { status: 400 });

  values.push(params.id);
  var updated = await withSchema(env, async function () {
    var stmt = env.DB.prepare("UPDATE topics SET " + sets.join(", ") + " WHERE id = ?");
    await stmt.bind.apply(stmt, values).run();
    return env.DB.prepare(
      "SELECT id, name, description, created_by, created_at, access_mode, COALESCE(title_prefix, '') AS title_prefix, COALESCE(mask_title, 0) AS mask_title FROM topics WHERE id = ?"
    ).bind(params.id).first();
  });
  updated.mask_title = !!updated.mask_title;
  updated.title_masked = false;
  updated.my_status = "approved";
  return json(updated);
}
