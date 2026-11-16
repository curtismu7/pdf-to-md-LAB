import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";

const SAMPLE_MD = "# Quarterly Report\n\n## Overview\n\nRevenue grew steadily.\n";

function mockFetch() {
  return vi.fn(async (url) => {
    const path = String(url);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (path === "/api/convert") {
      return json({ id: "r-1", filename: "report.pdf", markdown: SAMPLE_MD, stats: { pages: 2, headings: 3, words: 42, ms: 12 } });
    }
    return json({ error: "not_found", message: `no route ${path}` }, 404);
  });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PDF to Markdown page", () => {
  it("convert happy path: markdown text, stats line, download link", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByTestId("file-input"), new File(["%PDF-fake"], "report.pdf", { type: "application/pdf" }));
    await user.click(screen.getByTestId("convert"));
    expect((await screen.findByTestId("md-text")).textContent).toContain("# Quarterly Report");
    expect(screen.getByTestId("stats").textContent).toMatch(/2 pages/);
    expect(screen.getByTestId("download").getAttribute("href")).toBe("/api/download/r-1");
  });

  it("a failed conversion shows the server's JSON message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "not_a_pdf", message: "not a PDF file (missing %PDF- header)" }),
      { status: 415, headers: { "content-type": "application/json" } },
    )));
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByTestId("file-input"), new File(["garbage"], "bad.pdf", { type: "application/pdf" }));
    await user.click(screen.getByTestId("convert"));
    await waitFor(() => expect(screen.getByTestId("error-pane").textContent).toMatch(/missing %PDF- header/));
  });

  it("the preview toggle renders escaped text, no raw HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ id: "r-2", filename: "x.pdf", markdown: "# Hi\n\n<script>alert(1)</script>", stats: { pages: 1, headings: 1, words: 3, ms: 5 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByTestId("file-input"), new File(["%PDF-fake"], "x.pdf", { type: "application/pdf" }));
    await user.click(screen.getByTestId("convert"));
    await screen.findByTestId("md-text");
    await user.click(screen.getByTestId("view-preview"));
    const preview = screen.getByTestId("md-preview");
    expect(preview.querySelectorAll("script").length).toBe(0);
    expect(preview.textContent).toContain("<script>alert(1)</script>");
  });
});
