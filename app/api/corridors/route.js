import { loadGaps } from "@/lib/data";

// The HS-4 corridor set for one year, or every year with year=all. The page no
// longer carries corridors in its HTML; the tabs that need them ask here, so
// the home payload stays small however many partners are mirrored.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const gaps = await loadGaps();
  const y = new URL(req.url).searchParams.get("year") || "all";
  const corridors = y === "all" ? gaps.corridors : gaps.corridors.filter((c) => c.year === Number(y));
  return Response.json({ year: y, corridors }, { headers: { "Cache-Control": "no-store" } });
}
