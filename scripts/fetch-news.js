/* simplify - daily story drafter (runs in GitHub Actions, free).
   RSS headlines + short snippets -> Gemini drafts a plain-language story in simplify's format -> saved as a DRAFT in
   Supabase. Nothing is shown to readers until the editor approves it in /review.
   We never copy full articles: only the headline and the publisher's own short RSS snippet are used, and every
   story links back to the original source.
   Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY. Optional: MAX_NEW (default 10), GEMINI_MODEL. */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const MAX_NEW = Math.max(1, parseInt(process.env.MAX_NEW, 10) || 10);
const PER_FEED = 4;
const MAX_AGE_H = 48;

// Edit this list to add or remove sources. A feed that fails is skipped (see the Action log).
const FEEDS = [
  { name: 'RBI', url: 'https://www.rbi.org.in/pressreleases_rss.xml' },
  { name: 'PIB', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3' },
  { name: 'SEBI', url: 'https://www.sebi.gov.in/sebirss.xml' },
  { name: 'Mint', url: 'https://www.livemint.com/rss/markets' },
  { name: 'Mint', url: 'https://www.livemint.com/rss/economy' },
  { name: 'The Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { name: 'The Economic Times', url: 'https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms' },
  { name: 'The Hindu BusinessLine', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss' },
  { name: 'The Hindu BusinessLine', url: 'https://www.thehindubusinessline.com/economy/feeder/default.rss' },
];

const TAGS = ['Markets', 'Policy', 'Technology', 'Startups', 'Economy', 'AI'];
const CATEGORIES = ['Policy', 'Markets', 'Business', 'Finance', 'Global', 'Economy', 'Technology'];
const CONCEPTS = ['repo-rate', 'bond-yields', 'nim', 'monetary-policy', 'inflation', 'supply-chain', 'fdi', 'ipo',
  'valuation', 'current-account-deficit', 'yoy', 'nbfc', 'credit-growth', 'gdp', 'fii-flows'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function timed(url, opts, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 20000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); } finally { clearTimeout(t); }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '-', mdash: '-', hellip: '...' };
function clean(s) {
  s = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
  s = s.replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] !== undefined ? ENT[n.toLowerCase()] : m));
  return s.replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(block);
  return m ? m[1] : '';
}
function parseFeed(xml) {
  const out = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi; let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    let link = clean(tag(b, 'link'));
    if (!link) { const h = /<link[^>]*href="([^"]+)"/i.exec(b); link = h ? h[1] : ''; }
    const title = clean(tag(b, 'title'));
    const snippet = clean(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded')).slice(0, 500);
    const when = Date.parse(clean(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, snippet, ts: isNaN(when) ? Date.now() : when });
  }
  return out;
}

async function sb(path, opts) {
  return timed(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, {
    headers: Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }, (opts && opts.headers) || {}),
  }), 20000);
}

function pick(arr, allowed, max) {
  return (Array.isArray(arr) ? arr : []).map(String).filter(x => allowed.includes(x)).slice(0, max);
}
function str(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }

const PROMPT = [
  'You write for "simplify", an app that helps people new to finance and economics understand the news.',
  'You are given ONE news item: a headline and the publisher\'s short snippet. Draft a plain-language explainer.',
  'Rules:',
  '- Facts about the event must come only from the headline and snippet. Never invent numbers, names, quotes or dates.',
  '- If the snippet does not say why it happened or what comes next, write one general-knowledge sentence starting with "General background:" instead of guessing specifics, or say the source does not say.',
  '- Plain words, no jargon without a short explanation. No investment, tax or legal advice. Do not tell anyone to buy or sell.',
  '- Do not copy sentences from the snippet; paraphrase.',
  'Return ONLY JSON with these keys: headline (max 90 chars, plain), dek (one sentence, max 160 chars), category (one of: ' + CATEGORIES.join(', ') + '),',
  'tags (1-3 of: ' + TAGS.join(', ') + '), whatHappened (max 320 chars), why (max 320 chars), matters (max 320 chars), next (max 260 chars),',
  'affected (3-5 short groups of people or sectors), concepts (0-3 of: ' + CONCEPTS.join(', ') + '; only if truly relevant), skip (true if the item is not business, economy, markets, policy or technology news).',
].join('\n');

async function draft(item, feedName) {
  const body = {
    systemInstruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: 'Source: ' + feedName + '\nHeadline: ' + item.title + '\nSnippet: ' + (item.snippet || '(none)') }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 900, responseMimeType: 'application/json' },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await timed('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body),
    }, 30000);
    if (r.status === 429 || r.status >= 500) { await sleep(20000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error('gemini ' + r.status);
    const d = await r.json();
    const parts = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
    const text = parts ? parts.map(p => p.text || '').join('') : '';
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
  }
  throw new Error('gemini rate limited');
}

function istDate(ts) { return new Date(ts + 19800000).toISOString().slice(0, 10); }
function makeId(url) { return 'l' + require('crypto').createHash('sha1').update(url).digest('hex').slice(0, 12); }

(async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) { console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY or GEMINI_API_KEY'); process.exit(1); }

  const perFeed = [];
  for (const f of FEEDS) {
    try {
      const r = await timed(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; simplify-news-drafter/1.0)', Accept: 'application/rss+xml, application/xml, text/xml, */*' } }, 20000);
      if (!r.ok) { console.log('SKIP', f.name, f.url, 'HTTP', r.status); continue; }
      const items = parseFeed(await r.text()).filter(i => Date.now() - i.ts < MAX_AGE_H * 3600000).sort((a, b) => b.ts - a.ts).slice(0, PER_FEED);
      console.log('OK  ', f.name, f.url, items.length, 'recent items');
      perFeed.push(items.map(i => Object.assign({ feed: f.name }, i)));
    } catch (e) { console.log('SKIP', f.name, f.url, e.message); }
  }
  // interleave so one outlet cannot use the whole quota
  const mixed = [], seen = new Set();
  for (let i = 0; i < PER_FEED; i++) perFeed.forEach(list => { const it = list[i]; if (it && !seen.has(it.link)) { seen.add(it.link); mixed.push(it); } });

  let known = new Set();
  try {
    const r = await sb('stories_live?select=source_url&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 14 * 86400000).toISOString()) + '&limit=2000');
    if (r.ok) (await r.json()).forEach(x => known.add(x.source_url));
  } catch (e) { console.log('Could not read existing stories:', e.message); }

  const fresh = mixed.filter(i => !known.has(i.link)).slice(0, MAX_NEW);
  console.log('New candidates:', fresh.length);
  let saved = 0, skipped = 0, failed = 0;
  for (const it of fresh) {
    try {
      const d = await draft(it, it.feed);
      if (d.skip === true) { skipped++; console.log('skip (off-topic):', it.title.slice(0, 80)); await sleep(5000); continue; }
      const row = {
        id: makeId(it.link), status: 'draft', date: istDate(it.ts),
        category: CATEGORIES.includes(d.category) ? d.category : 'Business',
        tags: pick(d.tags, TAGS, 3), headline: str(d.headline || it.title, 300), dek: str(d.dek, 600),
        read_mins: 3, relevance: "In today's top stories",
        what_happened: str(d.whatHappened, 1200), why: str(d.why, 1200), matters: str(d.matters, 1200), next_text: str(d.next, 1000),
        affected: (Array.isArray(d.affected) ? d.affected : []).map(x => str(x, 60)).filter(Boolean).slice(0, 6),
        concepts: pick(d.concepts, CONCEPTS, 3),
        source_name: it.feed, source_url: it.link, published_at: new Date(it.ts).toISOString(),
        raw_title: str(it.title + ' | ' + it.snippet, 1000), ai_model: MODEL,
      };
      if (!row.tags.length) row.tags = ['Economy'];
      if (!row.what_happened || !row.matters) { failed++; console.log('incomplete draft, dropped:', it.title.slice(0, 80)); await sleep(5000); continue; }
      const r = await sb('stories_live?on_conflict=source_url', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify([row]) });
      if (!r.ok) { failed++; console.log('save failed', r.status, (await r.text()).slice(0, 200)); } else { saved++; console.log('drafted:', row.headline); }
    } catch (e) { failed++; console.log('failed:', it.title.slice(0, 60), '-', e.message); }
    await sleep(5000);   // stay inside the free-tier requests-per-minute limit
  }
  console.log('DONE drafted=' + saved + ' skipped=' + skipped + ' failed=' + failed);
})();
