from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from src.lib.mcatapi import MetaCatAPI

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Update this with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

metacat_api = MetaCatAPI()


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
        A dictionary with a "success" key and value True if the query succeeds, and a "results" key with the query results.
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
    print('Received query for files:', request.namespace, request.name)
    try:
        files = metacat_api.get_files(request.namespace, request.name)
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
