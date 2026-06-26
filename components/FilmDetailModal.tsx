"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FilmRef, FilmInfo, FilmDetail } from "@/types";
import { CloseIcon } from "@/components/icons";

function runtimeLabel(min: number | null): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * On-demand film detail modal (issue #1). Fetches rich TMDB data from
 * GET /api/film only once, when opened, so long lists stay cheap to compare.
 * `info` (from the batched resolve) seeds the header so the modal never shows
 * blank while the detail request is in flight.
 */
export default function FilmDetailModal({
  film,
  info,
  onClose,
}: {
  film: FilmRef;
  info?: FilmInfo;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<FilmDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Fetch detail once on open.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ slug: film.slug, name: film.name });
    if (film.year) params.set("year", String(film.year));
    setLoading(true);
    fetch(`/api/film?${params.toString()}`)
      .then((r) => r.json())
      .then((d: FilmDetail) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        /* keep the seeded header; just drop the loading state below */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [film.slug, film.name, film.year]);

  const title = detail?.title ?? info?.title ?? film.name;
  const year = detail?.year ?? info?.year ?? film.year;
  const posterUrl = detail?.posterUrl ?? info?.posterUrl ?? null;
  const rating = detail?.rating ?? info?.rating ?? null;
  const letterboxdUrl =
    detail?.letterboxdUrl ?? info?.letterboxdUrl ?? `https://letterboxd.com/film/${film.slug}/`;
  const runtime = runtimeLabel(detail?.runtime ?? null);

  // Portal to <body>: an ancestor column has backdrop-filter, which would
  // otherwise make it the containing block for this position:fixed overlay and
  // trap the modal inside the column instead of centering it on screen.
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal film-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="film-modal-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close film-modal-close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>

        <div className="film-modal-body">
          <div className="film-modal-poster">
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={posterUrl} alt={title} />
            ) : (
              <span className="placeholder">{title}</span>
            )}
          </div>

          <div className="film-modal-main">
            <h2 id="film-modal-title">
              {title}
              {year ? <span className="film-modal-year"> {year}</span> : null}
            </h2>
            {detail?.originalTitle ? (
              <p className="film-modal-original">{detail.originalTitle}</p>
            ) : null}
            {detail?.tagline ? <p className="film-modal-tagline">{detail.tagline}</p> : null}

            <div className="film-modal-meta">
              {rating != null ? (
                <span className="film-modal-rating" title={`TMDB ${rating.toFixed(1)} / 10`}>
                  ★ {rating.toFixed(1)}
                  {detail && detail.voteCount > 0 ? (
                    <span className="votes"> ({detail.voteCount.toLocaleString()})</span>
                  ) : null}
                </span>
              ) : null}
              {runtime ? <span>{runtime}</span> : null}
              {detail?.director ? <span>Dir. {detail.director}</span> : null}
            </div>

            {detail?.genres.length ? (
              <div className="film-modal-genres">
                {detail.genres.map((g) => (
                  <span className="film-modal-genre" key={g}>
                    {g}
                  </span>
                ))}
              </div>
            ) : null}

            {detail?.overview ? (
              <p className="film-modal-overview">{detail.overview}</p>
            ) : loading ? (
              <p className="film-modal-overview muted">Loading details…</p>
            ) : (
              <p className="film-modal-overview muted">No description available.</p>
            )}

            {detail?.cast.length ? (
              <p className="film-modal-cast">
                <span className="label">Cast</span> {detail.cast.join(", ")}
              </p>
            ) : null}

            <div className="film-modal-links">
              <a className="film-modal-link lb" href={letterboxdUrl} target="_blank" rel="noopener noreferrer">
                View on Letterboxd ↗
              </a>
              {detail?.tmdbUrl ? (
                <a className="film-modal-link" href={detail.tmdbUrl} target="_blank" rel="noopener noreferrer">
                  TMDB ↗
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
