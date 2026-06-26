import { NextResponse } from "next/server";
import { resolveListUrl, scrapeList, LetterboxdError, type ScrapedList } from "@/lib/letterboxd";
import { appendLog } from "@/lib/logger";
import type { CompareResult, GroupCompareResult, FilmRef } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LISTS = 10;

export async function POST(req: Request) {
  let rawUrls: string[];
  let groupMode: boolean;
  try {
    const body = await req.json();
    if (Array.isArray(body.urls)) {
      groupMode = true;
      rawUrls = body.urls.map((u: unknown) => String(u ?? "").trim());
    } else {
      groupMode = false;
      rawUrls = [String(body.url1 ?? "").trim(), String(body.url2 ?? "").trim()];
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  appendLog({ ts: new Date().toISOString(), ip, ua, urls: rawUrls });

  try {
    // Drop blank fields (the group modal can submit empty inputs).
    const provided = rawUrls.filter((u) => u.length > 0);
    if (provided.length < 2) {
      return NextResponse.json(
        { error: "Enter at least two lists to compare." },
        { status: 400 },
      );
    }
    if (provided.length > MAX_LISTS) {
      return NextResponse.json(
        { error: `Too many lists. Compare at most ${MAX_LISTS} at once.` },
        { status: 400 },
      );
    }

    // Expand short links + normalize (in parallel), then de-duplicate while
    // preserving input order.
    const resolvedBases = await Promise.all(provided.map((u) => resolveListUrl(u)));
    const bases: string[] = [];
    for (const base of resolvedBases) {
      if (!bases.includes(base)) bases.push(base);
    }
    if (bases.length < 2) {
      return NextResponse.json(
        { error: "Those fields point to the same list. Enter different lists to compare." },
        { status: 400 },
      );
    }

    const scraped = await Promise.all(bases.map((b) => scrapeList(b)));

    const empty = scraped.find((s) => s.films.length === 0);
    if (empty) {
      const label = groupMode
        ? `“${empty.title}”`
        : `List ${scraped.indexOf(empty) + 1}`;
      return NextResponse.json(
        { error: `${label} has no films. It may be private, empty, or the URL is wrong.` },
        { status: 400 },
      );
    }

    if (groupMode) {
      return NextResponse.json(buildGroupResult(scraped));
    }
    return NextResponse.json(buildPairResult(scraped[0], scraped[1]));
  } catch (err) {
    if (err instanceof LetterboxdError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong while reading the lists." }, { status: 500 });
  }
}

/** Classic two-list result: common + each side's unique films. */
function buildPairResult(a: ScrapedList, b: ScrapedList): CompareResult {
  const mapA = new Map<string, FilmRef>(a.films.map((f) => [f.slug, f]));
  const mapB = new Map<string, FilmRef>(b.films.map((f) => [f.slug, f]));

  const common: FilmRef[] = [];
  const uniqueA: FilmRef[] = [];
  const uniqueB: FilmRef[] = [];

  for (const [slug, film] of mapA) {
    if (mapB.has(slug)) common.push(film);
    else uniqueA.push(film);
  }
  for (const [slug, film] of mapB) {
    if (!mapA.has(slug)) uniqueB.push(film);
  }

  return {
    listA: { title: a.title, total: mapA.size, avatarUrl: a.avatarUrl },
    listB: { title: b.title, total: mapB.size, avatarUrl: b.avatarUrl },
    common,
    uniqueA,
    uniqueB,
  };
}

/** N-list result: films common to every list, plus each list's "only in" set. */
function buildGroupResult(lists: ScrapedList[]): GroupCompareResult {
  // De-duplicate each list by slug so a slug counts once per list.
  const maps = lists.map((l) => new Map<string, FilmRef>(l.films.map((f) => [f.slug, f])));

  // Count, across lists, how many lists contain each slug (and remember a FilmRef).
  const counts = new Map<string, number>();
  const refs = new Map<string, FilmRef>();
  for (const map of maps) {
    for (const [slug, film] of map) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
      if (!refs.has(slug)) refs.set(slug, film);
    }
  }

  const common: FilmRef[] = [];
  const onlyIn: FilmRef[][] = maps.map(() => []);

  // Walk the first list that introduced each slug to keep a stable order.
  for (let i = 0; i < maps.length; i++) {
    for (const [slug, film] of maps[i]) {
      if (refs.get(slug) !== film) continue; // only emit at first occurrence
      const count = counts.get(slug)!;
      if (count === maps.length) common.push(film);
      else if (count === 1) onlyIn[i].push(film);
    }
  }

  return {
    lists: lists.map((l, i) => ({
      title: l.title,
      total: maps[i].size,
      avatarUrl: l.avatarUrl,
    })),
    common,
    onlyIn,
  };
}
