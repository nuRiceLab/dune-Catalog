import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
import tempfile
import shutil
from src.lib.mcatapi import MetaCatAPI
from src.backend import auth

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
        "http://localhost:3001",
        "https://dune-tech.rice.edu"
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
    auth.set_admin_emails(admin_usernames)


# Get the absolute path to the project root directory
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Path to the configuration directory
CONFIG_PATH = os.path.join(PROJECT_ROOT, 'src', 'config')

# Admin emails (will be loaded from config/admins.json)
admin_usernames = []


# ---------------------------------------------------------------------------
# CILogon OIDC authentication routes (see src/backend/auth.py)
# ---------------------------------------------------------------------------


@app.get("/auth/login")
async def auth_login():
    """Start the CILogon OIDC authorization flow (redirects to CILogon)."""
    return await auth.login_start()


@app.get("/auth/callback")
async def auth_callback(request: Request):
    """Handle the CILogon redirect, issue a session cookie, and bounce the
    user back to the configured frontend URL."""
    return await auth.login_callback(request)


@app.post("/auth/logout")
async def auth_logout(response: Response):
    """Clear the authentication cookie."""
    return await auth.logout(response)


@app.get("/auth/me", response_model=auth.AuthResponse)
async def auth_me(request: Request):
    """Return the current session's authentication state and user info."""
    return await auth.check_auth(request)


class DatasetRequest(BaseModel):
    query: str
    category: str
    tab: str
    officialOnly: bool
    customMql: Optional[str] = None


@app.post("/queryDatasets")
def get_datasets(
    request: DatasetRequest,
    user: auth.UserInfo = Depends(auth.get_current_user),
) -> dict:
    """
    Queries MetaCat for datasets based on user input.

    Args:
        request: A DatasetRequest object with query, category, tab, officialOnly, and optional customMql fields.

    Returns:
        A dictionary with a "success" key and value True if the query succeeds,
        and a "results" key with the query results.
    Raises:
        HTTPException: If the query fails.
    """
    print('Received query:', request.query, request.category, request.tab, request.officialOnly)
    if request.customMql:
        print('Using custom MQL:', request.customMql)
    
    result = metacat_api.get_datasets(
        request.query, 
        request.category, 
        request.tab, 
        request.officialOnly,
        request.customMql
    )
    
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
def get_files(
    request: FileRequest,
    user: auth.UserInfo = Depends(auth.get_current_user),
):
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


class FileDetailsRequest(BaseModel):
    namespace: str
    name: str


@app.post("/fileDetails")
def get_file_details(
    request: FileDetailsRequest,
    user: auth.UserInfo = Depends(auth.get_current_user),
):
    """
    Returns full details for a single file: metadata, checksums,
    provenance (parents/children), and containing datasets.

    Args:
        request: A `FileDetailsRequest` object with namespace and name fields
    Returns:
        A dictionary with a "results" dict (success=True)
    Raises:
        HTTPException 404 if the file is not found, 500 on server errors
    """
    try:
        result = metacat_api.get_file_details(request.namespace, request.name)
        if not result["success"]:
            raise HTTPException(
                status_code=404,
                detail=result.get("message", "File not found")
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        print('Error in get_file_details:', str(e))
        raise HTTPException(status_code=500, detail=str(e))


class DatasetKey(BaseModel):
    namespace: str
    name: str


class DatasetSizesRequest(BaseModel):
    datasets: list[DatasetKey]


@app.post("/datasetSizes")
def get_dataset_sizes(
    request: DatasetSizesRequest,
    user: auth.UserInfo = Depends(auth.get_current_user),
):
    """
    Computes total sizes for a batch of datasets (max 25 per request)
    via MetaCat summary queries.

    Returns:
        {"success": True, "results": {"namespace:name": bytes, ...}}
    """
    if len(request.datasets) > 25:
        raise HTTPException(status_code=413, detail="Max 25 datasets per request")
    try:
        result = metacat_api.get_dataset_sizes(
            [{"namespace": d.namespace, "name": d.name} for d in request.datasets]
        )
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("message", "Size lookup failed"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        print('Error in get_dataset_sizes:', str(e))
        raise HTTPException(status_code=500, detail=str(e))


class DatasetStatsRequest(BaseModel):
    namespace: str
    name: str
    location: str | None = None  # Optional location field

@app.post("/recordDatasetAccess")
def record_dataset_access(
    request: DatasetStatsRequest,
    user: auth.UserInfo = Depends(auth.get_current_user),
):
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


def verify_admin(user: auth.UserInfo = Depends(auth.require_admin)) -> str:
    """
    FastAPI dependency: require an authenticated admin (CILogon session cookie
    + email on the allowlist). Returns the admin's email, or raises 401/403.
    """
    return user.email or user.sub


@app.get("/verify_admin")
def verify_admin_route(admin_user: str = Depends(verify_admin)) -> str:
    """Return the current admin's email if the session is an admin, else 401/403."""
    return admin_user


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
        
        # If we're updating the admins file, reload the admin allowlist
        if file == 'admins.json':
            global admin_usernames
            admin_usernames = get_admin_usernames()
            auth.set_admin_emails(admin_usernames)
        
        return {"success": True, "message": f"Config file {file} updated successfully"}
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


