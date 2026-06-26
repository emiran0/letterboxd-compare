import { NextResponse } from "next/server";
import { getFilmDetail } from "@/lib/tmdb";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Returns rich detail for a single film, fetched on demand when a card is
// opened. Kept separate from /api/resolve (which batches lightweight display
// data for the whole list) so the heavy per-film lookup only runs on a click.
//
// GET /api/film?slug=parasite-2019&name=Parasite&year=2019
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  }
  const name = searchParams.get("name")?.trim() || slug;
  const yearRaw = searchParams.get("year");
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

  const detail = await getFilmDetail({ slug, name, year });
  return NextResponse.json(detail);
}
