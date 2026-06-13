"use client";

import type { FilmRef, FilmInfo } from "@/types";

/**
 * Presentational film card. `info` (TMDB title/poster/rating) is resolved by the
 * parent and passed in; while it's undefined the card shows the Letterboxd name
 * from the list scrape so nothing is blank during loading.
 */
export default function FilmCard({ film, info }: { film: FilmRef; info?: FilmInfo }) {
  const title = info?.title ?? film.name;
  const year = info?.year ?? film.year;
  const href = info?.letterboxdUrl ?? `https://letterboxd.com/film/${film.slug}/`;
  const rating = info?.rating ?? null;

  return (
    <a className="card" href={href} target="_blank" rel="noopener noreferrer" title={title}>
      <div className="poster">
        {info?.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.posterUrl} alt={title} loading="lazy" />
        ) : (
          <span className="placeholder">{title}</span>
        )}
        {rating != null ? (
          <span className="rating-badge" title={`TMDB rating: ${rating.toFixed(1)} / 10`}>
            <span className="src">TMDB</span>
            <span className="val">★ {rating.toFixed(1)}</span>
          </span>
        ) : null}
      </div>
      <div className="title">
        {title}
        {year ? <span className="yr"> {year}</span> : null}
      </div>
    </a>
  );
}
