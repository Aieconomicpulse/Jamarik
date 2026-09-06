import { cookies } from "next/headers";
import { checkCredentials, createSession, cookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Small in-memory throttle. Serverless instances are short-lived, so this is a
// speed bump against casual guessing, not a substitute for a real rate limiter.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (tooManyAttempts(ip)) {
    return Response.json(
      { error: "Too many attempts — wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const { username, password } = body || {};
  if (!(await checkCredentials(username, password))) {
    // Constant-ish delay so a wrong username and a wrong password feel alike.
    await new Promise((r) => setTimeout(r, 400));
    return Response.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  attempts.delete(ip);
  const store = await cookies();
  store.set({ ...cookieOptions(), value: await createSession(String(username)) });
  return Response.json({ ok: true });
}
