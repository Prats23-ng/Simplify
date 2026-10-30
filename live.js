/* simplify - loads human-approved live stories from Supabase and puts them in front of the sample set.
   If anything fails (or there are none yet), the app silently keeps using the sample stories. */
(function(){
  var cfg = window.SIMPLIFY_CONFIG || {};
  function toStory(r){
    return {
      id: String(r.id), date: String(r.date).slice(0, 10), category: r.category || 'Business',
      tags: r.tags || [], headline: r.headline, dek: r.dek || '', readMins: r.read_mins || 3,
      relevance: r.relevance || "In today's top stories",
      whatHappened: r.what_happened || '', why: r.why || '', matters: r.matters || '', next: r.next_text || '',
      affected: r.affected || [], concepts: r.concepts || [],
      sources: [r.source_name].filter(Boolean), source: r.source_name || '', url: r.source_url,
      publishedAt: r.published_at || r.date, reviewed: true
    };
  }
  function load(){
    if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !Array.isArray(window.STORY_BANK)) return Promise.resolve(0);
    var url = cfg.SUPABASE_URL + '/rest/v1/stories_live?select=*&status=eq.approved&order=date.desc,published_at.desc&limit=40';
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var t = setTimeout(function(){ if(ctl) ctl.abort(); }, 5000);
    return fetch(url, { headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY }, signal: ctl ? ctl.signal : undefined })
      .then(function(r){ return r.ok ? r.json() : []; })
      .then(function(rows){
        clearTimeout(t);
        var live = (rows || []).filter(function(r){ return r && r.id && r.headline && /^https?:\/\//.test(r.source_url || ''); }).map(toStory);
        if(!live.length) return 0;
        window.STORY_BANK.length = 0;                 // live, reviewed stories replace the samples
        live.forEach(function(s){ window.STORY_BANK.push(s); });
        return live.length;
      })
      .catch(function(){ clearTimeout(t); return 0; });
  }
  window.SimplifyLive = { load: load, toStory: toStory };
})();
