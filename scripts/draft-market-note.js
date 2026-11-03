/* simplify - "Why did the market move today?" drafter (GitHub Actions, free).
   Takes the day's real index/sector moves and the approved stories, asks Gemini for a short, cautious explanation,
   checks that it quotes no numbers that are not in that material, and saves a DRAFT. The editor approves it in /review.
   The figures shown next to the note come straight from the market data, never from the AI.
   Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY. Optional: SITE_URL, FORCE=1. */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const SITE_URL = (process.env.SITE_URL || 'https://simplify-liart.vercel.app').replace(/\/$/, '');
const FORCE = !!process.env.FORCE;
const MODELS = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []).concat(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-2.5-flash-lite']);

async function timed(url, opts, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 20000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); } finally { clearTimeout(t); }
}
async function sb(path, opts) {
  return timed(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, {
    headers: Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }, (opts && opts.headers) || {}),
  }), 20000);
}
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const istDate = ts => new Date(ts + 19800000).toISOString().slice(0, 10);
const sgn = n => (n > 0 ? '+' : n < 0 ? '-' : '') + Math.abs(n).toFixed(2) + '%';

const PROMPT = [
  'You write the short "Why did the market move today?" note for simplify, an app that helps people new to finance understand the news.',
  'You get today\'s real market moves and a list of today\'s reviewed news stories (S1, S2, ...).',
  'Write 2 or 3 plain sentences (max 520 characters) saying what moved and what in the stories may help explain it.',
  'Rules:',
  '- Use ONLY the moves and stories given. Never invent causes, numbers, names or events.',
  '- Correlation is not proof: use words like "may have", "likely", "alongside". Never say a story "caused" the move.',
  '- If none of the stories plausibly explains the move, say plainly that there is no single clear trigger in today\'s news.',
  '- Do not quote any number except figures that appear in the market moves given. No predictions. No advice to buy or sell.',
  'Return ONLY JSON: {"summary": string, "driverIds": [numbers of the stories you actually relied on, e.g. 1, 3]}',
].join('\n');

async function gemini(material) {
  const body = {
    systemInstruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: material }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: 'application/json' },
  };
  for (const model of MODELS) {
    const r = await timed('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body),
    }, 40000);
    if (r.status === 404 || r.status === 400 || r.status === 429 || r.status >= 500) { console.log('model skipped:', model, 'HTTP', r.status); continue; }
    if (!r.ok) throw new Error('gemini ' + r.status);
    const d = await r.json();
    const parts = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
    const text = parts ? parts.map(p => p.text || '').join('') : '';
    return { json: JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')), model };
  }
  throw new Error('no Gemini model available');
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) { console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY or GEMINI_API_KEY'); process.exit(1); }
  const today = istDate(Date.now());
  const dow = new Date(Date.now() + 19800000).getUTCDay();
  if ((dow === 0 || dow === 6) && !FORCE) { console.log('Weekend, markets closed. Nothing to do.'); return; }

  const mr = await timed(SITE_URL + '/api/markets', {}, 25000).catch(() => null);
  if (!mr || !mr.ok) { console.log('Market data unavailable. Nothing drafted.'); return; }
  const market = await mr.json();
  const by = {}; (market.items || []).forEach(i => { by[i.id] = i; });
  if (!by.nifty || typeof by.nifty.changePct !== 'number') { console.log('No Nifty data. Nothing drafted.'); return; }
  const asOf = Date.parse(market.asOf);
  if (asOf && istDate(asOf) !== today && !FORCE) { console.log('Latest market data is from ' + istDate(asOf) + ', not today (holiday?). Nothing drafted.'); return; }

  const ex = await sb('market_notes?select=status&id=eq.' + today);
  const have = ex.ok ? await ex.json() : [];
  if (have.length && !(FORCE && have[0].status !== 'approved')) { console.log('A note for ' + today + ' already exists (' + have[0].status + ').'); return; }

  const since = istDate(Date.now() - 86400000);
  const sr = await sb('stories_live?select=id,headline,what_happened,why,source_name&status=eq.approved&date=gte.' + since + '&order=date.desc,published_at.desc&limit=8');
  const stories = sr.ok ? await sr.json() : [];

  const moves = ['nifty', 'sensex', 'banknifty', 'niftyit'].filter(k => by[k]).map(k => by[k].label + ' ' + sgn(by[k].changePct));
  const sectors = (market.sectors || []).slice().sort((a, b) => b.changePct - a.changePct);
  const best = sectors.slice(0, 2), worst = sectors.slice(-2).reverse();
  const others = ['usdinr', 'brent', 'gold', 'vix'].filter(k => by[k]).map(k => by[k].label + ' ' + sgn(by[k].changePct));
  const marketText = 'TODAY\'S MARKET MOVES:\n' + moves.join('\n') + '\nStrongest sectors: ' + best.map(s => s.name + ' ' + sgn(s.changePct)).join(', ') +
    '\nWeakest sectors: ' + worst.map(s => s.name + ' ' + sgn(s.changePct)).join(', ') + '\nOther: ' + others.join(', ');
  const storyText = stories.length
    ? stories.map((s, i) => 'S' + (i + 1) + ' [' + s.source_name + '] ' + s.headline + '. ' + s.what_happened + ' ' + s.why).join('\n')
    : '(No reviewed stories for today.)';
  const material = marketText + '\n\nTODAY\'S REVIEWED STORIES:\n' + storyText;

  const { json: out, model } = await gemini(material);
  const summary = str(out.summary, 880);
  if (!summary) { console.log('Empty draft. Not saved.'); process.exit(1); }

  const known = (material + ' ' + moves.join(' ')).replace(/,/g, '');
  const warnings = [];
  (summary.match(/\d+(?:\.\d+)?/g) || []).forEach(t => { if (!known.includes(t)) warnings.push('Check the number ' + t + ': it is not in the market data or stories.'); });
  if (/\b(caused|because of|due to)\b/i.test(summary)) warnings.push('Wording check: the note may state a cause too firmly. Markets rarely have one clear cause.');

  const drivers = (Array.isArray(out.driverIds) ? out.driverIds : []).map(n => stories[(parseInt(n, 10) || 0) - 1]).filter(Boolean)
    .slice(0, 3).map(s => ({ id: s.id, headline: str(s.headline, 120) }));
  const snapshot = ['nifty', 'sensex', 'banknifty'].filter(k => by[k]).map(k => ({ label: by[k].label, changePct: by[k].changePct }))
    .concat(best.slice(0, 1).concat(worst.slice(0, 1)).map(s => ({ label: s.name, changePct: s.changePct })));

  const row = { id: today, status: 'draft', note_date: today, summary, snapshot, drivers, warnings, ai_model: model };
  const r = await sb('market_notes?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([row]) });
  if (!r.ok) { console.log('Save failed', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  console.log('DRAFTED note for ' + today + ' | drivers ' + drivers.length + ' | warnings ' + warnings.length);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
