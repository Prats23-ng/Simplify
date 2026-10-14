/* markets.js — Markets strip, "Markets today" card and the full Markets view for simplify.
 *
 * STATUS: design preview. The default data source is markets-sample.js (illustrative numbers,
 * always labelled "Sample data"). To go live, change defaultFetcher() to call /api/markets (same
 * payload shape) and remove markets-sample.js. Nothing here invents numbers: if a fetch fails it
 * shows the last saved live quote with its real time, or a calm "unavailable" state.
 */
(function () {
  'use strict';

  var REFRESH_MS = 15 * 60 * 1000;      // refresh while the tab is visible
  var STALE_MS = 35 * 60 * 1000;        // latest quote older than this = "last close"
  var LS_KEY = 'simplify_markets_last';
  var NEUTRAL = { vix: true, usdinr: true };   // not simply good/bad when they fall
  var DESC = {
    nifty: "Average of India's 50 largest listed companies",
    sensex: 'Average of 30 large companies on the BSE',
    banknifty: "Tracks India's biggest banks",
    vix: 'Expected market swings, the fear gauge',
    usdinr: 'Rupees needed to buy one US dollar'
  };
  var STRIP_IDS = ['nifty', 'banknifty', 'vix', 'usdinr'];
  var TILE_IDS = ['sensex', 'banknifty', 'vix', 'usdinr'];

  var state = { data: null, loading: true, failed: false, fromSaved: false, range: '1M', moverTab: 'gainers' };
  var fetcher = defaultFetcher;
  var timer = null;
  var inited = false;

  /* ---------- data source ---------- */
  function defaultFetcher() {
    // LIVE: return fetch('/api/markets').then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); });
    return Promise.resolve(window.MARKETS_SAMPLE ? JSON.parse(JSON.stringify(window.MARKETS_SAMPLE)) : null);
  }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return typeof n === 'number' && isFinite(n); }
  function fmt(n, dp) { return n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function dir(n) { return Math.abs(n) < 0.005 ? 'flat' : (n > 0 ? 'up' : 'down'); }
  function signed(n, dp, suffix) { var d = dir(n); return (d === 'up' ? '+' : d === 'down' ? '−' : '') + fmt(Math.abs(n), dp) + (suffix || ''); }
  function arrow(d) { return d === 'up' ? '▲' : d === 'down' ? '▼' : '•'; }
  function track(name, props) { try { if (window.SimplifyTrack && window.SimplifyTrack.event) window.SimplifyTrack.event(name, props || {}); } catch (e) {} }
  function istTime(iso) {
    try { return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date(iso)).replace(/\s?([AP]M)/i, function (m, a) { return ' ' + a.toLowerCase(); }); } catch (e) { return ''; }
  }
  function istDate(iso) {
    try { return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso)); } catch (e) { return ''; }
  }
  function item(id) { var d = state.data; if (!d) return null; for (var i = 0; i < d.items.length; i++) if (d.items[i].id === id) return d.items[i]; return null; }
  function mode() {
    var d = state.data;
    if (!d) return 'none';
    if (d.sample) return 'sample';
    var t = Date.parse(d.asOf);
    return (isFinite(t) && Date.now() - t > STALE_MS) ? 'closed' : 'delayed';
  }
  function kindOf(it) { return NEUTRAL[it.id] ? 'neutral' : dir(it.changePct); }

  function validate(p) {
    if (!p || !Array.isArray(p.items)) throw new Error('shape');
    p.items = p.items.filter(function (it) { return it && typeof it.id === 'string' && num(it.price) && num(it.change) && num(it.changePct); });
    if (!p.items.some(function (it) { return it.id === 'nifty'; })) throw new Error('no nifty');
    return p;
  }

  /* ---------- small renderers ---------- */
  function chip(it, cls) {
    var k = kindOf(it), d = dir(it.changePct);
    return '<span class="mk-chip ' + k + (cls ? ' ' + cls : '') + '"><i aria-hidden="true">' + arrow(d) + '</i>' + signed(it.changePct, 2, '%') + '</span>';
  }
  function spark(values, kind, h) {
    if (!values || values.length < 2) return '';
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values), range = (max - min) || 1, W = 100, pad = 2;
    var pts = values.map(function (v, i) { return [(i / (values.length - 1)) * W, pad + (h - 2 * pad) * (1 - (v - min) / range)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(' ');
    var area = line + ' L' + W + ' ' + h + ' L0 ' + h + ' Z';
    return '<svg class="mk-spark ' + kind + '" viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="a" d="' + area + '"/><path class="l" d="' + line + '"/></svg>';
  }

  /* ---------- strip (A) ---------- */
  function pillShort() {
    var m = mode(), d = state.data;
    if (m === 'sample') return 'Sample data';
    if (m === 'closed') return 'Last close · ' + istTime(d.asOf) + ' IST';
    return 'Delayed · ' + istTime(d.asOf) + ' IST';
  }
  function renderStrip() {
    var el = document.getElementById('markets-strip');
    if (!el) return;
    var h;
    if (state.loading && !state.data) {
      h = '<div class="mk-strip-scroll" aria-hidden="true"><span class="mk-skel" style="width:120px"></span><span class="mk-skel" style="width:120px"></span><span class="mk-skel" style="width:110px"></span></div>';
    } else if (!state.data) {
      h = '<div class="mk-strip-scroll"><span class="mk-strip-note">Markets are unavailable right now.</span><button type="button" class="mk-link" onclick="Markets.refresh(true)">Try again</button></div>';
    } else {
      var cells = STRIP_IDS.map(function (id) {
        var it = item(id); if (!it) return '';
        return '<button type="button" class="mk-s-item" onclick="Markets.open()" aria-label="' + esc(it.label) + ' ' + fmt(it.price, 2) + ', ' + signed(it.changePct, 2, '%') + '. Open Markets"><span class="mk-s-label">' + esc(it.label) + '</span><span class="mk-s-val">' + fmt(it.price, 2) + '</span>' + chip(it, 'bare') + '</button>';
      }).join('');
      h = '<div class="mk-strip-scroll">' + cells + '</div><span class="mk-pill ' + mode() + '">' + esc(pillShort()) + '</span>';
    }
    el.innerHTML = h;
  }

  /* ---------- Today card (B) ---------- */
  function renderTodayCard() {
    var el = document.getElementById('markets-today-card');
    if (!el) return;
    var n = item('nifty'), b = item('banknifty');
    if (!state.data || !n) { el.style.display = 'none'; return; }
    el.style.display = '';
    var line = '<span class="mk-tc-i"><b>Nifty 50</b> ' + chip(n, 'bare') + '</span>' + (b ? '<span class="mk-tc-i"><b>Bank Nifty</b> ' + chip(b, 'bare') + '</span>' : '');
    el.innerHTML = '<div class="mk-tc-main"><div class="mk-tc-title">Markets today' + (mode() === 'sample' ? ' <span class="mk-tag">Sample</span>' : '') + '</div><div class="mk-tc-line">' + line + '</div></div><button type="button" class="mk-tc-btn" onclick="Markets.open(true)">Open Markets <span aria-hidden="true">→</span></button>';
  }

  /* ---------- full view (C) ---------- */
  function skeletonView() {
    return '<div class="mk-wrap" aria-busy="true" aria-label="Loading markets">' + headHTML(true) +
      '<div class="mk-top"><div class="mk-card mk-skel-card" style="height:320px"></div><div class="mk-card mk-skel-card" style="height:320px"></div></div>' +
      '<div class="mk-tiles"><div class="mk-card mk-skel-card" style="height:150px"></div><div class="mk-card mk-skel-card" style="height:150px"></div><div class="mk-card mk-skel-card" style="height:150px"></div><div class="mk-card mk-skel-card" style="height:150px"></div></div></div>';
  }
  function headHTML(skel) {
    var pill = '', asof = '';
    if (!skel && state.data) {
      var m = mode();
      asof = m === 'sample' ? 'Design preview' : 'As of ' + istTime(state.data.asOf) + ' IST' + (m === 'closed' ? '' : ' · delayed');
      pill = '<span class="mk-pill ' + m + '">' + (m === 'sample' ? 'Sample data · not live' : m === 'closed' ? 'Market closed · last close' : 'Delayed') + '</span>';
    }
    return '<div class="mk-head"><div><h1 class="mk-title">Markets</h1><div class="mk-sub">How Indian markets did today, at a glance.</div></div><div class="mk-head-r"><span class="mk-asof">' + esc(asof) + '</span>' + pill + '</div></div>';
  }
  function notice() {
    var m = mode();
    if (m === 'sample') return '<div class="mk-note">This is a design preview. The numbers below are illustrative samples, not real market data.</div>';
    if (state.fromSaved) return '<div class="mk-note warn">Couldn’t refresh just now. Showing the last saved data from ' + esc(istDate(state.data.asOf)) + ', ' + esc(istTime(state.data.asOf)) + ' IST.</div>';
    return '';
  }
  function heroHTML() {
    var n = item('nifty'), sp = n.spark || [];
    var s = state.range === '5D' ? sp.slice(-5) : sp;
    var tabs = ['5D', '1M'].map(function (r) { return '<button type="button" class="' + (state.range === r ? 'on' : '') + '" aria-pressed="' + (state.range === r) + '" onclick="Markets.setRange(\'' + r + '\')">' + r + '</button>'; }).join('');
    return '<div class="mk-card mk-hero"><div class="mk-hero-top"><div><div class="mk-eyebrow">NIFTY 50</div><div class="mk-desc">' + esc(DESC.nifty) + '</div></div><div class="mk-seg" role="group" aria-label="Chart range">' + tabs + '</div></div>' +
      '<div class="mk-big">' + fmt(n.price, 2) + '</div><div class="mk-hero-chg">' + chip(n, 'lg') + '<span class="mk-chg-abs">' + signed(n.change, 2) + ' pts</span></div>' +
      '<div class="mk-hero-spark">' + spark(s, kindOf(n), 60) + '</div></div>';
  }
  function breadthHTML() {
    var mv = state.data.movers;
    if (!mv || !num(mv.advancers) || !num(mv.decliners) || !Array.isArray(mv.grid)) return '';
    var up = mv.advancers, dn = mv.decliners, fl = num(mv.unchanged) ? mv.unchanged : 0, tot = (up + dn + fl) || 1;
    var cells = mv.grid.map(function (p) {
      if (!num(p) || Math.abs(p) < 0.005) return '<i class="f"></i>';
      var a = (0.16 + 0.84 * Math.min(Math.abs(p) / 2.5, 1)).toFixed(2);
      return '<i style="background:rgba(' + (p > 0 ? '22,163,74' : '220,38,38') + ',' + a + ')"></i>';
    }).join('');
    var cap = up > dn ? 'More stocks rose than fell today.' : dn > up ? 'More stocks fell than rose today.' : 'As many stocks rose as fell today.';
    return '<div class="mk-card mk-breadth"><div class="mk-eyebrow">MARKET BREADTH · NIFTY 50</div>' +
      '<div class="mk-bar" role="img" aria-label="' + up + ' rising, ' + fl + ' flat, ' + dn + ' falling"><span class="u" style="flex:' + up + '"></span><span class="f" style="flex:' + fl + '"></span><span class="d" style="flex:' + dn + '"></span></div>' +
      '<div class="mk-counts"><div><b>' + up + '</b><span>rising</span></div><div class="mid"><b>' + fl + '</b><span>flat</span></div><div class="end"><b>' + dn + '</b><span>falling</span></div></div>' +
      '<div class="mk-grid" aria-hidden="true">' + cells + '</div><div class="mk-cap">' + cap + '</div></div>';
  }
  function tileHTML(id) {
    var it = item(id); if (!it) return '';
    var body;
    if (id === 'vix') {
      var pos = Math.max(0, Math.min(1, (it.price - 8) / 22)) * 100;
      body = '<div class="mk-vix" aria-hidden="true"><div class="mk-vix-track"><span style="left:' + pos.toFixed(1) + '%"></span></div><div class="mk-vix-lab"><span>Calm</span><span>Nervous</span></div></div>';
    } else body = '<div class="mk-tile-spark">' + spark(it.spark || [], kindOf(it), 36) + '</div>';
    return '<div class="mk-card mk-tile"><div class="mk-tile-label">' + esc(it.label) + '</div><div class="mk-desc">' + esc(DESC[id] || '') + '</div><div class="mk-mid">' + fmt(it.price, 2) + '</div>' + chip(it) + body + '</div>';
  }
  function moversHTML() {
    var mv = state.data.movers;
    if (!mv || !Array.isArray(mv.gainers) || !Array.isArray(mv.losers)) return '';
    function list(rows, cls, title) {
      var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.changePct); }).concat([0.01]));
      return '<div class="mk-card mk-m ' + cls + '"><div class="mk-eyebrow">' + title + ' · NIFTY 50</div>' + rows.map(function (r, i) {
        var d = dir(r.changePct);
        return '<div class="mk-row"><span class="rk">' + (i + 1) + '</span><span class="nm">' + esc(r.name) + '</span><span class="pr">₹' + fmt(r.price, 2) + '</span><span class="ch ' + d + '"><i aria-hidden="true">' + arrow(d) + '</i>' + signed(r.changePct, 2, '%') + '</span><span class="bar"><em class="' + d + '" style="width:' + Math.max(8, Math.round(Math.abs(r.changePct) / max * 100)) + '%"></em></span></div>';
      }).join('') + '</div>';
    }
    var t = state.moverTab;
    return '<div class="mk-movers" data-tab="' + t + '"><div class="mk-seg mk-m-tabs" role="group" aria-label="Movers"><button type="button" class="' + (t === 'gainers' ? 'on' : '') + '" aria-pressed="' + (t === 'gainers') + '" onclick="Markets.setMovers(\'gainers\')">Gainers</button><button type="button" class="' + (t === 'losers' ? 'on' : '') + '" aria-pressed="' + (t === 'losers') + '" onclick="Markets.setMovers(\'losers\')">Losers</button></div>' +
      list(mv.gainers.slice(0, 5), 'mk-m-gainers', 'TOP GAINERS') + list(mv.losers.slice(0, 5), 'mk-m-losers', 'TOP LOSERS') + '</div>';
  }
  function sectorsHTML() {
    var s = state.data.sectors;
    if (!Array.isArray(s) || !s.length) return '';
    return '<div class="mk-card mk-sectors"><div class="mk-eyebrow">SECTORS</div><div class="mk-sec-grid">' + s.filter(function (x) { return num(x.changePct); }).map(function (x) {
      var d = dir(x.changePct), a = (0.07 + 0.13 * Math.min(Math.abs(x.changePct) / 2, 1)).toFixed(2);
      var bg = d === 'flat' ? 'rgba(10,10,10,0.04)' : 'rgba(' + (d === 'up' ? '22,163,74' : '220,38,38') + ',' + a + ')';
      var bd = d === 'flat' ? 'var(--border)' : 'rgba(' + (d === 'up' ? '22,163,74' : '220,38,38') + ',0.28)';
      return '<div class="mk-sec" style="background:' + bg + ';border-color:' + bd + '"><span class="n">' + esc(x.name) + '</span><span class="v"><i class="' + d + '" aria-hidden="true">' + arrow(d) + '</i>' + signed(x.changePct, 2, '%') + '</span></div>';
    }).join('') + '</div></div>';
  }
  function footHTML() {
    return mode() === 'sample'
      ? '<div class="mk-foot"><span>Sample numbers for design preview only. Not investment advice.</span></div>'
      : '<div class="mk-foot"><span>Delayed data, for information only. Not investment advice.</span><span>Source: Yahoo Finance (unofficial feed)</span></div>';
  }
  function errorView() {
    return '<div class="mk-wrap">' + headHTML(true) + '<div class="mk-card mk-empty"><div class="mk-empty-t">Markets are unavailable right now.</div><div class="mk-empty-s">We couldn’t load market data and have nothing saved to show. Nothing is shown rather than guessing.</div><button type="button" class="mk-btn" onclick="Markets.refresh(true)">Try again</button></div></div>';
  }
  function renderView() {
    var el = document.getElementById('markets-view-body');
    if (!el) return;
    if (state.loading && !state.data) { el.innerHTML = skeletonView(); return; }
    if (!state.data) { el.innerHTML = errorView(); return; }
    var tiles = TILE_IDS.map(tileHTML).join('');
    var br = breadthHTML();
    el.innerHTML = '<div class="mk-wrap">' + headHTML(false) + notice() +
      '<div class="mk-top' + (br ? '' : ' one') + '">' + heroHTML() + br + '</div>' +
      '<div class="mk-tiles">' + tiles + '</div>' + moversHTML() + sectorsHTML() + footHTML() + '</div>';
  }
  function renderAll() { renderStrip(); renderTodayCard(); renderView(); }

  /* ---------- loading ---------- */
  function readSaved() {
    try { var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return s && !s.sample ? validate(s) : null; } catch (e) { return null; }
  }
  function load(force) {
    if (!state.data) { state.loading = true; renderAll(); }
    return Promise.resolve().then(function () { return fetcher(); }).then(function (p) {
      p = validate(p);
      state.data = p; state.loading = false; state.failed = false; state.fromSaved = false;
      p.fetchedAtMs = Date.now();
      if (!p.sample) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {} }
      renderAll();
    }).catch(function () {
      state.loading = false; state.failed = true;
      track('markets_load_fail');
      if (!state.data || state.fromSaved) { var s = readSaved(); if (s) { state.data = s; state.fromSaved = true; } }
      else state.fromSaved = true;   // keep showing what we already had, but say it is not fresh
      renderAll();
    });
  }

  /* ---------- public ---------- */
  function openView(fromCard) {
    if (fromCard) track('markets_card_open');
    var b = document.querySelector('.nav-item[data-view="markets"]');
    if (b) b.click();
  }
  function init() {
    if (inited) return; inited = true;
    css();
    var top = document.getElementById('topbar');
    if (top && !document.getElementById('markets-strip')) {
      var s = document.createElement('div'); s.id = 'markets-strip'; s.setAttribute('role', 'region'); s.setAttribute('aria-label', 'Markets');
      top.insertAdjacentElement('afterend', s);
    }
    var list = document.getElementById('today-story-list');
    if (list && !document.getElementById('markets-today-card')) {
      var c = document.createElement('div'); c.id = 'markets-today-card'; c.className = 'mk-today'; c.style.display = 'none';
      list.parentNode.insertBefore(c, list);
    }
    load();
    timer = setInterval(function () { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && (!state.data || Date.now() - (state.data.fetchedAtMs || 0) > REFRESH_MS)) load();
    });
  }
  window.Markets = {
    init: init,
    open: openView,
    refresh: function () { return load(true); },
    onShow: function () { track('markets_view'); renderView(); },
    setRange: function (r) { state.range = r; renderView(); },
    setMovers: function (t) { state.moverTab = t; renderView(); },
    setFetcher: function (f) { fetcher = f; },
    _state: state
  };

  /* ---------- styles ---------- */
  function css() {
    var s = document.createElement('style'); s.id = 'markets-style';
    s.textContent = [
      '#markets-strip{display:flex;align-items:center;gap:12px;height:42px;flex-shrink:0;padding:0 28px;border-bottom:1px solid var(--border);background:var(--bg);}',
      '.mk-strip-scroll{flex:1;min-width:0;display:flex;align-items:center;gap:6px;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:none;-webkit-overflow-scrolling:touch;}',
      '.mk-strip-scroll::-webkit-scrollbar{display:none;}',
      '.mk-s-item{flex-shrink:0;display:flex;align-items:baseline;gap:8px;padding:6px 10px;border-radius:8px;scroll-snap-align:start;font-size:12.5px;white-space:nowrap;transition:background .15s ease;}',
      '.mk-s-item:hover{background:rgba(10,10,10,0.045);}',
      '.mk-s-label{color:var(--muted);font-weight:600;} .mk-s-val{font-weight:700;color:var(--ink);}',
      '.mk-strip-note{font-size:12.5px;color:var(--muted);font-weight:500;padding:0 6px;}',
      '.mk-link{color:var(--primary);font-size:12.5px;font-weight:700;padding:4px 6px;}',
      '.mk-pill{flex-shrink:0;font-size:11.5px;font-weight:600;color:var(--muted);background:var(--surface);border:1px solid var(--border);padding:4px 10px;border-radius:999px;white-space:nowrap;}',
      '.mk-pill.sample{color:var(--primary);background:var(--primary-soft);border-color:transparent;}',
      '.mk-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--ink);padding:3px 8px;border-radius:999px;background:rgba(10,10,10,0.04);}',
      '.mk-chip i{font-style:normal;font-size:9px;line-height:1;} .mk-chip.up{background:rgba(22,163,74,0.10);} .mk-chip.up i{color:#16A34A;} .mk-chip.down{background:rgba(220,38,38,0.09);} .mk-chip.down i{color:#DC2626;}',
      '.mk-chip.neutral{background:var(--primary-soft);} .mk-chip.neutral i{color:var(--primary);}',
      '.mk-chip.bare{background:none;padding:0;} .mk-chip.lg{font-size:13.5px;padding:5px 11px;}',
      '.mk-today{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:18px;}',
      '.mk-tc-title{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:5px;letter-spacing:.02em;}',
      '.mk-tag{font-size:10.5px;font-weight:700;color:var(--primary);background:var(--primary-soft);padding:2px 7px;border-radius:999px;margin-left:6px;}',
      '.mk-tc-line{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13.5px;} .mk-tc-i{display:inline-flex;align-items:center;gap:7px;}',
      '.mk-tc-btn{flex-shrink:0;font-size:13px;font-weight:700;color:var(--primary);padding:8px 10px;border-radius:8px;} .mk-tc-btn:hover{background:var(--primary-soft);}',
      '.mk-wrap{max-width:1040px;margin:0 auto;}',
      '.mk-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;}',
      '.mk-title{font-size:32px;font-weight:800;} .mk-sub{font-size:14px;color:var(--muted);font-weight:500;margin-top:4px;}',
      '.mk-head-r{display:flex;align-items:center;gap:10px;flex-wrap:wrap;} .mk-asof{font-size:12.5px;color:var(--muted);}',
      '.mk-note{font-size:13px;color:var(--primary);background:var(--primary-soft);border-radius:12px;padding:10px 14px;margin-bottom:16px;font-weight:500;} .mk-note.warn{color:var(--amber);background:rgba(180,83,9,0.08);}',
      '.mk-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;min-width:0;}',
      '.mk-eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.08em;color:var(--primary);} .mk-desc{font-size:12px;color:var(--muted);margin-top:3px;font-weight:500;}',
      '.mk-top{display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:14px;} .mk-top.one{grid-template-columns:1fr;}',
      '.mk-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}',
      '.mk-seg{display:inline-flex;background:var(--sidebar);border-radius:999px;padding:3px;gap:2px;} .mk-seg button{font-size:12px;font-weight:600;color:var(--muted);padding:5px 11px;border-radius:999px;} .mk-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(10,10,10,0.08);}',
      '.mk-big{font-family:Manrope,sans-serif;font-size:48px;font-weight:800;letter-spacing:-0.03em;line-height:1.05;margin:16px 0 10px;}',
      '.mk-hero-chg{display:flex;align-items:center;gap:10px;flex-wrap:wrap;} .mk-chg-abs{font-size:13px;color:var(--muted);font-weight:500;}',
      '.mk-hero-spark{margin-top:18px;height:150px;} .mk-spark{width:100%;height:100%;display:block;overflow:visible;}',
      '.mk-spark .l{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;} .mk-spark .a{stroke:none;}',
      '.mk-spark.up .l{stroke:#16A34A;} .mk-spark.up .a{fill:rgba(22,163,74,0.10);} .mk-spark.down .l{stroke:#DC2626;} .mk-spark.down .a{fill:rgba(220,38,38,0.10);}',
      '.mk-spark.neutral .l,.mk-spark.flat .l{stroke:var(--primary);} .mk-spark.neutral .a,.mk-spark.flat .a{fill:rgba(79,70,229,0.10);}',
      '.mk-bar{display:flex;gap:2px;height:8px;margin:16px 0 12px;} .mk-bar span{border-radius:4px;min-width:0;} .mk-bar .u{background:#16A34A;} .mk-bar .d{background:#DC2626;} .mk-bar .f{background:#D1D5DB;}',
      '.mk-counts{display:flex;justify-content:space-between;} .mk-counts div{display:flex;flex-direction:column;} .mk-counts .mid{align-items:center;color:var(--muted);} .mk-counts .end{align-items:flex-end;}',
      '.mk-counts b{font-family:Manrope,sans-serif;font-size:22px;font-weight:800;} .mk-counts span{font-size:12px;color:var(--muted);}',
      '.mk-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;margin:16px 0 14px;} .mk-grid i{aspect-ratio:1/1;border-radius:5px;display:block;} .mk-grid i.f{background:#E5E7EB;}',
      '.mk-cap{font-size:12.5px;color:var(--muted);line-height:1.5;padding-top:12px;border-top:1px solid var(--border-soft);}',
      '.mk-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px;} .mk-tile{padding:16px;display:flex;flex-direction:column;align-items:flex-start;}',
      '.mk-tile-label{font-size:13.5px;font-weight:600;} .mk-mid{font-family:Manrope,sans-serif;font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:10px 0 8px;}',
      '.mk-tile-spark{width:100%;height:40px;margin-top:12px;} .mk-vix{width:100%;margin-top:16px;}',
      '.mk-vix-track{position:relative;height:6px;border-radius:999px;background:linear-gradient(90deg,rgba(79,70,229,0.10),rgba(79,70,229,0.34));} .mk-vix-track span{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;background:var(--primary);border:2px solid var(--surface);box-shadow:0 0 0 1px var(--primary-soft2);transform:translate(-50%,-50%);}',
      '.mk-vix-lab{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:7px;}',
      '.mk-movers{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;} .mk-m-tabs{display:none;grid-column:1/-1;width:100%;} .mk-m-tabs button{flex:1;}',
      '.mk-row{display:grid;grid-template-columns:18px minmax(0,1fr) auto 76px 52px;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border-soft);font-size:13.5px;} .mk-row:last-child{border-bottom:none;padding-bottom:0;}',
      '.mk-row .rk{color:var(--muted);font-size:12px;} .mk-row .nm{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .mk-row .pr{color:var(--muted);font-variant-numeric:tabular-nums;}',
      '.mk-row .ch{font-weight:700;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;} .mk-row .ch i{font-style:normal;font-size:9px;} .mk-row .ch.up i,.mk-sec .v i.up{color:#16A34A;} .mk-row .ch.down i,.mk-sec .v i.down{color:#DC2626;}',
      '.mk-row .bar{display:block;height:4px;border-radius:4px;background:transparent;} .mk-row .bar em{display:block;height:4px;border-radius:4px;} .mk-row .bar em.up{background:#16A34A;} .mk-row .bar em.down{background:#DC2626;} .mk-row .bar em.flat{background:#D1D5DB;}',
      '.mk-sectors{margin-bottom:14px;} .mk-sec-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px;}',
      '.mk-sec{border:1px solid;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0;} .mk-sec .n{font-size:12.5px;color:var(--muted);font-weight:600;} .mk-sec .v{font-family:Manrope,sans-serif;font-size:18px;font-weight:800;display:inline-flex;align-items:center;gap:6px;} .mk-sec .v i{font-style:normal;font-size:11px;}',
      '.mk-foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted);padding:6px 2px 0;}',
      '.mk-empty{text-align:center;padding:48px 20px;} .mk-empty-t{font-size:17px;font-weight:700;font-family:Manrope,sans-serif;} .mk-empty-s{font-size:13.5px;color:var(--muted);margin:8px auto 18px;max-width:380px;line-height:1.5;}',
      '.mk-btn{background:var(--primary);color:#fff;font-size:13.5px;font-weight:700;padding:10px 18px;border-radius:10px;}',
      '.mk-skel,.mk-skel-card{background:linear-gradient(90deg,rgba(10,10,10,0.05),rgba(10,10,10,0.09),rgba(10,10,10,0.05));background-size:200% 100%;animation:mkshim 1.4s ease infinite;border-radius:8px;} .mk-skel{display:inline-block;height:14px;} .mk-skel-card{border-color:transparent;}',
      '@keyframes mkshim{from{background-position:200% 0}to{background-position:-200% 0}} @media (prefers-reduced-motion:reduce){.mk-skel,.mk-skel-card{animation:none}}',
      '@media (max-width:860px){#markets-strip{padding:0 14px;gap:8px;} .mk-top{grid-template-columns:1fr;} .mk-tiles{grid-template-columns:repeat(2,1fr);} .mk-sec-grid{grid-template-columns:repeat(2,1fr);} .mk-title{font-size:28px;} .mk-big{font-size:42px;}}',
      '@media (max-width:700px){.mk-movers{grid-template-columns:1fr;} .mk-m-tabs{display:inline-flex;} .mk-movers[data-tab="gainers"] .mk-m-losers,.mk-movers[data-tab="losers"] .mk-m-gainers{display:none;} .mk-row{grid-template-columns:16px minmax(0,1fr) auto 74px;} .mk-row .bar{display:none;}}',
      '@media (max-width:420px){.mk-card{padding:16px;} .mk-tile{padding:14px;} .mk-big{font-size:38px;} .mk-mid{font-size:21px;} .mk-pill{font-size:11px;padding:4px 8px;} .mk-hero-spark{height:120px;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
