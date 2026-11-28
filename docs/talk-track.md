# Talk track — PDF to Markdown LAB

Two minutes. A utility, not a security demo. Say first: "This runs entirely on your machine — no network calls, nothing leaves the container. Only the last conversion is kept in memory."

1. **The dropzone.** "Drag a PDF here, or choose a file — 25 MB, 200 pages max." Drop `server/assets/sample.pdf`.
2. **Convert.** Click **Convert to Markdown**. "Conversion is in-process with pdfjs-dist — deterministic, bounded input, eval disabled. Same PDF in, same Markdown out."
3. **The result.** "Headings from font-size tiers, bullets, paragraphs, a `---` between pages. Toggle Markdown and Preview — the preview is escaped, never injected HTML."
4. **Download.** Click **Download .md**. "The original filename plus `.md`."
5. **Break it (optional).** Drop a non-PDF or an oversized file to show the refusals: "only .pdf files are accepted", the 25 MB cap, the `%PDF-` magic-byte check. An image-only PDF comes back as `(no extractable text)`.

## Notes for the presenter

- Docker (OrbStack, never Docker Desktop): `docker compose up --build -d`, then http://127.0.0.1:7818.
- Error to have in your back pocket: after a second conversion, the first conversion's download link 404s — "only the last one is kept" is by design.
