# simplify

A calmer way to understand the news: a daily brief that explains *why a story matters*, not just what happened.
Static site on Vercel + Supabase (accounts and progress) + one serverless function (`api/ask.js`) for "Ask simplify".

## Files
- `index.html` landing page, `start.html` setup, `signin.html` sign in / reset, `app.html` the product
- `stories.js` sample stories, shared by the browser and the server (the server looks stories up by id)
- `markets.js`, `markets-sample.js` Markets view (sample numbers, labelled "Sample")
- `auth.js`, `track.js`, `config.js`, `supabase.js` accounts/sync, analytics, public Supabase config, vendored library
- `api/ask.js` AI endpoint: signed-in only, per-user daily cap, grounded in the story
- `schema.sql` run once in Supabase -> SQL Editor (safe to re-run)
- `privacy.html`, `terms.html`

## Vercel environment variables
- `GEMINI_API_KEY` free-tier key for Ask simplify (default provider)
- optional: `ASK_PROVIDER` (`gemini` or `anthropic`), `ASK_KEY_ENV`, `ASK_MODEL`, `ASK_DAILY_CAP` (default 10)
Without a key, Ask simplify shows a labelled offline answer.

## Known limits (beta)
- Stories and Markets are samples until a live feed is connected.
- Guests keep progress in their browser only; accounts sync to Supabase.
