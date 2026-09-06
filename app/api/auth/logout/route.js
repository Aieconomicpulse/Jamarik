import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  store.set({ ...cookieOptions(0), value: "" });
  return Response.json({ ok: true });
}
