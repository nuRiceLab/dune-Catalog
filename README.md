# DUNE Catalog

DUNE Catalog is a web application designed to provide an interface for searching and browsing data related to the Deep Underground Neutrino Experiment (DUNE). It consists of a Next.js frontend and a Python backend.

## Features

- Search functionality across multiple DUNE-related datasets
- Tabbed interface for different detector types:
  - Far Detectors
  - Protodune-HD
  - ProtoDune-VD
  - Near Detector Prototypes
- Saved searches for quick access to common queries
- File browsing with size and timestamp information
- Responsive design using Tailwind CSS
- Custom UI components using shadcn/ui
- Python backend for handling MetaCat API queries

## Getting Started

### Prerequisites

- Node.js (version specified in `.nvmrc` or latest LTS)
- npm, yarn, pnpm, or bun
- Python 3.7+
- pip (Python package installer)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/calvin-www/DUNE-Catalog.git
   cd dune_catalog
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   - Copy `.env.example` to `.env` in the root directory and fill in the values.
   - MetaCat + API:
     ```
     METACAT_SERVER_URL=your_metacat_server_url
     METACAT_AUTH_SERVER_URL=your_metacat_auth_server_url
     NEXT_PUBLIC_API_URL=the_url/api      # e.g. http://localhost:8080 in dev
     ```
   - CILogon authentication (see "Authentication (CILogon)" below):
     ```
     CILOGON_CLIENT_ID=...
     CILOGON_CLIENT_SECRET=...
     CILOGON_REDIRECT_URI=http://localhost:8080/auth/callback
     FRONTEND_URL=http://localhost:3001/dunecatalog
     JWT_SECRET_KEY=<random; python -c "import secrets;print(secrets.token_urlsafe(48))">
     ENVIRONMENT=development
     ```
5. Set up Python virtual environment:
   ```bash
   source dune-data-catalog/bin/activate
   ```

### Running the Application

You can run both the frontend and backend with a single command:

```bash
python run.py  # Development mode with hot reloading
# or
python run.py --production  # Production mode
```

This will:
- Start the frontend (Next.js) server
- Start the backend (FastAPI) server
- Handle graceful shutdown of both servers when you press Ctrl+C

Alternatively, you can run them separately:

1. Start the frontend development server: 
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

2. Start the backend server:
   ```bash
   python run.py
   ```

## Configuration

The application's configuration is centralized in `src/config/config.json`:

- `app.search`: Search-related settings (cooldown time)
- `app.files`: File display settings (max files to show)
- `app.api`: API settings (timeout)
- `app.info`: Application information
- `savedSearches`: Predefined search queries
- `tabs`: Tab configurations and categories

## Authentication (CILogon)

Before starting either the runner or Uvicorn directly, configure a generated
application-specific `JWT_SECRET_KEY` (at least 32 bytes), the CILogon client
ID/secret, callback URL, and frontend URL. Generate the key with
`python -c "import secrets; print(secrets.token_urlsafe(48))"`.
Startup rejects missing or short keys. Never reuse a key from another application.

Production is the default when `ENVIRONMENT` is omitted. Explicit
`ENVIRONMENT=development` permits HTTP only for localhost URLs.
`python run.py --production` enforces production settings after loading
`.env`, requires HTTPS URLs, and disables backend auto-reload.
Session and OAuth cookies are HttpOnly, Secure in production, and SameSite=Lax.

`CONDB_BASE_URL` is optional. When absent, Conditions DB queries return 503;
catalog startup and other features remain available.

DUNE Catalog uses **CILogon** (OpenID Connect) for single sign-on. The FastAPI
backend runs the OIDC authorization-code + PKCE flow, mints a short-lived
session JWT, and stores it in an httpOnly cookie. The frontend never handles a
token — it asks the backend who the user is via `/auth/me`.


**Searching and browsing datasets requires logging in.** The dataset and file
query endpoints only accept requests carrying a valid session cookie;
anonymous requests receive `401 Unauthorized`, and the home page shows a
sign-in prompt in place of the search bar until the user logs in (via the
Login button in the header). Logging in also establishes **identity** and
gates the **admin** panel.

Note: this gate applies to the DUNE Catalog app itself. The underlying
MetaCat instance serves reads anonymously, so the login requirement provides
usage accountability within the app rather than protection of the data.

### Registering a CILogon client

1. Register a client at https://cilogon.org/oauth2/register with:
   - **Client Type:** Confidential
   - **Scopes:** `openid`, `email`, `profile`, `org.cilogon.userinfo`
   - **Callback URLs** (one per line):
     - Dev: `http://localhost:8080/auth/callback`
     - Prod: `https://dune-tech.rice.edu/dunecatalog/api/auth/callback`
2. CILogon issues a **Client ID** and **Client Secret** → put them in `.env`
   (`CILOGON_CLIENT_ID` / `CILOGON_CLIENT_SECRET`). New clients may require
   CILogon admin approval before they work.
3. Set `CILOGON_REDIRECT_URI` to the callback URL for the environment you're
   running, and `FRONTEND_URL` to where users should land after login
   (include the `/dunecatalog` basePath).

### Admin access

Admins are enrolled by the exact CILogon issuer and subject in
`src/config/admins.json`. Email is optional display information and never grants
access. The initial list is empty to prevent automatic enrollment by email.

Before deploying this migration, have each intended administrator sign in and
obtain their own `identity_issuer` and `sub` from `/auth/me`. Independently verify
ownership, then provision records of the form
`{"issuer":"https://cilogon.org","sub":"the verified subject"}` on the server.
Do not guess subjects from email addresses. The Admin Users form accepts exact
subjects; JSON mode also accepts an optional `email` label. Backend validation
rejects malformed entries and removal of the last administrator through the API.

State-changing API requests require an exact trusted `Origin`, or a trusted
`Referer` when Origin is absent. The trusted origin comes from `FRONTEND_URL`;
its path is excluded. Scripts using session cookies must also supply this origin.
FNAL login polling uses POST JSON with `login_id`; GET is not supported.

### Session storage and FNAL lifecycle

Production requires an absolute `SESSION_DB_PATH` on local disk, writable by the
backend service account (for example `/var/lib/dunecatalog/sessions.sqlite3`).
Keep it outside the repository and synced folders such as OneDrive. Development
defaults to the user's local application data directory. SQLite stores only
session identifiers and expirations. Losing the database signs everyone out;
restarting with the same database preserves active sessions and revocations.
This upgrade rejects all existing session cookies; users must sign in again.

Logout revokes the catalog session before clearing its cookie, then removes
session-owned FNAL credentials and pending logins. FNAL provider revocation is
attempted with a five-second timeout; the UI reports when confirmation fails.
Validate `auth/token/revoke-self` with an operator test account before deployment.
Local logout remains effective if the provider is unavailable.

Run **one backend worker**: FNAL credentials are held only in process memory.
Users reconnect to FNAL after a backend restart. Connections expire at the
earlier of the vault lease or catalog session expiry; unfinished logins expire
after five minutes. Replica results are fetched using the requesting session's
credentials on every request.

### Auth endpoints (backend)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/login` | Start the CILogon flow (302 to CILogon). |
| GET | `/auth/callback` | Handle the redirect, set the session cookie. |
| POST | `/auth/logout` | Revoke the session, clear its cookie, and disconnect FNAL. |
| GET | `/auth/me` | Current auth state + user info (incl. `is_admin`). |

## Project Structure

```
dune_catalog/
├── src/
│   ├── app/          # Next.js pages and routing
│   ├── components/   # React components
│   ├── config/       # Configuration files
│   ├── lib/          # Utility functions and API clients
│   ├── types/        # TypeScript type definitions
│   └── backend/      # Python backend code
├── public/           # Static assets
├── run.py           # Combined frontend/backend runner
└── requirements.txt  # Python dependencies
```

## Error Handling

The backend implements error handling to manage issues such as:
- Invalid requests
- Authentication failures
- MetaCat API errors
- Query validation and sanitization

These are communicated back to the frontend as appropriate HTTP status codes and error messages.

## Adding New Tabs

To add a new tab to the application, modify the `tabs` section in `src/config/config.json`. Each tab requires a unique name and a list of categories. Here's the structure:

```json
{
  "tabs": {
    "Your New Tab Name": {
      "categories": [
        {
          "name": "Category Name",
          "namespace": "metacat-namespace"
        },
        {
          "name": "Another Category",
          "namespace": "another-namespace"
        }
      ]
    }
  }
}
```
Important notes:
- The tab name will appear exactly as written in the navigation bar
- Each category must have both a `name` (displayed to users) and a `namespace` (used for MetaCat queries)
- The namespace should match the MetaCat namespace for the data you want to query
- Changes to the config file take effect after the back end server is restarted
