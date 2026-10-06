// Where live data comes from — the only file that knows about connections.
//
// Two kinds of connection, both set on the server and never by the browser:
//
//   folder  data/live/<code>/ — any CSV, Excel, JSON, text or HTML file
//           dropped there. Every country has one; it is "connected" once it
//           holds a file. This is how a document a partner emails is loaded.
//   http    a feed named in config/live_sources.json. The URL and any
//           headers are read from environment variables the config names,
//           so keys stay out of the repository.
//
// The browser only ever sends a country code. It cannot supply a URL or a
// path, so it cannot point the server anywhere the config does not.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import config from "@/config/live_sources.json";
import { SUPPORTED_EXT, extFromContentType } from "@/lib/live/parse";

// Serverless bundles are read-only except the temp directory, as in lib/db.js.
// Uploads land there on Vercel and are wiped on a cold start; on-prem they sit
// in data/live, or wherever LIVE_DATA_DIR points.
const ON_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const LIVE_DIR = process.env.LIVE_DATA_DIR || path.join(ON_SERVERLESS ? os.tmpdir() : process.cwd(), "data", "live");
export const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 50;
const FETCH_TIMEOUT_MS = 20000;

// Example mode reads only the bundled samples, never the live folder, and
// has no feeds and no uploads. Nothing outside the Live data tab reads either.
const SAMPLE_DIR = path.join(process.cwd(), "samples", "live");
const isExample = (mode) => mode === "example";

/** The configured countries, by code — the live list, or the example list. */
export function countries(mode) {
  if (isExample(mode)) return (config.examples || []).map((c) => ({ code: Number(c.code), name: c.name, connector: null }));
  return config.countries.map((c) => ({ code: Number(c.code), name: c.name, connector: c.connector || null }));
}

export function countryByCode(code, mode) {
  return countries(mode).find((c) => c.code === Number(code)) || null;
}

function folderFor(code, mode) {
  // Codes are integers from the config, so the path cannot escape its root.
  return path.join(isExample(mode) ? SAMPLE_DIR : LIVE_DIR, String(Number(code)));
}

async function folderFiles(code, mode) {
  try {
    const names = await fs.readdir(folderFor(code, mode));
    return names.filter((n) => !n.startsWith(".") && SUPPORTED_EXT.includes(path.extname(n).toLowerCase())).sort();
  } catch {
    return [];
  }
}

function httpConfig(connector) {
  if (connector?.type !== "http") return null;
  const url = connector.url_env ? process.env[connector.url_env] : connector.url;
  if (!url) return null;
  let headers = {};
  if (connector.headers_env && process.env[connector.headers_env]) {
    try {
      headers = JSON.parse(process.env[connector.headers_env]);
    } catch {
      throw new Error(`${connector.headers_env} must be a JSON object of headers.`);
    }
  }
  return { url, headers, label: connector.label || new URL(url).host, format: connector.format || "auto" };
}

async function describe(code, names, mode) {
  return Promise.all(names.map(async (name) => {
    try {
      const st = await fs.stat(path.join(folderFor(code, mode), name));
      return { name, size: st.size, modified: st.mtime.toISOString() };
    } catch {
      return { name, size: null, modified: null };
    }
  }));
}

/**
 * A file name that is safe to write: no directories, no odd characters, a
 * supported extension. Returns null when the extension is not one we read.
 */
export function safeName(original) {
  const base = path.basename(String(original || "")).normalize("NFKC");
  const ext = path.extname(base).toLowerCase();
  if (!SUPPORTED_EXT.includes(ext)) return null;
  const stem = base.slice(0, base.length - ext.length).replace(/[^\p{L}\p{N} ._()-]+/gu, "_").replace(/^[.\s]+/, "").trim().slice(0, 100) || "upload";
  return stem + ext;
}

/** Save an uploaded file to a country's folder. Never overwrites: a clash gets " (2)", " (3)"… */
export async function saveUpload(code, originalName, buf) {
  const name = safeName(originalName);
  if (!name) throw Object.assign(new Error(`"${path.basename(String(originalName))}" is not a supported file type.`), { status: 415 });
  if (buf.length === 0) throw Object.assign(new Error(`"${name}" is empty.`), { status: 400 });
  if (buf.length > MAX_BYTES) throw Object.assign(new Error(`"${name}" is over 10 MB.`), { status: 413 });
  const dir = folderFor(code);
  await fs.mkdir(dir, { recursive: true });
  const existing = await folderFiles(code);
  if (existing.length >= MAX_FILES) throw Object.assign(new Error(`A country holds at most ${MAX_FILES} files — remove one first.`), { status: 409 });
  const ext = path.extname(name);
  const stem = name.slice(0, -ext.length);
  let final = name;
  for (let i = 2; existing.includes(final); i++) final = `${stem} (${i})${ext}`;
  await fs.writeFile(path.join(dir, final), buf, { flag: "wx" });
  return final;
}

/** Remove one uploaded file. The name must be one the folder already lists. */
export async function removeUpload(code, name) {
  const files = await folderFiles(code);
  if (!files.includes(name)) throw Object.assign(new Error("No such file."), { status: 404 });
  await fs.unlink(path.join(folderFor(code), name));
}

/** What each country is connected to, without retrieving anything. */
export async function connectionStatus(mode) {
  return Promise.all(
    countries(mode).map(async (c) => {
      const files = await folderFiles(c.code, mode);
      let http = null;
      try { http = httpConfig(c.connector); } catch { http = null; }
      const links = [];
      if (http) links.push({ type: "http", label: http.label });
      if (files.length) {
        const n = `${files.length} ${isExample(mode) ? "example" : "uploaded"} file${files.length === 1 ? "" : "s"}`;
        links.push({ type: isExample(mode) ? "example" : "folder", label: n });
      }
      return { code: c.code, name: c.name, connected: links.length > 0, links, files: await describe(c.code, files, mode) };
    })
  );
}

/**
 * Pull every document a country's connections hold.
 * Returns [{ name, origin, ext, buf, error? }]. A connection that fails is
 * reported as an entry with an error, so one bad feed does not hide the rest.
 */
export async function retrieveDocuments(code, mode) {
  const c = countryByCode(code, mode);
  if (!c) throw new Error("Unknown country.");
  const docs = [];
  const origin = isExample(mode) ? "example" : "folder";

  for (const name of await folderFiles(c.code, mode)) {
    try {
      const file = path.join(folderFor(c.code, mode), name);
      const stat = await fs.stat(file);
      if (stat.size > MAX_BYTES) { docs.push({ name, origin, error: "file is over 10 MB" }); continue; }
      docs.push({ name, origin, ext: path.extname(name).toLowerCase(), buf: await fs.readFile(file), modified: stat.mtime.toISOString() });
    } catch (err) {
      docs.push({ name, origin, error: err.message });
    }
  }

  let http = null;
  try { http = httpConfig(c.connector); } catch (err) { docs.push({ name: c.connector?.label || "feed", origin: "http", error: err.message }); }
  if (http) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(http.url, { headers: http.headers, signal: ctrl.signal, cache: "no-store", redirect: "follow" });
      if (!res.ok) throw new Error(`the feed answered ${res.status} ${res.statusText}`);
      const len = Number(res.headers.get("content-length") || 0);
      if (len > MAX_BYTES) throw new Error("the feed response is over 10 MB");
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new Error("the feed response is over 10 MB");
      const ext = http.format !== "auto" ? `.${http.format.replace(/^\./, "")}` : extFromContentType(res.headers.get("content-type") || "");
      docs.push({ name: http.label, origin: "http", ext, buf });
    } catch (err) {
      docs.push({ name: http.label, origin: "http", error: err.name === "AbortError" ? "the feed did not answer within 20 seconds" : err.message });
    } finally {
      clearTimeout(timer);
    }
  }
  return docs;
}
