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
    result = metacat_api.login(request.username, request.password)
    if result["success"]:
        return {"token": result["token"]}
    else:
        raise HTTPException(status_code=401, detail=result["message"])


class QueryRequest(BaseModel):
    query: str
    category: str
    tab: str


@app.post("/query")
async def query(request: QueryRequest):
    print('Received query:', request.query, request.category, request.tab)
    result = metacat_api.query(request.query, request.category, request.tab)
    # print(result)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.get("/health")
async def health_check():
    result = metacat_api.list_datasets()
    if not result["success"]:
        raise HTTPException(status_code=500, detail="MetaCat connection failed")
    return {"status": "healthy"}
