import { countryByCode, saveUpload, removeUpload, MAX_BYTES } from "@/lib/live/sources";

// Files a user uploads for a country. They join that country's folder and are
// read by the same retrieval as everything else — tables as received, other
// documents through the verified extraction.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Example mode is read-only: its files are bundled samples, never uploads.
const exampleRefused = (req) =>
  new URL(req.url).searchParams.get("mode") === "example"
    ? Response.json({ error: "Example mode is read-only — switch to Live sources to upload." }, { status: 403 })
    : null;

export async function POST(req, { params }) {
  const refused = exampleRefused(req);
  if (refused) return refused;
  const { code } = await params;
  const country = countryByCode(code);
  if (!country) return Response.json({ error: "Unknown country." }, { status: 404 });

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BYTES * 5 + 1e5) return Response.json({ error: "Upload at most five files of 10 MB at a time." }, { status: 413 });

  let form;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Send the files as a form upload." }, { status: 400 });
  }
  const files = form.getAll("file").filter((f) => f && typeof f.arrayBuffer === "function");
  if (files.length === 0) return Response.json({ error: "No file was attached." }, { status: 400 });
  if (files.length > 5) return Response.json({ error: "Upload at most five files at a time." }, { status: 400 });

  const saved = [];
  const failed = [];
  for (const f of files) {
    try {
      saved.push(await saveUpload(country.code, f.name, Buffer.from(await f.arrayBuffer())));
    } catch (err) {
      failed.push({ name: f.name, error: err.message });
    }
  }
  return Response.json({ saved, failed }, { status: saved.length ? 200 : 400 });
}

export async function DELETE(req, { params }) {
  const refused = exampleRefused(req);
  if (refused) return refused;
  const { code } = await params;
  const country = countryByCode(code);
  if (!country) return Response.json({ error: "Unknown country." }, { status: 404 });
  const name = new URL(req.url).searchParams.get("name");
  if (!name) return Response.json({ error: "Name the file to remove." }, { status: 400 });
  try {
    await removeUpload(country.code, name);
    return Response.json({ removed: name });
  } catch (err) {
    return Response.json({ error: err.message }, { status: err.status || 500 });
  }
}
