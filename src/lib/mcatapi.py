from datetime import datetime
from metacat.webapi import MetaCatClient
import os
import json
import re


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


with open(os.path.join(os.path.dirname(__file__), '..', 'config', 'tabsConfig.json')) as f:
    tabs_config = json.load(f)


with open(os.path.join(os.path.dirname(__file__), '..', 'config', 'appConfigs.json')) as f:
    app_configs = json.load(f)


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

    def get_datasets(self, query_text, category, tab, official_only):
        """
        Get datasets matching the given query parameters

        Args:
            query_text (str): The text to search for in the dataset names
            category (str): The category to search in
            tab (str): The tab to search in
            official_only (bool): Whether to only search for official datasets

        Returns:
            A dictionary with a boolean "success" key and a list "results" key,
            or a string "message" key if the query fails.
        """
        try:
            # Get the namespace based on tab and category
            namespace = next(
                (cat['namespace'] for cat in tabs_config[tab]['categories'] if cat['name'] == category),
                None
            )
            if not namespace:
                raise ValueError(f"No matching namespace found for tab '{tab}' and category '{category}'")

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

            print(f"Executing MQL query: {mql_query}")  # Debug print

            # Execute the MQL query
            results = self.client.query(mql_query)
            # print("Raw query results:")
            # Convert the generator to a list
            raw_results = list(results)
            # for result in raw_results:
            #     print(result)  # Print each raw result

            # Format the results
            formatted_results = [
                {
                    "name": result.get("name", ""),
                    "creator": result.get("creator", ""),
                    "created": format_timestamp(result.get("created_timestamp", "")),
                    "files": result.get("file_count", 0),
                    "namespace": namespace
                }
                for result in raw_results
            ]
            # print("Formatted query results:")
            # for result in formatted_results:
            #     print(result)  # Print each formatted result
            return {"success": True, "results": formatted_results}
        except Exception as e:
            print(f"Query error: {str(e)}")  # Debug print
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
            max_files = app_configs['filesTable']['maxFilesToShow']
            
            # Construct the MQL query with dynamic limit
            mql_query = f"files from {namespace}:{name} limit {max_files}"
            print(f"Executing MQL query: {mql_query}")  # Debug print

            # Execute the MQL query
            results = self.client.query(mql_query)
            raw_results = list(results)

            # Format the results
            files = [
                {
                    "fid": result.get("fid", ""),  # File id
                    "name": result.get("name", ""),  # File name
                    "updated": format_timestamp(result.get("updated_timestamp", "")),  # Timestamp of last update
                    "created": format_timestamp(result.get("created_timestamp", "")),  # Timestamp of creation
                    "size": result.get("size", result.get("size", 0)),  # File size
                }
                for result in raw_results
            ]

            return {
                "success": True,
                "files": files
            }
        except Exception as e:
            print(f"Error in get_files: {e}")  # Debug print
            return {
                "success": False,
                "message": str(e)
            }
