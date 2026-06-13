import type { FilmRef, FilmInfo } from "@/types";
import { cacheGet, cacheSet } from "./cache";
import { fetchTmdbIdFromFilmPage, letterboxdFilmUrl } from "./letterboxd";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w185";

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
 *  1. TMDB title+year search — fast, no extra Letterboxd request.
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
    };
  }

  cacheSet(cacheKey, info);
  return info;
}
