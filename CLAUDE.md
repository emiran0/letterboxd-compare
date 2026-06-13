# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js (App Router, TypeScript) website that compares two Letterboxd lists
and shows **Common / Only in List 1 / Only in List 2**, with TMDB posters and a
title filter. There is no Letterboxd API and no CSV import — list data is
**scraped from public Letterboxd HTML pages**, so it works for anyone's list.

## Commands

- `npm run dev` — dev server on http://localhost:3000
- `npm run build` — production build (also the fastest full type-check + lint)
- `npm start` — serve the production build
- `npm run lint` — ESLint (`next lint`)
- `npx tsc --noEmit` — type-check only

Requires a TMDB key in `.env.local` (`TMDB_API_KEY=`), v3 hex key or v4 `eyJ…`
token. Without it the comparison still works but posters/canonical titles are
absent — useful for testing scraping without a key.

There is no test suite. Verify changes by running `npm run dev` and exercising
`POST /api/compare` and `GET /api/film` (see below).

## Architecture (the important bit)

The design separates **set comparison** (cheap, exact) from **display
resolution** (batched, best-effort), which is the key to understanding the code:

1. **Comparison runs on Letterboxd film slugs, not TMDB.** Each film on a list
   page carries `data-item-slug` (e.g. `parasite-2019`), a stable unique ID.
   `common / uniqueA / uniqueB` are pure set operations on slugs — no TMDB
   needed. This makes `/api/compare` fast and independent of the TMDB key.

2. **TMDB is only for display (title, poster, rating).** The list page already
   gives us title + year (`data-item-name`, e.g. `"Parasite (2019)"`), so
   `resolveFilm` searches TMDB by title+year — **no second Letterboxd request
   per film**. Only if search fails does it fall back to fetching the film page
   to read `data-tmdb-id`. Results are cached by slug (permanent mapping).

3. **Resolution is batched, not lazy-per-card.** After a compare, the client
   resolves *all* films (in 60-item chunks) via `POST /api/resolve`, merging
   results into a `Map<slug, FilmInfo>` in React state and showing a progress
   bar. This is deliberate: sorting/filtering by **rating** needs every film's
   TMDB data, which a viewport-lazy approach can't provide. `FilmCard` is purely
   presentational — it renders whatever `FilmInfo` the parent has resolved so
   far (scraped name shown until then). Caching: in `app/page.tsx` state on the
   client, `lib/cache.ts` (in-memory `Map`) on the server.

   Note: the `/api/resolve` route caps at 80 films/request and runs TMDB lookups
   through a small concurrency pool (`CONCURRENCY = 12`).

### Request flow

- `app/page.tsx` (client) → `POST /api/compare` with `{url1, url2}`.
- `app/api/compare/route.ts` → `normalizeListUrl` + `scrapeList` (both lists in
  parallel) → returns `CompareResult` (`types.ts`) with the three `FilmRef[]`
  buckets.
- Client then chunks the union of all films → `POST /api/resolve` →
  `resolveFilm` per film → `FilmInfo[]`. Sorting/filtering happens client-side
  over the resolved map (see the `Column` component in `app/page.tsx`).
- Per-column **CSV export** (`buildCsv`/`downloadCsv` in `app/page.tsx`) is fully
  client-side. The header is `Name,Year,Letterboxd URI` — Letterboxd's own export
  format, so the file imports directly into a new list. The `Letterboxd URI` is an
  exact film link, which is what the importer matches on (so export is accurate
  even before TMDB titles resolve). It exports the currently *shown* films, i.e.
  after the active filter + sort.

### Modules

- `lib/letterboxd.ts` — all Letterboxd scraping. `normalizeListUrl` (accepts a
  bare **username** → that user's watchlist, plus watchlist and `/list/` URLs;
  strips `/detail/`, `/by/…`, `/page/N/`), `scrapeList` (paginates via
  `.paginate-pages`, capped at `MAX_PAGES=60`, concurrency 5), `parseFilms`
  (reads `[data-component-class="LazyPoster"]` divs), and
  `fetchTmdbIdFromFilmPage` (fallback). Throws `LetterboxdError` for
  user-facing messages.
- `lib/tmdb.ts` — `resolveFilm` and the TMDB fetch helper. `tmdbFetch` switches
  between Bearer header (v4 `eyJ…` token) and `api_key` query param (v3 key).
- `lib/cache.ts` — process-lifetime in-memory cache.
- `types.ts` — `FilmRef` (slug/name/year from scraping), `FilmInfo` (TMDB
  display data), `CompareResult`.

## Deployment

Ships as a Docker image using Next.js **standalone** output (`output: "standalone"`
in `next.config.mjs`). The multi-stage `Dockerfile` copies `.next/standalone`,
`.next/static`, and `public/` into a minimal `node:20-alpine` runner that runs
`node server.js`. `docker-compose.yml` publishes it on `127.0.0.1:3000` (Caddy
reverse-proxies the public domain to it) and injects `TMDB_API_KEY` at runtime
from a `.env` file — the key is never needed at build time (it's read per-request
in `lib/tmdb.ts`). Redeploy with `docker compose up -d --build`. See README +
`deploy/Caddyfile.example`.

## Gotchas

- **cheerio is pinned to `1.0.0-rc.12` on purpose.** `cheerio@1.0.0` pulls in
  `undici`, which needs the `File` global (Node 20+) and breaks the build on
  Node 18. Do not bump cheerio to 1.0.0 without confirming the Node version.
- **Letterboxd markup is scraped, so it can change.** Selectors depend on
  `data-component-class="LazyPoster"` and `data-item-*` / `data-tmdb-id`
  attributes. If scraping returns 0 films, re-inspect a live page's HTML first.
- The Letterboxd `/film/{slug}/json/` endpoint is Cloudflare-protected — don't
  rely on it; use the regular HTML pages.
- `resolveFilm` swallows per-film errors by design so one bad lookup can't break
  the page; it returns the Letterboxd name with `posterUrl: null` as last resort.
- Letterboxd is films-only, so TMDB lookups use `/search/movie` and `/movie/{id}`.
