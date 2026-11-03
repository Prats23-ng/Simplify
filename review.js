/* simplify - private editor page. Only the admin account can read drafts or change stories (enforced by Supabase). */
(function(){
  var cfg = window.SIMPLIFY_CONFIG || {};
  var TAGS = ['Markets','Policy','Technology','Startups','Economy','AI'];
  var CATS = ['Policy','Markets','Business','Finance','Global','Economy','Technology'];
  var CONCEPTS = ['repo-rate','bond-yields','nim','monetary-policy','inflation','supply-chain','fdi','ipo','valuation','current-account-deficit','yoy','nbfc','credit-growth','gdp','fii-flows'];
  var token = null, uid = null, filter = 'draft', mode = 'stories';
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
      if(rows && rows.length){ say(''); $('app').hidden = false; drawModes(); drawTabs(); load(); return; }
      var b = el('button', { class: 'btn main', type: 'button', text: 'Make me the editor' });
      b.addEventListener('click', claim);
      say('This account is not an editor yet. If you are setting up simplify for the first time, claim the editor role now.', false, [el('br'), b]);
    });
  }
  function claim(){
    api('rpc/claim_admin', { method: 'POST', body: '{}' }).then(function(r){
      if(!r.ok){ say('The database setup is missing. Run the latest schema.sql in the Supabase SQL Editor, then reload this page.', true); return null; }
      return r.json();
    }).then(function(ok){
      if(ok === null) return;
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

  function drawModes(){
    var box = $('modes'); box.innerHTML = '';
    [['stories','Stories'],['weekly','The Weekly'],['notes','Market note']].forEach(function(t){
      var b = el('button', { class: 'tab' + (mode === t[0] ? ' on' : ''), type: 'button', text: t[1] });
      b.addEventListener('click', function(){ mode = t[0]; drawModes(); drawTabs(); load(); });
      box.appendChild(b);
    });
  }

  function load(){
    if(mode === 'weekly') return loadWeekly();
    if(mode === 'notes') return loadNotes();
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
    var h = r.hi || {};
    f.hi = { headline: text(h.headline), dek: text(h.dek), whatHappened: area(h.whatHappened), why: area(h.why), matters: area(h.matters), next: area(h.next) };
    var cat = el('select'); CATS.forEach(function(x){ var o = el('option', { value: x, text: x }); if(x === r.category) o.selected = true; cat.appendChild(o); });
    var tagsBox = el('div', { class: 'tags' });
    var tagInputs = TAGS.map(function(t){ var i = el('input', { type: 'checkbox', value: t }); i.checked = (r.tags || []).indexOf(t) > -1; tagsBox.appendChild(el('label', {}, [i, document.createTextNode(t)])); return i; });
    [srcLine, raw, field('Headline', f.headline), field('One-line summary', f.dek), field('Category', cat), field('Tags', tagsBox),
     field('What happened', f.what), field('Why it happened', f.why), field('Why it matters', f.matters), field('What happens next', f.next),
     field('Who is affected (comma separated)', f.affected),
     field('Concepts (comma separated, allowed: ' + CONCEPTS.join(', ') + ')', f.concepts)].forEach(function(n){ c.appendChild(n); });
    var hd = el('details', { class: 'hi-box' }, [el('summary', { text: 'Hindi version' + (r.hi ? ' (drafted)' : ' (not drafted yet, it is added on the next daily run)') }),
      el('div', { class: 'hint', text: 'Check meaning and numbers against the English. Clear all fields to hide Hindi for this story.' }),
      field('Headline (Hindi)', f.hi.headline), field('One-line summary (Hindi)', f.hi.dek), field('What happened (Hindi)', f.hi.whatHappened), field('Why it happened (Hindi)', f.hi.why),
      field('Why it matters (Hindi)', f.hi.matters), field('What happens next (Hindi)', f.hi.next)]);
    c.appendChild(hd);

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
    var hiOut = {}, hiAny = false;
    Object.keys(f.hi).forEach(function(k){ hiOut[k] = f.hi[k].value.trim(); if(hiOut[k]) hiAny = true; });
    if(hiAny && hiOut.headline && hiOut.whatHappened) body.hi = hiOut; else if(!hiAny) body.hi = null;
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

  /* ---------- The Weekly editor ---------- */
  function loadWeekly(){
    var box = $('list'); box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'Loading...' }));
    api('editorials?select=*&status=eq.' + filter + '&order=week_start.desc,created_at.desc&limit=20').then(function(r){
      if(!r.ok) throw new Error('load failed'); return r.json();
    }).then(function(rows){
      box.innerHTML = '';
      if(!rows.length){ box.appendChild(el('p', { class: 'hint', text: filter === 'draft' ? 'No weekly draft yet. It is drafted every Sunday from the week\'s approved stories (or run "Draft The Weekly" on GitHub).' : 'Nothing here yet.' })); return; }
      rows.forEach(function(r){ box.appendChild(weeklyCard(r)); });
    }).catch(function(){ box.innerHTML = ''; say('Could not load editorials. Run the latest schema.sql in Supabase first.', true); });
  }

  function weeklyCard(row){
    var ed = JSON.parse(JSON.stringify(row));
    var c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'src', text: 'Week of ' + ed.week_start + ' · ' + (ed.ai_model || 'AI') + ' · ' + (ed.read_mins || 5) + ' min read' }));
    if((ed.warnings || []).length){
      var w = el('div', { class: 'warn' }); w.appendChild(el('b', { text: 'Check these before publishing (numbers not found in the source stories or market data):' }));
      var ul = el('ul'); ed.warnings.forEach(function(t){ ul.appendChild(el('li', { text: t })); }); w.appendChild(ul); c.appendChild(w);
    }
    var title = text(ed.title); title.addEventListener('input', function(){ ed.title = title.value; });
    var stand = area(ed.standfirst); stand.addEventListener('input', function(){ ed.standfirst = stand.value; });
    c.appendChild(field('Title', title)); c.appendChild(field('Standfirst (the short intro under the title)', stand));
    var blocksBox = el('div'); c.appendChild(el('label', { text: 'Blocks (reorder or remove; charts use real market data)' })); c.appendChild(blocksBox);

    function bind(input, obj, key, transform){ input.addEventListener('input', function(){ obj[key] = transform ? transform(input.value) : input.value; }); return input; }
    function pair(label, input){ return field(label, input); }
    function drawBlocks(){
      blocksBox.innerHTML = '';
      (ed.body || []).forEach(function(b, i){
        var blk = el('div', { class: 'blk' });
        var hd = el('div', { class: 'blk-h' }); hd.appendChild(el('span', { text: b.type }));
        var ctl = el('span');
        [['↑', function(){ if(i > 0){ var t = ed.body[i - 1]; ed.body[i - 1] = b; ed.body[i] = t; drawBlocks(); } }],
         ['↓', function(){ if(i < ed.body.length - 1){ var t = ed.body[i + 1]; ed.body[i + 1] = b; ed.body[i] = t; drawBlocks(); } }],
         ['✕', function(){ ed.body.splice(i, 1); drawBlocks(); }]].forEach(function(a){ var bt = el('button', { type: 'button', text: a[0] }); bt.addEventListener('click', a[1]); ctl.appendChild(bt); });
        hd.appendChild(ctl); blk.appendChild(hd);
        if(b.type === 'p' || b.type === 'h'){ blk.appendChild(bind(area(b.text), b, 'text')); }
        else if(b.type === 'stat'){ (b.items || []).forEach(function(it){ var g = el('div', { class: 'two' }); g.appendChild(pair('Figure', bind(text(it.value), it, 'value'))); g.appendChild(pair('What it is', bind(text(it.label), it, 'label'))); blk.appendChild(g); }); }
        else if(b.type === 'line' || b.type === 'bars'){
          blk.appendChild(pair('Chart title', bind(text(b.title), b, 'title'))); blk.appendChild(pair('One-line note under the chart', bind(text(b.note), b, 'note')));
          blk.appendChild(el('div', { class: 'hint', text: b.type === 'line' ? 'Line chart of: ' + (b.series || []).map(function(s){ return s.label; }).join(', ') : 'Bar chart of today\'s sector moves' }));
        }
        else if(b.type === 'compare'){
          blk.appendChild(pair('Title', bind(text(b.title), b, 'title')));
          [['left', 'Left'], ['right', 'Right']].forEach(function(k){ var o = b[k[0]] || (b[k[0]] = {}); var g = el('div', { class: 'two' }); g.appendChild(pair(k[1] + ' label', bind(text(o.label), o, 'label'))); g.appendChild(pair(k[1] + ' figure', bind(text(o.value), o, 'value'))); blk.appendChild(g); blk.appendChild(pair(k[1] + ' note', bind(text(o.note), o, 'note'))); });
        }
        else if(b.type === 'flow'){
          blk.appendChild(pair('Title', bind(text(b.title), b, 'title')));
          (b.steps || []).forEach(function(st){ var g = el('div', { class: 'two' }); g.appendChild(pair('Step', bind(text(st.title), st, 'title'))); g.appendChild(pair('Explanation', bind(text(st.text), st, 'text'))); blk.appendChild(g); });
        }
        else if(b.type === 'takeaways'){
          var ta = area((b.items || []).join('\n')); ta.addEventListener('input', function(){ b.items = ta.value.split('\n').map(function(x){ return x.trim(); }).filter(Boolean); }); blk.appendChild(field('Takeaways (one per line)', ta));
        }
        blocksBox.appendChild(blk);
      });
    }
    drawBlocks();

    var pv = el('div'); c.appendChild(pv);
    var row2 = el('div', { class: 'row' });
    var pvBtn = el('button', { class: 'btn', type: 'button', text: 'Preview' });
    pvBtn.addEventListener('click', function(){
      if(pv.firstChild){ pv.innerHTML = ''; return; }
      var d = el('div', { class: 'pv' }); d.innerHTML = window.SimplifyWeekly.articleHTML(ed); pv.appendChild(d);
    });
    row2.appendChild(pvBtn);
    function mk(label, cls, status){ var b = el('button', { class: cls, type: 'button', text: label }); b.addEventListener('click', function(){ saveWeekly(row, ed, status, b, c); }); return b; }
    if(row.status !== 'approved') row2.appendChild(mk('Approve and publish', 'btn ok', 'approved'));
    if(row.status === 'approved'){ row2.appendChild(mk('Save changes', 'btn main', 'approved')); row2.appendChild(mk('Unpublish', 'btn', 'draft')); }
    if(row.status === 'draft'){ row2.appendChild(mk('Save draft', 'btn main', 'draft')); row2.appendChild(mk('Reject', 'btn bad', 'rejected')); }
    if(row.status === 'rejected') row2.appendChild(mk('Move back to drafts', 'btn', 'draft'));
    c.appendChild(row2);
    return c;
  }

  function saveWeekly(row, ed, status, btn, c){
    var title = (ed.title || '').trim();
    if(status === 'approved' && (!title || !(ed.body || []).length)){ say('A title and at least one block are required before publishing.', true); return; }
    btn.disabled = true;
    var body = { status: status, title: title, standfirst: (ed.standfirst || '').trim(), body: ed.body, reviewed_by: uid, reviewed_at: new Date().toISOString() };
    api('editorials?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }).then(function(res){
      if(!res.ok) throw new Error('save failed');
      say(status === 'approved' ? 'Saved and published.' : status === 'rejected' ? 'Rejected.' : 'Saved as draft.');
      if(row.status !== status) c.remove(); else btn.disabled = false;
    }).catch(function(){ btn.disabled = false; say('Could not save. Try again.', true); });
  }

  /* ---------- Market note editor ---------- */
  function loadNotes(){
    var box = $('list'); box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'Loading...' }));
    api('market_notes?select=*&status=eq.' + filter + '&order=note_date.desc&limit=20').then(function(r){
      if(!r.ok) throw new Error('load failed'); return r.json();
    }).then(function(rows){
      box.innerHTML = '';
      if(!rows.length){ box.appendChild(el('p', { class: 'hint', text: filter === 'draft' ? 'No market note waiting. One is drafted each weekday at 4 pm after the market closes (or run "Draft market note" on GitHub).' : 'Nothing here yet.' })); return; }
      rows.forEach(function(r){ box.appendChild(noteCard(r)); });
    }).catch(function(){ box.innerHTML = ''; say('Could not load market notes. Run the latest schema.sql in Supabase first.', true); });
  }

  function noteCard(row){
    var c = el('div', { class: 'card' });
    c.appendChild(el('div', { class: 'src', text: row.note_date + ' · ' + (row.ai_model || 'AI') }));
    c.appendChild(el('div', { class: 'raw', text: 'Real figures shown on the card: ' + (row.snapshot || []).map(function(x){ return x.label + ' ' + (x.changePct > 0 ? '+' : '') + Number(x.changePct).toFixed(2) + '%'; }).join(' · ') }));
    if((row.warnings || []).length){
      var w = el('div', { class: 'warn' }); var ul = el('ul'); row.warnings.forEach(function(t){ ul.appendChild(el('li', { text: t })); }); w.appendChild(ul); c.appendChild(w);
    }
    var sum = area(row.summary); sum.style.minHeight = '110px';
    c.appendChild(field('Note (2-3 plain sentences; markets rarely have one clear cause, so avoid "because")', sum));
    c.appendChild(el('div', { class: 'hint', text: 'Stories linked under the note: ' + ((row.drivers || []).map(function(d){ return d.headline; }).join(' | ') || 'none') }));
    var r2 = el('div', { class: 'row' });
    function mk(label, cls, status){
      var b = el('button', { class: cls, type: 'button', text: label });
      b.addEventListener('click', function(){
        var summary = sum.value.trim();
        if(status === 'approved' && !summary){ say('Write the note before publishing.', true); return; }
        b.disabled = true;
        api('market_notes?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: status, summary: summary, reviewed_by: uid, reviewed_at: new Date().toISOString() }) }).then(function(res){
          if(!res.ok) throw new Error('save failed');
          say(status === 'approved' ? 'Saved and published.' : status === 'rejected' ? 'Rejected.' : 'Saved as draft.');
          if(row.status !== status) c.remove(); else b.disabled = false;
        }).catch(function(){ b.disabled = false; say('Could not save. Try again.', true); });
      });
      return b;
    }
    if(row.status !== 'approved') r2.appendChild(mk('Approve and publish', 'btn ok', 'approved'));
    if(row.status === 'approved'){ r2.appendChild(mk('Save changes', 'btn main', 'approved')); r2.appendChild(mk('Unpublish', 'btn', 'draft')); }
    if(row.status === 'draft'){ r2.appendChild(mk('Save draft', 'btn main', 'draft')); r2.appendChild(mk('Reject', 'btn bad', 'rejected')); }
    if(row.status === 'rejected') r2.appendChild(mk('Move back to drafts', 'btn', 'draft'));
    c.appendChild(r2);
    return c;
  }

  start();
})();
