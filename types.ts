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
  /** Resolved TMDB movie id, or null if the film couldn't be matched. */
  tmdbId: number | null;
}

/**
 * Rich, on-demand film metadata for the detail view. Fetched lazily from TMDB
 * only when a user opens a card, so the comparison/resolve flow stays light.
 */
export interface FilmDetail {
  slug: string;
  tmdbId: number | null;
  title: string;
  /** Original-language title, shown when it differs from `title`. */
  originalTitle: string | null;
  year: number | null;
  /** Runtime in minutes, or null if TMDB has none. */
  runtime: number | null;
  tagline: string | null;
  overview: string | null;
  genres: string[];
  /** Larger poster than the card thumbnail, or null. */
  posterUrl: string | null;
  /** Wide backdrop image for the modal header, or null. */
  backdropUrl: string | null;
  rating: number | null;
  voteCount: number;
  director: string | null;
  /** Top-billed cast names. */
  cast: string[];
  letterboxdUrl: string;
  /** Link to the film's TMDB page, or null if unresolved. */
  tmdbUrl: string | null;
}

/** Result of comparing two lists. */
export interface CompareResult {
  listA: { title: string; total: number; avatarUrl: string | null };
  listB: { title: string; total: number; avatarUrl: string | null };
  common: FilmRef[];
  uniqueA: FilmRef[];
  uniqueB: FilmRef[];
}

/** Display metadata for one list in a group comparison. */
export interface ListMeta {
  title: string;
  total: number;
  avatarUrl: string | null;
}

/** Result of comparing N (≥2) lists. */
export interface GroupCompareResult {
  /** One entry per input list, in input order. */
  lists: ListMeta[];
  /** Films present in every list. */
  common: FilmRef[];
  /** Per-list films present in that list and no other. Same length/order as `lists`. */
  onlyIn: FilmRef[][];
}
