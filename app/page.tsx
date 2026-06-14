"use client";

import { useMemo, useState } from "react";
import type { CompareResult, FilmRef, FilmInfo } from "@/types";
import FilmCard from "@/components/FilmCard";

type SortKey = "default" | "title" | "year" | "rating";
type SortDir = "asc" | "desc";

const REZFLIX_URL = "https://letterboxd.com/emiran/list/rezflix-library/";

/** Escape a value for CSV (quote if it contains comma/quote/newline). */
function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Build a Letterboxd-importable CSV. Mirrors Letterboxd's own export format
 * (Name, Year, Letterboxd URI). The URI is an exact film link, so the importer
 * matches reliably even before TMDB titles have resolved.
 */
function buildCsv(films: FilmRef[], infoMap: Map<string, FilmInfo>): string {
  const header = "Name,Year,Letterboxd URI";
  const rows = films.map((f) => {
    const info = infoMap.get(f.slug);
    const name = info?.title ?? f.name;
    const year = (info?.year ?? f.year ?? "").toString();
    const uri = info?.letterboxdUrl ?? `https://letterboxd.com/film/${f.slug}/`;
    return [csvEscape(name), csvEscape(year), csvEscape(uri)].join(",");
  });
  return [header, ...rows].join("\r\n");
}

function slugifyName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "list";
}

/** Trigger a client-side download of a CSV string. */
function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface Controls {
  filter: string;
  sortKey: SortKey;
  sortDir: SortDir;
  minRating: number;
}

function Column({
  kind,
  title,
  exportLabel,
  avatars,
  films,
  infoMap,
  controls,
}: {
  kind: "common" | "a" | "b";
  title: string;
  exportLabel: string;
  avatars: (string | null)[];
  films: FilmRef[];
  infoMap: Map<string, FilmInfo>;
  controls: Controls;
}) {
  const { filter, sortKey, sortDir, minRating } = controls;

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let arr = films.map((f, idx) => ({ f, idx }));

    if (q) {
      arr = arr.filter(({ f }) => (infoMap.get(f.slug)?.title ?? f.name).toLowerCase().includes(q));
    }
    if (minRating > 0) {
      arr = arr.filter(({ f }) => {
        const r = infoMap.get(f.slug)?.rating;
        return r != null && r >= minRating;
      });
    }
    if (sortKey !== "default") {
      const dir = sortDir === "asc" ? 1 : -1;
      arr.sort((a, b) => {
        const ia = infoMap.get(a.f.slug);
        const ib = infoMap.get(b.f.slug);
        let cmp = 0;
        if (sortKey === "title") {
          cmp = (ia?.title ?? a.f.name).localeCompare(ib?.title ?? b.f.name);
        } else if (sortKey === "year") {
          cmp = (ia?.year ?? a.f.year ?? 0) - (ib?.year ?? b.f.year ?? 0);
        } else if (sortKey === "rating") {
          cmp = (ia?.rating ?? -1) - (ib?.rating ?? -1);
        }
        if (cmp === 0) cmp = a.idx - b.idx; // stable tiebreak
        return cmp * dir;
      });
    }
    return arr.map((x) => x.f);
  }, [films, infoMap, filter, sortKey, sortDir, minRating]);

  return (
    <section className={`column ${kind}`}>
      <div className="column-head">
        {avatars.some(Boolean) ? (
          <span className="head-avatars">
            {avatars.filter(Boolean).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} className="head-avatar" src={src as string} alt="" />
            ))}
          </span>
        ) : null}
        <h2>{title}</h2>
        <div className="head-right">
          <span className="count">
            {shown.length}
            {shown.length !== films.length ? ` / ${films.length}` : ""}
          </span>
          <button
            type="button"
            className="export"
            onClick={() => downloadCsv(`letterboxd-${exportLabel}.csv`, buildCsv(shown, infoMap))}
            disabled={shown.length === 0}
            title="Export these films as a Letterboxd-importable CSV"
          >
            ⬇ Export
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="empty">{films.length === 0 ? "Nothing here." : "No matches."}</p>
      ) : (
        <div className="grid">
          {shown.map((f) => (
            <FilmCard key={f.slug} film={f} info={infoMap.get(f.slug)} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [url1, setUrl1] = useState("");
  const [url2, setUrl2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  const [infoMap, setInfoMap] = useState<Map<string, FilmInfo>>(new Map());
  const [resolved, setResolved] = useState(0);
  const [total, setTotal] = useState(0);

  // controls
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [minRating, setMinRating] = useState(0);

  // mobile-only: which section tab is active (ignored on desktop via CSS)
  const [activeTab, setActiveTab] = useState<"common" | "a" | "b">("common");

  const controls: Controls = { filter, sortKey, sortDir, minRating };

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
        // Skip a failed chunk; its cards just keep their scraped names.
      }
      setResolved((c) => c + chunk.length);
    }
  }

  async function compare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Quick client-side checks before hitting the network.
    if (!url1.trim() || !url2.trim()) {
      setError("Please fill in both lists.");
      return;
    }
    if (url1.trim().toLowerCase() === url2.trim().toLowerCase()) {
      setError("Both fields point to the same list — enter two different lists to compare.");
      return;
    }

    setLoading(true);
    setResult(null);
    setInfoMap(new Map());
    setTotal(0);
    setResolved(0);
    try {
      let res: Response;
      try {
        res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url1, url2 }),
        });
      } catch {
        throw new Error("Network error — couldn't reach the server. Check your connection and try again.");
      }

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // Non-JSON response (e.g. a crash or proxy error page).
        throw new Error(`Unexpected server response (HTTP ${res.status}). Please try again.`);
      }

      if (!res.ok) {
        if (res.status === 504) throw new Error("The lists took too long to read. Try smaller lists.");
        throw new Error(data.error || `Comparison failed (HTTP ${res.status}).`);
      }

      const compareResult = data as CompareResult;
      setResult(compareResult);
      // Resolve every film (buckets are mutually exclusive, so concat = union).
      const all = [...compareResult.common, ...compareResult.uniqueA, ...compareResult.uniqueB];
      void resolveAll(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function swap() {
    setUrl1(url2);
    setUrl2(url1);
  }

  function onSortKey(key: SortKey) {
    setSortKey(key);
    // Sensible default direction per sort.
    if (key === "title") setSortDir("asc");
    else if (key === "year" || key === "rating") setSortDir("desc");
  }

  const overlap =
    result && result.listA.total + result.listB.total - result.common.length > 0
      ? Math.round(
          (result.common.length /
            (result.listA.total + result.listB.total - result.common.length)) *
            100,
        )
      : 0;

  const resolving = total > 0 && resolved < total;
  const progressPct = total > 0 ? Math.min(100, Math.round((resolved / total) * 100)) : 0;

  return (
    <main className="container">
      <header className="hero">
        <h1>Letterboxd List Compare</h1>
        <p className="subtitle">
          Paste two list URLs — or just a username for their watchlist — to see what they share and
          what&apos;s unique to each.
        </p>
      </header>

      <form className="form" onSubmit={compare}>
        <div className="inputs">
          <div className="field">
            <label htmlFor="url1">List 1</label>
            <input
              id="url1"
              value={url1}
              onChange={(e) => setUrl1(e.target.value)}
              placeholder="username or https://letterboxd.com/user/watchlist/"
              autoComplete="off"
            />
          </div>
          <button type="button" className="swap" onClick={swap} title="Swap lists" aria-label="Swap lists">
            ⇄
          </button>
          <div className="field">
            <div className="field-head">
              <label htmlFor="url2">List 2</label>
              <span
                className="shortcut"
                role="button"
                tabIndex={0}
                onClick={() => setUrl2(REZFLIX_URL)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setUrl2(REZFLIX_URL);
                  }
                }}
                title="Fill List 2 with the REZFLIX Library list"
              >
                Check <span className="rez">REZFLIX</span> Library
              </span>
            </div>
            <input
              id="url2"
              value={url2}
              onChange={(e) => setUrl2(e.target.value)}
              placeholder="username or https://letterboxd.com/user/list/name/"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="row">
          <button className="primary" type="submit" disabled={loading || !url1 || !url2}>
            {loading ? "Comparing…" : "Compare"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </form>

      {result ? (
        <>
          <div className="stats">
            <span className="chip chip-a">
              {result.listA.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="chip-avatar" src={result.listA.avatarUrl} alt="" />
              ) : null}
              {result.listA.title} · {result.listA.total}
            </span>
            <span className="chip chip-b">
              {result.listB.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="chip-avatar" src={result.listB.avatarUrl} alt="" />
              ) : null}
              {result.listB.title} · {result.listB.total}
            </span>
            <span className="chip chip-common">{result.common.length} in common</span>
            <span className="chip">{overlap}% overlap</span>
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
          {(result.listA.truncated || result.listB.truncated) ? (
            <p className="truncation-warning">
              {[
                result.listA.truncated ? `${result.listA.title} (${result.listA.total.toLocaleString()} films shown)` : null,
                result.listB.truncated ? `${result.listB.title} (${result.listB.total.toLocaleString()} films shown)` : null,
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              is very large — results may be incomplete.
            </p>
          ) : null}

          <div className="toolbar">
            <input
              className="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by title…"
            />
            <div className="control">
              <label>Sort</label>
              <select value={sortKey} onChange={(e) => onSortKey(e.target.value as SortKey)}>
                <option value="default">Letterboxd order</option>
                <option value="title">Title</option>
                <option value="year">Year</option>
                <option value="rating">Rating (TMDB)</option>
              </select>
            </div>
            <button
              type="button"
              className="dir"
              disabled={sortKey === "default"}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title="Toggle sort direction"
            >
              {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
            </button>
            <div className="control">
              <label>Min rating (TMDB)</label>
              <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
                <option value={0}>Any</option>
                {[5, 6, 7, 8, 9].map((r) => (
                  <option key={r} value={r}>
                    {r}+
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="info">
            <span className="info-icon">ℹ</span>
            <span>
              <strong>Export</strong> saves a section as a Letterboxd-compatible CSV. Create a new
              list on Letterboxd, choose <em>Import</em>, and upload the file to rebuild that section
              as a list in seconds. Exports respect your current filter &amp; sort.
            </span>
          </p>

          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "common"}
              className={`tab tab-common ${activeTab === "common" ? "active" : ""}`}
              onClick={() => setActiveTab("common")}
            >
              <span className="tab-label">Common</span>
              <span className="tab-count">{result.common.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "a"}
              className={`tab tab-a ${activeTab === "a" ? "active" : ""}`}
              onClick={() => setActiveTab("a")}
            >
              {result.listA.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="tab-avatar" src={result.listA.avatarUrl} alt="" />
              ) : null}
              <span className="tab-label">{result.listA.title}</span>
              <span className="tab-count">{result.uniqueA.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "b"}
              className={`tab tab-b ${activeTab === "b" ? "active" : ""}`}
              onClick={() => setActiveTab("b")}
            >
              {result.listB.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="tab-avatar" src={result.listB.avatarUrl} alt="" />
              ) : null}
              <span className="tab-label">{result.listB.title}</span>
              <span className="tab-count">{result.uniqueB.length}</span>
            </button>
          </div>

          <div className={`columns show-${activeTab}`}>
            <Column
              kind="common"
              title="Common"
              exportLabel="common"
              avatars={[result.listA.avatarUrl, result.listB.avatarUrl]}
              films={result.common}
              infoMap={infoMap}
              controls={controls}
            />
            <Column
              kind="a"
              title={`Only in ${result.listA.title}`}
              exportLabel={`only-in-${slugifyName(result.listA.title)}`}
              avatars={[result.listA.avatarUrl]}
              films={result.uniqueA}
              infoMap={infoMap}
              controls={controls}
            />
            <Column
              kind="b"
              title={`Only in ${result.listB.title}`}
              exportLabel={`only-in-${slugifyName(result.listB.title)}`}
              avatars={[result.listB.avatarUrl]}
              films={result.uniqueB}
              infoMap={infoMap}
              controls={controls}
            />
          </div>
        </>
      ) : null}
    </main>
  );
}
