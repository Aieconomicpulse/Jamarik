import { connectionStatus } from "@/lib/live/sources";
import { FEATURES } from "@/lib/features";

// The Live data country list: every configured country and what it is
// connected to. Nothing is retrieved here — that happens per country, on click.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const mode = new URL(req.url).searchParams.get("mode") === "example" && FEATURES.liveExample ? "example" : "live";
  try {
    const list = await connectionStatus(mode);
    return Response.json(
      { mode, countries: list, extraction: Boolean(process.env.ANTHROPIC_API_KEY) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("GET /api/live:", err);
    return Response.json({ error: err.message || "The country list could not be loaded." }, { status: 500 });
  }
}
