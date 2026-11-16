# CLAUDE.md

- Simple personal utility: convert a PDF to Markdown in-process. No demos, no mock modes.
- Server: `server/` (Express + pdfjs-dist). Web: `web/` (one React page). Run tests: `npm test`.
- The server binds all interfaces inside the container; compose publishes 127.0.0.1 only.
- Port 7818. Docker runtime is OrbStack, never Docker Desktop.
- No AI attribution in commits.
