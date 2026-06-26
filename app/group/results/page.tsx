"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GroupCompareResult, FilmRef, FilmInfo } from "@/types";
import FilmCard from "@/components/FilmCard";
import { GROUP_URLS_KEY } from "@/lib/group";

/**
 * Dedicated group results page (issue #6).
 *
 * Reads the list URLs the modal stashed in sessionStorage, runs the multi-list
 * comparison via POST /api/compare, then resolves TMDB details for every film
 * and shows the Commons section. The per-list "Only in" picker (#7) and CSV
 * export (#9) build on top of this; `onlyIn` is already kept in state for them.
 */
export default function GroupResultsPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "no-input">("loading");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GroupCompareResult | null>(null);

  const [infoMap, setInfoMap] = useState<Map<string, FilmInfo>>(new Map());
  const [resolved, setResolved] = useState(0);
  const [total, setTotal] = useState(0);

  // Guard against React's double-invoked effects (dev strict mode).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let urls: string[];
    try {
      urls = JSON.parse(sessionStorage.getItem(GROUP_URLS_KEY) ?? "[]");
    } catch {
      urls = [];
    }
    if (!Array.isArray(urls) || urls.length < 2) {
      setStatus("no-input");
      return;
    }

    (async () => {
      try {
        let res: Response;
        try {
          res = await fetch("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls }),
          });
        } catch {
          throw new Error("Network error — couldn't reach the server. Check your connection and try again.");
        }

        let data: { error?: string } & Partial<GroupCompareResult> = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(`Unexpected server response (HTTP ${res.status}). Please try again.`);
        }
        if (!res.ok) {
          if (res.status === 504) throw new Error("The lists took too long to read. Try smaller lists.");
          throw new Error(data.error || `Comparison failed (HTTP ${res.status}).`);
        }

        const groupResult = data as GroupCompareResult;
        setResult(groupResult);
        setStatus("ready");
        void resolveAll([...groupResult.common, ...groupResult.onlyIn.flat()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        setStatus("error");
      }
    })();
  }, []);

  async function resolveAll(films: FilmRef[]) {
    setTotal(films.length);
    setResolved(0);
    const CHUNK = 60;
    for (let i = 0; i < films.length; i += CHUNK) {
      const chunk = films.slice(i, i + CHUNK);
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ films: chunk }),
        });
        const data = await res.json();
        if (Array.isArray(data.films)) {
          setInfoMap((prev) => {
            const next = new Map(prev);
            for (const info of data.films as FilmInfo[]) next.set(info.slug, info);
            return next;
          });
        }
      } catch {
        // Skip a failed chunk; its cards keep their scraped names.
      }
      setResolved((c) => c + chunk.length);
    }
  }

  const resolving = total > 0 && resolved < total;
  const progressPct = total > 0 ? Math.min(100, Math.round((resolved / total) * 100)) : 0;

  return (
    <main className="container">
      <header className="hero">
        <h1>Group Comparison</h1>
        <p className="subtitle">
          <Link className="back-link" href="/">
            ← New comparison
          </Link>
        </p>
      </header>

      {status === "no-input" ? (
        <p className="empty">
          No lists to compare. <Link href="/">Start a new group comparison.</Link>
        </p>
      ) : null}

      {status === "error" ? <p className="error">{error}</p> : null}

      {status === "loading" ? <p className="empty">Reading the lists…</p> : null}

      {status === "ready" && result ? (
        <>
          <div className="stats">
            {result.lists.map((l, i) => (
              <span className="chip" key={i}>
                {l.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="chip-avatar" src={l.avatarUrl} alt="" />
                ) : null}
                {l.title} · {l.total}
              </span>
            ))}
            <span className="chip chip-common">
              {result.common.length} in common across {result.lists.length} lists
            </span>
            {resolving ? (
              <span className="chip chip-progress">
                Loading details… {resolved}/{total}
              </span>
            ) : null}
          </div>

          {resolving ? (
            <div className="progress">
              <div className="progress-bar" style={{ width: `${progressPct}%` }} />
            </div>
          ) : null}

          <section className="column common">
            <div className="column-head">
              <h2>In common</h2>
              <div className="head-right">
                <span className="count">{result.common.length}</span>
              </div>
            </div>
            {result.common.length === 0 ? (
              <p className="empty">No films are on every list.</p>
            ) : (
              <div className="grid">
                {result.common.map((f) => (
                  <FilmCard key={f.slug} film={f} info={infoMap.get(f.slug)} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
