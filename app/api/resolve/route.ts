import { NextResponse } from "next/server";
import { resolveFilm } from "@/lib/tmdb";
import type { FilmRef } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Max films resolved per request (the client sends chunks below this). */
const MAX_PER_REQUEST = 80;
/** How many TMDB lookups to run at once. */
const CONCURRENCY = 12;

/** Run `fn` over `items` with a bounded number of concurrent workers. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Resolves a batch of films to TMDB display data (title, poster, rating).
// Results are cached server-side by slug, so repeated/overlapping batches are cheap.
export async function POST(req: Request) {
  let films: FilmRef[];
  try {
    const body = await req.json();
    films = Array.isArray(body.films) ? body.films : [];
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const clean = films
    .filter((f) => f && typeof f.slug === "string")
    .slice(0, MAX_PER_REQUEST)
    .map((f) => ({ slug: f.slug, name: f.name ?? f.slug, year: f.year ?? null }));

  const resolved = await pool(clean, CONCURRENCY, resolveFilm);
  return NextResponse.json({ films: resolved });
}
