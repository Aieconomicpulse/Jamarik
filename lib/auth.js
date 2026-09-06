// Jamarik access control.
//
// A single shared credential set in environment variables guards the whole
// portal. On a successful login we mint a signed, HTTP-only session cookie
// (HMAC-SHA256 over a small JSON payload) and the middleware verifies it on
// every request. Everything here uses Web Crypto only, so the exact same code
// runs in the Edge middleware and in Node route handlers.

export const COOKIE_NAME = "jamarik_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

/** Credentials the portal will accept. Override both in Vercel. */
export function credentials() {
  return {
    user: env("PORTAL_USER", "jamarik"),
    password: env("PORTAL_PASSWORD", "change-me-in-vercel"),
  };
}

/** Secret used to sign session cookies. */
export function sessionSecret() {
  // Falls back to the password so the app still boots in local dev, but a
  // dedicated SESSION_SECRET should always be set in production.
  return env("SESSION_SECRET", credentials().password + "::jamarik");
}

/* ------------------------------ encoding ------------------------------ */

const enc = new TextEncoder();

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64url(new Uint8Array(sig));
}

/** Length-safe, timing-safe-ish string comparison. */
export function safeEqual(a, b) {
  const A = enc.encode(String(a));
  const B = enc.encode(String(b));
  let diff = A.length ^ B.length;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) diff |= (A[i] ?? 0) ^ (B[i] ?? 0);
  return diff === 0;
}

/* ------------------------------- session ------------------------------ */

export async function createSession(username) {
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        u: username,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
      })
    )
  );
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(payload))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    if (!data?.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function checkCredentials(username, password) {
  const c = credentials();
  // Evaluate both so a wrong username costs the same as a wrong password.
  const okUser = safeEqual(username ?? "", c.user);
  const okPass = safeEqual(password ?? "", c.password);
  return okUser && okPass;
}

/** Cookie attributes shared by the login and logout handlers. */
export function cookieOptions(maxAge = SESSION_MAX_AGE) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
