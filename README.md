# simplify

A calmer way to understand the news — a daily intelligence brief that explains
*why a story matters*, not just what happened.

This repo is a static, zero-backend beta: two self-contained HTML files, no
build step, no database. It's built to be deployed as-is and then upgraded
piece by piece (see **Swapping in real infrastructure** below).

## Structure

```
/
├── index.html      → Landing page + onboarding (cinematic scroll story,
│                      profile/reading-time selection, simulated auth)
├── app.html         → The actual product: Daily Brief, story deep-dives,
│                      Ask Simplify, Explore, Archive, Saved & History,
│                      Knowledge Compounds, Profile/Settings
├── vercel.json       → Clean URLs (/app instead of /app.html)
└── package.json      → Metadata + a local preview script
```

## How the two pages connect

`index.html` and `app.html` share one `localStorage` key: `simplify_state_v1`.

- Onboarding (`index.html`) writes the user's role, interests, reading time
  and depth into that key when they finish the flow, then shows an
  **"Open my Daily Brief →"** link to `app.html`.
- The product (`app.html`) reads that same key on load.
- As a fallback (useful if `localStorage` is ever blocked), onboarding also
  passes the same values as URL params on that link, and `app.html` reads
  and merges them if present. Belt and suspenders — neither path depends
  on the other.

Because both files are served from the same Vercel deployment, they're
**same-origin**, so the primary `localStorage` path works natively with no
extra wiring. (This is different from testing the two pages as separate
claude.ai artifact previews, where each runs in its own sandboxed origin —
that's what the URL-param fallback was originally built for.)

## Deploy on Vercel

**Option A — GitHub (recommended):**
1. Push this folder to a new GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Framework preset: **Other** (it's static — no build command needed).
4. Deploy. You'll get a URL like `simplify-yourname.vercel.app`.

**Option B — Vercel CLI, no GitHub needed:**
```bash
npm i -g vercel
cd simplify
vercel
```
Follow the prompts; it deploys directly from your machine.

## Local preview

```bash
npm run dev
```
Opens a static server at `http://localhost:3000`. `npx serve` is used so
there's nothing to install beyond Node.

## Known limitations (intentional, for beta)

- **No real backend.** All user state (streak, saved stories, concepts
  learned, points) lives in the visitor's own browser `localStorage`. Clear
  site data or switch browsers/devices and it resets.
- **No real auth.** "Continue with Google/Apple/Email" simulates a session
  and writes local state — it doesn't create a real account or verify
  identity.
- **Mock news + mock AI.** Stories in `app.html` are a hand-written sample
  set (`STORY_BANK`), and "Ask Simplify" answers come from a template
  function (`askAI()`), not a live model. Nothing is presented as
  real-time or sourced beyond what's disclosed in the UI.

## Swapping in real infrastructure later

The app was structured so each of these is a contained swap, not a rebuild:

| Mock today | Replace with | Where to look |
|---|---|---|
| `STORIES` array | Real news API | `index.html`/`app.html` → data layer |
| Ask Simplify (template/fallback answers) | Real LLM call | `app.html` → mock AI layer. Note: the onboarding artifact this repo is based on already has a working `window.claude.use('sample')` call wired up for its own (now-unused) in-page app view — worth porting that logic into `app.html` rather than writing it from scratch. |
| `localStorage` state | Supabase / Postgres + API routes | `app.html` → `load()` / `save()` |
| Simulated auth | Google/Apple/Email OAuth | `index.html` → account step |
| — | Stripe subscription | new — no payment code exists yet |

Each swap should only touch its own section — the rendering/UI code reads
from `state` and calls these functions, and doesn't need to know where the
data actually comes from.
