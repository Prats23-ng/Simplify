/* simplify — auth + cloud sync (Supabase). Loaded after config.js and vendor/supabase.js.
   If config is empty or the library failed to load, SimplifyAuth.enabled is false and the
   whole product keeps working in guest mode (localStorage only). */
(function(){
  var KEY = 'simplify_state_v1';
  var cfg = window.SIMPLIFY_CONFIG || {};
  var client = null, enabled = false;
  var uid = null, email = null, lastSig = '', timer = null, recovery = false;
  // Nothing is ever written to the cloud until this page has first READ the account (hydrate).
  // Otherwise a stale/empty local copy could overwrite the saved profile.
  var hydrated = false;

  try{
    if(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient){
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
      });
      enabled = true;
      // implicit flow (default) is used on purpose: confirmation/reset links keep working when the email
      // opens in a different browser than the one used to sign up (common on phones).
      client.auth.onAuthStateChange(function(ev, session){
        if(ev === 'PASSWORD_RECOVERY') recovery = true;
        if(session && session.user){ uid = session.user.id; email = session.user.email; }
        if(ev === 'SIGNED_OUT'){ uid = null; email = null; lastSig = ''; hydrated = false; }
      });
    }
  }catch(e){ enabled = false; client = null; }
  if(/type=recovery/.test(location.hash)) recovery = true;

  function origin(){ return location.origin + location.pathname.replace(/[^\/]*$/, ''); }

  function nice(err){
    var m = (err && (err.message || err.error_description)) || 'Something went wrong. Please try again.';
    var l = m.toLowerCase();
    if(l.indexOf('invalid login') > -1) return 'That email and password do not match. Check them, or reset your password.';
    if(l.indexOf('email not confirmed') > -1) return 'Please confirm your email first. Check your inbox for the verification link.';
    if(l.indexOf('already registered') > -1 || l.indexOf('already been registered') > -1) return 'An account with this email already exists. Try signing in.';
    if(l.indexOf('rate limit') > -1 || l.indexOf('too many') > -1 || err && err.status === 429) return 'Too many attempts or emails sent. Please wait a few minutes and try again.';
    if(l.indexOf('not authorized') > -1) return 'This email cannot receive messages yet. Email delivery is still being set up for the beta.';
    if(l.indexOf('password') > -1 && l.indexOf('characters') > -1) return 'Choose a longer password (at least 8 characters).';
    if(l.indexOf('failed to fetch') > -1 || l.indexOf('network') > -1) return 'Network problem. Check your connection and try again.';
    return m;
  }

  function readState(){ try{ return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(e){ return {}; } }
  function writeState(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }

  var PROGRESS_KEYS = ['storiesRead','storiesSaved','quizResults','askHistory','conceptsLearned','points','streak','lastActiveDate','searches'];

  function payloadFrom(st){
    var prog = {};
    PROGRESS_KEYS.forEach(function(k){ if(st[k] !== undefined) prog[k] = st[k]; });
    if(JSON.stringify(prog).length > 150000) delete prog.askHistory;   // keep the row small
    var p = st.profile || {};
    return {
      role: p.role || null,
      interests: Array.isArray(st.interests) ? st.interests : [],
      reading_time: st.readingTime || null,
      depth: st.depth || null,
      delivery_time: st.deliveryTime || null,
      onboarded: !!st.onboarded,
      progress: prog
    };
  }

  function union(a, b){ var o = {}, k; a = a || {}; b = b || {}; for(k in a) o[k] = a[k]; for(k in b) o[k] = b[k]; return o; }
  function mergeProgress(local, cloud){
    cloud = cloud || {};
    var out = {};
    ['storiesRead','storiesSaved','quizResults','askHistory','conceptsLearned'].forEach(function(k){
      out[k] = union(cloud[k], local[k]);
    });
    out.points = Math.max(+local.points || 0, +cloud.points || 0);
    var lc = local.lastActiveDate || '', cc = cloud.lastActiveDate || '';
    if(lc > cc || (lc === cc && (+local.streak || 0) >= (+cloud.streak || 0))){ out.streak = +local.streak || 1; out.lastActiveDate = local.lastActiveDate || null; }
    else { out.streak = +cloud.streak || 1; out.lastActiveDate = cloud.lastActiveDate || null; }
    var seen = {}, s = [];
    (cloud.searches || []).concat(local.searches || []).forEach(function(x){ var j = JSON.stringify(x); if(!seen[j]){ seen[j] = 1; s.push(x); } });
    out.searches = s.slice(-50);
    return out;
  }
  function clearProgress(st){
    st.storiesRead = {}; st.storiesSaved = {}; st.quizResults = {}; st.askHistory = {}; st.conceptsLearned = {};
    st.points = 0; st.streak = 1; st.lastActiveDate = null; st.searches = [];
  }

  var api = {
    enabled: enabled,
    isRecovery: function(){ return recovery; },
    uid: function(){ return uid; },
    email: function(){ return email; },
    nice: nice,

    getSession: function(){
      if(!enabled) return Promise.resolve(null);
      return client.auth.getSession().then(function(r){
        var s = r && r.data && r.data.session || null;
        if(s){ uid = s.user.id; email = s.user.email; }
        return s;
      }).catch(function(){ return null; });
    },
    onChange: function(cb){ if(enabled) client.auth.onAuthStateChange(cb); },

    signUp: function(em, pw){
      return client.auth.signUp({ email: em, password: pw, options:{ emailRedirectTo: origin() + 'signin.html?confirmed=1' } })
        .then(function(r){
          if(r.error) throw r.error;
          var u = r.data && r.data.user;
          // With email confirmation on, an existing address returns a user with no identities
          if(u && u.identities && u.identities.length === 0){ var e = new Error('User already registered'); throw e; }
          return { signedIn: !!(r.data && r.data.session), needsConfirm: !(r.data && r.data.session) };
        });
    },
    signIn: function(em, pw){
      return client.auth.signInWithPassword({ email: em, password: pw }).then(function(r){ if(r.error) throw r.error; return r.data; });
    },
    resetPassword: function(em){
      return client.auth.resetPasswordForEmail(em, { redirectTo: origin() + 'signin.html?mode=reset' }).then(function(r){ if(r.error) throw r.error; });
    },
    updatePassword: function(pw){
      return client.auth.updateUser({ password: pw }).then(function(r){ if(r.error) throw r.error; });
    },

    /* Save what we have, sign out, and wipe this browser's copy (shared-device safety). */
    signOut: function(){
      return api.flush().catch(function(){}).then(function(){
        return client.auth.signOut();
      }).then(function(){
        try{ localStorage.removeItem(KEY); }catch(e){}
        uid = null; email = null; lastSig = '';
      });
    },

    /* Pull the cloud profile into `st` (mutates it). Account is the source of truth for preferences;
       progress is merged so nothing earned as a guest is lost. */
    hydrate: function(st){
      if(!enabled) return Promise.resolve({ signedIn:false });
      return api.getSession().then(function(session){
        if(!session) return { signedIn:false };
        var user = session.user;
        st.profile = st.profile || {};
        // A different account was last used in this browser: don't mix their progress
        if(st.profile.uid && st.profile.uid !== user.id){ clearProgress(st); st.onboarded = false; }
        return client.from('profiles').select('*').eq('id', user.id).maybeSingle().then(function(r){
          if(r.error) throw r.error;
          var row = r.data;
          st.profile.uid = user.id;
          st.profile.email = user.email;
          st.profile.authMethod = 'Email account';
          var pushBack = false;
          if(row && row.onboarded){
            if(row.role) st.profile.role = row.role;
            if(row.interests && row.interests.length) st.interests = row.interests;
            if(row.reading_time) st.readingTime = row.reading_time;
            if(row.depth) st.depth = row.depth;
            if(row.delivery_time) st.deliveryTime = row.delivery_time;
            st.onboarded = true;
            var merged = mergeProgress(st, row.progress);
            Object.keys(merged).forEach(function(k){ st[k] = merged[k]; });
            pushBack = true;                  // cloud may now be missing guest progress
          } else if(st.onboarded){
            pushBack = true;                  // brand-new account: migrate this guest's setup up
          }
          writeState(st);
          lastSig = '';
          hydrated = true;
          return (pushBack ? api.pushNow(st) : Promise.resolve()).then(function(){ return { signedIn:true, onboarded: !!st.onboarded, email:user.email }; });
        });
      }).catch(function(e){ return { signedIn:false, error:e }; });
    },

    fetchProfile: function(){
      if(!enabled || !uid) return Promise.resolve(null);
      return client.from('profiles').select('onboarded').eq('id', uid).maybeSingle().then(function(r){ return r.data || null; }).catch(function(){ return null; });
    },

    pushNow: function(st){
      if(!enabled || !uid || !hydrated) return Promise.resolve();
      var body = payloadFrom(st); body.id = uid; body.email = email;
      var sig = JSON.stringify(body);
      if(sig === lastSig) return Promise.resolve();
      return client.from('profiles').upsert(body, { onConflict:'id' }).then(function(r){
        if(r.error) throw r.error;
        lastSig = sig;
      });
    },
    /* Debounced; called from save() on every state change. Safe no-op for guests. */
    queuePush: function(st){
      if(!enabled || !uid || !hydrated) return;
      clearTimeout(timer);
      timer = setTimeout(function(){ api.pushNow(st).catch(function(){}); }, 1200);
    },
    flush: function(){
      clearTimeout(timer);
      if(!enabled || !uid || !hydrated) return Promise.resolve();
      return api.pushNow(readState());
    }
  };
  window.SimplifyAuth = api;

  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'hidden') api.flush().catch(function(){});
  });
})();
