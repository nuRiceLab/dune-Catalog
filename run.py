import os
import sys
import importlib
import uvicorn


def load_env_variables():
    """
    Load environment variables from a .env file.

    The .env file is expected to be in the same directory as this script.
    The file should contain lines of the form "VARIABLE_NAME=VALUE".
    Lines that start with "#" are ignored.

    If the .env file is not found, the function simply prints a warning message.
    """
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                # Ignore blank lines and lines that start with "#"
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value
        print("Loaded environment variables from .env file.")
    else:
        print("Warning: .env file not found.")


def check_environment_variables():
    """
    Check that all required environment variables are set.
    """
    # The list of environment variables that must be set
    required_vars = ['METACAT_SERVER_URL', 'METACAT_AUTH_SERVER_URL']

    # Check if any of the required environment variables are missing
    missing_vars = [var for var in required_vars if not os.getenv(var)]

    # If any required environment variables are missing, print an error message and exit
    if missing_vars:
        print(f"Error: Missing environment variables: {', '.join(missing_vars)}")
        sys.exit(1)


def check_required_packages():
    """
    Check if all required packages are installed.

    The function checks if the packages in the required_packages list are installed.
    If any of the packages are missing, the function prints an error message and exits.
    """
    required_packages = ['fastapi', 'uvicorn', 'metacat']
    for package in required_packages:
        try:
            # Try to import the package
            importlib.import_module(package)
        except ImportError:
            # If the import fails, print an error message and exit
            print(f"Error: Required package '{package}' is not installed.")
            sys.exit(1)


def check_metacat_connection():
    """
    Check that we can connect to MetaCat.

    This function is called before starting the server. If the connection
    check fails, the function prints an error message and exits the program.
    """
    from src.lib.mcatapi import MetaCatAPI

    try:
        api = MetaCatAPI()
        # Perform a simple query to check the connection
        api.list_datasets()
        print("MetaCat connection successful.")
    except Exception as e:
        # If the connection check fails, print an error message and exit
        print(f"Error: Unable to connect to MetaCat. {str(e)}")
        sys.exit(1)


def start_server() -> None:
    """
    Start the FastAPI server.

    This function is called at the end of the run.py script. It starts the
    FastAPI server using the uvicorn.run() function.

    Parameters:
        None

    Returns:
        None
    """
    uvicorn.run("src.backend.main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    print("Performing pre-start checks...")
    load_env_variables()
    check_environment_variables()
    check_required_packages()
    check_metacat_connection()
    print("All checks passed. Starting the server...")
    start_server()
