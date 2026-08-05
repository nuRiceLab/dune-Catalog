"""
condb_router.py — FastAPI router for looking up a run's conditions record
Endpoint:
  POST /runConditions  {folder?, run}  -> {success, results: {...}}
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.backend import auth
from src.lib.condb_api import (
    ConditionsDBAPI, KNOWN_FOLDERS, DEFAULT_FOLDER, FIELD_METADATA, CANONICAL_FIELDS,
)

router = APIRouter(tags=["conditions-db"])
condb_api = ConditionsDBAPI()


def _build_preview(folder: str, results: dict) -> dict:
    """
    Folder-agnostic preview: for each canonical concept (run type, beam
    momentum, etc.), resolve this folder's actual column name via
    CANONICAL_FIELDS, then pull its value/label/unit. This is what lets the
    UI show a consistent preview regardless of whether the raw column is
    named e.g. beam_setmomentum (HD) or beam_momentum_set (VD).
    """
    meta = FIELD_METADATA.get(folder, {})
    preview = {}
    for canonical_key, per_folder in CANONICAL_FIELDS.items():
        raw_key = per_folder.get(folder)
        if raw_key is None or raw_key not in results:
            continue
        field_meta = meta.get(raw_key, {})
        preview[canonical_key] = {
            "label": field_meta.get("label", raw_key),
            "unit": field_meta.get("unit"),
            "value": results[raw_key],
            "raw_key": raw_key,
        }
    return preview


class RunSearchCondition(BaseModel):
    field: str   # canonical field name, e.g. "beam_momentum_set", "start_time"
    op: str      # one of <, <=, =, !=, >=, >
    value: float | int | str


class RunSearchRequest(BaseModel):
    folder: str | None = None
    conditions: list[RunSearchCondition]


ALLOWED_OPS = {"<", "<=", "=", "!=", ">=", ">"}


@router.post("/searchRuns")
def search_runs(
    request: RunSearchRequest,
    user: auth.UserInfo = Depends(auth.get_current_user),
):
    """
    Search for runs matching one or more conditions on canonical fields
    (e.g. beam momentum range, start/stop time range). Canonical fields are
    resolved to the folder's actual column name via CANONICAL_FIELDS, so
    the same request shape works for HD and VD despite their differing
    column names.
    """
    folder = request.folder or DEFAULT_FOLDER
    resolved: list[tuple[str, str, object]] = []
    for cond in request.conditions:
        if cond.op not in ALLOWED_OPS:
            raise HTTPException(400, f"Invalid operator: {cond.op}")
        raw_col = CANONICAL_FIELDS.get(cond.field, {}).get(folder)
        if raw_col is None:
            raise HTTPException(
                400, f"Field '{cond.field}' is not available for this folder"
            )
        resolved.append((raw_col, cond.op, cond.value))

    result = condb_api.search_runs(folder, resolved)
    if not result["success"]:
        raise HTTPException(502, result.get("message", "Conditions DB search failed"))

    runs = [
        {"results": row, "preview": _build_preview(folder, row)}
        for row in result["results"]
    ]
    return {
        "success": True,
        "runs": runs,
        "truncated": result.get("truncated", False),
        "folder": folder,
        "field_metadata": FIELD_METADATA.get(folder, {}),
    }


class RunConditionsRequest(BaseModel):
    run: int
    folder: str | None = None  # defaults to DEFAULT_FOLDER if omitted


@router.get("/runConditions/folders")
def list_condb_folders(user: auth.UserInfo = Depends(auth.get_current_user)):
    """Known ConDB folders, for populating the folder picker in the UI."""
    return {
        "folders": [
            {"folder": key, **meta} for key, meta in KNOWN_FOLDERS.items()
        ],
        "default": DEFAULT_FOLDER,
    }


@router.post("/runConditions")
def get_run_conditions(
    request: RunConditionsRequest,
    user: auth.UserInfo = Depends(auth.get_current_user),
):
    """
    Fetch the full conditions record for a single run number.

    Returns:
        {"success": True, "results": {...}, "folder": ..., "namespace": ...}
    Raises:
        HTTPException 404 if the run has no conditions record, 500 on error.
    """
    folder = request.folder or DEFAULT_FOLDER
    result = condb_api.get_run_conditions(folder, request.run)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result.get("message", "Run not found"))

    return {
        "success": True,
        "results": result["results"],
        "preview": _build_preview(folder, result["results"]),
        "field_metadata": FIELD_METADATA.get(folder, {}),
        "folder": folder,
        "namespace": KNOWN_FOLDERS.get(folder, {}).get("namespace"),
    }
