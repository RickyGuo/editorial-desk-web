import { getSessionAccount, json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  var account = await getSessionAccount(request, env);
  return json({ account: account || null });
}
