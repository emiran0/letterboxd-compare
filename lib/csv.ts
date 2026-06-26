import type { FilmRef, FilmInfo } from "@/types";

/** Escape a value for CSV (quote if it contains comma/quote/newline). */
export function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Build a Letterboxd-importable CSV. Mirrors Letterboxd's own export format
 * (Name, Year, Letterboxd URI). The URI is an exact film link, so the importer
 * matches reliably even before TMDB titles have resolved.
 */
export function buildCsv(films: FilmRef[], infoMap: Map<string, FilmInfo>): string {
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

/** Turn a list/section title into a filename-safe slug. */
export function slugifyName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "list";
}

/** Trigger a client-side download of a CSV string. */
export function downloadCsv(filename: string, content: string) {
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
