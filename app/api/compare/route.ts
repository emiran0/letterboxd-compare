import { NextResponse } from "next/server";
import { normalizeListUrl, scrapeList, LetterboxdError } from "@/lib/letterboxd";
import { appendLog } from "@/lib/logger";
import type { CompareResult, FilmRef } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let url1: string, url2: string;
  try {
    const body = await req.json();
    url1 = String(body.url1 ?? "");
    url2 = String(body.url2 ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";
  appendLog({ ts: new Date().toISOString(), ip, ua, url1, url2 });

  try {
    const base1 = normalizeListUrl(url1);
    const base2 = normalizeListUrl(url2);
    if (base1 === base2) {
      return NextResponse.json(
        { error: "Both fields point to the same list — enter two different lists to compare." },
        { status: 400 },
      );
    }

    const [a, b] = await Promise.all([scrapeList(base1), scrapeList(base2)]);

    if (a.films.length === 0) {
      return NextResponse.json(
        { error: "List 1 has no films — it may be private, empty, or the URL is wrong." },
        { status: 400 },
      );
    }
    if (b.films.length === 0) {
      return NextResponse.json(
        { error: "List 2 has no films — it may be private, empty, or the URL is wrong." },
        { status: 400 },
      );
    }

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

    const result: CompareResult = {
      listA: { title: a.title, total: mapA.size, avatarUrl: a.avatarUrl },
      listB: { title: b.title, total: mapB.size, avatarUrl: b.avatarUrl },
      common,
      uniqueA,
      uniqueB,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LetterboxdError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong while reading the lists." }, { status: 500 });
  }
}
