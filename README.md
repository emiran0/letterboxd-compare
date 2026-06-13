# Letterboxd List Compare

A small website to compare two Letterboxd lists. Paste two list URLs (a
watchlist or any user list) and get three sections: **Common**, **Only in
List 1**, and **Only in List 2** — with posters and canonical titles from TMDB
and a basic title filter.

No Letterboxd API or CSV export is required: the lists are read directly from
their public web pages, so it works for **anyone's** public list.

## How it works

- **Comparison** is done on Letterboxd's `data-film-slug`, a stable unique ID
  scraped from the list pages. No TMDB call is needed to compute the buckets.
- **Display** (poster + canonical title) is resolved per film from TMDB,
  searched by the title + year that the list page already provides. If a search
  is inconclusive, it falls back to reading the exact TMDB id off the Letterboxd
  film page. Results are cached server-side by slug.
- Posters load lazily as you scroll, so a large comparison stays responsive.

## Setup

Requires Node 18+.

```bash
npm install
cp .env.local.example .env.local   # then add your TMDB key
npm run dev                        # http://localhost:3000
```

### TMDB key

Get a free key at <https://www.themoviedb.org/settings/api>. Either a **v3 API
key** (32-char hex) or a **v4 read access token** (starts with `eyJ`) works —
put it in `.env.local` as `TMDB_API_KEY`. Without it the app still computes the
comparison, but shows titles with no posters.

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the dev server on port 3000.   |
| `npm run build` | Production build.                    |
| `npm start`     | Run the production build.            |
| `npm run lint`  | ESLint via `next lint`.              |

## Deployment (Docker + Caddy + Cloudflare)

The app builds to a self-contained Next.js **standalone** server and ships as a
small Docker image. Behind a Caddy reverse proxy with Cloudflare DNS, it runs on
your own domain with no vendor subdomain.

On the server (Docker + Docker Compose installed):

```bash
git clone https://github.com/<you>/letterboxd-list-compare /opt/rezflix
cd /opt/rezflix
echo "TMDB_API_KEY=your_real_key_here" > .env   # runtime secret, not committed
docker compose up -d --build
```

This publishes the container on **127.0.0.1:3000** (localhost only — Caddy is the
public entry point). Point Caddy at it (see `deploy/Caddyfile.example`):

```
lboxd-compare.rezflixtv.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Cloudflare: add an **A record** for the subdomain → server IP. For TLS behind the
orange-cloud proxy, set SSL/TLS mode to **Full (strict)** and either use a
Cloudflare **Origin Certificate** in Caddy, or issue the record DNS-only first so
Caddy can get a Let's Encrypt cert, then re-enable the proxy.

### Build once, pull on the server (recommended)

Rather than building on the VPS, build the image locally (or in CI), push it to
GitHub Container Registry, and have the server pull the prebuilt image.

Locally — build, tag a version, and push:

```bash
# one-time: authenticate with a PAT that has write:packages
echo "$GHCR_TOKEN" | docker login ghcr.io -u emiran0 --password-stdin

VERSION=1.0.0
docker build \
  -t ghcr.io/emiran0/letterboxd-compare:$VERSION \
  -t ghcr.io/emiran0/letterboxd-compare:latest .
docker push ghcr.io/emiran0/letterboxd-compare:$VERSION
docker push ghcr.io/emiran0/letterboxd-compare:latest
```

On the VPS — `docker-compose.yml` already references that image, so just:

```bash
# one-time if the package is private: docker login ghcr.io (read:packages)
docker compose pull && docker compose up -d
```

**Versioning:** tag every release with semver (`1.0.0`, `1.1.0`, …) plus
`latest`. For reproducible deploys, pin a specific tag in `docker-compose.yml` on
the server and bump it when you want to update; `latest` is convenient but
non-deterministic.

### Update / redeploy (building on the server instead)

```bash
cd /opt/rezflix && git pull && docker compose up -d --build
```

Notes:
- The TMDB key is provided at **runtime** via `.env` (read by `docker-compose.yml`),
  never baked into the image.
- The in-memory slug→TMDB cache lives in the container process, so it persists
  between requests and resets on container restart.

## Notes / limits

- Supports **watchlists** (`/user/watchlist/`) and **user lists**
  (`/user/list/name/`). Other page types are rejected with a helpful message.
- Scraping is capped at 60 pages per list and uses limited concurrency to be a
  good citizen toward Letterboxd.
