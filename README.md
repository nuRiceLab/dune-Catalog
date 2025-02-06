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
   - Create a `.env` file in the root directory
   - Required environment variables:
     ```
     METACAT_SERVER_URL=your_metacat_server_url
     METACAT_AUTH_SERVER_URL=your_metacat_auth_server_url
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
