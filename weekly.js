/* simplify - The Weekly: renders editorials (text + infographics) and wires them into the app.
   Charts are drawn here from data stored in the editorial (HTML/CSS bars and SVG lines), so they are free, sharp,
   accessible and match the app. Used by app.html (reader, rail card) and review.html (preview). */
(function(){
  'use strict';
  var cfg = window.SIMPLIFY_CONFIG || {};
  var COLORS = ['#4F46E5', '#F59E0B', '#16A34A', '#DC2626'];
  var state = { list: [], loaded: false, openId: null };

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function safeUrl(u){ return /^https?:\/\//i.test(u || '') ? u : ''; }
  function isNum(n){ return typeof n === 'number' && isFinite(n); }
  function fmt(n, dp){ return n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function signedPct(n){ return (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), 2) + '%'; }
  function weekLabel(d){ try { return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } }

  /* ---------- blocks ---------- */
  function head(b){ return (b.title ? '<div class="wk-ct">' + esc(b.title) + '</div>' : ''); }
  function foot(b){ return (b.note ? '<div class="wk-cn">' + esc(b.note) + '</div>' : ''); }

  function stat(b){
    var items = (b.items || []).filter(function(i){ return i && i.value; }).slice(0, 4);
    if(!items.length) return '';
    return '<div class="wk-fig wk-stats n' + items.length + '">' + items.map(function(i){
      return '<div class="wk-stat"><div class="wk-sv">' + esc(i.value) + '</div><div class="wk-sl">' + esc(i.label || '') + '</div></div>';
    }).join('') + '</div>';
  }

  function bars(b){
    var items = (b.items || []).filter(function(i){ return i && isNum(i.value); }).slice(0, 12);
    if(!items.length) return '';
    var signed = !!b.signed || items.some(function(i){ return i.value < 0; });
    var max = Math.max.apply(null, items.map(function(i){ return Math.abs(i.value); }).concat([0.0001]));
    var rows = items.map(function(i){
      var w = Math.max(2, Math.abs(i.value) / max * (signed ? 50 : 100));
      var up = i.value >= 0;
      var bar = signed
        ? '<span class="wk-bar ' + (up ? 'up' : 'down') + '" style="' + (up ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%"></span><span class="wk-mid"></span>'
        : '<span class="wk-bar flat" style="left:0;width:' + w.toFixed(1) + '%"></span>';
      var val = signed ? signedPct(i.value) : fmt(i.value, Math.abs(i.value) < 10 ? 2 : 0) + (b.unit ? ' ' + esc(b.unit) : '');
      return '<div class="wk-row"><span class="wk-rl">' + esc(i.label) + '</span><span class="wk-track">' + bar + '</span><span class="wk-rv ' + (signed ? (up ? 'up' : 'down') : '') + '">' + val + '</span></div>';
    }).join('');
    var text = items.map(function(i){ return i.label + ' ' + i.value; }).join(', ');
    return '<figure class="wk-fig" role="img" aria-label="' + esc((b.title || 'Bar chart') + ': ' + text) + '">' + head(b) + rows + foot(b) + '</figure>';
  }

  function line(b){
    var series = (b.series || []).filter(function(s){ return s && Array.isArray(s.values) && s.values.filter(isNum).length > 1; }).slice(0, 4);
    if(!series.length) return '';
    var norm = b.normalize === true || (b.normalize !== false && series.length > 1);
    var data = series.map(function(s){
      var v = s.values.filter(isNum), base = v[0] || 1;
      return { label: s.label, raw: v, v: norm ? v.map(function(x){ return x / base * 100; }) : v };
    });
    var all = [].concat.apply([], data.map(function(d){ return d.v; }));
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all), range = (max - min) || 1, W = 600, H = 190, pad = 10;
    var paths = data.map(function(d, k){
      var pts = d.v.map(function(y, i){ return [(i / (d.v.length - 1)) * W, pad + (H - 2 * pad) * (1 - (y - min) / range)]; });
      var p = pts.map(function(q, i){ return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
      var area = data.length === 1 ? '<path d="' + p + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="' + COLORS[0] + '" opacity="0.10"/>' : '';
      return area + '<path d="' + p + '" fill="none" stroke="' + COLORS[k] + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
    }).join('');
    var legend = data.map(function(d, k){
      var ch = (d.raw[d.raw.length - 1] / d.raw[0] - 1) * 100;
      return '<span class="wk-lg"><i style="background:' + COLORS[k] + '"></i>' + esc(d.label) + ' <b class="' + (ch >= 0 ? 'up' : 'down') + '">' + signedPct(ch) + '</b></span>';
    }).join('');
    var text = data.map(function(d){ var ch = (d.raw[d.raw.length - 1] / d.raw[0] - 1) * 100; return d.label + ' ' + signedPct(ch); }).join(', ');
    return '<figure class="wk-fig" role="img" aria-label="' + esc((b.title || 'Line chart') + ' over about a month: ' + text) + '">' + head(b) +
      '<div class="wk-legend">' + legend + '</div>' +
      '<svg class="wk-line" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true" focusable="false"><line x1="0" y1="' + (H - 1) + '" x2="' + W + '" y2="' + (H - 1) + '" stroke="rgba(10,10,10,0.12)"/>' + paths + '</svg>' +
      '<div class="wk-axis"><span>About a month ago</span><span>' + (norm ? 'Indexed: start = 100' : '') + '</span><span>Latest</span></div>' + foot(b) + '</figure>';
  }

  function compare(b){
    var l = b.left || {}, r = b.right || {};
    if(!l.value || !r.value) return '';
    function side(x){ return '<div class="wk-cmp-s"><div class="wk-cmp-l">' + esc(x.label || '') + '</div><div class="wk-cmp-v">' + esc(x.value) + '</div>' + (x.note ? '<div class="wk-cmp-n">' + esc(x.note) + '</div>' : '') + '</div>'; }
    return '<figure class="wk-fig">' + head(b) + '<div class="wk-cmp">' + side(l) + '<div class="wk-cmp-a" aria-hidden="true">→</div>' + side(r) + '</div>' + foot(b) + '</figure>';
  }

  function flow(b){
    var steps = (b.steps || []).filter(function(s){ return s && s.title; }).slice(0, 6);
    if(steps.length < 2) return '';
    return '<figure class="wk-fig">' + head(b) + '<ol class="wk-flow">' + steps.map(function(s){
      return '<li><span class="wk-fn" aria-hidden="true"></span><div><b>' + esc(s.title) + '</b>' + (s.text ? '<span>' + esc(s.text) + '</span>' : '') + '</div></li>';
    }).join('') + '</ol>' + foot(b) + '</figure>';
  }

  function takeaways(b){
    var it = (b.items || []).filter(Boolean).slice(0, 6);
    if(!it.length) return '';
    return '<div class="wk-take"><div class="wk-take-t">What to take away</div><ul>' + it.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  }

  function blocksHTML(body){
    return (body || []).map(function(b){
      if(!b || typeof b !== 'object') return '';
      switch(b.type){
        case 'h': return '<h2 class="wk-h">' + esc(b.text) + '</h2>';
        case 'p': return '<p class="wk-p">' + esc(b.text) + '</p>';
        case 'stat': return stat(b);
        case 'bars': return bars(b);
        case 'line': return line(b);
        case 'compare': return compare(b);
        case 'flow': return flow(b);
        case 'takeaways': return takeaways(b);
        default: return '';
      }
    }).join('');
  }

  function articleHTML(ed){
    var src = (ed.sources || []).map(function(s){
      var u = safeUrl(s.url);
      return u ? '<li><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.name || u) + (s.title ? ': ' + esc(s.title) : '') + ' ↗</a></li>' : '';
    }).join('');
    return '<article class="wk-art"><div class="wk-kicker">' + esc(ed.kicker || 'The Weekly') + '</div><h1 class="wk-title">' + esc(ed.title) + '</h1>' +
      (ed.standfirst ? '<p class="wk-stand">' + esc(ed.standfirst) + '</p>' : '') +
      '<div class="wk-meta">' + (ed.sample ? 'Preview of the layout · the first real edition is coming soon' : 'Week of ' + esc(weekLabel(ed.week_start)) + ' · ' + esc(ed.read_mins || 5) + ' min read · AI-drafted, human-reviewed') + '</div>' +
      blocksHTML(ed.body) +
      (src ? '<div class="wk-src"><div class="wk-src-t">Sources</div><ul>' + src + '</ul></div>' : '') +
      '<p class="wk-disc">Drafted by AI from public headlines and summaries, then reviewed by a human editor. It can still contain mistakes, so check the original sources. Not investment, tax or legal advice. Market figures are delayed.</p></article>';
  }


  /* Shown until the first real edition is approved, so the space is never empty. No market numbers: it only shows the format. */
  var SAMPLE = {
    id: 'sample', sample: true, kicker: 'The Weekly · Preview',
    title: 'One big story a week, explained properly',
    standfirst: 'This is a preview of the layout. Each Sunday, simplify picks the one theme that mattered most that week, explains it step by step, and shows the charts behind it.',
    read_mins: 3, sources: [],
    body: [
      { type: 'stat', items: [{ value: '1', label: 'big story a week' }, { value: '~5 min', label: 'to read, start to finish' }, { value: '3–4', label: 'charts that show the idea' }] },
      { type: 'h', text: 'What you will find in an edition' },
      { type: 'p', text: 'A plain-language explanation of the week\'s most important theme, written for someone who is new to finance. No jargon without a short explanation, and no advice on what to buy or sell.' },
      { type: 'flow', title: 'How each edition is made', steps: [
        { title: 'Collect', text: 'The week\'s reviewed news stories from RBI, PIB, SEBI, Mint, ET and BusinessLine.' },
        { title: 'Draft', text: 'AI writes a first version using only those stories and real, delayed market data.' },
        { title: 'Check', text: 'Every number is matched against the sources, and anything doubtful is flagged.' },
        { title: 'Review', text: 'A human editor edits and approves it before anyone sees it.' } ] },
      { type: 'takeaways', items: ['Charts use real market data, never numbers typed in by the AI.', 'Every edition lists its sources so you can check the originals.'] }
    ]
  };
  function eff(){ return state.list.length ? state.list : [SAMPLE]; }

  /* ---------- app wiring ---------- */
  function firstVisual(ed){
    var b = (ed.body || []).filter(function(x){ return x && (x.type === 'line' || x.type === 'bars' || x.type === 'stat'); })[0];
    if(!b) return '';
    if(b.type === 'stat'){ var i = (b.items || [])[0]; return i ? '<div class="wk-rail-stat"><b>' + esc(i.value) + '</b><span>' + esc(i.label || '') + '</span></div>' : ''; }
    if(b.type === 'line'){
      var s = (b.series || [])[0]; if(!s || !Array.isArray(s.values)) return '';
      var v = s.values.filter(isNum); if(v.length < 2) return '';
      var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), r = (mx - mn) || 1;
      var p = v.map(function(y, k){ return (k ? 'L' : 'M') + ((k / (v.length - 1)) * 100).toFixed(1) + ' ' + (4 + 32 * (1 - (y - mn) / r)).toFixed(1); }).join(' ');
      return '<svg class="wk-rail-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="' + p + '" fill="none" stroke="#fff" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>';
    }
    return '';
  }

  function railHTML(ed){
    return '<button type="button" class="wk-rail" onclick="SimplifyWeekly.open(\'' + esc(ed.id) + '\')"><div class="wk-rail-k">' + (ed.sample ? 'THE WEEKLY · PREVIEW' : 'THE WEEKLY') + '</div>' + firstVisual(ed) +
      '<div class="wk-rail-t">' + esc(ed.title) + '</div><div class="wk-rail-s">' + esc(ed.standfirst || '') + '</div><div class="wk-rail-c">Read the deep dive →</div></button>';
  }

  function renderView(){
    var el = document.getElementById('weekly-body'); if(!el) return;
    var ed = null; eff().forEach(function(x){ if(x.id === state.openId) ed = x; });
    if(!state.list.length){ el.innerHTML = articleHTML(SAMPLE); return; }
    if(ed){ el.innerHTML = '<button type="button" class="wk-back" onclick="SimplifyWeekly.back()">← All editions</button>' + articleHTML(ed); return; }
    var latest = state.list[0], older = state.list.slice(1);
    el.innerHTML = '<div class="wk-list-h">The Weekly</div><div class="wk-list-s">One story a week, explained properly, with the charts to see it.</div>' +
      '<div class="wk-hero" onclick="SimplifyWeekly.open(\'' + esc(latest.id) + '\')"><div class="wk-kicker">Latest · Week of ' + esc(weekLabel(latest.week_start)) + '</div><div class="wk-hero-t">' + esc(latest.title) + '</div><div class="wk-hero-s">' + esc(latest.standfirst || '') + '</div><div class="wk-rail-c" style="color:var(--primary)">Read →</div></div>' +
      (older.length ? '<div class="wk-older-h">Earlier editions</div>' + older.map(function(o){ return '<button type="button" class="wk-old" onclick="SimplifyWeekly.open(\'' + esc(o.id) + '\')"><span>' + esc(o.title) + '</span><em>Week of ' + esc(weekLabel(o.week_start)) + '</em></button>'; }).join('') : '');
  }

  function renderRail(){
    var el = document.getElementById('weekly-rail'); if(!el) return;
    el.innerHTML = railHTML(eff()[0]);
    el.style.display = '';
    var nav = document.getElementById('nav-weekly'); if(nav) nav.style.display = '';
  }

  function load(){
    if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY){ renderRail(); renderView(); return Promise.resolve(0); }
    return fetch(cfg.SUPABASE_URL + '/rest/v1/editorials?select=*&status=eq.approved&order=week_start.desc,created_at.desc&limit=30', {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY }
    }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){
      state.list = (rows || []).filter(function(r){ return r && r.id && r.title && Array.isArray(r.body); });
      state.loaded = true; renderRail(); renderView(); return state.list.length;
    }).catch(function(){ renderRail(); renderView(); return 0; });
  }

  function open(id){
    state.openId = id;
    var btn = document.getElementById('nav-weekly');
    if(window.switchView && btn) switchView('weekly', btn);
    renderView();
    try { if(window.SimplifyTrack) SimplifyTrack.event('weekly_open', { id: String(id).slice(0, 40) }); } catch (e) {}
  }
  function back(){ state.openId = null; renderView(); var c = document.getElementById('view-container'); if(c) c.scrollTop = 0; }

  /* ---------- styles ---------- */
  var css = [
    '.wk-art{max-width:720px;margin:0 auto;} .wk-kicker{font-size:12px;font-weight:800;letter-spacing:.08em;color:var(--primary);text-transform:uppercase;}',
    '.wk-title{font-size:34px;line-height:1.15;font-weight:800;margin:10px 0 12px;letter-spacing:-0.02em;} .wk-stand{font-size:18px;line-height:1.5;color:#374151;margin:0 0 12px;}',
    '.wk-meta{font-size:13px;color:var(--muted);margin-bottom:26px;padding-bottom:18px;border-bottom:1px solid var(--border);}',
    '.wk-p{font-size:16.5px;line-height:1.75;color:#1F2937;margin:0 0 16px;} .wk-h{font-size:21px;font-weight:800;margin:30px 0 10px;letter-spacing:-0.01em;}',
    '.wk-fig{margin:26px 0;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:18px;} .wk-ct{font-size:14px;font-weight:700;margin-bottom:14px;} .wk-cn{font-size:12.5px;color:var(--muted);margin-top:12px;line-height:1.5;}',
    '.wk-stats{display:grid;gap:12px;grid-template-columns:repeat(2,1fr);background:linear-gradient(180deg,#EEF2FF,#fff);} .wk-stats.n3{grid-template-columns:repeat(3,1fr);} .wk-stats.n4{grid-template-columns:repeat(4,1fr);} .wk-stats.n1{grid-template-columns:1fr;}',
    '.wk-sv{font-size:30px;font-weight:800;color:var(--primary);letter-spacing:-0.02em;line-height:1.1;} .wk-sl{font-size:13px;color:#4B5563;margin-top:5px;line-height:1.35;}',
    '.wk-row{display:grid;grid-template-columns:minmax(80px,32%) 1fr 66px;gap:10px;align-items:center;padding:6px 0;font-size:13.5px;} .wk-rl{color:#374151;font-weight:600;} .wk-rv{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;}',
    '.wk-track{position:relative;height:16px;background:rgba(10,10,10,0.04);border-radius:8px;overflow:hidden;} .wk-bar{position:absolute;top:0;bottom:0;border-radius:8px;} .wk-bar.up{background:#16A34A;} .wk-bar.down{background:#DC2626;} .wk-bar.flat{background:var(--primary);} .wk-mid{position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(10,10,10,0.25);}',
    '.up{color:#15803D;} .down{color:#B91C1C;}',
    '.wk-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:10px;font-size:13px;} .wk-lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;} .wk-lg b{margin-left:4px;}',
    '.wk-line{width:100%;height:190px;display:block;overflow:visible;} .wk-axis{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:6px;}',
    '.wk-cmp{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;} .wk-cmp-s{background:var(--sidebar);border-radius:14px;padding:16px;} .wk-cmp-l{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;} .wk-cmp-v{font-size:26px;font-weight:800;margin-top:4px;letter-spacing:-0.02em;} .wk-cmp-n{font-size:12.5px;color:#4B5563;margin-top:4px;line-height:1.4;} .wk-cmp-a{font-size:22px;color:var(--primary);font-weight:800;}',
    '.wk-flow{list-style:none;margin:0;padding:0;counter-reset:s;} .wk-flow li{display:flex;gap:14px;position:relative;padding-bottom:18px;} .wk-flow li:last-child{padding-bottom:0;} .wk-flow li:not(:last-child)::before{content:"";position:absolute;left:13px;top:30px;bottom:2px;width:2px;background:rgba(79,70,229,0.25);}',
    '.wk-fn{flex:0 0 28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center;counter-increment:s;} .wk-fn::after{content:counter(s);} .wk-flow b{display:block;font-size:15px;} .wk-flow div span{display:block;font-size:14px;color:#4B5563;line-height:1.5;margin-top:2px;}',
    '.wk-take{margin:30px 0;padding:20px 22px;background:#EEF2FF;border-radius:18px;} .wk-take-t{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--primary);margin-bottom:8px;} .wk-take ul{margin:0;padding-left:20px;} .wk-take li{font-size:15.5px;line-height:1.6;margin:6px 0;color:#1F2937;}',
    '.wk-src{margin-top:30px;font-size:13.5px;} .wk-src-t{font-weight:800;margin-bottom:6px;} .wk-src ul{margin:0;padding-left:18px;} .wk-src li{margin:4px 0;} .wk-src a{color:var(--primary);} .wk-disc{font-size:12.5px;color:var(--muted);line-height:1.5;margin-top:22px;padding-top:16px;border-top:1px solid var(--border);}',
    '.wk-back{background:none;border:0;font:600 14px inherit;color:var(--muted);cursor:pointer;padding:6px 0;margin-bottom:14px;} .wk-empty{text-align:center;color:var(--muted);padding:60px 0;}',
    '.wk-list-h{font-size:26px;font-weight:800;} .wk-list-s{color:var(--muted);margin:4px 0 22px;font-size:14px;} .wk-hero{background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;border-radius:22px;padding:28px;cursor:pointer;} .wk-hero .wk-kicker{color:#C7D2FE;} .wk-hero-t{font-size:26px;font-weight:800;line-height:1.2;margin:8px 0;} .wk-hero-s{opacity:.9;line-height:1.55;margin-bottom:14px;} .wk-hero .wk-rail-c{color:#fff !important;}',
    '.wk-older-h{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:26px 0 8px;} .wk-old{display:flex;justify-content:space-between;gap:12px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:8px;cursor:pointer;font:600 15px inherit;} .wk-old em{font-style:normal;font-weight:500;font-size:12.5px;color:var(--muted);white-space:nowrap;}',
    '.wk-rail{display:block;width:100%;text-align:left;border:0;cursor:pointer;color:#fff;background:linear-gradient(135deg,#4F46E5,#7C3AED);border-radius:20px;padding:22px;font-family:inherit;} .wk-rail-k{font-size:11.5px;font-weight:800;letter-spacing:.1em;color:#C7D2FE;margin-bottom:10px;} .wk-rail-t{font-size:19px;font-weight:800;line-height:1.25;margin-bottom:8px;} .wk-rail-s{font-size:13.5px;line-height:1.5;opacity:.88;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:14px;} .wk-rail-c{font-size:13.5px;font-weight:700;}',
    '.wk-rail-spark{width:100%;height:46px;display:block;margin-bottom:12px;} .wk-rail-stat{margin-bottom:12px;} .wk-rail-stat b{display:block;font-size:34px;letter-spacing:-0.02em;line-height:1.1;} .wk-rail-stat span{font-size:12.5px;opacity:.85;}',
    '@media (max-width:640px){.wk-title{font-size:27px;} .wk-stats.n3,.wk-stats.n4{grid-template-columns:repeat(2,1fr);} .wk-cmp{grid-template-columns:1fr;} .wk-cmp-a{transform:rotate(90deg);text-align:center;} .wk-row{grid-template-columns:minmax(70px,34%) 1fr 58px;}}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.SimplifyWeekly = { load: load, open: open, back: back, articleHTML: articleHTML, blocksHTML: blocksHTML, renderRail: renderRail, renderView: renderView, state: state };
})();
