from datetime import datetime
from metacat.webapi import MetaCatClient
import os
import json
import re
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Computed dataset sizes are expensive (one MetaCat aggregate query each),
# so cache them briefly. Keyed by "namespace:name" -> (timestamp, bytes).
_dataset_size_cache: dict[str, tuple[float, int]] = {}
_DATASET_SIZE_CACHE_TTL_S = 900  # 15 minutes
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
            logger.info(f"Attempting login for user: {username}")
            logger.info(f"Server URL: {os.getenv('METACAT_SERVER_URL')}")
            logger.info(f"Auth URL: {os.getenv('METACAT_AUTH_SERVER_URL')}")
            authenticated_user, expiration = self.client.login_password(username, password)
            logger.info(f"Login successful for: {authenticated_user}")
            return {
                "success": True,
                "token": authenticated_user,
                "expiration": format_timestamp(expiration)
            }
        except Exception as e:
            logger.error(f"Login failed: {type(e).__name__}: {str(e)}", exc_info=True)
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
                    # Escape the query text for regex use, but let '*' act as
                    # a wildcard (e.g. atmos*reco2*official -> atmos.*reco2.*official)
                    sanitized = query_text.replace("'", "\\'")
                    escaped_query = ".*".join(re.escape(part) for part in sanitized.split("*"))
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
                    "size": int(result.get("total_size", 0) or 0),  # total bytes
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
                    "namespace": str(result.get("namespace", "")),  # Needed for file detail links
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
            
    def get_file_details(self, namespace: str, name: str):
        """
        Get full details for a single file: metadata, checksums, provenance
        (parents/children), and containing datasets.

        Args:
            namespace (str): The file's namespace
            name (str): The file's name

        Returns:
            A dictionary with a boolean "success" key and a dict "results" key,
            or a string "message" key if the lookup fails.
        """
        MAX_RELATIVES = 50  # cap parents/children returned; raw files can have thousands
        try:
            f = self.client.get_file(
                did=f"{namespace}:{name}",
                with_metadata=True,
                with_provenance=True,
                with_datasets=True,
            )
            if f is None:
                return {"success": False, "message": "File not found"}

            def to_refs(items):
                """Normalize provenance entries to {fid, namespace, name} dicts."""
                out = []
                for item in (items or [])[:MAX_RELATIVES]:
                    if isinstance(item, dict):
                        out.append({
                            "fid": str(item.get("fid", "")),
                            "namespace": item.get("namespace"),
                            "name": item.get("name"),
                        })
                    else:  # bare fid string
                        out.append({"fid": str(item), "namespace": None, "name": None})
                return out

            parents = to_refs(f.get("parents"))
            children = to_refs(f.get("children"))

            # Some MetaCat versions return provenance as bare fids; resolve
            # them to human-readable namespace:name with one batch lookup.
            unresolved = [r["fid"] for r in parents + children if not r["name"] and r["fid"]]
            if unresolved:
                try:
                    resolved = self.client.get_files([{"fid": fid} for fid in unresolved])
                    by_fid = {str(r.get("fid")): r for r in (resolved or [])}
                    for ref in parents + children:
                        info = by_fid.get(ref["fid"])
                        if info:
                            ref["namespace"] = info.get("namespace")
                            ref["name"] = info.get("name")
                except Exception as e:
                    logger.warning(f"Provenance name resolution failed: {e}")

            details = {
                "fid": str(f.get("fid", "")),
                "namespace": f.get("namespace", namespace),
                "name": f.get("name", name),
                "size": int(f.get("size", 0) or 0),
                "created": format_timestamp(f.get("created_timestamp")),
                "updated": format_timestamp(f.get("updated_timestamp")),
                "checksums": f.get("checksums") or {},
                "metadata": f.get("metadata") or {},
                "parents": parents,
                "children": children,
                "total_parents": len(f.get("parents") or []),
                "total_children": len(f.get("children") or []),
                "datasets": [
                    {"namespace": d.get("namespace"), "name": d.get("name")}
                    for d in (f.get("datasets") or [])
                    if isinstance(d, dict)
                ],
            }
            return {"success": True, "results": details}
        except Exception as e:
            logger.error(f"get_file_details failed for {namespace}:{name}: {str(e)}")
            return {"success": False, "message": str(e)}

    def get_dataset_sizes(self, datasets):
        """
        Compute total sizes for a list of datasets using MetaCat summary
        file queries: `files from ns:name` with summary="count" returns
        {"count": n, "total_size": nbytes} without listing the files.

        Args:
            datasets: list of {"namespace": ..., "name": ...} dicts

        Returns:
            A dictionary with a boolean "success" key and a "results" dict
            mapping "namespace:name" -> total size in bytes.
        """
        import time
        from concurrent.futures import ThreadPoolExecutor

        def one(ds):
            did = f"{ds['namespace']}:{ds['name']}"
            cached = _dataset_size_cache.get(did)
            if cached and time.time() - cached[0] < _DATASET_SIZE_CACHE_TTL_S:
                return did, cached[1]
            try:
                res = self.client.query(f"files from {did}", summary="count")
                # Depending on client version this is a dict or a 1-element list
                if not isinstance(res, dict):
                    res = list(res)
                    res = res[0] if res else {}
                size = int((res or {}).get("total_size", 0) or 0)
                _dataset_size_cache[did] = (time.time(), size)
                return did, size
            except Exception as e:
                logger.warning(f"Size summary query failed for {did}: {e}")
                return did, 0  # failures are not cached, so a retry recomputes

        try:
            with ThreadPoolExecutor(max_workers=8) as pool:
                sizes = dict(pool.map(one, datasets))
            return {"success": True, "results": sizes}
        except Exception as e:
            logger.error(f"get_dataset_sizes failed: {str(e)}")
            return {"success": False, "message": str(e)}

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
