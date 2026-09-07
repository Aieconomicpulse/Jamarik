export default function Footer({ meta }) {
  return (
    <footer className="border-t border-rule mt-16">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[12px] text-slate2">
        <div>
          <span className="num">Jamarik</span> · trade-mirror forensics for Lebanese customs
          {meta?.years?.length ? ` · reference years ${meta.years.join(", ")}` : ""}
        </div>
        <div className="num">
          {meta?.demo ? "Demonstration dataset — not for citation" : "Restricted distribution"}
        </div>
      </div>
    </footer>
  );
}
