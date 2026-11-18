import { getSessionAccount, getTopicAccess, withSchema, json } from "../../../../_lib/auth.js";

var CHUNK_SIZE = 450 * 1024;

function base64ToBytes(b64) {
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseRange(rangeHeader, totalSize) {
  if (!rangeHeader || !totalSize) return null;
  var m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) return null;
  var start = m[1] === "" ? 0 : parseInt(m[1], 10);
  var end = m[2] === "" ? totalSize - 1 : parseInt(m[2], 10);
  if (m[1] === "" && m[2] !== "") {
    var suffixLen = parseInt(m[2], 10);
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  }
  if (isNaN(start) || isNaN(end) || start < 0 || start >= totalSize || end < start) return "invalid";
  if (end >= totalSize) end = totalSize - 1;
  return { start: start, end: end };
}

export async function onRequestGet({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });
  var access = await getTopicAccess(env, params.id, account.id);
  if (!access.topic) return json({ error: "not_found" }, { status: 404 });
  if (!access.allowed) return json({ error: "access_denied", status: access.status }, { status: 403 });

  var meta = await withSchema(env, function () {
    return env.DB.prepare(
      "SELECT id, mime_type, size_bytes, chunk_count, storage FROM media_files WHERE id = ? AND topic_id = ?"
    ).bind(params.mediaId, params.id).first();
  });
  if (!meta) return json({ error: "not_found" }, { status: 404 });

  var range = parseRange(request.headers.get("Range"), meta.size_bytes);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": "bytes */" + meta.size_bytes }
    });
  }

  if (meta.storage === "r2" && env.MEDIA_BUCKET) {
    var r2Key = "topics/" + params.id + "/" + meta.id;
    var obj = range
      ? await env.MEDIA_BUCKET.get(r2Key, { range: { offset: range.start, length: range.end - range.start + 1 } })
      : await env.MEDIA_BUCKET.get(r2Key);
    if (!obj) return json({ error: "not_found" }, { status: 404 });

    var r2Headers = {
      "Content-Type": meta.mime_type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400"
    };
    if (range) {
      r2Headers["Content-Range"] = "bytes " + range.start + "-" + range.end + "/" + meta.size_bytes;
      r2Headers["Content-Length"] = String(range.end - range.start + 1);
      return new Response(obj.body, { status: 206, headers: r2Headers });
    }
    r2Headers["Content-Length"] = String(meta.size_bytes);
    return new Response(obj.body, { status: 200, headers: r2Headers });
  }

  var start = range ? range.start : 0;
  var end = range ? range.end : Math.max(0, meta.size_bytes - 1);
  var firstChunk = Math.floor(start / CHUNK_SIZE);
  var lastChunk = Math.floor(end / CHUNK_SIZE);

  var rows = (await withSchema(env, function () {
    return env.DB.prepare(
      "SELECT chunk_index, data FROM media_chunks WHERE media_id = ? AND chunk_index >= ? AND chunk_index <= ? ORDER BY chunk_index ASC"
    ).bind(meta.id, firstChunk, lastChunk).all();
  })).results || [];

  if (!rows.length) return json({ error: "not_found" }, { status: 404 });

  var outLen = end - start + 1;
  var out = new Uint8Array(outLen);
  var writePos = 0;
  for (var i = 0; i < rows.length; i++) {
    var chunkBytes = base64ToBytes(rows[i].data);
    var chunkGlobalStart = rows[i].chunk_index * CHUNK_SIZE;
    var localStart = Math.max(0, start - chunkGlobalStart);
    var localEnd = Math.min(chunkBytes.length, end - chunkGlobalStart + 1);
    if (localEnd > localStart) {
      out.set(chunkBytes.subarray(localStart, localEnd), writePos);
      writePos += localEnd - localStart;
    }
  }

  var headers = {
    "Content-Type": meta.mime_type,
    "Accept-Ranges": "bytes",
    "Content-Length": String(outLen),
    "Cache-Control": "private, max-age=86400"
  };
  if (range) {
    headers["Content-Range"] = "bytes " + start + "-" + end + "/" + meta.size_bytes;
    return new Response(out, { status: 206, headers: headers });
  }
  return new Response(out, { status: 200, headers: headers });
}
