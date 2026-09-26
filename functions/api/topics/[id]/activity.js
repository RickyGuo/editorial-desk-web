import { json } from "../../../_lib/auth.js";

// GET: activity leaderboard for a topic — message count, completed relay
// items, and votes cast, per account, ranked by total descending.
export async function onRequestGet({ params, env }) {
  var msgRows = (await env.DB.prepare(
    "SELECT author_id AS account_id, COUNT(*) AS n FROM messages WHERE topic_id = ? GROUP BY author_id"
  ).bind(params.id).all()).results || [];

  var itemRows = (await env.DB.prepare(
    "SELECT assignee_id AS account_id, COUNT(*) AS n FROM checklist_items WHERE topic_id = ? AND status = 'done' AND assignee_id IS NOT NULL GROUP BY assignee_id"
  ).bind(params.id).all()).results || [];

  var voteRows = (await env.DB.prepare(
    "SELECT voter_id AS account_id, COUNT(*) AS n FROM votes WHERE topic_id = ? GROUP BY voter_id"
  ).bind(params.id).all()).results || [];

  var byAccount = {};
  function bump(accountId, field, n) {
    if (!accountId) return;
    var row = byAccount[accountId] || (byAccount[accountId] = { account_id: accountId, messages: 0, items_done: 0, votes: 0 });
    row[field] += n;
  }
  msgRows.forEach(function (r) { bump(r.account_id, "messages", r.n); });
  itemRows.forEach(function (r) { bump(r.account_id, "items_done", r.n); });
  voteRows.forEach(function (r) { bump(r.account_id, "votes", r.n); });

  var list = Object.keys(byAccount).map(function (id) {
    var row = byAccount[id];
    row.total = row.messages + row.items_done * 2 + row.votes;
    return row;
  });
  list.sort(function (a, b) { return b.total - a.total; });

  return json({ activity: list });
}
