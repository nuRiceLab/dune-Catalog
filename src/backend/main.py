import os
import json
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
import tempfile
import shutil
from src.lib.mcatapi import MetaCatAPI

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create the FastAPI app
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Add your frontend URLs here
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MetaCat API
metacat_api = MetaCatAPI()

# Get the absolute path to the project root directory
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Path to store dataset access statistics
STATS_FILE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'config', 'dataset_access_stats.json'))

def load_dataset_stats():
    """
    Load dataset access statistics from JSON file.
    Creates the file if it doesn't exist.
    
    Returns:
        dict: Dataset access statistics
    """
    try:
        # logger.info(f"Loading stats from absolute path: {STATS_FILE_PATH}")
        if not os.path.exists(STATS_FILE_PATH):
            # logger.info("Stats file doesn't exist, creating new one")
            os.makedirs(os.path.dirname(STATS_FILE_PATH), exist_ok=True)
            stats = {}
        else:
            try:
                with open(STATS_FILE_PATH, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if not content:  # File is empty
                        # logger.info("Stats file is empty, initializing new stats")
                        stats = {}
                    else:
                        stats = json.loads(content)
                        # logger.info(f"Successfully loaded existing stats with {len(stats)} entries")
            except json.JSONDecodeError:
                # Try to load the backup file if it exists
                backup_path = f"{STATS_FILE_PATH}.bak"
                if os.path.exists(backup_path):
                    try:
                        with open(backup_path, 'r', encoding='utf-8') as f:
                            stats = json.loads(f.read())
                            # logger.info("Successfully loaded stats from backup file")
                    except:
                        stats = {}
                else:
                    stats = {}

        return stats
    except Exception as e:
        logger.error(f"Error loading dataset stats: {e}")
        return {}

def save_dataset_stats(stats):
    """
    Save dataset access statistics to JSON file using a temporary file for atomic writes.
    
    Args:
        stats (dict): Dataset access statistics to save
    """
    try:
        # logger.info(f"Saving stats to: {STATS_FILE_PATH}")
        
        # Create backup of existing file if it exists
        if os.path.exists(STATS_FILE_PATH):
            backup_path = f"{STATS_FILE_PATH}.bak"
            try:
                shutil.copy2(STATS_FILE_PATH, backup_path)
                # logger.info("Created backup of existing stats file")
            except Exception as e:
                logger.warning(f"Could not create backup: {e}")
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(STATS_FILE_PATH), exist_ok=True)
        
        # Write to a temporary file first
        with tempfile.NamedTemporaryFile(mode='w', delete=False, encoding='utf-8') as temp_file:
            json.dump(stats, temp_file, indent=2)
            temp_path = temp_file.name
        
        # Then move it to the actual file
        shutil.move(temp_path, STATS_FILE_PATH)
        # logger.info(f"Successfully saved stats with {len(stats)} entries")
    except Exception as e:
        logger.error(f"Error saving dataset stats: {e}")
        # Clean up temporary file if it exists
        if 'temp_path' in locals():
            try:
                os.unlink(temp_path)
            except:
                pass

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/login")
async def login(request: LoginRequest):
    """
    Log in to MetaCat using the username and password provided.

    Args:
        request (LoginRequest): The request body containing the username and password.

    Returns:
        A JSON response with a "token" key containing the authentication token if the login is successful.
        If the login fails, an HTTPException is raised with a status code of 401.
    """
    result = metacat_api.login(request.username, request.password)
    if result["success"]:
        return {"token": result["token"]}
    else:
        raise HTTPException(status_code=401, detail="Login failed")


class DatasetRequest(BaseModel):
    query: str
    category: str
    tab: str
    officialOnly: bool


@app.post("/queryDatasets")
async def get_datasets(request: DatasetRequest) -> dict:
    """
    Queries MetaCat for datasets based on user input.

    Args:
        request: A DatasetRequest object with query, category, tab, and officialOnly fields.

    Returns:
        A dictionary with a "success" key and value True if the query succeeds,
        and a "results" key with the query results.
    Raises:
        HTTPException: If the query fails.
    """
    print('Received query:', request.query, request.category, request.tab, request.officialOnly)
    result = metacat_api.get_datasets(request.query, request.category, request.tab, request.officialOnly)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.get("/health")
async def health_check() -> dict:
    """
    Performs a health check by pinging MetaCat.

    Returns:
        A dictionary with a "status" key and value "healthy" if the health check succeeds.
    Raises:
        HTTPException: If the health check fails.
    """
    # Perform a simple query to check the connection
    result = metacat_api.list_datasets()
    if not result["success"]:
        raise HTTPException(status_code=500, detail="MetaCat connection failed")
    return {"status": "healthy"}


class FileRequest(BaseModel):
    namespace: str
    name: str


@app.post("/queryFiles")
async def get_files(request: FileRequest):
    """
    Queries MetaCat for files given namespace and name.

    Args:
        request: A `FileRequest` object with namespace and name fields
    Returns:
        A dictionary with a list of files (success=True) or an error message (success=False)
    Raises:
        HTTPException if a server error occurs
    """
    try:
        result = metacat_api.get_files(request.namespace, request.name)
        if not result["success"]:
            # If the API call was successful but returned an error
            raise HTTPException(
                status_code=400,
                detail=result.get("message", "Failed to get files from MetaCat")
            )
            
        return result
    except Exception as e:
        print('Error in get_files:', str(e))
        raise HTTPException(status_code=500, detail=str(e))


class DatasetStatsRequest(BaseModel):
    namespace: str
    name: str
    location: str | None = None  # Optional location field

@app.post("/recordDatasetAccess")
async def record_dataset_access(request: DatasetStatsRequest):
    """
    Record access for a specific dataset.
    
    Args:
        request (DatasetStatsRequest): Namespace, name, and location of the dataset access
    
    Returns:
        dict: Updated dataset access statistics
    """
    try:
        # logger.info(f"Received dataset access request for: {request.namespace}/{request.name}")
        # Load existing stats
        stats = load_dataset_stats()
        
        # Create unique key
        dataset_key = f"{request.namespace}/{request.name}"
        # logger.info(f"Processing dataset key: {dataset_key}")
        
        # Update or create stats for this dataset
        if dataset_key not in stats:
            # logger.info("Creating new entry for dataset")
            stats[dataset_key] = {
                "timesAccessed": 1,
                "lastAccessed": datetime.now().isoformat(),
                "lastLocation": request.location,
                "locations": [request.location] if request.location else []
            }
        else:
            # logger.info(f"Updating existing entry. Previous access count: {stats[dataset_key].get('timesAccessed', 0)}")
            # Increment access count
            if "timesAccessed" not in stats[dataset_key]:
                stats[dataset_key]["timesAccessed"] = 1
            else:
                stats[dataset_key]["timesAccessed"] += 1
            
            # Update last access time
            stats[dataset_key]["lastAccessed"] = datetime.now().isoformat()
            
            # Update location if provided
            if request.location:
                stats[dataset_key]["lastLocation"] = request.location
                if "locations" not in stats[dataset_key]:
                    stats[dataset_key]["locations"] = []
                if request.location not in stats[dataset_key]["locations"]:
                    stats[dataset_key]["locations"].append(request.location)
            
            # logger.info(f"New access count: {stats[dataset_key]['timesAccessed']}")
        
        # Save updated stats
        save_dataset_stats(stats)
        
        return {"success": True, "stats": stats}
    except Exception as e:
        # logger.error(f"Error recording dataset access: {e}")
        return {"success": False, "message": str(e)}

@app.get("/getDatasetAccessStats")
async def get_dataset_access_stats():
    """
    Retrieve dataset access statistics.
    
    Returns:
        dict: Dataset access statistics
    """
    try:
        stats = load_dataset_stats()
        return {"success": True, "stats": stats}
    except Exception as e:
        return {"success": False, "message": str(e)}
