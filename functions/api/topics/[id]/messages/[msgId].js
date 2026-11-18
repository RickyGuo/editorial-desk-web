import { getSessionAccount, withSchema, json } from "../../../../_lib/auth.js";

// Moderation: only the topic's creator can delete a message in it.
export async function onRequestDelete({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var topic = await env.DB.prepare("SELECT created_by FROM topics WHERE id = ?").bind(params.id).first();
  if (!topic) return json({ error: "not_found" }, { status: 404 });
  if (topic.created_by !== account.id) return json({ error: "forbidden" }, { status: 403 });

  var deletedMedia = await withSchema(env, async function () {
    var msg = await env.DB.prepare(
      "SELECT id, media_id FROM messages WHERE id = ? AND topic_id = ?"
    ).bind(params.msgId, params.id).first();
    if (!msg) return null;

    await env.DB.prepare("DELETE FROM messages WHERE id = ? AND topic_id = ?").bind(params.msgId, params.id).run();

    if (msg.media_id) {
      var media = await env.DB.prepare("SELECT id, storage FROM media_files WHERE id = ? AND topic_id = ?").bind(msg.media_id, params.id).first();
      if (media) {
        if (media.storage === "r2" && env.MEDIA_BUCKET) {
          try { await env.MEDIA_BUCKET.delete("topics/" + params.id + "/" + media.id); } catch (e) {}
        }
        await env.DB.prepare("DELETE FROM media_chunks WHERE media_id = ?").bind(media.id).run();
        await env.DB.prepare("DELETE FROM media_files WHERE id = ?").bind(media.id).run();
      }
    }
    return msg;
  });

  return json({ ok: true, deleted: !!deletedMedia });
}
