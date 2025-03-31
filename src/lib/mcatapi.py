from datetime import datetime
from metacat.webapi import MetaCatClient
import os
import json
import re
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
def format_timestamp(timestamp):
    """
    Format a given timestamp (in seconds) into a human-readable string

    Args:
        timestamp (int): The timestamp (in seconds) to format

    Returns:
        str: The formatted timestamp string
    """
    if timestamp is None:
        return ''
    return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')


with open(os.path.join(os.path.dirname(__file__), '..', 'config', 'config.json')) as f:
    config = json.load(f)
    tabs_config = config['tabs']
    app_configs = config['app']


class MetaCatAPI:
    def __init__(self):
        """
        Initialize the MetaCat API client

        The client is initialized with the server and authentication server URLs
        read from the environment variables METACAT_SERVER_URL and METACAT_AUTH_SERVER_URL
        """
        self.client = MetaCatClient(
            os.getenv('METACAT_SERVER_URL'),
            os.getenv('METACAT_AUTH_SERVER_URL')
        )

    def login(self, username, password):
        try:
            # Attempt to log in to MetaCat using the provided username and password
            token = self.client.login_password(username, password)
            return {"success": True, "token": token}
        except Exception as e:
            # If the login fails, return an error message
            return {"success": False, "message": str(e)}

    def get_datasets(self, query_text, category, tab, official_only, custom_mql=None):
        """
        Get datasets matching the given query parameters

        Args:
            query_text (str): The text to search for in the dataset names
            category (str): The category to search in
            tab (str): The tab to search in
            official_only (bool): Whether to only search for official datasets
            custom_mql (str, optional): Custom MQL query string to use directly

        Returns:
            A dictionary with a boolean "success" key and a list "results" key,
            or a string "message" key if the query fails.
        """
        try:
            # If custom MQL is provided, use it directly
            if custom_mql:
                mql_query = custom_mql
            else:
                # Get the namespace based on tab and category from the consolidated config
                tab_config = tabs_config.get(tab)
                if not tab_config:
                    raise ValueError(f"No matching tab found: '{tab}'")
                
                category_config = next(
                    (cat for cat in tab_config['categories'] if cat['name'] == category),
                    None
                )
                if not category_config:
                    raise ValueError(f"No matching category found for tab '{tab}': '{category}'")
                
                namespace = category_config['namespace']
                
                # Construct the base MQL query
                mql_query = f"datasets matching {namespace}:*"

                having_conditions = []
                # Add search condition if query_text is provided
                if query_text:
                    # Escape the query text for use in the MQL query
                    escaped_query = re.escape(query_text.replace("'", "\\'"))
                    # Add the search condition to the list of conditions
                    having_conditions.append(f"name ~* '(?i){escaped_query}'")

                if official_only:
                    # Add the condition to search for official datasets
                    having_conditions.append("name ~* '(?i)official'")

                if having_conditions:
                    # Add the having clause to the MQL query
                    mql_query += " having " + " and ".join(having_conditions)
            
            print(f"Executing MQL query: {mql_query}")
            # Execute the MQL query
            results = self.client.query(mql_query)
            # Convert the generator to a list
            raw_results = list(results)

            # Format the results
            formatted_results = [
                {
                    "name": result.get("name", ""),
                    "creator": result.get("creator", ""),
                    "created": format_timestamp(result.get("created_timestamp", "")),
                    "files": result.get("file_count", 0),
                    "namespace": result.get("namespace", "")
                }
                for result in raw_results
            ]
            return {
                "success": True, 
                "results": formatted_results,
                "mqlQuery": mql_query  # Include the MQL query in the response
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

    def list_datasets(self):
        """
        List all datasets in MetaCat

        This method is used for connection testing and returns a list of all
        datasets in MetaCat.

        Returns:
            A dictionary with a boolean "success" key and a list "datasets" key,
            or a string "message" key if the query fails.
        """
        try:
            # Get the list of all datasets in MetaCat
            datasets = self.client.list_datasets()
            return {"success": True, "datasets": datasets}
        except Exception as e:
            # If the query fails, return an error message
            return {"success": False, "message": str(e)}

    def get_files(self, namespace: str, name: str):
        """
        Get a list of files in MetaCat matching the given namespace and name

        Args:
            namespace (str): The namespace to search in
            name (str): The name to search for

        Returns:
            A dictionary with a boolean "success" key and a list "files" key,
            or a string "message" key if the query fails.
        """
        try:
            # Get num max files to show from app configs
            max_files = app_configs['files']['maxToShow']
            
            # Construct the MQL query with dynamic limit
            mql_query = f"files from {namespace}:{name} ordered limit {max_files}"
            print(f"  MQL query: {mql_query}")

            # Execute the MQL query
            results = self.client.query(mql_query)
            raw_results = list(results)

            # Format the results
            files = [
                {
                    "fid": str(result.get("fid", "")),  # Ensure fid is a string
                    "name": str(result.get("name", "")),  # Ensure name is a string
                    "updated": format_timestamp(result.get("updated_timestamp", 0)),  # Use 0 as default
                    "created": format_timestamp(result.get("created_timestamp", 0)),  # Use 0 as default
                    "size": int(result.get("size", 0)),  # Ensure size is an integer
                }
                for result in raw_results
            ]

            # Always return a dictionary with files, even if empty
            return {
                "success": True,
                "results": files,
                "mqlQuery": mql_query
            }
        except Exception as e:
            return {
                "success": False,
                "message": str(e)
            }
            
    def get_username(self):
        """
        Returns username and token expiration timestamp.

        Returns:
            str: Username of the authenticated user
        """
        try:
            username, _ = self.client.auth_info()
            return username
        except Exception as e:
            logger.error(f"Failed to get username from token auth_info: {str(e)}")
            return ""
