// Shared client-side fetch helpers.
//
// A failed request does not always come back as JSON — a platform-level 500
// (a crashed serverless function, a read-only filesystem, a proxy timeout)
// can arrive with an empty or HTML body. Calling `.json()` on that throws
// "Unexpected end of JSON input", which is a useless message to show anyone.
// Read the body as text first and degrade gracefully instead.

/** The error message for a failed Response, whatever shape its body is in. */
export async function errorFrom(r) {
  let text = "";
  try {
    text = await r.text();
  } catch {
    return r.statusText || `Request failed (${r.status})`;
  }
  if (!text) return r.statusText || `Request failed (${r.status})`;
  try {
    const data = JSON.parse(text);
    return data?.error || text;
  } catch {
    return text.slice(0, 300);
  }
}
