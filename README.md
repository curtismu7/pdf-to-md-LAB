# PDF to Markdown

Upload a PDF, convert it to Markdown in-process (pdfjs-dist), view or download the result. No network calls, nothing leaves the machine.

## Run

    docker compose up --build -d

Then open http://127.0.0.1:7818. Set `HOST_PORT` in `.env` to change the published port (see `.env.example`).

## Tests

    npm ci && npm test
