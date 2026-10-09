/* simplify — public client config.
   The Supabase URL and the "anon" (publishable) key are SAFE to commit: they are designed to be public,
   and Row Level Security is what protects the data.
   NEVER put the service_role / secret key in this file or anywhere in the repo. */
window.SIMPLIFY_CONFIG = {
  SUPABASE_URL: 'https://ixoofiufxonbqqpcnosk.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_bEb1SGf2vQ20_h7rTQaaRg_9UBLtK70'
};
