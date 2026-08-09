"""
condb_api.py — thin wrapper around the DUNE Conditions DB REST 'get' endpoint.
"""

import ast
import logging
import os

import httpx

logger = logging.getLogger(__name__)

CONDB_BASE_URL = os.environ.get("CONDB_BASE_URL")  # required -- see .env.example

# Known folder -> {label, namespace} pairs. "namespace" is used only to
# prefill the suggested combined query -- confirm it before trusting it,
# and add more folders here as other detectors' folders are identified.
KNOWN_FOLDERS = {
    "pdunesp.run_conditionstest": {
        "label": "ProtoDUNE-HD",
        "namespace": "hd-protodune",  # corrected from protodune-sp now that this folder is confirmed to hold HD data
    },
    "pdunesp.run_conditions_vd": {
        "label": "ProtoDUNE-VD",
        "namespace": "vd-protodune",  # from config.json's ProtoDune-VD categories
    },
}
DEFAULT_FOLDER = "pdunesp.run_conditionstest"


class ConditionsDBAPI:
    def __init__(self, base_url: str = CONDB_BASE_URL, timeout: float = 20.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_run_conditions(self, folder: str, run: int) -> dict:
        """
        Fetch the conditions record for a single run number.

        Args:
            folder: ConDB folder name, e.g. "pdunesp.run_conditionstest"
            run: run number (passed through as ConDB's "t" parameter)

        Returns:
            {"success": True, "results": {<column>: <value>, ...}}
            or {"success": False, "message": ...}
        """
        if not self.base_url:
            return {
                "success": False,
                "message": "Conditions DB is not configured on this server "
                           "(set CONDB_BASE_URL in .env)",
            }
        try:
            resp = httpx.get(
                f"{self.base_url}/get",
                params={"folder": folder, "t": run},
                timeout=self.timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"ConDB request failed for {folder} t={run}: {e}")
            return {"success": False, "message": f"Conditions DB request failed: {e}"}

        text = resp.text.strip()
        if not text:
            return {"success": False, "message": f"No conditions found for run {run}"}

        lines = text.splitlines()
        if len(lines) < 2:
            return {"success": False, "message": f"No conditions found for run {run}"}

        columns = lines[0].split(",")
        data_line = lines[1]

        # The last column (config_files) is a Python dict literal with
        # unquoted commas inside it, e.g. {'np04_daq': '...', 'np04_ssp':
        # '...'}. A generic CSV parser can't tell those commas apart from
        # real delimiters and mis-splits the row. Since config_files is
        # always last, split on only the first len(columns)-1 commas and
        # let everything after that be one field, commas and all.
        values = data_line.split(",", len(columns) - 1)
        if len(values) != len(columns):
            logger.error(
                f"ConDB row for {folder} t={run} has {len(values)} fields, "
                f"expected {len(columns)}"
            )
            return {"success": False, "message": "Could not parse conditions DB response"}

        row = dict(zip(columns, values))
        if len(lines) > 2:
            logger.warning(
                f"ConDB returned {len(lines) - 1} rows for {folder} t={run}; using the first"
            )

        return {"success": True, "results": self._clean_row(row)}

    def search_runs(self, folder: str, conditions: list[tuple[str, str, object]],
                     limit: int = 200) -> dict:
        """
        Search a folder for runs matching column conditions, via ConDB's
        REST /search endpoint -- called directly with httpx rather than
        through the `condb` Python package.

        Why not use condb.ConDBClient.search_data()? Its installed version
        (2.0.0) has a confirmed bug: internally it always runs
        `namedtuple(folder, columns)`, even when as_named_tuples=False and
        the named tuple is never used. namedtuple() validates its type name
        eagerly, and folder names here contain dots (e.g.
        "pdunesp.run_conditionstest"), which aren't valid identifiers -- so
        it raises ValueError on every call, for every folder we have. This
        method replicates the same request the library would have made
        (same URL shape, same condition-encoding), just without going
        through the buggy code path.

        Args:
            folder: ConDB folder name
            conditions: list of (raw_column, op, value) tuples;
                        op in "<", "<=", "=", "!=", ">=", ">"
            limit: safety cap on rows returned

        Returns:
            {"success": True, "results": [{col: val, ...}, ...], "truncated": bool}
            or {"success": False, "message": ...}
        """
        params: list[tuple[str, str]] = [("folder", folder)]
        if not self.base_url:
            return {
                "success": False,
                "message": "Conditions DB is not configured on this server "
                           "(set CONDB_BASE_URL in .env)",
            }
        for column, op, value in conditions:
            if op not in ("<", "<=", "=", "!=", ">=", ">"):
                return {"success": False, "message": f"Invalid operator: {op}"}
            if value is None:
                if op not in ("=", "!="):
                    return {"success": False, "message": f"Unsupported operator {op} for NULL"}
                params.append(("cond", f"{column} {op} null"))
            elif isinstance(value, str):
                if "'" in value:
                    return {"success": False, "message": f"Unsafe string value: {value}"}
                params.append(("cond", f"{column} {op} '{value}'"))
            else:
                params.append(("cond", f"{column} {op} {value}"))

        try:
            resp = httpx.get(f"{self.base_url}/search", params=params, timeout=self.timeout)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"ConDB search failed for {folder}: {e}")
            return {"success": False, "message": f"Conditions DB search failed: {e}"}

        text = resp.text.strip()
        if not text:
            return {"success": True, "results": [], "truncated": False}

        lines = text.splitlines()
        columns = lines[0].split(",")
        results = []
        truncated = False
        for line in lines[1:]:
            if len(results) >= limit:
                truncated = True
                break
            # Same fix as get_run_conditions(): config_files (last column)
            # is a Python dict literal with unquoted commas, so split only
            # on the first len(columns)-1 commas.
            values = line.split(",", len(columns) - 1)
            if len(values) != len(columns):
                logger.warning(
                    f"Skipping malformed search row for {folder}: "
                    f"{len(values)} fields, expected {len(columns)}"
                )
                continue
            results.append(self._clean_row(dict(zip(columns, values))))

        return {"success": True, "results": results, "truncated": truncated}

    @staticmethod
    def _clean_row(row: dict) -> dict:
        cleaned = {}
        for key, value in row.items():
            if value is None or value in ("", "None"):
                cleaned[key] = None
                continue
            if key == "config_files":
                # Single-quoted Python dict literal, not JSON -- literal_eval
                # only, never eval(), and fall back to the raw string on
                # anything that doesn't parse cleanly.
                try:
                    cleaned[key] = ast.literal_eval(value)
                except (ValueError, SyntaxError):
                    cleaned[key] = value
                continue
            # Best-effort numeric coercion so the frontend can format/sort;
            # anything that doesn't parse as a number stays a string.
            try:
                cleaned[key] = float(value) if "." in value else int(value)
            except ValueError:
                cleaned[key] = value
        return cleaned


# Per-folder field metadata: human-readable label, unit, and description for
# each raw column, extracted from the DUNE Conditions DB documentation.
# Used to render friendly labels in the UI instead of raw column names, and
# as the basis for a cross-detector "canonical field" mapping (see
# CANONICAL_FIELDS below) since equivalent quantities are named differently
# per folder -- e.g. HD's beam_setmomentum vs VD's beam_momentum_set.
FIELD_METADATA = {
    "pdunesp.run_conditions_vd": {
        "tv": {"label": "Run number", "unit": None, "description": "Run number"},
        "tr": {"label": "Tr", "unit": "Unix", "description": "Used for versioning"},
        "data_type": {"label": "Data type", "unit": None,
                       "description": "e.g. np02_coldbox or np04_hd"},
        "upload_time": {"label": "Upload time", "unit": "Unix", "description": None},
        "start_time": {"label": "Start time", "unit": "Unix", "description": None},
        "stop_time": {"label": "Stop time", "unit": "Unix", "description": None},
        "run_type": {"label": "Run type", "unit": None, "description": "e.g. PROD"},
        "detector_id": {"label": "Detector ID", "unit": None,
                         "description": "e.g. np02_coldbox, np02-detector, np02_hermes_WIB_conf"},
        "software_version": {"label": "Software version", "unit": None,
                              "description": "e.g. fddaq-v4.4.0-rc3-a9"},
        "data_stream": {"label": "Data stream", "unit": None,
                         "description": "cosmic, physics, or calibration"},
        "data_quality": {"label": "Data quality", "unit": None,
                          "description": "good or bad (offline-assessed run quality)"},
        "ac_couple": {"label": "AC couple", "unit": None, "description": "True or False"},
        "baseline": {"label": "Baseline", "unit": None,
                     "description": "0 = 900 mV; 1 = 200 mV; 2 = 200 mV collection, 900 mV induction"},
        "gain": {"label": "Gain", "unit": "mV/fC",
                  "description": "Options: 14, 25, 7.8, 4.7. VD-COLDBOX-WIEC if coldbox, CRP4-WIEC if detector"},
        "peak_time": {"label": "Peak time", "unit": "us", "description": "Channel peak time selector"},
        "pulser": {"label": "Pulser", "unit": None,
                    "description": "True if the calibration pulser should be enabled"},
        "apas": {"label": "APAs", "unit": None, "description": "List of APAs, e.g. '2,3'"},
        "test_cap": {"label": "Test capacitor", "unit": None, "description": "Enable the test capacitor"},
        "beam_momentum_mean": {"label": "Beam momentum (mean)", "unit": "GeV/c",
                                "description": "Indirectly calculated from magnet MBPL.022.692 current"},
        "beam_momentum_std": {"label": "Beam momentum (std)", "unit": "GeV/c", "description": None},
        "beam_momentum_set": {"label": "Beam momentum (set)", "unit": "GeV/c",
                               "description": "Set beam momentum value for the run"},
        "beam_polarity": {"label": "Beam polarity", "unit": None,
                           "description": "positive or negative, from magnet MBPL.022.692 current"},
        "detector_hv_mean": {"label": "Detector HV (mean)", "unit": "V",
                              "description": "Mean from sensorID 47894774153498 (NP04_DCS_01:Heinz_V)"},
        "detector_hv_std": {"label": "Detector HV (std)", "unit": "V", "description": None},
        "detector_set": {"label": "Detector HV (set)", "unit": "V", "description": "Set HV for the run"},
        "lar_top_temp_mean": {"label": "LAr top temperature (mean)", "unit": None, "description": None},
        "lar_bottom_temp_mean": {"label": "LAr bottom temperature (mean)", "unit": None, "description": None},
        "hv_induction_plane": {"label": "HV induction plane", "unit": "mV", "description": None},
        "hv_collection_plane": {"label": "HV collection plane", "unit": "mV", "description": None},
    },
}

# HD's field metadata. This is the SAME folder already configured above as
# "pdunesp.run_conditionstest" -- its data_type/detector_id values are
# "np04_hd", and its full column set matches this exactly (confirmed via a
# populated-fields screenshot for run 27425 plus the full 43-column schema
# from run 28650 seen earlier). So HD and the originally-configured folder
# are the same thing; no third folder was needed. NOTE: the folder's
# "namespace" above is currently set to "protodune-sp", which is probably
# wrong for HD data -- likely should be "hd-protodune". Flagged, not yet
# changed, pending confirmation.
FIELD_METADATA["pdunesp.run_conditionstest"] = {
    "tv": {"label": "Run number", "unit": None, "description": "Run number"},
    "tr": {"label": "Tr", "unit": "Unix", "description": "Used for versioning"},
    "channel": {"label": "Channel", "unit": None, "description": None},
    "data_type": {"label": "Data type", "unit": None, "description": "e.g. np04_hd"},
    "upload_time": {"label": "Upload time", "unit": "Unix", "description": None},
    "start_time": {"label": "Start time", "unit": "Unix", "description": None},
    "stop_time": {"label": "Stop time", "unit": "Unix", "description": None},
    "run_type": {"label": "Run type", "unit": None, "description": "e.g. PROD"},
    "detector_id": {"label": "Detector ID", "unit": None, "description": "e.g. np04_hd"},
    "software_version": {"label": "Software version", "unit": None,
                          "description": "e.g. fddaq-v4.4.3-a9-1"},
    "ac_couple": {"label": "AC/DC coupling", "unit": None, "description": "e.g. dc_coupling"},
    "baseline": {"label": "Baseline", "unit": None, "description": None},
    "buffering": {"label": "Buffering", "unit": None, "description": None},
    "enabled": {"label": "Enabled", "unit": None, "description": None},
    "gain": {"label": "Gain", "unit": "mV/fC", "description": None},
    "gain_match": {"label": "Gain match", "unit": None, "description": None},
    "leak": {"label": "Leak", "unit": None, "description": None},
    "leak_10x": {"label": "Leak (10x)", "unit": None, "description": None},
    "leak_f": {"label": "Leak (f)", "unit": None, "description": None},
    "peak_time": {"label": "Peak time", "unit": "us", "description": "Channel peak time selector"},
    "pulse_dac": {"label": "Pulse DAC", "unit": None, "description": None},
    "strobe_delay": {"label": "Strobe delay", "unit": None, "description": None},
    "strobe_length": {"label": "Strobe length", "unit": None, "description": None},
    "strobe_skip": {"label": "Strobe skip", "unit": None, "description": None},
    "test_cap": {"label": "Test capacitor", "unit": None, "description": "Enable the test capacitor"},
    "adc_test_pattern": {"label": "ADC test pattern", "unit": None, "description": None},
    "cold": {"label": "Cold", "unit": None, "description": None},
    "detector_type": {"label": "Detector type", "unit": None, "description": "e.g. wib_default"},
    "pulser": {"label": "Pulser", "unit": None,
               "description": "True if the calibration pulser should be enabled"},
    "beam_momentum": {"label": "Beam momentum (measured)", "unit": "GeV/c", "description": None},
    "beam_polarity": {"label": "Beam polarity", "unit": None, "description": "positive or negative"},
    "detector_hv": {"label": "Detector HV (measured)", "unit": "V", "description": None},
    "wire_bias_g": {"label": "Wire bias (grid plane)", "unit": "V", "description": None},
    "wire_bias_u": {"label": "Wire bias (U plane)", "unit": "V", "description": None},
    "wire_bias_x": {"label": "Wire bias (X plane)", "unit": "V", "description": None},
    "lar_purity": {"label": "LAr purity", "unit": None, "description": None},
    "lar_top_temp_mean": {"label": "LAr top temperature (mean)", "unit": None, "description": None},
    "lar_bottom_temp_mean": {"label": "LAr bottom temperature (mean)", "unit": None, "description": None},
    "data_quality": {"label": "Data quality", "unit": None, "description": "good or bad"},
    "detector_hvset": {"label": "Detector HV (set)", "unit": "V", "description": "Set HV for the run"},
    "beam_setmomentum": {"label": "Beam momentum (set)", "unit": "GeV/c",
                          "description": "Set beam momentum value for the run"},
    "data_stream": {"label": "Data stream", "unit": None, "description": "cosmic, physics, or calibration"},
    "config_files": {"label": "Config files", "unit": None, "description": None},
}


# Cross-detector canonical field mapping: the same physical quantity is
# named (and sometimes formatted) differently per folder -- e.g. HD's
# beam_setmomentum vs VD's beam_momentum_set, and HD's detector_hvset
# (no underscore) vs VD's detector_hv_set (underscored). This lets the UI
# show one consistent list of concepts regardless of which folder answered
# the query, and is the basis for a future folder-agnostic run search.
CANONICAL_FIELDS = {
    "run_number":        {"pdunesp.run_conditionstest": "tv",
                           "pdunesp.run_conditions_vd": "tv"},
    "run_type":          {"pdunesp.run_conditionstest": "run_type",
                           "pdunesp.run_conditions_vd": "run_type"},
    "detector_id":       {"pdunesp.run_conditionstest": "detector_id",
                           "pdunesp.run_conditions_vd": "detector_id"},
    "data_stream":       {"pdunesp.run_conditionstest": "data_stream",
                           "pdunesp.run_conditions_vd": "data_stream"},
    "start_time":        {"pdunesp.run_conditionstest": "start_time",
                           "pdunesp.run_conditions_vd": "start_time"},
    "stop_time":         {"pdunesp.run_conditionstest": "stop_time",
                           "pdunesp.run_conditions_vd": "stop_time"},
    "beam_momentum_set": {"pdunesp.run_conditionstest": "beam_setmomentum",
                           "pdunesp.run_conditions_vd": "beam_momentum_set"},
    "beam_polarity":     {"pdunesp.run_conditionstest": "beam_polarity",
                           "pdunesp.run_conditions_vd": "beam_polarity"},
    "detector_hv_set":   {"pdunesp.run_conditionstest": "detector_hvset",
                           "pdunesp.run_conditions_vd": "detector_set"},  # live column, not doc's "detector_hv_set"
    "gain":              {"pdunesp.run_conditionstest": "gain",
                           "pdunesp.run_conditions_vd": "gain"},
    "software_version":  {"pdunesp.run_conditionstest": "software_version",
                           "pdunesp.run_conditions_vd": "software_version"},
}
