import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
    allow_origins=[
        "http://localhost:3000", 
        "https://dune-tech.rice.edu/dunecatalog"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MetaCat API
metacat_api = MetaCatAPI()

# Load admin usernames on startup
@app.on_event("startup")
async def startup_event():
    global admin_usernames
    admin_usernames = get_admin_usernames()
    

# Get the absolute path to the project root directory
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Path to the configuration directory
CONFIG_PATH = os.path.join(PROJECT_ROOT, 'src', 'config')

# Security
security = HTTPBearer()

# Admin usernames (will be loaded from config)
admin_usernames = []


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
        token = result["token"]
        return {
            "token": token, 
            "username": request.username
        }
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
        logger.error(f"Error recording dataset access: {e}")
        return {"success": False, "message": str(e)}


def load_dataset_stats() -> Dict[str, Any]:
    """
    Load dataset access statistics from the config file
    
    Returns:
        Dict containing dataset access statistics
    """
    stats_file = os.path.join(CONFIG_PATH, 'dataset_access_stats.json')
    
    # Create empty stats file if it doesn't exist
    if not os.path.exists(stats_file):
        with open(stats_file, 'w') as f:
            json.dump({}, f)
        return {}
    
    try:
        with open(stats_file, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading dataset stats: {e}")
        return {}


def save_dataset_stats(stats: Dict[str, Any]) -> bool:
    """
    Save dataset access statistics to the config file
    
    Args:
        stats: Dictionary containing dataset access statistics
        
    Returns:
        bool: True if successful, False otherwise
    """
    stats_file = os.path.join(CONFIG_PATH, 'dataset_access_stats.json')
    
    try:
        # Create a temporary file to write to
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
            json.dump(stats, temp_file, indent=2)
        
        # Replace the original file with the temporary file
        shutil.move(temp_file.name, stats_file)
        return True
    except Exception as e:
        logger.error(f"Error saving dataset stats: {e}")
        return False


def get_admin_usernames() -> List[str]:
    """
    Get list of admin usernames from the admins config file
    
    Returns:
        List of admin usernames
    """
    admins_file = os.path.join(CONFIG_PATH, 'admins.json')
    
    try:
        if os.path.exists(admins_file):
            with open(admins_file, 'r') as f:
                content = f.read()
                data = json.loads(content)
                admins = data.get('admins', [])
                return admins
        else:
            logger.warning(f"Admin file does not exist: {admins_file}")
        return []
    except Exception as e:
        logger.error(f"Error loading admin usernames: {e}")
        return []


@app.get("/verify_admin")
def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(security), x_username: Optional[str] = Header(None)) -> str:
    """
    Verify that the request is from an admin user
    
    Args:
        credentials: HTTP Authorization credentials
        x_username: Username from X-Username header
        
    Returns:
        str: Username if admin, raises HTTPException otherwise
    """
    logger.info(f"Verifying admin access. X-Username header: {x_username}")
    logger.info(f"Token present: {bool(credentials and credentials.credentials)}")
    
    # Get username from token using auth_info
    username = None
    if credentials and credentials.credentials:
        token = credentials.credentials
        token_username = metacat_api.get_username()
        logger.info(f"Token username: {token_username}")
        if token_username:
            username = token_username
            logger.info(f"Using username from token auth_info: {username}")
        
    if not username:
        logger.warning("Admin verification failed: Could not determine username")
        raise HTTPException(status_code=401, detail="Authentication failed - could not determine username")
    isAdmin = username in admin_usernames

    # Check if user is admin
    if not isAdmin:
        logger.warning(f"Admin verification failed: User '{username}' is not an admin")
        raise HTTPException(status_code=403, detail="Not authorized as admin")
    
    logger.info(f"Admin verification successful for user: {username}")
    return username


class ConfigRequest(BaseModel):
    file: str


class ConfigData(BaseModel):
    data: Dict[str, Any]


@app.get("/admin/config")
async def get_config(file: str = None, list: bool = False, admin_user: str = Depends(verify_admin)):
    """
    Get configuration data or list available configuration files
    
    Args:
        file: Name of the configuration file to retrieve
        list: If True, return a list of available configuration files
        admin_user: Username of the admin user (from dependency)
        
    Returns:
        Configuration data or list of configuration files
    """
    try:
        if list:
            # List all config files
            files = [f for f in os.listdir(CONFIG_PATH) if f.endswith('.json')]
            return {"success": True, "configFiles": files}
        
        if not file:
            raise HTTPException(status_code=400, detail="File parameter is required")
        
        # Get config file path
        config_file = os.path.join(CONFIG_PATH, file)
        
        # Check if file exists
        if not os.path.exists(config_file):
            return {"success": False, "message": f"Config file {file} not found"}
        
        # Read and parse the file
        with open(config_file, 'r') as f:
            data = json.load(f)
        
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/config")
async def save_config(file: str, data: ConfigData, admin_user: str = Depends(verify_admin)):
    """
    Save configuration data to a file
    
    Args:
        file: Name of the configuration file to save
        data: Configuration data to save
        admin_user: Username of the admin user (from dependency)
        
    Returns:
        Success message
    """
    try:
        if not file:
            raise HTTPException(status_code=400, detail="File parameter is required")
        
        # Get config file path
        config_file = os.path.join(CONFIG_PATH, file)
        
        # Create a temporary file to write to
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
            json.dump(data.data, temp_file, indent=2)
        
        # Replace the original file with the temporary file
        shutil.move(temp_file.name, config_file)
        
        # If we're updating the admins file, reload the admin usernames
        if file == 'admins.json':
            global admin_usernames
            admin_usernames = get_admin_usernames()
        
        return {"success": True, "message": f"Config file {file} updated successfully"}
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


