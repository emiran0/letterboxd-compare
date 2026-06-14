import * as cheerio from "cheerio";
import type { FilmRef } from "@/types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BASE = "https://letterboxd.com";

/** Hard cap on how many pages we will fetch from a single list (politeness + safety). */
const MAX_PAGES = 60;

export class LetterboxdError extends Error {
  constructor(message: string, public readonly httpStatus?: number) {
    super(message);
  }
}

/**
 * Custom avatar overrides for specific lists, keyed by normalized base URL.
 * Values are paths served from /public. Used to brand known lists.
 */
const AVATAR_OVERRIDES: Record<string, string> = {
  [`${BASE}/emiran/list/rezflix-library`]: "/rezflix-icon.png",
};

async function fetchText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      // Letterboxd pages are cacheable; avoid Next.js trying to cache huge HTML.
      cache: "no-store",
    });
  } catch {
    throw new LetterboxdError("Couldn't reach Letterboxd — it may be down or blocking requests. Try again shortly.");
  }
  if (res.status === 404) {
    throw new LetterboxdError("List not found — double-check the URL or username.", 404);
  }
  if (res.status === 429) {
    throw new LetterboxdError("Letterboxd is rate-limiting requests. Wait a moment and try again.", 429);
  }
  if (!res.ok) {
    throw new LetterboxdError(`Letterboxd returned an error (HTTP ${res.status}). Try again shortly.`, res.status);
  }
  return res.text();
}

/**
 * Normalize a pasted Letterboxd URL down to a list's base path.
 * Accepts:
 *  - a bare username (e.g. "dave")           -> that user's watchlist
 *  - a watchlist URL (/user/watchlist/)
 *  - a user list URL (/user/list/name/)
 *  - a films URL (/user/films/)              -> all rated/logged films
 * with or without trailing modifiers (/detail/, /by/rating/, /page/3/) or the
 * leading https://letterboxd.com.
 */
export function normalizeListUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new LetterboxdError("Please paste a list URL or username.");

  // Bare username: no path separators and not a URL/host -> their watchlist.
  if (!trimmed.includes("/") && !trimmed.includes(".") && !trimmed.includes(" ")) {
    return `${BASE}/${trimmed}/watchlist`;
  }

  let pathname: string;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    pathname = url.pathname;
  } catch {
    // Not a full URL — treat the input as a bare path.
    pathname = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  const segments = pathname.split("/").filter(Boolean);
  const user = segments[0];
  if (!user) throw new LetterboxdError("Could not find a username in that URL.");

  // Just a profile URL (/username/) -> their watchlist.
  if (segments.length === 1) {
    return `${BASE}/${user}/watchlist`;
  }
  if (segments[1] === "watchlist") {
    return `${BASE}/${user}/watchlist`;
  }
  if (segments[1] === "films") {
    return `${BASE}/${user}/films`;
  }
  if (segments[1] === "list" && segments[2]) {
    return `${BASE}/${user}/list/${segments[2]}`;
  }
  throw new LetterboxdError(
    "Only watchlists, film diaries (/films/) and user lists are supported (e.g. /username/watchlist/, /username/films/, or /username/list/name/).",
  );
}

function splitNameAndYear(fullName: string): { name: string; year: number | null } {
  const match = fullName.match(/^(.*?)\s+\((\d{4})\)\s*$/);
  if (match) return { name: match[1].trim(), year: Number(match[2]) };
  return { name: fullName.trim(), year: null };
}

/** Extract every film on a single list page. */
function parseFilms(html: string): FilmRef[] {
  const $ = cheerio.load(html);
  const films: FilmRef[] = [];
  $('[data-component-class="LazyPoster"]').each((_, el) => {
    const slug = $(el).attr("data-item-slug");
    const link = $(el).attr("data-item-link") ?? "";
    // Only count actual films (skip avatars / other lazy posters).
    if (!slug || !link.startsWith("/film/")) return;
    const fullName =
      $(el).attr("data-item-name") || $(el).attr("data-item-full-display-name") || slug;
    const { name, year } = splitNameAndYear(fullName);
    films.push({ slug, name, year });
  });
  return films;
}

/** Read the human-readable list title from a page (og:title), falling back to the URL. */
function parseListTitle(html: string, fallback: string): string {
  const $ = cheerio.load(html);
  return $('meta[property="og:title"]').attr("content")?.trim() || fallback;
}

/** Read the list owner's avatar URL. Prefers the avatar linking to /{user}/. */
function parseAvatar(html: string, user: string): string | null {
  const $ = cheerio.load(html);
  const owned = $(`a.avatar[href="/${user}/"] img`).first().attr("src");
  return owned || $("a.avatar img").first().attr("src") || null;
}

/** Determine the highest page number from the pagination control, default 1. */
function parseTotalPages(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  $(".paginate-pages a").each((_, el) => {
    const n = Number($(el).text().trim());
    if (Number.isFinite(n) && n > max) max = n;
  });
  return max;
}

export interface ScrapedList {
  title: string;
  avatarUrl: string | null;
  films: FilmRef[];
  /** True when the list exceeded MAX_PAGES and was silently truncated. */
  truncated: boolean;
}

/**
 * Scrape every film from a normalized list base URL across all pages.
 * Page 1 is fetched first to learn the title and page count, then the
 * remaining pages are fetched with limited concurrency.
 */
export async function scrapeList(baseUrl: string): Promise<ScrapedList> {
  const firstHtml = await fetchText(`${baseUrl}/`);
  const user = baseUrl.replace(`${BASE}/`, "").split("/")[0];
  const title = parseListTitle(firstHtml, user);
  const avatarUrl = AVATAR_OVERRIDES[baseUrl] ?? parseAvatar(firstHtml, user);
  const rawPages = parseTotalPages(firstHtml);
  let truncated = rawPages > MAX_PAGES;
  const totalPages = Math.min(rawPages, MAX_PAGES);

  const films: FilmRef[] = parseFilms(firstHtml);

  if (totalPages > 1) {
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const CONCURRENCY = 5;
    for (let i = 0; i < pages.length; i += CONCURRENCY) {
      const batch = pages.slice(i, i + CONCURRENCY);
      let htmls: string[];
      try {
        htmls = await Promise.all(batch.map((p) => fetchText(`${baseUrl}/page/${p}/`)));
      } catch (e) {
        // Some Letterboxd endpoints (e.g. /films/) block paginated access with 403.
        // Stop quietly and flag the result as truncated.
        if (e instanceof LetterboxdError && e.httpStatus === 403) {
          truncated = true;
          break;
        }
        throw e;
      }
      for (const html of htmls) films.push(...parseFilms(html));
    }
  }

  return { title, avatarUrl, films, truncated };
}

/**
 * Fallback resolver: read the TMDB id directly from a Letterboxd film page.
 * Used only when a TMDB title search fails to find a confident match.
 */
export async function fetchTmdbIdFromFilmPage(
  slug: string,
): Promise<{ id: number; type: string } | null> {
  const html = await fetchText(`${BASE}/film/${slug}/`);
  const id = html.match(/data-tmdb-id="(\d+)"/)?.[1];
  const type = html.match(/data-tmdb-type="(\w+)"/)?.[1] ?? "movie";
  return id ? { id: Number(id), type } : null;
}

export function letterboxdFilmUrl(slug: string): string {
  return `${BASE}/film/${slug}/`;
}
