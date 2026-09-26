import { getSessionAccount, json } from "../../../../_lib/auth.js";

// GET: list polls for a topic, each with per-option tallies and (if signed in) the caller's own vote.
export async function onRequestGet({ request, params, env }) {
  var account = await getSessionAccount(request, env);

  var polls = (await env.DB.prepare(
    "SELECT id, question, options, created_by, created_at, closed FROM polls WHERE topic_id = ? ORDER BY created_at ASC"
  ).bind(params.id).all()).results || [];

  var votes = (await env.DB.prepare(
    "SELECT poll_id, option_id, voter_id, voter_name FROM votes WHERE topic_id = ?"
  ).bind(params.id).all()).results || [];

  var votesByPoll = {};
  votes.forEach(function (v) { (votesByPoll[v.poll_id] = votesByPoll[v.poll_id] || []).push(v); });

  polls.forEach(function (p) {
    var options;
    try { options = JSON.parse(p.options); } catch (e) { options = []; }
    var tally = {};
    options.forEach(function (o) { tally[o.id] = 0; });
    var pollVotes = votesByPoll[p.id] || [];
    pollVotes.forEach(function (v) { if (tally.hasOwnProperty(v.option_id)) tally[v.option_id]++; });
    p.options = options;
    p.tally = tally;
    p.total_votes = pollVotes.length;
    p.closed = !!p.closed;
    p.my_vote = null;
    if (account) {
      var mine = pollVotes.find(function (v) { return v.voter_id === account.id; });
      p.my_vote = mine ? mine.option_id : null;
    }
  });

  return json({ polls: polls });
}

// POST: create a poll with 2+ options.
export async function onRequestPost({ request, params, env }) {
  var account = await getSessionAccount(request, env);
  if (!account) return json({ error: "unauthorized" }, { status: 401 });

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, { status: 400 }); }
  var question = (body.question || "").trim();
  if (!question) return json({ error: "missing_question" }, { status: 400 });
  var optionTexts = Array.isArray(body.options) ? body.options.map(function (t) { return (t || "").trim(); }).filter(Boolean) : [];
  if (optionTexts.length < 2) return json({ error: "need_two_options" }, { status: 400 });

  var options = optionTexts.map(function (text) { return { id: crypto.randomUUID(), text: text }; });
  var id = crypto.randomUUID();
  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO polls (id, topic_id, question, options, created_by, created_at, closed) VALUES (?, ?, ?, ?, ?, ?, 0)"
  ).bind(id, params.id, question, JSON.stringify(options), account.id, now).run();

  var tally = {};
  options.forEach(function (o) { tally[o.id] = 0; });
  return json({ id: id, question: question, options: options, created_by: account.id, created_at: now, closed: false, tally: tally, total_votes: 0, my_vote: null });
}
