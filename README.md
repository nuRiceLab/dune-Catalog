# DUNE Catalog

DUNE Catalog is a web application designed to provide an interface for searching and browsing data related to the Deep Underground Neutrino Experiment (DUNE). It consists of a Next.js frontend and a Python backend.

## Features

- Search functionality across multiple DUNE-related datasets
- Tabbed interface for different detector types:
  - Far Detectors
  - Protodune-HD
  - ProtoDune-VD
  - Near Detector Prototypes
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
2. git clone 

2. Install frontend dependencies:
      - npm install 
      - yarn install
      - pnpm install

3. Install backend dependencies:
   pip install -r requirements.txt
4. Set up environment variables:
   - Create a `.env.local` file in the root directory
   - Add necessary environment variables (e.g., API keys, database URLs)

### Running the Application

1. Start the frontend development server: 
   - npm run dev
   - yarn dev
   - pnpm dev

2. Start the backend server:
   - run python run.py

3. Open http://localhost:3000 in your browser to view

## Project Structure
dune-catalog/   
├── src/   
│ ├── app/  
│ ├── components/   
│ ├── lib/   
│ ├── config/   
│ │ └── tabsConfig.json  
│ ├── types/   
│ └── backend/  
├── public/    
├── styles/  
├── package.json    
├── requirements.txt   
└── README.md 
## Project documentation

## Configuration

### Adding New Tabs and Categories

To add a new tab or category, simply edit the [src/config/tabsConfig.json](cci:7://file:///C:/Users/calvi/OneDrive/Desktop/github/dune_catalog/src/config/tabsConfig.json:0:0-0:0) file. The structure of this file is as follows:

```json
[
  {
    "name": "Tab Name",
    "categories": [
      {
        "name": "Category Name",
        "namespace": "corresponding-namespace"
      },
      // ... more categories
    ]
  },
  // ... more tabs
]
```

## Backend API

The Python backend provides several API endpoints to support the DUNE Catalog frontend. The main API routes are defined in [src/backend/main.py](cci:7://file:///C:/Users/calvi/OneDrive/Desktop/github/dune_catalog/src/backend/main.py:0:0-0:0), with additional functionality implemented in [src/lib/mcatapi.py](cci:7://file:///C:/Users/calvi/OneDrive/Desktop/github/dune_catalog/src/lib/mcatapi.py:0:0-0:0). The frontend interacts with these endpoints using functions defined in [src/lib/api.ts](cci:7://file:///C:/Users/calvi/OneDrive/Desktop/github/dune_catalog/src/lib/api.ts:0:0-0:0) and [src/lib/auth.ts](cci:7://file:///C:/Users/calvi/OneDrive/Desktop/github/dune_catalog/src/lib/auth.ts:0:0-0:0).

### API Endpoints

1. **Search Datasets**
    - Endpoint: `/api/search`
    - Method: POST
    - Description: Searches for datasets based on query, category, and tab.
    - Request Body:
      ```typescript
      {
        query: string;
        category: string;
        tab: string;
      }
      ```
    - Response: Array of dataset objects matching the search criteria.

2. **User Authentication**
    - Endpoint: `/api/auth/login`
    - Method: POST
    - Description: Authenticates a user and returns a token.
    - Request Body:
      ```typescript
      {
        username: string;
        password: string;
      }
      ```
    - Response: Authentication token and user information.

### Frontend API Integration

The frontend uses axios to make requests to the backend API. The main API functions are defined in [src/lib/api.ts](cci:7://file:///C:/Users/calvi/OneDrive/Desktop/github/dune_catalog/src/lib/api.ts:0:0-0:0):

- `searchDataSets(query: string, category: string, tab: string): Promise<Dataset[]>`
  Sends a search request to the backend and returns the results.

- `login(username: string, password: string): Promise<{ token: string, user: User }>`
  Authenticates a user and returns a token and user information.

Authentication-related functions are handled in [src/lib/auth.ts](cci:7://file:///C:/Users/calvi/OneDrive/Desktop/github/dune_catalog/src/lib/auth.ts:0:0-0:0), including token storage and retrieval.

### MetaCat API Integration

The backend interacts with the MetaCat API using the `MetaCatAPI` class defined in [src/lib/mcatapi.py](cci:7://file:///C:/Users/calvi/OneDrive/Desktop/github/dune_catalog/src/lib/mcatapi.py:0:0-0:0). This class handles the construction and execution of MetaCat queries based on the search parameters received from the frontend.

### Error Handling

The backend implements error handling to manage issues such as invalid requests, authentication failures, and MetaCat API errors. These are communicated back to the frontend as appropriate HTTP status codes and error messages.

For detailed information on API usage and integration, refer to the source files mentioned above.
