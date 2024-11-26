from datetime import datetime
from metacat.webapi import MetaCatClient
import os


def format_timestamp(timestamp):
    if timestamp:
        return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
    return ''


class MetaCatAPI:
    def __init__(self):
        self.client = MetaCatClient(
            os.getenv('METACAT_SERVER_URL'),
            os.getenv('METACAT_AUTH_SERVER_URL')
        )

    def login(self, username, password):
        try:
            token = self.client.login_password(username, password)
            return {"success": True, "token": token}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def query(self, query_text, category, tab):
        try:
            # Define namespace mappings
            namespace_mapping = {
                ("Far Detectors", "FD-HD"): "fardet-hd",
                ("Far Detectors", "FD-VD"): "fardet-vd",
                ("Protodune-HD", "Data"): "hd-protodune",
                ("Protodune-HD", "MC"): "hd-protodune",
                ("ProtoDune-VD", "Data"): "vd-protodune",
                ("ProtoDune-VD", "MC"): "vd-protodune",
                ("Near Detector Prototypes", "M 2x2 Data"): "neardet-2x2",
                ("Near Detector Prototypes", "M 2x2 MC"): "neardet-2x2",
            }

            # Get the namespace based on tab and category
            namespace = namespace_mapping.get((tab, category), "")

            if not namespace:
                raise ValueError(f"No matching namespace found for tab '{tab}' and category '{category}'")

            # Construct the base MQL query
            mql_query = f"datasets matching {namespace}:*"

            # Add search condition if query_text is provided
            if query_text:
                # Escape single quotes in the query_text
                escaped_query = query_text.replace("'", "\\'")
                mql_query += f" having name like '%{escaped_query}%'"

            print(f"Executing MQL query: {mql_query}")  # Debug print

            results = self.client.query(mql_query)
            # print("Raw query results:")
            raw_results = list(results)  # Convert generator to list
            # for result in raw_results:
            #     print(result)  # Print each raw result

            formatted_results = [
                {
                    "name": result.get("name", ""),
                    "creator": result.get("creator", ""),
                    "created": format_timestamp(result.get("created_timestamp", "")),
                    "files": result.get("file_count", 0)
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
        # This method is used for connection testing
        try:
            datasets = self.client.list_datasets()
            return {"success": True, "datasets": datasets}
        except Exception as e:
            return {"success": False, "message": str(e)}
