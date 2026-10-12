/* simplify — tiny, cookieless usage analytics + feedback.
   - Random anonymous id kept in localStorage (no cookies, no fingerprinting, no third parties).
   - Events go to the `events` table in Supabase; feedback goes to `feedback`. Both are insert-only (see schema.sql).
   - Never pass personal data or the text of questions/emails in props. Story ids and counts only.
   - If config.js is empty, everything here silently does nothing. */
(function(){
  var cfg = window.SIMPLIFY_CONFIG || {};
  var enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var ANON_KEY = 'simplify_anon_id', VISIT_KEY = 'simplify_last_visit';
  var queue = [], timer = null;

  function safeGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function safeSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }

  function rand(){
    try{ if(window.crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
    var s = ''; for(var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function anonId(){
    var id = safeGet(ANON_KEY);
    if(!id || id.length < 8 || id.length > 64){ id = rand(); safeSet(ANON_KEY, id); }
    return id;
  }
  function istDay(){ return new Date(Date.now() + 19800000).toISOString().slice(0, 10); }
  function dayDiff(a, b){ return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

  function cleanProps(p){
    var out = {}, n = 0;
    if(!p || typeof p !== 'object') return out;
    for(var k in p){
      if(n >= 8) break;
      var v = p[k];
      if(typeof v === 'string') v = v.slice(0, 60);
      else if(typeof v !== 'number' && typeof v !== 'boolean') continue;
      out[String(k).slice(0, 30)] = v; n++;
    }
    return out;
  }

  /* Returns { token, uid } if signed in, else {} (events are then sent as anonymous). */
  function identity(){
    var A = window.SimplifyAuth;
    if(!A || !A.enabled || !A.uid || !A.uid()) return Promise.resolve({});
    return A.getSession().then(function(s){
      return s && s.access_token ? { token: s.access_token, uid: s.user.id } : {};
    }).catch(function(){ return {}; });
  }

  function post(table, rows, token, keepalive){
    return fetch(cfg.SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + (token || cfg.SUPABASE_ANON_KEY),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(rows),
      keepalive: !!keepalive
    });
  }

  function flush(keepalive){
    clearTimeout(timer); timer = null;
    if(!enabled || !queue.length) return Promise.resolve();
    var batch = queue.splice(0, queue.length);
    return identity().then(function(id){
      var rows = batch.map(function(e){
        return { anon_id: e.anon, user_id: id.uid || null, name: e.name, props: e.props, created_at: e.at };
      });
      return post('events', rows, id.token, keepalive);
    }).catch(function(){ /* analytics must never break the product */ });
  }

  function event(name, props){
    if(!enabled || !name) return;
    if(queue.length >= 50) return;
    queue.push({ name: String(name).slice(0, 40), props: cleanProps(props), anon: anonId(), at: new Date().toISOString() });
    if(!timer) timer = setTimeout(function(){ flush(false); }, 1500);
  }

  function feedback(message, contact, page){
    if(!enabled) return Promise.resolve(false);
    message = String(message || '').trim().slice(0, 2000);
    if(!message) return Promise.resolve(false);
    return identity().then(function(id){
      return post('feedback', [{
        anon_id: anonId(), user_id: id.uid || null, message: message,
        contact: contact ? String(contact).slice(0, 200) : null, page: page ? String(page).slice(0, 100) : null
      }], id.token, false);
    }).then(function(r){ return !!(r && r.ok); }).catch(function(){ return false; });
  }

  // return_visit: first load on a new India day after a previous visit.
  function checkReturn(){
    var today = istDay(), last = safeGet(VISIT_KEY);
    if(last && last !== today){
      event('return_visit', { days_since: Math.min(60, Math.max(1, dayDiff(last, today))) });
    }
    safeSet(VISIT_KEY, today);
  }

  document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'hidden') flush(true); });
  window.addEventListener('pagehide', function(){ flush(true); });
  checkReturn();

  window.SimplifyTrack = { enabled: enabled, event: event, feedback: feedback, flush: function(){ return flush(false); } };
})();
