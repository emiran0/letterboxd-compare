import type { FilmRef, FilmInfo, FilmDetail } from "@/types";
import { cacheGet, cacheSet } from "./cache";
import { fetchTmdbIdFromFilmPage, letterboxdFilmUrl } from "./letterboxd";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w185";
/** Larger artwork for the detail view than the card thumbnail uses. */
const POSTER_LG = "https://image.tmdb.org/t/p/w342";
const BACKDROP_LG = "https://image.tmdb.org/t/p/w780";
const TMDB_MOVIE_URL = "https://www.themoviedb.org/movie/";

function apiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error("TMDB_API_KEY is not set. Copy .env.local.example to .env.local and add your key.");
  }
  return key;
}

/**
 * Call the TMDB API. v4 read tokens (JWTs, "eyJ...") go in the Authorization
 * header; classic v3 keys go in the api_key query param.
 */
async function tmdbFetch(path: string, params: Record<string, string>): Promise<any> {
  const key = apiKey();
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  } else {
    url.searchParams.set("api_key", key);
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  return res.json();
}

function yearFromDate(date?: string): number | null {
  const y = date?.slice(0, 4);
  return y && /^\d{4}$/.test(y) ? Number(y) : null;
}

function toInfo(slug: string, movie: any): FilmInfo {
  const votes = movie.vote_count ?? 0;
  const rated = votes > 0 && typeof movie.vote_average === "number";
  return {
    slug,
    title: movie.title || movie.name || slug,
    year: yearFromDate(movie.release_date),
    posterUrl: movie.poster_path ? IMG + movie.poster_path : null,
    rating: rated ? Math.round(movie.vote_average * 10) / 10 : null,
    letterboxdUrl: letterboxdFilmUrl(slug),
    tmdbId: typeof movie.id === "number" ? movie.id : null,
  };
}

async function searchMovie(name: string, year: number | null): Promise<any | null> {
  const base: Record<string, string> = { query: name, include_adult: "false" };
  if (year) {
    const withYear = await tmdbFetch("/search/movie", { ...base, year: String(year) });
    if (withYear.results?.length) return withYear.results[0];
  }
  const withoutYear = await tmdbFetch("/search/movie", base);
  return withoutYear.results?.[0] ?? null;
}

async function getMovie(id: number): Promise<any | null> {
  return tmdbFetch(`/movie/${id}`, {});
}

/**
 * Resolve a Letterboxd film to TMDB display metadata.
 *
 * Strategy (cached by slug, since the mapping is permanent):
 *  1. TMDB title+year search (fast, no extra Letterboxd request).
 *  2. Fallback: read the exact TMDB id from the Letterboxd film page,
 *     then fetch canonical details. Covers titles that search gets wrong.
 *  3. Last resort: return the Letterboxd name with no poster.
 */
export async function resolveFilm(ref: FilmRef): Promise<FilmInfo> {
  const cacheKey = `film:${ref.slug}`;
  const cached = cacheGet<FilmInfo>(cacheKey);
  if (cached) return cached;

  let info: FilmInfo | null = null;
  try {
    const hit = await searchMovie(ref.name, ref.year);
    if (hit) info = toInfo(ref.slug, hit);

    if (!info) {
      const tmdb = await fetchTmdbIdFromFilmPage(ref.slug);
      if (tmdb && tmdb.type === "movie") {
        const movie = await getMovie(tmdb.id);
        if (movie) info = toInfo(ref.slug, movie);
      }
    }
  } catch {
    // Swallow resolution errors so one bad film can't break the page.
  }

  if (!info) {
    info = {
      slug: ref.slug,
      title: ref.name,
      year: ref.year,
      posterUrl: null,
      rating: null,
      letterboxdUrl: letterboxdFilmUrl(ref.slug),
      tmdbId: null,
    };
  }

  cacheSet(cacheKey, info);
  return info;
}

function toDetail(slug: string, movie: any): FilmDetail {
  const info = toInfo(slug, movie);
  const credits = movie.credits ?? {};
  const director =
    (credits.crew ?? []).find((c: any) => c.job === "Director")?.name ?? null;
  const cast = (credits.cast ?? [])
    .slice(0, 6)
    .map((c: any) => c.name)
    .filter(Boolean) as string[];
  const original =
    movie.original_title && movie.original_title !== info.title
      ? movie.original_title
      : null;
  return {
    slug,
    tmdbId: info.tmdbId,
    title: info.title,
    originalTitle: original,
    year: info.year,
    runtime: typeof movie.runtime === "number" && movie.runtime > 0 ? movie.runtime : null,
    tagline: movie.tagline?.trim() || null,
    overview: movie.overview?.trim() || null,
    genres: (movie.genres ?? []).map((g: any) => g.name).filter(Boolean),
    posterUrl: movie.poster_path ? POSTER_LG + movie.poster_path : info.posterUrl,
    backdropUrl: movie.backdrop_path ? BACKDROP_LG + movie.backdrop_path : null,
    rating: info.rating,
    voteCount: movie.vote_count ?? 0,
    director,
    cast,
    letterboxdUrl: info.letterboxdUrl,
    tmdbUrl: info.tmdbId != null ? TMDB_MOVIE_URL + info.tmdbId : null,
  };
}

/**
 * Fetch rich detail for one film, on demand (when a card is opened).
 *
 * Reuses the cached slug→TMDB-id mapping from {@link resolveFilm} so we don't
 * re-search, then pulls full movie details + credits in one request. Cached by
 * slug separately from the lightweight FilmInfo. If the film never resolved to a
 * TMDB id, returns a minimal detail built from the Letterboxd ref.
 */
export async function getFilmDetail(ref: FilmRef): Promise<FilmDetail> {
  const cacheKey = `detail:${ref.slug}`;
  const cached = cacheGet<FilmDetail>(cacheKey);
  if (cached) return cached;

  let detail: FilmDetail | null = null;
  try {
    const info = await resolveFilm(ref);
    if (info.tmdbId != null) {
      const movie = await tmdbFetch(`/movie/${info.tmdbId}`, {
        append_to_response: "credits",
      });
      if (movie) detail = toDetail(ref.slug, movie);
    }
  } catch {
    // Swallow so a failed detail lookup just yields the minimal fallback below.
  }

  if (!detail) {
    detail = {
      slug: ref.slug,
      tmdbId: null,
      title: ref.name,
      originalTitle: null,
      year: ref.year,
      runtime: null,
      tagline: null,
      overview: null,
      genres: [],
      posterUrl: null,
      backdropUrl: null,
      rating: null,
      voteCount: 0,
      director: null,
      cast: [],
      letterboxdUrl: letterboxdFilmUrl(ref.slug),
      tmdbUrl: null,
    };
  }

  cacheSet(cacheKey, detail);
  return detail;
}
