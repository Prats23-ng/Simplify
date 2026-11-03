/* simplify - weekly editorial drafter (GitHub Actions, free).
   Reads the week's APPROVED stories and the live market snapshot, asks Gemini to write one deep-dive with
   infographic blocks, checks every number it quotes against that material, and saves it as a DRAFT.
   Nothing is published until the editor approves it in /review.
   Chart data is never typed by the AI: charts only REFER to market series (e.g. "nifty", "sectors") and this script
   fills in the real numbers.
   Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY. Optional: SITE_URL, FORCE=1 (draft again for this week). */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const SITE_URL = (process.env.SITE_URL || 'https://simplify-liart.vercel.app').replace(/\/$/, '');
const MODELS = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []).concat(['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']);
let modelIdx = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));
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
const isNum = n => typeof n === 'number' && isFinite(n);

function istMonday() {
  const ist = new Date(Date.now() + 19800000);
  const dow = (ist.getUTCDay() + 6) % 7;                      // Monday = 0
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow)).toISOString().slice(0, 10);
}

const MARKET_LABELS = { nifty: 'Nifty 50', sensex: 'Sensex', banknifty: 'Bank Nifty', niftyit: 'Nifty IT', vix: 'India VIX', usdinr: 'USD/INR', gold: 'Gold (US$)', brent: 'Brent crude (US$)', sp500: 'S&P 500', nasdaq: 'Nasdaq' };

const PROMPT = [
  'You are the editor of "The Weekly", a once-a-week deep dive in simplify, an app that helps people new to finance and economics understand the news.',
  'You are given this week\'s reviewed news stories (S1, S2, ...) and a market data catalogue. Choose the ONE theme that matters most for Indian readers and write a deep dive on it, about 450-650 words in total, in plain language.',
  'Rules:',
  '- Every fact must come from the stories or the market data. Never invent numbers, names, quotes, dates or causes. If the material does not say why something happened, say what is known and what is not.',
  '- Any number in a "stat" or "compare" block must be copied exactly from the stories or market data.',
  '- Explain jargon in a few words the first time it appears. No investment, tax or legal advice. Never tell anyone to buy or sell. No predictions beyond what the sources say.',
  '- Charts do NOT contain numbers. A chart block only names which market series to draw (refs), and the system fills in the real data.',
  'Return ONLY JSON: {"title":"<=70 chars","standfirst":"<=200 chars, one or two sentences","theme":"short","usedStories":[1,3],',
  '"blocks":[ ... ]}. Blocks, in a good reading order (5 to 9 blocks, at least two visual blocks, ending with takeaways):',
  '{"type":"p","text":"..."}  {"type":"h","text":"short subheading"}',
  '{"type":"stat","items":[{"value":"exact figure","label":"what it is"}]}  (1 to 3 items)',
  '{"type":"chart","kind":"line","refs":["nifty","brent"],"title":"...","note":"one line on what to notice"}  (refs from the catalogue; 1 to 3 series; only if relevant)',
  '{"type":"chart","kind":"bars","refs":["sectors"],"title":"...","note":"..."}  (shows today\'s sector moves; only if relevant)',
  '{"type":"compare","title":"...","left":{"label":"Before","value":"exact figure","note":"..."},"right":{"label":"After","value":"exact figure","note":"..."}}',
  '{"type":"flow","title":"How X reaches Y","steps":[{"title":"short","text":"one sentence"}]}  (3 to 5 steps explaining a mechanism)',
  '{"type":"takeaways","items":["...","...","..."]}  (3 to 4 short points)',
].join('\n');

async function gemini(userText) {
  const body = {
    systemInstruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 8000, responseMimeType: 'application/json' },
  };
  for (let attempt = 0; attempt < 4 + MODELS.length; attempt++) {
    const model = MODELS[modelIdx];
    const r = await timed('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body),
    }, 90000);
    if (r.status === 404 || r.status === 400) { console.log('model not usable:', model, r.status); if (modelIdx < MODELS.length - 1) { modelIdx++; continue; } throw new Error('no model available'); }
    if (r.status === 429 || r.status >= 500) { await sleep(20000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error('gemini ' + r.status);
    const d = await r.json();
    const parts = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
    const text = parts ? parts.map(p => p.text || '').join('') : '';
    return { json: JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')), model };
  }
  throw new Error('gemini rate limited');
}

/* numbers: every figure a stat/compare quotes must exist in the source material */
function numTokens(s) {
  return (String(s).replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []);
}
function trivial(t) { const n = parseFloat(t); return (/^\d$/.test(t)) || (Number.isInteger(n) && n >= 1990 && n <= 2100); }

function marketNumbers(market) {
  const out = [];
  if (market) {
    (market.items || []).forEach(i => [i.price, Math.abs(i.change), Math.abs(i.changePct)].forEach(v => {
      if (!isNum(v)) return;
      [0, 1, 2].forEach(dp => out.push(v.toFixed(dp)));
      out.push(String(Math.round(v)));
    }));
    (market.sectors || []).forEach(s => { if (isNum(s.changePct)) { out.push(Math.abs(s.changePct).toFixed(1), Math.abs(s.changePct).toFixed(2)); } });
  }
  return out.join(' ');
}

function resolveChart(b, market) {
  const refs = (Array.isArray(b.refs) ? b.refs : []).map(String);
  if (b.kind === 'bars') {
    if (!refs.includes('sectors') || !market || !(market.sectors || []).length) return null;
    return { type: 'bars', signed: true, title: str(b.title, 90), note: str(b.note, 200), items: market.sectors.filter(s => isNum(s.changePct)).map(s => ({ label: s.name, value: s.changePct })) };
  }
  if (b.kind === 'line') {
    const byId = {}; ((market && market.items) || []).forEach(i => { byId[i.id] = i; });
    const series = refs.filter(r => byId[r] && Array.isArray(byId[r].spark) && byId[r].spark.length > 4).slice(0, 3)
      .map(r => ({ label: MARKET_LABELS[r] || byId[r].label, values: byId[r].spark }));
    if (!series.length) return null;
    return { type: 'line', normalize: series.length > 1, title: str(b.title, 90), note: str(b.note, 200), series };
  }
  return null;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) { console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY or GEMINI_API_KEY'); process.exit(1); }
  const weekStart = istMonday();
  const id = 'w-' + weekStart;
  if (process.env.FORCE !== '1') {
    const ex = await sb('editorials?select=id,status&id=eq.' + encodeURIComponent(id));
    if (ex.ok && (await ex.json()).length) { console.log('This week already has an editorial (' + id + '). Set FORCE=1 to draft again.'); return; }
  }
  const since = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);
  const sr = await sb('stories_live?select=headline,dek,what_happened,why,matters,source_name,source_url,date&status=eq.approved&date=gte.' + since + '&order=date.desc&limit=30');
  const stories = sr.ok ? await sr.json() : [];
  console.log('Approved stories this week:', stories.length);
  if (stories.length < 3) { console.log('Not enough approved stories yet (need 3). Approve more drafts, then run again.'); return; }

  let market = null;
  try { const r = await timed(SITE_URL + '/api/markets', {}, 20000); if (r.ok) market = await r.json(); } catch (e) { console.log('Market data unavailable:', e.message); }
  console.log('Market snapshot:', market ? market.items.length + ' items' : 'none');

  const storyText = stories.map((s, i) => 'S' + (i + 1) + ' [' + s.source_name + ', ' + s.date + '] ' + s.headline + '. ' + s.dek + ' What happened: ' + s.what_happened + ' Why: ' + s.why + ' Matters: ' + s.matters).join('\n');
  const marketText = market
    ? 'MARKET CATALOGUE (series you may reference by id):\n' + market.items.map(i => i.id + ' = ' + (MARKET_LABELS[i.id] || i.label) + ': latest ' + i.price + ', today ' + (i.changePct >= 0 ? '+' : '') + i.changePct + '%, about one month of daily closes available').join('\n') +
      '\nsectors = today\'s sector moves: ' + (market.sectors || []).map(s => s.name + ' ' + s.changePct + '%').join(', ')
    : 'MARKET CATALOGUE: none available this week. Do not use chart blocks.';
  const material = 'STORIES THIS WEEK:\n' + storyText + '\n\n' + marketText;

  const { json: ed, model } = await gemini(material);
  const sourceNorm = (material.replace(/,/g, '') + ' ' + marketNumbers(market));
  const has = t => sourceNorm.includes(t);
  const warnings = [];
  const body = [];
  (Array.isArray(ed.blocks) ? ed.blocks : []).slice(0, 12).forEach(b => {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'p' || b.type === 'h') {
      const text = str(b.text, 1400); if (!text) return;
      body.push({ type: b.type, text });
      numTokens(text).filter(t => !trivial(t) && !has(t)).forEach(t => warnings.push('Check the number ' + t + ' in: "' + text.slice(0, 70) + '..."'));
    } else if (b.type === 'stat') {
      const items = (b.items || []).slice(0, 3).map(i => ({ value: str(i && i.value, 24), label: str(i && i.label, 90) }))
        .filter(i => i.value && numTokens(i.value).every(t => trivial(t) || has(t)));
      if (items.length) body.push({ type: 'stat', items });
    } else if (b.type === 'chart') {
      const c = resolveChart(b, market); if (c) body.push(c);
    } else if (b.type === 'compare') {
      const l = b.left || {}, r = b.right || {};
      const ok = x => x.value && numTokens(x.value).every(t => trivial(t) || has(t));
      if (ok(l) && ok(r)) body.push({ type: 'compare', title: str(b.title, 90), note: str(b.note, 200),
        left: { label: str(l.label, 30), value: str(l.value, 24), note: str(l.note, 120) }, right: { label: str(r.label, 30), value: str(r.value, 24), note: str(r.note, 120) } });
    } else if (b.type === 'flow') {
      const steps = (b.steps || []).slice(0, 5).map(s => ({ title: str(s && s.title, 60), text: str(s && s.text, 200) })).filter(s => s.title);
      if (steps.length >= 3) body.push({ type: 'flow', title: str(b.title, 90), steps });
    } else if (b.type === 'takeaways') {
      const items = (b.items || []).slice(0, 4).map(x => str(x, 220)).filter(Boolean);
      if (items.length) { body.push({ type: 'takeaways', items }); items.forEach(x => numTokens(x).filter(t => !trivial(t) && !has(t)).forEach(t => warnings.push('Check the number ' + t + ' in: "' + x.slice(0, 70) + '..."'))); }
    }
  });
  const visuals = body.filter(b => ['stat', 'line', 'bars', 'compare', 'flow'].includes(b.type)).length;
  const paras = body.filter(b => b.type === 'p').length;
  if (!ed.title || paras < 2 || visuals < 1) { console.log('Draft was too thin (paragraphs ' + paras + ', visuals ' + visuals + '). Not saved. Run again.'); process.exit(1); }

  const words = body.reduce((n, b) => n + (b.text ? b.text.split(/\s+/).length : 0) + (b.items && b.items.map ? b.items.map(x => (x.text || x.label || x) + '').join(' ').split(/\s+/).length : 0), 0);
  const used = (Array.isArray(ed.usedStories) ? ed.usedStories : []).map(n => stories[(parseInt(n, 10) || 0) - 1]).filter(Boolean);
  const srcStories = (used.length ? used : stories.slice(0, 5)).slice(0, 8);
  const row = {
    id, status: 'draft', week_start: weekStart, kicker: 'The Weekly', title: str(ed.title, 160), standfirst: str(ed.standfirst, 400),
    read_mins: Math.max(2, Math.min(15, Math.round(words / 200))), body,
    sources: srcStories.map(s => ({ name: s.source_name, title: str(s.headline, 120), url: s.source_url })),
    warnings: warnings.slice(0, 20), ai_model: model,
  };
  const r = await sb('editorials?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([row]) });
  if (!r.ok) { console.log('Save failed', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  console.log('DRAFTED:', row.title, '| blocks', body.length, '| visuals', visuals, '| warnings', warnings.length);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
