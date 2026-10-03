from datetime import datetime
from metacat.webapi import MetaCatClient
import os
import json
import re
import logging
from typing import Callable
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
import threading
import time
from fastapi import HTTPException
from src.backend.cancellable import QueryCancelled
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Computed dataset sizes are expensive (one MetaCat aggregate query each),
# so cache them briefly. Keyed by "namespace:name" -> (timestamp, bytes).
_dataset_size_cache: dict[str, tuple[float, int]] = {}
_DATASET_SIZE_CACHE_TTL_S = 900  # 15 minutes

# Per-request socket timeout for the MetaCat client, in seconds. The client's
# own default is 1800s (30 min), which lets a single stuck request pin a
# worker thread for half an hour. Dataset/file/detail searches are meant to be
# quick, and the frontend reports a timeout to the user at 2 minutes
# (config.app.api.timeout); this socket timeout sits just above that as a
# backstop, so the *client* is normally the one that reports the 2-minute
# "server busy" timeout (and the backend simply cancels on the resulting
# disconnect) rather than this firing first. Overridable via the environment.
METACAT_TIMEOUT_S = float(os.getenv("METACAT_TIMEOUT", "150"))

# Dataset-size aggregates get a longer, separate timeout: they can legitimately
# take minutes on large datasets. If the summary can't finish within this
# window we give up and report the size as unavailable ("n/a") rather than
# waiting indefinitely. Default 5 minutes; overridable via the environment.
METACAT_SIZE_TIMEOUT_S = float(os.getenv("METACAT_SIZE_TIMEOUT", "300"))

# Sentinel size meaning "we tried but couldn't compute it" (e.g. the aggregate
# timed out because the dataset is too large), as opposed to a real 0 bytes.
# The frontend renders this as "n/a" rather than "—".
SIZE_UNAVAILABLE = -1

# ponytail: eight aggregates and at most 32 admitted jobs per worker; scale only
# after measuring upstream capacity. Admission includes running cancelled jobs.
_SIZE_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="dataset-size")
_SIZE_SLOTS = threading.BoundedSemaphore(32)


def _check_cancelled(is_cancelled):
    if is_cancelled():
        raise QueryCancelled()


@contextmanager
def _client(timeout=METACAT_TIMEOUT_S):
    client = MetaCatClient(os.getenv("METACAT_SERVER_URL"),
                          os.getenv("METACAT_AUTH_SERVER_URL"), timeout=timeout)
    # MetaCat 4.1.5 otherwise retries 503s for its default retry budget.
    client.DefaultTimeout = 0
    try:
        yield client
    finally:
        # The client belongs to this operation; LastResponse cannot be replaced
        # by another request. Closing it also releases partially read json-seq.
        response = getattr(client, "LastResponse", None)
        if response is not None:
            response.close()


def _never_cancelled() -> bool:
    """Default cancel predicate for callers that don't pass one."""
    return False
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
    def _consume_query(self, mql_query, is_cancelled, *,
                       timeout=METACAT_TIMEOUT_S, **query_kwargs):
        _check_cancelled(is_cancelled)
        with _client(timeout) as client:
            result = client.query(mql_query, **query_kwargs)
            _check_cancelled(is_cancelled)
            if isinstance(result, dict):
                return result
            rows = []
            for row in result:
                _check_cancelled(is_cancelled)
                rows.append(row)
            return rows

    def get_datasets(self, query_text, category, tab, official_only, custom_mql=None,
                     is_cancelled: Callable[[], bool] = _never_cancelled):
        """
        Get datasets matching the given query parameters

        Args:
            query_text (str): The text to search for in the dataset names
            category (str): The category to search in
            tab (str): The tab to search in
            official_only (bool): Whether to only search for official datasets
            custom_mql (str, optional): Custom MQL query string to use directly
            is_cancelled (callable, optional): predicate polled while streaming
                results; when it returns True the query is aborted and the
                MetaCat connection is closed.

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
            # Execute the MQL query, streaming results and honouring cancellation
            raw_results = self._consume_query(mql_query, is_cancelled)

            # Format the results
            formatted_results = [
                {
                    "name": result.get("name", ""),
                    "creator": result.get("creator", ""),
                    "created": format_timestamp(result.get("created_timestamp", "")),
                    "files": result.get("file_count", 0),
                    "size": int(result["total_size"]) if result.get("total_size") is not None else None,
                    "namespace": result.get("namespace", "")
                }
                for result in raw_results
            ]
            return {
                "success": True, 
                "results": formatted_results,
                "mqlQuery": mql_query  # Include the MQL query in the response
            }
        except QueryCancelled:
            raise
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
            with _client() as client:
                datasets = list(client.list_datasets())
            return {"success": True, "datasets": datasets}
        except Exception as e:
            # If the query fails, return an error message
            return {"success": False, "message": str(e)}

    def get_files(self, namespace: str, name: str,
                  is_cancelled: Callable[[], bool] = _never_cancelled):
        """
        Get a list of files in MetaCat matching the given namespace and name

        Args:
            namespace (str): The namespace to search in
            name (str): The name to search for
            is_cancelled (callable, optional): predicate polled while streaming
                results; when True the query is aborted and the MetaCat
                connection closed.

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

            # Execute the MQL query, streaming results and honouring cancellation
            raw_results = self._consume_query(mql_query, is_cancelled)

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
        except QueryCancelled:
            raise
        except Exception as e:
            return {
                "success": False,
                "message": str(e)
            }
            
    def get_file_details(self, namespace: str, name: str,
                         is_cancelled: Callable[[], bool] = _never_cancelled):
        """
        Get full details for a single file: metadata, checksums, provenance
        (parents/children), and containing datasets.

        Args:
            namespace (str): The file's namespace
            name (str): The file's name
            is_cancelled (callable, optional): predicate checked before the
                secondary provenance-name lookup, so an abandoned request
                doesn't issue that extra MetaCat call.

        Returns:
            A dictionary with a boolean "success" key and a dict "results" key,
            or a string "message" key if the lookup fails.
        """
        MAX_RELATIVES = 50  # cap parents/children returned; raw files can have thousands
        try:
            _check_cancelled(is_cancelled)
            with _client() as client:
                f = client.get_file(
                    did=f"{namespace}:{name}", with_metadata=True,
                    with_provenance=True, with_datasets=True,
                )
            _check_cancelled(is_cancelled)
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
                    _check_cancelled(is_cancelled)
                    with _client() as client:
                        resolved = client.get_files([{"fid": fid} for fid in unresolved])
                        by_fid = {}
                        for row in resolved or []:
                            _check_cancelled(is_cancelled)
                            by_fid[str(row.get("fid"))] = row
                    for ref in parents + children:
                        info = by_fid.get(ref["fid"])
                        if info:
                            ref["namespace"] = info.get("namespace")
                            ref["name"] = info.get("name")
                except QueryCancelled:
                    raise
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
        except QueryCancelled:
            raise
        except Exception as e:
            logger.error(f"get_file_details failed for {namespace}:{name}: {str(e)}")
            return {"success": False, "message": str(e)}

    def get_dataset_sizes(self, datasets,
                          is_cancelled: Callable[[], bool] = _never_cancelled):
        """
        Compute total sizes for a list of datasets using MetaCat summary
        file queries: `files from ns:name` with summary="count" returns
        {"count": n, "total_size": nbytes} without listing the files.

        Args:
            datasets: list of {"namespace": ..., "name": ...} dicts
            is_cancelled (callable, optional): predicate checked before each
                per-dataset query; once cancelled, no further MetaCat queries
                are issued (so an abandoned page of results stops adding load).

        Returns:
            A dictionary with a boolean "success" key and a "results" dict
            mapping "namespace:name" -> total size in bytes.
        """
        def one(ds):
            _check_cancelled(is_cancelled)
            did = f"{ds['namespace']}:{ds['name']}"
            cached = _dataset_size_cache.get(did)
            if cached and time.time() - cached[0] < _DATASET_SIZE_CACHE_TTL_S:
                return did, cached[1]
            try:
                result = self._consume_query(f"files from {did}", is_cancelled,
                    timeout=METACAT_SIZE_TIMEOUT_S, summary="count")
                if not isinstance(result, dict):
                    result = result[0] if result else {}
                size = int(result["total_size"]) if result.get("total_size") is not None else SIZE_UNAVAILABLE
            except QueryCancelled:
                raise
            except Exception as error:
                logger.warning("Size summary failed for %s: %s", did, error)
                size = SIZE_UNAVAILABLE
            _check_cancelled(is_cancelled)
            _dataset_size_cache[did] = (time.time(), size)
            return did, size

        reserved = 0
        futures = []
        try:
            # Reserve the whole batch before issuing any new upstream query.
            for _ in datasets:
                _check_cancelled(is_cancelled)
                if not _SIZE_SLOTS.acquire(blocking=False):
                    raise HTTPException(503, "Dataset size service is busy; retry later")
                reserved += 1
            for dataset in datasets:
                _check_cancelled(is_cancelled)
                future = _SIZE_POOL.submit(one, dataset)
                futures.append(future)
                future.add_done_callback(lambda done: _SIZE_SLOTS.release())
                reserved -= 1
            pending = set(futures)
            sizes = {}
            while pending:
                _check_cancelled(is_cancelled)
                done, pending = wait(pending, timeout=.05, return_when=FIRST_COMPLETED)
                for future in done:
                    did, size = future.result()
                    sizes[did] = size
            return {"success": True, "results": sizes}
        finally:
            for future in futures:
                future.cancel()
            for _ in range(reserved):
                _SIZE_SLOTS.release()

    def get_username(self):
        """
        Returns username and token expiration timestamp.

        Returns:
            str: Username of the authenticated user
        """
        try:
            with _client() as client:
                username, _ = client.auth_info()
            return username
        except Exception as e:
            logger.error(f"Failed to get username from token auth_info: {str(e)}")
            return ""
