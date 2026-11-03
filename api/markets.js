/* simplify - /api/markets  (Vercel serverless function, CommonJS)
   Delayed index, currency and commodity quotes for the Markets strip and Markets page.
   Source: Yahoo Finance's public chart data (unofficial and free: it can change or block without notice, and it is
   delayed about 15 minutes, so the UI labels it "Delayed" and "not investment advice").
   Responses are cached at Vercel's edge for 5 minutes, so Yahoo is called only a few times an hour however many
   people visit. If Yahoo fails, this returns 502 and the app shows its saved last quote or "unavailable";
   it never invents numbers. */

// id -> Yahoo symbol and display label. Order here is the order in the ticker strip.
const ITEMS = [
  { id: 'nifty',     sym: '^NSEI',     label: 'Nifty 50' },
  { id: 'sensex',    sym: '^BSESN',    label: 'Sensex' },
  { id: 'banknifty', sym: '^NSEBANK',  label: 'Bank Nifty' },
  { id: 'niftyit',   sym: '^CNXIT',    label: 'Nifty IT' },
  { id: 'vix',       sym: '^INDIAVIX', label: 'India VIX' },
  { id: 'usdinr',    sym: 'USDINR=X',  label: 'USD/INR' },
  { id: 'gold',      sym: 'GC=F',      label: 'Gold (US$)' },
  { id: 'brent',     sym: 'BZ=F',      label: 'Brent (US$)' },
  { id: 'sp500',     sym: '^GSPC',     label: 'S&P 500' },
  { id: 'nasdaq',    sym: '^IXIC',     label: 'Nasdaq' },
];
const SECTORS = [
  { name: 'Banking', sym: '^NSEBANK' },   { name: 'IT',     sym: '^CNXIT' },
  { name: 'Pharma',  sym: '^CNXPHARMA' }, { name: 'Auto',   sym: '^CNXAUTO' },
  { name: 'FMCG',    sym: '^CNXFMCG' },   { name: 'Metals', sym: '^CNXMETAL' },
  { name: 'Energy',  sym: '^CNXENERGY' }, { name: 'Realty', sym: '^CNXREALTY' },
];

const UA = 'Mozilla/5.0 (compatible; simplify-markets/1.0)';
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

async function timedFetch(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 6000);
  try { return await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

const fin = n => typeof n === 'number' && isFinite(n);
const round = (n, dp) => Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp);

/* Turn one Yahoo chart response into { price, prev, change, changePct, spark, time }.
   Daily candles: while the market is open the last candle is today's, so the previous close is the one before it;
   when the market is closed the last candle is already the last close, and the previous close is the one before that
   only if its day differs from the quote day. */
function parseChart(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.meta || !r.timestamp || !r.indicators || !r.indicators.quote || !r.indicators.quote[0]) return null;
  const meta = r.meta, ts = r.timestamp, cl = r.indicators.quote[0].close || [];
  const off = fin(meta.gmtoffset) ? meta.gmtoffset : 0;
  const day = t => Math.floor((t + off) / 86400);
  const pts = [];
  for (let i = 0; i < ts.length; i++) if (fin(cl[i]) && cl[i] > 0) pts.push({ t: ts[i], c: cl[i] });
  if (pts.length < 2) return null;
  const rmt = fin(meta.regularMarketTime) ? meta.regularMarketTime : pts[pts.length - 1].t;
  const price = fin(meta.regularMarketPrice) && meta.regularMarketPrice > 0 ? meta.regularMarketPrice : pts[pts.length - 1].c;
  const last = pts[pts.length - 1];
  const prev = day(last.t) === day(rmt) ? pts[pts.length - 2].c : last.c;
  if (!(prev > 0)) return null;
  const change = price - prev;
  const spark = pts.slice(-22).map(p => p.c);
  spark[spark.length - 1] = price;   // the sparkline ends on the live price
  return { price, prev, change, changePct: (change / prev) * 100, spark, time: rmt };
}

async function getChart(sym) {
  let lastErr = null;
  for (const host of HOSTS) {
    try {
      const r = await timedFetch(host + '/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1mo&interval=1d', 6000);
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
      const q = parseChart(await r.json());
      if (q) return q;
      lastErr = new Error('unreadable');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('failed');
}

async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end(); }
  const syms = Array.from(new Set(ITEMS.map(i => i.sym).concat(SECTORS.map(s => s.sym))));
  const settled = await Promise.allSettled(syms.map(getChart));
  const quotes = {};
  syms.forEach((s, i) => { if (settled[i].status === 'fulfilled') quotes[s] = settled[i].value; });

  const items = [];
  ITEMS.forEach(it => {
    const q = quotes[it.sym]; if (!q) return;
    const dp = it.id === 'usdinr' ? 4 : 2;
    items.push({ id: it.id, label: it.label, price: round(q.price, dp), change: round(q.change, dp), changePct: round(q.changePct, 2), spark: q.spark.map(v => round(v, dp)) });
  });
  const nifty = quotes['^NSEI'];
  if (!nifty || !items.length) {
    res.statusCode = 502; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'unavailable' }));
  }
  const sectors = SECTORS.filter(s => quotes[s.sym]).map(s => ({ name: s.name, changePct: round(quotes[s.sym].changePct, 2) }));
  const payload = { asOf: new Date(nifty.time * 1000).toISOString(), fetchedAt: new Date().toISOString(), items, sectors };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  res.end(JSON.stringify(payload));
}

module.exports = handler;
module.exports._internal = { parseChart, ITEMS, SECTORS };
