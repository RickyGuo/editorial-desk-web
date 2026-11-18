import { getSessionAccount, getTopicAccess, withSchema, json } from "../../../../_lib/auth.js";

var ALLOWED_SIZES = { sm: true, md: true, lg: true, xl: true };
var ALLOWED_FAMILIES = { sans: true, serif: true, mono: true };
var ALLOWED_LAYOUTS = { bottom: true, top: true, left: true, right: true };
var ALLOWED_SHAPE_TYPES = { arrow: true, circle: true, rect: true, pin: true };

function sanitizeStyle(raw) {
  if (!raw || typeof raw !== "object") return null;
  var out = {};
  if (typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color.trim())) {
    out.color = raw.color.trim();
  }
  if (typeof raw.size === "string" && ALLOWED_SIZES[raw.size]) {
    out.size = raw.size;
  }
  if (typeof raw.family === "string" && ALLOWED_FAMILIES[raw.family]) {
    out.family = raw.family;
  }
  if (raw.bold) out.bold = true;
  if (raw.italic) out.italic = true;
  return Object.keys(out).length ? out : null;
}

function clamp01(n) {
  var x = Number(n);
  if (!isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, Math.round(x * 10000) / 10000));
}

function sanitizeAnnotations(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  var out = [];
  for (var i = 0; i < raw.length && out.length < 30; i++) {
    var a = raw[i];
    if (!a || typeof a !== "object" || !ALLOWED_SHAPE_TYPES[a.type]) continue;
    var color = typeof a.color === "string" && /^#[0-9a-fA-F]{6}$/.test(a.color.trim()) ? a.color.trim() : "#E03131";
    var note = typeof a.note === "string" ? Array.from(a.note.trim()).slice(0, 120).join("") : "";
    out.push({
      id: typeof a.id === "string" && a.id.length <= 40 ? a.id : String(out.length + 1),
      type: a.type,
      color: color,
      x1: clamp01(a.x1),
      y1: clamp01(a.y1),
      x2: clamp01(a.x2),
      y2: clamp01(a.y2),
      note: note
    });
  }
  return out;
}

function parseJsonSafe(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

export async function onRequestGet({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });
  var access = await getTopicAccess(env, params.id, account.id);
  if (!access.topic) return json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) return json({ error: "access_denied", status: access.status }, { status: 403 });

  var res = await withSchema(env, function () {
    return env.DB.prepare(
      "SELECT id, author_id, author_name, text, COALESCE(style, '') AS style, media_id, media_type, COALESCE(media_layout, 'bottom') AS media_layout, COALESCE(annotations, '') AS annotations, created_at " +
      "FROM messages WHERE topic_id = ? ORDER BY created_at DESC LIMIT 200"
    ).bind(params.id).all();
  });

  var messages = (res.results || []).map(function (m) {
    return {
      id: m.id,
      author_id: m.author_id,
      author_name: m.author_name,
      text: m.text || "",
      style: parseJsonSafe(m.style, null),
      media_id: m.media_id || null,
      media_type: m.media_type || null,
      media_url: m.media_id ? ("/api/topics/" + params.id + "/media/" + m.media_id) : null,
      media_layout: ALLOWED_LAYOUTS[m.media_layout] ? m.media_layout : "bottom",
      annotations: parseJsonSafe(m.annotations, []),
      created_at: m.created_at
    };
  });

  return json({ messages: messages });
}

export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });
  var access = await getTopicAccess(env, params.id, account.id);
  if (!access.topic) return json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) return json({ error: "access_denied", status: access.status }, { status: 403 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var text = typeof body.text === "string" ? body.text.trim() : "";
  var mediaId = typeof body.media_id === "string" && body.media_id.trim() ? body.media_id.trim() : null;
  if (!text && !mediaId) return json({ error: "missing_text" }, { status: 400 });

  var styleObj = sanitizeStyle(body.style);
  var styleStr = styleObj ? JSON.stringify(styleObj) : "";
  var layout = typeof body.media_layout === "string" && ALLOWED_LAYOUTS[body.media_layout] ? body.media_layout : "bottom";
  var annotationsArr = sanitizeAnnotations(body.annotations);
  var annotationsStr = annotationsArr.length ? JSON.stringify(annotationsArr) : "";

  var mediaType = null;
  if (mediaId) {
    var mediaRow = await withSchema(env, function () {
      return env.DB.prepare("SELECT id, kind FROM media_files WHERE id = ? AND topic_id = ?").bind(mediaId, params.id).first();
    });
    if (!mediaRow) return json({ error: "media_not_found" }, { status: 400 });
    mediaType = mediaRow.kind;
    if (mediaType !== "image") annotationsArr = [];
    annotationsStr = annotationsArr.length ? JSON.stringify(annotationsArr) : "";
  } else {
    annotationsArr = [];
    annotationsStr = "";
  }

  var id = crypto.randomUUID();
  var now = new Date().toISOString();
  await withSchema(env, function () {
    return env.DB.prepare(
      "INSERT INTO messages (id, topic_id, author_id, author_name, text, style, media_id, media_type, media_layout, annotations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, params.id, account.id, account.username, text, styleStr, mediaId, mediaType, layout, annotationsStr, now).run();
  });

  return json({
    id: id,
    author_id: account.id,
    author_name: account.username,
    text: text,
    style: styleObj,
    media_id: mediaId,
    media_type: mediaType,
    media_url: mediaId ? ("/api/topics/" + params.id + "/media/" + mediaId) : null,
    media_layout: layout,
    annotations: annotationsArr,
    created_at: now
  });
}
