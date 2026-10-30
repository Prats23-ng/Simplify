/* simplify - private editor page. Only the admin account can read drafts or change stories (enforced by Supabase). */
(function(){
  var cfg = window.SIMPLIFY_CONFIG || {};
  var TAGS = ['Markets','Policy','Technology','Startups','Economy','AI'];
  var CATS = ['Policy','Markets','Business','Finance','Global','Economy','Technology'];
  var CONCEPTS = ['repo-rate','bond-yields','nim','monetary-policy','inflation','supply-chain','fdi','ipo','valuation','current-account-deficit','yoy','nbfc','credit-growth','gdp','fii-flows'];
  var token = null, uid = null, filter = 'draft';
  var $ = function(id){ return document.getElementById(id); };

  function el(tag, attrs, kids){
    var n = document.createElement(tag), k;
    for(k in (attrs||{})){ if(k === 'text') n.textContent = attrs[k]; else if(k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]); }
    (kids||[]).forEach(function(c){ if(c) n.appendChild(c); });
    return n;
  }
  function say(text, err, actions){
    var box = $('status'); box.innerHTML = '';
    if(!text) return;
    var m = el('div', { class: 'msg' + (err ? ' err' : ''), text: text }, actions || []);
    box.appendChild(m);
  }
  function api(path, opts){
    opts = opts || {};
    var h = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    for(var k in (opts.headers||{})) h[k] = opts.headers[k];
    return fetch(cfg.SUPABASE_URL + '/rest/v1/' + path, { method: opts.method || 'GET', headers: h, body: opts.body });
  }

  function start(){
    var A = window.SimplifyAuth;
    if(!A || !A.enabled){ say('Sign-in is not available right now.', true); return; }
    A.getSession().then(function(s){
      if(!s){ say('Please sign in first, then come back to this page.', false, [el('br'), el('a', { href: 'signin.html', text: 'Go to sign in' })]); return; }
      token = s.access_token; uid = s.user.id;
      return checkAdmin();
    });
  }

  function checkAdmin(){
    return api('admins?select=user_id&user_id=eq.' + encodeURIComponent(uid)).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){
      if(rows && rows.length){ say(''); $('app').hidden = false; drawTabs(); load(); return; }
      var b = el('button', { class: 'btn main', type: 'button', text: 'Make me the editor' });
      b.addEventListener('click', claim);
      say('This account is not an editor yet. If you are setting up simplify for the first time, claim the editor role now.', false, [el('br'), b]);
    });
  }
  function claim(){
    api('rpc/claim_admin', { method: 'POST', body: '{}' }).then(function(r){ return r.ok ? r.json() : false; }).then(function(ok){
      if(ok === true) checkAdmin(); else say('Someone else is already the editor, so this account cannot review stories.', true);
    });
  }

  function drawTabs(){
    var box = $('tabs'); box.innerHTML = '';
    [['draft','Drafts to review'],['approved','Published'],['rejected','Rejected']].forEach(function(t){
      var b = el('button', { class: 'tab' + (filter === t[0] ? ' on' : ''), type: 'button', text: t[1] });
      b.addEventListener('click', function(){ filter = t[0]; drawTabs(); load(); });
      box.appendChild(b);
    });
  }

  function load(){
    var list = $('list'); list.innerHTML = '';
    list.appendChild(el('p', { class: 'hint', text: 'Loading...' }));
    api('stories_live?select=*&status=eq.' + filter + '&order=date.desc,created_at.desc&limit=60').then(function(r){
      if(!r.ok) throw new Error('load failed ' + r.status); return r.json();
    }).then(function(rows){
      list.innerHTML = '';
      if(!rows.length){ list.appendChild(el('p', { class: 'hint', text: filter === 'draft' ? 'No drafts waiting. New ones arrive each morning.' : 'Nothing here yet.' })); return; }
      rows.forEach(function(r){ list.appendChild(card(r)); });
    }).catch(function(){ list.innerHTML = ''; say('Could not load stories. Check that the database setup (schema.sql) has been run.', true); });
  }

  function field(label, node){ return el('div', {}, [el('label', { text: label }), node]); }
  function text(v){ var i = el('input', { type: 'text' }); i.value = v || ''; return i; }
  function area(v){ var t = el('textarea'); t.value = v || ''; return t; }

  function card(r){
    var c = el('div', { class: 'card' });
    var srcLine = el('div', { class: 'src' }, [document.createTextNode((r.source_name || 'Source') + ' · ' + r.date + ' · '), el('a', { href: r.source_url, target: '_blank', rel: 'noopener noreferrer', text: 'Open original ↗' })]);
    var raw = el('div', { class: 'raw', text: 'Source text the AI saw: ' + (r.raw_title || '') });
    var f = { headline: text(r.headline), dek: text(r.dek), what: area(r.what_happened), why: area(r.why), matters: area(r.matters), next: area(r.next_text),
      affected: text((r.affected || []).join(', ')), concepts: text((r.concepts || []).join(', ')) };
    var cat = el('select'); CATS.forEach(function(x){ var o = el('option', { value: x, text: x }); if(x === r.category) o.selected = true; cat.appendChild(o); });
    var tagsBox = el('div', { class: 'tags' });
    var tagInputs = TAGS.map(function(t){ var i = el('input', { type: 'checkbox', value: t }); i.checked = (r.tags || []).indexOf(t) > -1; tagsBox.appendChild(el('label', {}, [i, document.createTextNode(t)])); return i; });
    [srcLine, raw, field('Headline', f.headline), field('One-line summary', f.dek), field('Category', cat), field('Tags', tagsBox),
     field('What happened', f.what), field('Why it happened', f.why), field('Why it matters', f.matters), field('What happens next', f.next),
     field('Who is affected (comma separated)', f.affected),
     field('Concepts (comma separated, allowed: ' + CONCEPTS.join(', ') + ')', f.concepts)].forEach(function(n){ c.appendChild(n); });

    var row = el('div', { class: 'row' });
    function buttons(){
      var out = [];
      if(r.status !== 'approved') out.push(mk('Approve and publish', 'btn ok', 'approved'));
      if(r.status === 'approved') out.push(mk('Save changes', 'btn main', 'approved'), mk('Unpublish', 'btn', 'draft'));
      if(r.status === 'draft') out.push(mk('Save draft', 'btn main', 'draft'), mk('Reject', 'btn bad', 'rejected'));
      if(r.status === 'rejected') out.push(mk('Move back to drafts', 'btn', 'draft'));
      return out;
    }
    function mk(label, cls, status){
      var b = el('button', { class: cls, type: 'button', text: label });
      b.addEventListener('click', function(){ save(r, status, b, f, cat, tagInputs, c); });
      return b;
    }
    buttons().forEach(function(b){ row.appendChild(b); });
    c.appendChild(row);
    return c;
  }

  function list(v, allowed){
    return String(v || '').split(',').map(function(x){ return x.trim(); }).filter(function(x){ return x && (!allowed || allowed.indexOf(x) > -1); });
  }

  function save(r, status, btn, f, cat, tagInputs, c){
    var tags = tagInputs.filter(function(i){ return i.checked; }).map(function(i){ return i.value; });
    var body = {
      status: status, headline: f.headline.value.trim(), dek: f.dek.value.trim(), category: cat.value, tags: tags,
      what_happened: f.what.value.trim(), why: f.why.value.trim(), matters: f.matters.value.trim(), next_text: f.next.value.trim(),
      affected: list(f.affected.value).slice(0, 6), concepts: list(f.concepts.value, CONCEPTS).slice(0, 3),
      reviewed_by: uid, reviewed_at: new Date().toISOString()
    };
    if(status === 'approved'){
      if(!body.headline || !body.what_happened || !body.matters){ say('Headline, "What happened" and "Why it matters" are required before publishing.', true); return; }
      if(!tags.length){ say('Pick at least one tag.', true); return; }
    }
    btn.disabled = true;
    api('stories_live?id=eq.' + encodeURIComponent(r.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }).then(function(res){
      if(!res.ok) throw new Error('save failed ' + res.status);
      say(status === 'approved' ? 'Saved and published.' : status === 'rejected' ? 'Rejected.' : 'Saved as draft.');
      if(r.status !== status) c.remove(); else btn.disabled = false;
    }).catch(function(){ btn.disabled = false; say('Could not save. Try again.', true); });
  }

  start();
})();
