/** A film as scraped from a Letterboxd list page. */
export interface FilmRef {
  /** Letterboxd film slug, e.g. "parasite-2019". Stable unique identifier used for set comparison. */
  slug: string;
  /** Display title without the year, e.g. "Parasite". */
  name: string;
  /** Release year parsed from the list page, or null if unavailable. */
  year: number | null;
}

/** TMDB-resolved metadata for a film, used for display. */
export interface FilmInfo {
  slug: string;
  /** Canonical TMDB title (falls back to the Letterboxd name if TMDB has no match). */
  title: string;
  year: number | null;
  /** Full poster URL, or null if none found. */
  posterUrl: string | null;
  /** TMDB average rating (0–10, one decimal), or null if unrated/unresolved. */
  rating: number | null;
  /** Link back to the Letterboxd film page. */
  letterboxdUrl: string;
}

/** Result of comparing two lists. */
export interface CompareResult {
  listA: { title: string; total: number; avatarUrl: string | null };
  listB: { title: string; total: number; avatarUrl: string | null };
  common: FilmRef[];
  uniqueA: FilmRef[];
  uniqueB: FilmRef[];
}
