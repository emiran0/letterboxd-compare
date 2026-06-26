"use client";

import { useState } from "react";
import type { FilmRef, FilmInfo } from "@/types";
import FilmDetailModal from "./FilmDetailModal";

/**
 * Presentational film card. `info` (TMDB title/poster/rating) is resolved by the
 * parent and passed in; while it's undefined the card shows the Letterboxd name
 * from the list scrape so nothing is blank during loading.
 *
 * Tapping the card opens an on-demand detail view (issue #1): the rich TMDB
 * data is fetched only on click, so comparing long lists stays cheap.
 */
export default function FilmCard({ film, info }: { film: FilmRef; info?: FilmInfo }) {
  const [open, setOpen] = useState(false);
  const title = info?.title ?? film.name;
  const year = info?.year ?? film.year;
  const rating = info?.rating ?? null;

  return (
    <>
      <button type="button" className="card" onClick={() => setOpen(true)} title={title}>
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
          <span className="card-hint" aria-hidden="true">
            Details
          </span>
        </div>
        <div className="title">
          {title}
          {year ? <span className="yr"> {year}</span> : null}
        </div>
      </button>
      {open ? <FilmDetailModal film={film} info={info} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
