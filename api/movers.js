/* simplify - /api/movers  (Vercel serverless function, CommonJS)
   Top gainers, top losers and market breadth for the Nifty 50, from Yahoo Finance's public chart data
   (unofficial, free, delayed about 15 minutes). Cached for 5 minutes at Vercel's edge.
   Needs at least 45 of the 50 stocks to answer; otherwise it returns 502 and the app simply hides these two cards.
   The list below is the Nifty 50 as of August 2026 and changes a couple of times a year; update it when it does. */

const STOCKS = [
  ['ADANIENT.NS', 'Adani Enterprises'], ['ADANIPORTS.NS', 'Adani Ports'], ['APOLLOHOSP.NS', 'Apollo Hospitals'],
  ['ASIANPAINT.NS', 'Asian Paints'], ['AXISBANK.NS', 'Axis Bank'], ['BAJAJ-AUTO.NS', 'Bajaj Auto'],
  ['BAJAJFINSV.NS', 'Bajaj Finserv'], ['BAJFINANCE.NS', 'Bajaj Finance'], ['BEL.NS', 'Bharat Electronics'],
  ['BHARTIARTL.NS', 'Bharti Airtel'], ['CIPLA.NS', 'Cipla'], ['COALINDIA.NS', 'Coal India'],
  ['DRREDDY.NS', "Dr. Reddy's"], ['EICHERMOT.NS', 'Eicher Motors'], ['ETERNAL.NS', 'Eternal'],
  ['GRASIM.NS', 'Grasim'], ['HCLTECH.NS', 'HCL Tech'], ['HDFCBANK.NS', 'HDFC Bank'],
  ['HDFCLIFE.NS', 'HDFC Life'], ['HINDALCO.NS', 'Hindalco'], ['HINDUNILVR.NS', 'HUL'],
  ['ICICIBANK.NS', 'ICICI Bank'], ['INDIGO.NS', 'IndiGo'], ['INFY.NS', 'Infosys'],
  ['ITC.NS', 'ITC'], ['JIOFIN.NS', 'Jio Financial'], ['JSWSTEEL.NS', 'JSW Steel'],
  ['KOTAKBANK.NS', 'Kotak Bank'], ['LT.NS', 'Larsen & Toubro'], ['M&M.NS', 'Mahindra & Mahindra'],
  ['MARUTI.NS', 'Maruti Suzuki'], ['MAXHEALTH.NS', 'Max Healthcare'], ['NESTLEIND.NS', 'Nestle India'],
  ['NTPC.NS', 'NTPC'], ['ONGC.NS', 'ONGC'], ['POWERGRID.NS', 'Power Grid'],
  ['RELIANCE.NS', 'Reliance Ind.'], ['SBILIFE.NS', 'SBI Life'], ['SBIN.NS', 'SBI'],
  ['SHRIRAMFIN.NS', 'Shriram Finance'], ['SUNPHARMA.NS', 'Sun Pharma'], ['TATACONSUM.NS', 'Tata Consumer'],
  ['TATASTEEL.NS', 'Tata Steel'], ['TCS.NS', 'TCS'], ['TECHM.NS', 'Tech Mahindra'],
  ['TITAN.NS', 'Titan'], ['TMPV.NS', 'Tata Motors PV'], ['TRENT.NS', 'Trent'],
  ['ULTRACEMCO.NS', 'UltraTech Cement'], ['WIPRO.NS', 'Wipro'],
];
const MIN_OK = 45;
const UA = 'Mozilla/5.0 (compatible; simplify-markets/1.0)';
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const fin = n => typeof n === 'number' && isFinite(n);
const round = (n, dp) => Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp);

async function timedFetch(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 6000);
  try { return await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

// Same day logic as /api/markets: the previous close is the candle before today's.
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
  return { price, changePct: ((price - prev) / prev) * 100 };
}

async function getStock(sym) {
  for (const host of HOSTS) {
    try {
      const r = await timedFetch(host + '/v8/finance/chart/' + encodeURIComponent(sym) + '?range=5d&interval=1d', 6000);
      if (!r.ok) continue;
      const q = parseChart(await r.json());
      if (q) return q;
    } catch (e) { /* try the next host */ }
  }
  return null;
}

async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end(); }
  const rows = [];
  for (let i = 0; i < STOCKS.length; i += 10) {            // 10 at a time, to be gentle with Yahoo
    const batch = STOCKS.slice(i, i + 10);
    const got = await Promise.all(batch.map(s => getStock(s[0])));
    got.forEach((q, k) => { if (q) rows.push({ name: batch[k][1], price: round(q.price, 2), changePct: round(q.changePct, 2) }); });
  }
  if (rows.length < MIN_OK) {
    res.statusCode = 502; res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'unavailable' }));
  }
  const sorted = rows.slice().sort((a, b) => b.changePct - a.changePct);
  const adv = rows.filter(r => r.changePct > 0.005).length, dec = rows.filter(r => r.changePct < -0.005).length;
  const payload = {
    advancers: adv, decliners: dec, unchanged: rows.length - adv - dec,
    grid: sorted.map(r => r.changePct),
    gainers: sorted.slice(0, 5), losers: sorted.slice(-5).reverse(),
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  res.end(JSON.stringify(payload));
}

module.exports = handler;
module.exports._internal = { STOCKS, parseChart };
