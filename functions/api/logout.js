import { parseCookies, sessionCookie, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  var cookies = parseCookies(request);
  if (cookies.session) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(cookies.session).run();
  }
  return json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0) } });
}
