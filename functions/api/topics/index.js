import { getSessionAccount, hashPassword, randomHex, maskTitle, json } from "../../_lib/auth.js";

// GET: list all topics. Every topic's name/description/access_mode is public
// (so people can see it exists and decide whether to request access), but
// the password hash/salt never leaves the server. When mask_title is enabled,
// middle characters of the title are masked for non-creators (unless already
// approved on a restricted topic).
export async function onRequestGet({ request, env }) {
  var account = await getSessionAccount(request, env);

  var topics = (await env.DB.prepare(
    "SELECT id, name, description, created_by, created_at, access_mode, COALESCE(title_prefix, '') AS title_prefix, COALESCE(mask_title, 0) AS mask_title FROM topics ORDER BY created_at ASC"
  ).all()).results || [];

  var statusByTopic = {};
  if (account) {
    var reqs = (await env.DB.prepare(
      "SELECT topic_id, status FROM join_requests WHERE account_id = ?"
    ).bind(account.id).all()).results || [];
    reqs.forEach(function (r) { statusByTopic[r.topic_id] = r.status; });
  }

  topics.forEach(function (t) {
    var isCreator = !!(account && t.created_by === account.id);
    if (t.access_mode === "public" || isCreator) {
      t.my_status = "approved";
    } else {
      t.my_status = statusByTopic[t.id] || "none";
    }
    t.mask_title = !!t.mask_title;
    t.title_prefix = t.title_prefix || "";
    var shouldMask = t.mask_title && !isCreator && (t.access_mode === "public" || t.my_status !== "approved");
    t.title_masked = shouldMask;
    if (shouldMask) {
      t.name = maskTitle(t.name);
      if (t.access_mode !== "public" && t.my_status !== "approved") {
        t.description = "";
      }
    }
  });

  return json({ topics: topics });
}

// POST: create a topic. Optional body.access_mode: "public" (default) |
// "password" (requires body.password) | "approval" (creator approves joiners).
// Optional body.title_prefix (string, max 20 chars) and body.mask_title (boolean).
export async function onRequestPost({ request, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var name = (body.name || "").trim();
  if (!name) return json({ error: "missing_name" }, { status: 400 });
  var description = (body.description || "").trim();
  var titlePrefix = typeof body.title_prefix === "string" ? Array.from(body.title_prefix.trim()).slice(0, 20).join("") : "";
  var maskTitleFlag = body.mask_title ? 1 : 0;

  var accessMode = body.access_mode === "password" || body.access_mode === "approval" ? body.access_mode : "public";
  var saltHex = null, passwordHash = null;
  if (accessMode === "password") {
    var password = (body.password || "").trim();
    if (password.length < 4) return json({ error: "weak_join_password" }, { status: 400 });
    saltHex = randomHex(16);
    passwordHash = await hashPassword(password, saltHex);
  }

  var id = crypto.randomUUID();
  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO topics (id, name, description, created_by, created_at, access_mode, join_password_salt, join_password_hash, title_prefix, mask_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, name, description, account.id, now, accessMode, saltHex, passwordHash, titlePrefix, maskTitleFlag).run();

  return json({
    id: id,
    name: name,
    description: description,
    created_by: account.id,
    created_at: now,
    access_mode: accessMode,
    title_prefix: titlePrefix,
    mask_title: !!maskTitleFlag,
    title_masked: false,
    my_status: "approved"
  });
}
