/* simplify - "Why did the market move today?" card. Shows the latest human-approved note (drafted by AI after the close,
   reviewed by the editor). Figures come straight from market data. Hidden when there is no recent approved note. */
(function(){
  'use strict';
  var cfg = window.SIMPLIFY_CONFIG || {};
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function pct(n){ return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%'; }
  function istDay(ms){ return new Date(ms + 19800000).toISOString().slice(0, 10); }

  function html(n){
    var d = new Date(n.note_date + 'T00:00:00');
    var when = istDay(Date.now()) === n.note_date ? 'today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    var chips = (n.snapshot || []).slice(0, 5).map(function(c){
      if(typeof c.changePct !== 'number') return '';
      return '<span class="mn-chip ' + (c.changePct >= 0 ? 'up' : 'down') + '">' + esc(c.label) + ' <b>' + pct(c.changePct) + '</b></span>';
    }).join('');
    var drivers = (n.drivers || []).filter(function(x){ return x && x.id && window.findStory && window.findStory(x.id); }).map(function(x){
      return '<button type="button" class="rail-l" onclick="openStory(\'' + esc(x.id) + '\')">' + esc(x.headline) + ' →</button>';
    }).join('');
    return '<div class="rail-card"><div class="rail-k">WHY MARKETS MOVED · ' + esc(when.toUpperCase()) + '</div>' +
      (chips ? '<div class="mn-chips">' + chips + '</div>' : '') +
      '<div class="rail-d" style="margin-top:10px">' + esc(n.summary) + '</div>' +
      (drivers ? '<div class="mn-d">Stories behind it</div>' + drivers : '') +
      '<div class="mn-foot">AI-drafted, human-reviewed. Markets rarely have one clear cause. Figures are delayed. Not investment advice.</div></div>';
  }

  function load(){
    var el = document.getElementById('note-card'); if(!el) return Promise.resolve(0);
    if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return Promise.resolve(0);
    return fetch(cfg.SUPABASE_URL + '/rest/v1/market_notes?select=*&status=eq.approved&order=note_date.desc&limit=1', {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY }
    }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){
      var n = rows && rows[0];
      var fresh = n && n.summary && (Date.parse(istDay(Date.now())) - Date.parse(n.note_date)) <= 3 * 86400000;
      el.innerHTML = fresh ? html(n) : '';
      return fresh ? 1 : 0;
    }).catch(function(){ return 0; });
  }

  var css = '.mn-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;} .mn-chip{font-size:12px;padding:4px 9px;border-radius:999px;background:var(--sidebar);color:#374151;font-weight:600;} .mn-chip b{font-variant-numeric:tabular-nums;} .mn-chip.up b{color:#15803D;} .mn-chip.down b{color:#B91C1C;} .mn-d{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:12px 0 2px;} .mn-foot{font-size:11.5px;color:var(--muted);line-height:1.45;margin-top:12px;}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  window.SimplifyNote = { load: load, html: html };
})();
