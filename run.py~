import os
import sys
import importlib
import uvicorn


def load_env_variables():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                print(line)
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value
        print("Loaded environment variables from .env file.")
    else:
        print("Warning: .env file not found.")


def check_environment_variables():
    required_vars = ['METACAT_SERVER_URL', 'METACAT_AUTH_SERVER_URL']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        print(f"Error: Missing environment variables: {', '.join(missing_vars)}")
        sys.exit(1)


def check_required_packages():
    required_packages = ['fastapi', 'uvicorn', 'metacat']
    for package in required_packages:
        try:
            importlib.import_module(package)
        except ImportError:
            print(f"Error: Required package '{package}' is not installed.")
            sys.exit(1)


def check_metacat_connection():
    from src.lib.mcatapi import MetaCatAPI
    try:
        api = MetaCatAPI()
        # Perform a simple query to check the connection
        api.list_datasets()
        print("MetaCat connection successful.")
    except Exception as e:
        print(f"Error: Unable to connect to MetaCat. {str(e)}")
        sys.exit(1)


def start_server():
    uvicorn.run("src.backend.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    print("Performing pre-start checks...")
    load_env_variables()
    check_environment_variables()
    check_required_packages()
    check_metacat_connection()
    print("All checks passed. Starting the server...")
    start_server()
