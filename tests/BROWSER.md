# Browser regressions

These checks use Chromium, the Next.js UI, and the real FastAPI session,
configuration, query cancellation, and size-worker code. Only MetaCat data and
the CILogon login exchange are replaced by local fixtures. Configuration and
SQLite sessions live in a temporary directory. The fixture listens only on
loopback and must not be used as a deployment entrypoint.

Install the usual project dependencies. If Playwright is not already available,
install the browser test tooling without changing the package manifest:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
```

Run each command in a separate terminal from the repository root:

```sh
python tests/browser_server.py
```

```powershell
$env:NEXT_PUBLIC_API_URL = 'http://localhost:8082'
node node_modules/next/dist/bin/next dev --port 3002 --hostname 127.0.0.1
```

```sh
node --test tests/browser_regressions.cjs
```

The checks cover retry after a 503 size response, zero-byte datasets, all sizes
on a 50-row page, global size ordering, cancellation before the next batch,
empty or malformed administrator JSON and recovery, persisted admin edits, and logout
revoking a copied session cookie. They do not contact live CILogon, FNAL, or
MetaCat services. Monaco's normal editor assets are loaded from its CDN.
The page-error assertion excludes Monaco's `Canceled` rejection when disposing
the editor; application errors, including malformed-record render crashes, fail.
