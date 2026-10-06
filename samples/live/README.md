# samples/live — example data for the Live data tab

Read only in the tab's **Example** mode. It never mixes with real uploads
(`data/live/`), and no other tab reads it: Products, Corridors, Evidence,
Worklist and the Detective are built only from the Comtrade files in `data/`.

- `586/pakistan_shipments_sample.xls`: ten shipment records, Pakistan to
  Lebanon, taken from a bill-of-lading export with the company names and
  exporter code replaced by placeholders. It keeps the original layout,
  including the title line above the header, so it shows the parser finding
  the real header row.
- `586/pakistan_trade_note_sample.txt`: the same shipments written as a short
  prose note, plus one figure for another destination. It shows Claude
  reading a document that is not a table, and every figure being checked word
  for word against the text.

The countries Example mode lists are in `config/live_sources.json` under
`examples`.
