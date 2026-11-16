import { useRef, useState } from "react";

function renderMdLine(line, i) {
  if (line.startsWith("### ")) return <h4 key={i}>{line.slice(4)}</h4>;
  if (line.startsWith("## ")) return <h3 key={i}>{line.slice(3)}</h3>;
  if (line.startsWith("# ")) return <h2 key={i}>{line.slice(2)}</h2>;
  if (line === "---") return <hr key={i} />;
  if (/^- /.test(line)) return <li key={i}>{line.slice(2)}</li>;
  if (!line.trim()) return null;
  return <p key={i}>{line}</p>;
}

// Safe preview: escaped text, React elements only, never dangerouslySetInnerHTML.
function MarkdownPreview({ markdown }) {
  const blocks = markdown.split("\n");
  const out = [];
  let list = [];
  const flush = () => { if (list.length) { out.push(<ul key={`ul-${out.length}`}>{list}</ul>); list = []; } };
  for (let i = 0; i < blocks.length; i++) {
    if (/^- /.test(blocks[i])) { list.push(renderMdLine(blocks[i], i)); continue; }
    flush();
    const el = renderMdLine(blocks[i], i);
    if (el) out.push(el);
  }
  flush();
  return <div className="preview" data-testid="md-preview">{out}</div>;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("text");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const pickFile = (f) => {
    setError("");
    if (f && !/\.pdf$/i.test(f.name)) { setError("only .pdf files are accepted"); return; }
    setFile(f);
  };

  const onConvert = async () => {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error(`server answered ${res.status} with a non-JSON body`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setResult(body);
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally { setBusy(false); }
  };

  return (
    <main className="app">
      <h1>PDF to Markdown</h1>
      <div
        className={`dropzone${dragOver ? " over" : ""}`}
        data-testid="dropzone"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
      >
        <p>Drag a PDF here, or browse. Max 25 MB.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          data-testid="file-input"
          aria-label="Choose a PDF file"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {file && <p data-testid="file-name">Selected: {file.name} ({Math.ceil(file.size / 1024)} KB)</p>}
      </div>
      <button type="button" className="primary" data-testid="convert" disabled={!file || busy} onClick={onConvert}>
        {busy ? "Converting…" : "Convert to Markdown"}
      </button>

      {error && <div className="error" data-testid="error-pane" role="alert">{error}</div>}

      {result && (
        <section data-testid="result-pane" aria-label="Result">
          <div className="result-head">
            <h2>Result</h2>
            <div role="group" aria-label="Result view">
              <button type="button" aria-pressed={view === "text"} data-testid="view-text" onClick={() => setView("text")}>Markdown</button>
              <button type="button" aria-pressed={view === "preview"} data-testid="view-preview" onClick={() => setView("preview")}>Preview</button>
            </div>
          </div>
          {view === "text"
            ? <pre className="code" data-testid="md-text">{result.markdown}</pre>
            : <MarkdownPreview markdown={result.markdown} />}
          <p className="stats" data-testid="stats">
            {result.stats.pages} pages · {result.stats.headings} headings · {result.stats.words} words · {result.stats.ms} ms
          </p>
          <a className="btn primary" href={`/api/download/${encodeURIComponent(result.id)}`} data-testid="download">Download .md</a>
        </section>
      )}
    </main>
  );
}
