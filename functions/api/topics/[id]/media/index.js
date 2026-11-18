import { getSessionAccount, getTopicAccess, withSchema, json } from "../../../../_lib/auth.js";

var ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
var ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
var D1_MAX_BYTES = 5 * 1024 * 1024;
var R2_MAX_BYTES = 50 * 1024 * 1024;
var CHUNK_SIZE = 450 * 1024; // ~600 KB base64 per row, safely below D1's 1 MB parameter limit

function bytesToBase64(bytes) {
  var bin = "";
  var sliceSize = 0x8000;
  for (var i = 0; i < bytes.length; i += sliceSize) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + sliceSize));
  }
  return btoa(bin);
}

// POST: multipart/form-data with field `file`. Compresses client-side first.
export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });
  var access = await getTopicAccess(env, params.id, account.id);
  if (!access.topic) return json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) return json({ error: "access_denied", status: access.status }, { status: 403 });

  var formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return json({ error: "bad_request" }, { status: 400 });
  }

  var file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ error: "missing_file" }, { status: 400 });
  }

  var rawType = (file.type || "").split(";")[0].trim().toLowerCase();
  var kind = "";
  if (ALLOWED_IMAGE_TYPES.indexOf(rawType) !== -1) kind = "image";
  else if (ALLOWED_VIDEO_TYPES.indexOf(rawType) !== -1) kind = "video";
  else return json({ error: "unsupported_media_type" }, { status: 400 });

  var useR2 = !!env.MEDIA_BUCKET;
  var maxBytes = useR2 ? R2_MAX_BYTES : D1_MAX_BYTES;
  var buf = await file.arrayBuffer();
  var sizeBytes = buf.byteLength;
  if (!sizeBytes) return json({ error: "empty_file" }, { status: 400 });
  if (sizeBytes > maxBytes) {
    return json({
      error: "media_too_large",
      max_bytes: maxBytes,
      storage: useR2 ? "r2" : "d1"
    }, { status: 413 });
  }

  var id = crypto.randomUUID();
  var now = new Date().toISOString();

  if (useR2) {
    await env.MEDIA_BUCKET.put("topics/" + params.id + "/" + id, buf, {
      httpMetadata: { contentType: rawType }
    });
    await withSchema(env, function () {
      return env.DB.prepare(
        "INSERT INTO media_files (id, topic_id, uploader_id, kind, mime_type, size_bytes, chunk_count, storage, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 'r2', ?)"
      ).bind(id, params.id, account.id, kind, rawType, sizeBytes, now).run();
    });
  } else {
    var bytes = new Uint8Array(buf);
    var chunkCount = Math.ceil(bytes.length / CHUNK_SIZE);
    await withSchema(env, async function () {
      await env.DB.prepare(
        "INSERT INTO media_files (id, topic_id, uploader_id, kind, mime_type, size_bytes, chunk_count, storage, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'd1', ?)"
      ).bind(id, params.id, account.id, kind, rawType, sizeBytes, chunkCount, now).run();

      for (var i = 0; i < chunkCount; i++) {
        var slice = bytes.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        var b64 = bytesToBase64(slice);
        await env.DB.prepare(
          "INSERT INTO media_chunks (media_id, chunk_index, data) VALUES (?, ?, ?)"
        ).bind(id, i, b64).run();
      }
    });
  }

  return json({
    id: id,
    kind: kind,
    mime_type: rawType,
    size_bytes: sizeBytes,
    url: "/api/topics/" + params.id + "/media/" + id
  });
}
