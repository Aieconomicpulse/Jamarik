"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { errorFrom } from "@/lib/http";
import { FEATURES } from "@/lib/features";
import { Button, Chip, Icon, Input, Panel, PanelHead, Segmented, Skeleton } from "@/components/ui";

// Live data: pick a country, retrieve what its connection holds right now.
// Tables are shown exactly as received. Documents that are not tables are
// read by Claude, and every figure it returns has been checked on the server
// against the words of the source — the ones that failed are listed, with
// the reason, rather than quietly dropped.
//
// Example mode swaps the whole tab onto bundled sample files (samples/live)
// so the flow can be shown without real data. It is bannered throughout, has
// no uploads, and — like live mode — feeds nothing on any other tab.

const ROW_LIMIT = 200;
const FLOW = {
  export_to_lebanon: "export to Lebanon",
  import_from_lebanon: "import from Lebanon",
  other: "other",
  unclear: "unclear",
};

const stamp = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

export default function LiveData() {
  const [mode, setMode] = useState("live"); // live | example
  const [list, setList] = useState(null);
  const [extraction, setExtraction] = useState(true);
  const [listError, setListError] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const example = mode === "example";
  const key = (code, m = mode) => `${m}:${code}`;

  async function loadList(m = mode) {
    setListError(null);
    try {
      const r = await fetch(`/api/live?mode=${m}`, { cache: "no-store" });
      if (!r.ok) throw new Error(await errorFrom(r));
      const d = await r.json();
      setList(d.countries);
      setExtraction(d.extraction);
      return d.countries;
    } catch (e) {
      setListError(e.message);
      return null;
    }
  }
  useEffect(() => { loadList(mode); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchMode(m) {
    if (m === mode) return;
    setList(null); setSelected(null); setError(null); setQuery("");
    setMode(m);
  }

  // While a retrieval runs, walk the connection steps so the flow is visible.
  useEffect(() => {
    if (busy == null) return;
    setStep(0);
    const t = setInterval(() => setStep((n) => Math.min(n + 1, 3)), 700);
    return () => clearInterval(t);
  }, [busy]);

  async function retrieve(code, m = mode) {
    setBusy(code); setError(null);
    try {
      const r = await fetch(`/api/live/${code}?mode=${m}`, { method: "POST", cache: "no-store" });
      if (!r.ok) throw new Error(await errorFrom(r));
      const d = await r.json();
      setResults((prev) => ({ ...prev, [key(code, m)]: d }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  // Clicking a country retrieves straight away when it has a connection.
  function pick(c) {
    setSelected(c.code); setError(null);
    if (c.connected && !results[key(c.code)]) retrieve(c.code);
  }

  // Look again: a file may have been dropped in, or a feed configured.
  async function checkAgain(code) {
    const fresh = await loadList();
    const c = fresh?.find((x) => x.code === code);
    if (c?.connected) retrieve(code);
  }

  // After an upload or a removal: refresh the list, then retrieve again so
  // the screen shows what the country holds now.
  async function changed(code) {
    setResults((m) => { const n = { ...m }; delete n[key(code)]; return n; });
    const fresh = await loadList();
    const c = fresh?.find((x) => x.code === code);
    if (c?.connected) retrieve(code);
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const l = (list || []).filter((c) => !q || c.name.toLowerCase().includes(q) || String(c.code).includes(q));
    return [...l].sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
  }, [list, query]);

  const connectedCount = (list || []).filter((c) => c.connected).length;
  const country = list?.find((c) => c.code === selected) || null;
  const result = selected != null ? results[key(selected)] : null;

  return (
    <div className="fade-in">
    {/* Example mode is switched off for now (lib/features.js, REWIRE.md). */}
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      {FEATURES.liveExample && (
        <Segmented size="sm" label="Data" value={mode} onChange={switchMode}
          options={[["live", "Live sources"], ["example", "Example"]]} />
      )}
      <div className="text-[12px] text-slate1">
        {example ? "Showing example data — switch back to Live sources for real connections." : "Nothing on this tab feeds the other tabs."}
      </div>
    </div>
    {example && (
      <div role="note" className="mb-5 rounded-lg border-2 border-gold/50 bg-gold/10 px-4 py-3 flex items-start gap-3">
        <Icon name="info" className="w-5 h-5 text-gold mt-0.5" />
        <div className="text-[13px] text-ink2 leading-relaxed">
          <strong className="text-ink">Example data.</strong> These files show how a connection works. They are not real
          trade records, company names are placeholders, and nothing here is stored or used anywhere else in the portal.
        </div>
      </div>
    )}
    <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
      <Panel>
        <PanelHead
          title={example ? "Example countries" : "Countries"}
          sub={list ? (example ? "Sample connections only" : `${connectedCount} of ${list.length} connected`) : "Loading…"}
        />
        <div className="p-3 border-b border-rule">
          <Input value={query} onChange={setQuery} placeholder="Find a country" className="w-full" />
        </div>
        {listError && <div role="alert" className="m-3 rounded-md border border-burgundy/40 bg-burgundy/5 p-3 text-[12.5px] text-burgundy">{listError}</div>}
        {!list && !listError && <div className="p-3" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 mb-2" />)}</div>}
        <ul className="max-h-[62vh] overflow-y-auto thin-scroll divide-y divide-rule">
          {shown.map((c) => {
            const on = c.code === selected;
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  aria-current={on ? "true" : undefined}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer transition-colors ${
                    on ? "bg-gold/10" : "hover:bg-bone2/70"
                  }`}
                >
                  <span className="min-w-0">
                    <span className={`block text-[13px] truncate ${on ? "text-ink font-semibold" : "text-ink2"}`}>{c.name}</span>
                    <span className="block text-[10.5px] text-slate2 num">
                      {c.connected ? c.links.map((l) => l.label).join(" · ") : `code ${c.code}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0 text-[10.5px] num uppercase tracking-wider">
                    {example ? (
                      <Chip tone="gold">sample</Chip>
                    ) : (
                      <>
                        <i aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${c.connected ? "bg-cedar" : "bg-rule"}`} />
                        <span className={c.connected ? "text-cedar" : "text-slate2"}>{c.connected ? "Connected" : "No link"}</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {list && shown.length === 0 && <li className="px-4 py-6 text-[12.5px] text-slate2">No country matches.</li>}
        </ul>
      </Panel>

      <div className="min-w-0">
        {!country && (example ? <ExampleIntro /> : <Intro extraction={extraction} />)}

        {country && (
          <Panel>
            <PanelHead
              title={example ? `${country.name} · example` : country.name}
              sub={result ? `Retrieved ${stamp(result.retrieved_at)}${example ? " · example data" : ""}` : country.connected ? (example ? "Sample connection" : "Connected") : "No connection yet"}
              right={
                <Button
                  variant={country.connected ? "primary" : "ghost"}
                  icon="refresh"
                  onClick={() => (country.connected ? retrieve(country.code) : checkAgain(country.code))}
                  disabled={busy != null}
                >
                  {busy === country.code ? "Retrieving…" : country.connected ? "Retrieve now" : "Check again"}
                </Button>
              }
            />
            <div className="px-5 py-5">
              {error && <div role="alert" className="rounded-md border border-burgundy/40 bg-burgundy/5 p-3 text-[13px] text-burgundy mb-4">{error}</div>}
              {!example && <Uploads country={country} disabled={busy != null} onChanged={() => changed(country.code)} />}
              {!country.connected && <NotConnected country={country} />}
              {busy === country.code && (
                <div aria-busy="true">
                  <Steps country={country} step={step} />
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 mb-2" />)}
                </div>
              )}
              {result && busy !== country.code && (
                <>
                  <Log result={result} country={country} />
                  <Result result={result} />
                </>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
    </div>
  );
}

const STEPS = (country) => [
  `Connecting to ${country.links.map((l) => l.label).join(" and ") || "the connection"}`,
  "Receiving documents",
  "Reading tables as received",
  "Reading other documents with Claude and checking every figure against the text",
];

/** The connection steps, revealed one by one while the request runs. */
function Steps({ country, step }) {
  return (
    <ol className="mb-4 space-y-1.5 text-[12.5px]">
      {STEPS(country).map((t, i) => (
        <li key={t} className={`flex items-center gap-2 ${i <= step ? "text-ink2" : "text-slate2/60"}`}>
          <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${i < step ? "bg-cedar" : i === step ? "bg-gold animate-pulse" : "bg-rule"}`} />
          {t}{i === step ? "…" : ""}
        </li>
      ))}
    </ol>
  );
}

/** What the retrieval actually did, step by step, from the server's answer. */
function Log({ result, country }) {
  const docs = result.sources;
  const lines = [
    { ok: result.connected, text: result.connected ? `Connected to ${country.links.map((l) => l.label).join(" and ")}` : "No connection answered" },
    { ok: docs.length > 0, text: `${docs.length} document${docs.length === 1 ? "" : "s"} received` },
    ...docs.map((d) => ({
      ok: d.kind !== "error",
      text: d.kind === "table"
        ? `${d.name}: read as a table, ${d.total.toLocaleString("en-US")} row${d.total === 1 ? "" : "s"}${d.preamble?.length ? ", header found below a title line" : ""}`
        : d.kind === "extracted"
        ? `${d.name}: read by Claude, ${d.records.length} figure${d.records.length === 1 ? "" : "s"} verified${d.rejected.length ? `, ${d.rejected.length} rejected` : ""}`
        : `${d.name}: not read — ${d.error}`,
    })),
  ];
  return (
    <div className="mb-6 rounded-md border border-rule bg-bone2/40 px-4 py-3">
      <div className="eyebrow text-[10px] mb-2">Connection log</div>
      <ol className="space-y-1 text-[12.5px]">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden="true" className={`num ${l.ok ? "text-cedar" : "text-burgundy"}`}>{l.ok ? "✓" : "✕"}</span>
            <span className="text-ink2">{l.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ExampleIntro() {
  return (
    <Panel>
      <PanelHead title="How a connection works" sub="Pick the example country on the left" />
      <div className="px-5 py-5 text-[13px] text-ink2 leading-relaxed space-y-3 max-w-3xl">
        <p>
          Pakistan is connected here to two sample documents: a shipment export as an Excel file, and the same shipments
          written up as a short note. Clicking it runs the real retrieval on them, step by step.
        </p>
        <p>
          The Excel file is shown exactly as received, with plain counts worked out from its rows. The note is read by
          Claude, and each figure is shown only if it is found word for word in the text.
        </p>
      </div>
    </Panel>
  );
}

function Intro({ extraction }) {
  return (
    <Panel>
      <PanelHead title="Live data from partner countries" sub="Pick a country on the left to retrieve what its connection holds now" />
      <div className="px-5 py-5 text-[13px] text-ink2 leading-relaxed space-y-3 max-w-3xl">
        <p>
          Each country is reached through its own connection: files uploaded here, or a live feed set up on the server.
          A country without either shows <span className="num text-slate2 uppercase text-[11px] tracking-wider">No link</span>;
          once one is added it shows <span className="num text-cedar uppercase text-[11px] tracking-wider">Connected</span> and a click retrieves it.
        </p>
        <p>
          <strong className="text-ink">Tables</strong> (CSV, Excel, JSON records) are shown exactly as received.
          <strong className="text-ink"> Other documents</strong> — bulletins, letters, web pages — are read by Claude.
          Every figure it returns must be copied word for word from a quoted line of the source, and the server checks
          that before anything is shown. Figures that fail the check are listed separately, with the reason, and are never used.
        </p>
        {!extraction && (
          <p className="text-gold">Reading documents that are not tables needs ANTHROPIC_API_KEY; tables still work without it.</p>
        )}
      </div>
    </Panel>
  );
}

function NotConnected({ country }) {
  return (
    <div className="text-[12.5px] text-slate1 leading-relaxed max-w-3xl">
      Nothing is connected for {country.name} yet. Upload a file above to add data for it; a live feed can also be set
      up by an administrator, and this screen will pick it up on Check again.
    </div>
  );
}

const ACCEPT = ".csv,.tsv,.xlsx,.xls,.json,.txt,.md,.html,.htm,.xml";
const kb = (n) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Upload files for a country (button or drag and drop), and list or remove the ones it holds. */
function Uploads({ country, disabled, onChanged }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState(null);
  const files = country.files || [];

  async function send(list) {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    setWorking(true); setMsg(null);
    try {
      const fd = new FormData();
      picked.slice(0, 5).forEach((f) => fd.append("file", f));
      const r = await fetch(`/api/live/${country.code}/files`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      const notes = [];
      if (picked.length > 5) notes.push("Only the first five files were sent.");
      (d.failed || []).forEach((f) => notes.push(`${f.name}: ${f.error}`));
      if (!r.ok && !d.failed) notes.push(d.error || "The upload failed.");
      setMsg(notes.length ? { tone: "error", text: notes.join(" ") } : { tone: "ok", text: `Uploaded ${d.saved.join(", ")}.` });
      if (d.saved?.length) onChanged();
    } catch (e) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setWorking(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(name) {
    if (!window.confirm(`Remove ${name} from ${country.name}?`)) return;
    setWorking(true); setMsg(null);
    try {
      const r = await fetch(`/api/live/${country.code}/files?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await errorFrom(r));
      setMsg({ tone: "ok", text: `Removed ${name}.` });
      onChanged();
    } catch (e) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setWorking(false);
    }
  }

  const off = disabled || working;
  return (
    <div className="mb-6">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!off) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!off) send(e.dataTransfer.files); }}
        className={`rounded-lg border-2 border-dashed px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors ${
          over ? "border-gold bg-gold/5" : "border-rule bg-bone2/40"
        }`}
      >
        <div className="text-center sm:text-left">
          <div className="text-[13.5px] text-ink">
            {working ? "Uploading…" : `Add data for ${country.name}`}
          </div>
          <div className="text-[11.5px] text-slate2 mt-0.5">
            Drop files here, or choose them · CSV, Excel, JSON, text or HTML · up to 10 MB each
          </div>
        </div>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => send(e.target.files)} />
        <Button variant="ghost" icon="upload" onClick={() => input.current?.click()} disabled={off} className="shrink-0">
          Upload files
        </Button>
      </div>

      {msg && (
        <div role={msg.tone === "error" ? "alert" : "status"}
          className={`text-[12px] mt-2 ${msg.tone === "error" ? "text-burgundy" : "text-cedar"}`}>{msg.text}</div>
      )}

      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-rule border border-rule rounded-md">
          {files.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
              <span className="min-w-0">
                <span className="text-ink2 break-all">{f.name}</span>
                <span className="text-slate2 num text-[11px] ml-2">{kb(f.size)}{f.modified ? ` · ${stamp(f.modified)}` : ""}</span>
              </span>
              <button type="button" onClick={() => remove(f.name)} disabled={off}
                className="shrink-0 text-[11.5px] num uppercase tracking-wider text-slate1 hover:text-burgundy cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Result({ result }) {
  if (!result.sources.length) {
    return <div className="text-[13px] text-slate1">The connection answered but held no documents.</div>;
  }
  return (
    <div className="space-y-8">
      {result.sources.map((s, i) => <Source key={`${s.name}-${i}`} s={s} />)}
    </div>
  );
}

function SourceHead({ s, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <Icon name={s.origin === "http" ? "refresh" : "book"} className="w-4 h-4 text-slate1" />
      <span className="text-[13.5px] font-semibold text-ink break-all">{s.name}</span>
      <Chip tone={s.origin === "example" ? "gold" : "neutral"}>{s.origin === "http" ? "feed" : s.origin === "example" ? "example file" : "document"}</Chip>
      {children}
      {s.modified && <span className="text-[11px] text-slate2 num">updated {stamp(s.modified)}</span>}
    </div>
  );
}

/** Counts worked out by code from the rows — no model involved. */
function Summary({ summary }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2 mb-3 text-[12.5px]">
      <div><span className="eyebrow text-[10px] block">Rows</span><span className="num text-ink">{summary.rows.toLocaleString("en-US")}</span></div>
      {summary.totals.map((t) => (
        <div key={t.column}>
          <span className="eyebrow text-[10px] block">Total of {t.column.trim()}</span>
          <span className="num text-ink">{t.total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
          <span className="text-[11px] text-slate2 num"> · {t.counted} of {t.of} rows had a number</span>
        </div>
      ))}
      {summary.hs.length > 0 && (
        <div>
          <span className="eyebrow text-[10px] block">{summary.hs_column.trim()} · {summary.hs.length} distinct</span>
          <span className="num text-ink">{summary.hs.slice(0, 8).join(" · ")}{summary.hs.length > 8 ? " …" : ""}</span>
        </div>
      )}
      <div className="w-full text-[11px] text-slate2">Counted from the rows by the portal, not by AI.</div>
    </div>
  );
}

function Source({ s }) {
  if (s.kind === "error") {
    return (
      <section>
        <SourceHead s={s}><Chip tone="crimson">not read</Chip></SourceHead>
        <div className="text-[12.5px] text-burgundy">{s.error}</div>
      </section>
    );
  }

  if (s.kind === "table") {
    const rows = s.rows.slice(0, ROW_LIMIT);
    return (
      <section>
        <SourceHead s={s}><Chip tone="cedar">table · as received</Chip></SourceHead>
        {s.preamble?.length > 0 && (
          <div className="text-[11.5px] text-slate1 mb-2">
            Above the header, the file says: {s.preamble.map((p, k) => <span key={k} className="italic">&ldquo;{p}&rdquo; </span>)}
          </div>
        )}
        {s.summary && <Summary summary={s.summary} />}
        <div className="overflow-x-auto border border-rule rounded-md">
          <table className="dt [&_td]:px-3 [&_th]:px-3 text-[12.5px]">
            <thead><tr>{s.columns.map((c, k) => <th key={k} className="whitespace-nowrap">{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k}>{r.map((v, n) => <td key={n} className="num whitespace-nowrap">{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[11.5px] text-slate2 mt-2 num">
          {s.total.toLocaleString("en-US")} row{s.total === 1 ? "" : "s"}
          {s.total > rows.length ? ` · showing the first ${rows.length}` : ""}
          {s.truncated ? " · file cut at 5,000 rows" : ""}
        </div>
      </section>
    );
  }

  // Read by Claude, checked against the source.
  return (
    <section>
      <SourceHead s={s}>
        <Chip tone="gold">read by Claude · figures checked</Chip>
      </SourceHead>
      {s.note && <div className="text-[12.5px] text-slate1 mb-3">{s.note}</div>}
      {s.records.length === 0 ? (
        <div className="text-[13px] text-slate1">No figure in this document could be tied word for word to its text, so none is shown.</div>
      ) : (
        <div className="overflow-x-auto border border-rule rounded-md">
          <table className="dt [&_td]:px-3 [&_th]:px-3 text-[12.5px]">
            <thead>
              <tr>
                <th>Product</th><th>HS</th><th>Flow</th><th>Period</th>
                <th className="text-right" title="Copied exactly from the source">Value, as written</th>
                <th className="text-right" title="Copied exactly from the source">Quantity, as written</th>
                <th>Source line</th>
              </tr>
            </thead>
            <tbody>
              {s.records.map((r, k) => (
                <tr key={k}>
                  <td className="align-top min-w-[140px]">{r.product || <span className="text-slate2">—</span>}</td>
                  <td className="align-top num whitespace-nowrap">
                    {r.hs_code || <span className="text-slate2">—</span>}
                    {r.context_from_document?.includes("hs_code") && <div className="text-[10px] text-slate2">from elsewhere in the document</div>}
                  </td>
                  <td className="align-top whitespace-nowrap text-slate1">{FLOW[r.flow] || "—"}</td>
                  <td className="align-top num whitespace-nowrap">
                    {r.period || <span className="text-slate2">—</span>}
                    {r.context_from_document?.includes("period") && <div className="text-[10px] text-slate2">from elsewhere in the document</div>}
                  </td>
                  <td className="align-top num text-right whitespace-nowrap">
                    {r.value_text || <span className="text-slate2">—</span>}
                    {r.value != null && <div className="text-[10.5px] text-slate2">= {r.value.toLocaleString("en-US")}{r.currency ? ` ${r.currency}` : ""}</div>}
                  </td>
                  <td className="align-top num text-right whitespace-nowrap">
                    {r.quantity_text || <span className="text-slate2">—</span>}
                    {r.quantity_unit && r.quantity_text && !r.quantity_text.includes(r.quantity_unit) ? ` ${r.quantity_unit}` : ""}
                  </td>
                  <td className="align-top text-[11.5px] text-slate1 italic min-w-[240px] max-w-[420px]">&ldquo;{r.quote}&rdquo;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[11.5px] text-slate2 mt-2">
        {s.records.length} figure{s.records.length === 1 ? "" : "s"} verified against the source
        {s.truncated ? " · the document was long, only its first part was read" : ""}
      </div>
      {s.rejected.length > 0 && (
        <details className="mt-3 text-[12px]">
          <summary className="cursor-pointer text-burgundy">
            {s.rejected.length} figure{s.rejected.length === 1 ? "" : "s"} rejected — not found word for word in the source
          </summary>
          <ul className="mt-2 space-y-1.5 pl-4 list-disc text-slate1">
            {s.rejected.map((r, k) => (
              <li key={k}>
                <span className="text-ink2">{r.product || r.hs_code || "record"}</span>
                <span className="text-burgundy"> — {r.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
