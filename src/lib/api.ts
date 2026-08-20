import axios from 'axios';
import config from '@/config/config.json';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const API_TIMEOUT = config.app.api.timeout;

// Dataset size aggregates can legitimately take minutes on MetaCat (up to the
// backend's 5-minute per-dataset cap), so they don't use the short default
// request timeout. This client-side timeout sits above the backend's size
// budget so the request waits long enough to receive the computed sizes (or
// the "unavailable" verdict) rather than aborting first; callers additionally
// abort the request when the user navigates away or the result page changes.
const SIZE_REQUEST_TIMEOUT = 6 * 60 * 1000; // 6 minutes

/**
 * True if an error is an aborted/cancelled request (from an AbortController).
 * Callers use this to ignore the expected error that fires when they abort an
 * in-flight request on unmount, navigation, or a superseding search — it is
 * not a real failure and must not overwrite state or trigger a retry.
 */
export function isAbortError(error: unknown): boolean {
  return (
    axios.isCancel(error) ||
    (error instanceof Error && error.name === 'CanceledError') ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

/**
 * True if an error is a timeout: either the client-side request timeout fired
 * (axios ECONNABORTED / ETIMEDOUT) or the backend gave up and returned 504.
 * Distinct from isAbortError, which is a deliberate cancellation.
 */
export function isTimeoutError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return (
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    error.response?.status === 504
  );
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  results?: T[] | T;  // Allow either an array or a single item
  mqlQuery?: string;
}

// Helper function to ensure results are always an array
function normalizeResults<T>(results?: T[] | T): T[] {
  if (!results) return [];
  return Array.isArray(results) ? results : [results];
}

export interface Dataset {
  name: string;
  creator: string;
  created: number;
  files: number;
  size: number;
  namespace: string;
}
export interface File {
  fid: string;
  name: string;
  namespace?: string;
  updated: number;
  created: number;
  size: number;
}

export interface FileRef {
  fid: string;
  namespace: string | null;
  name: string | null;
}

export interface DatasetRef {
  namespace: string;
  name: string;
}

export interface FileDetails {
  fid: string;
  namespace: string;
  name: string;
  size: number;
  created: string;
  updated: string;
  checksums: Record<string, string>;
  metadata: Record<string, unknown>;
  parents: FileRef[];
  children: FileRef[];
  total_parents: number;
  total_children: number;
  datasets: DatasetRef[];
}

// The isAdmin function has been moved to the backend for better security
// Use checkIsAdmin from adminConfigApi.ts or verifyUserIsAdmin from auth.ts instead

function sanitizeMQLQuery(query: string): string {
  if (!query) return '';
  
  // Trim whitespace
  let sanitized = query.trim();
  
  // Remove potentially harmful characters while preserving MQL syntax
  sanitized = sanitized
    .replace(/['"\\]/g, '') // Remove quotes and backslashes for safety
    .replace(/\/\*/g, '') // Remove block comment starts
    .replace(/\*\//g, '') // Remove block comment ends
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/\s+/g, ' '); // Normalize whitespace
    
  // Limit query length to prevent overflow attacks
  // but allow enough space for complex queries with dataset specifications
  return sanitized.slice(0, 2000);
}

/**
 * Searches for datasets matching the given query string.
 *
 * This function sends a POST request to the API with the given `query`, `category`, `tab` and `officialOnly`
 * parameters. The API responds with a JSON object that contains the search results.
 *
 * @param {string} query The query string to search for.
 * @param {string} category The category to search in.
 * @param {string} tab The tab to search in.
 * @param {boolean} officialOnly Whether to search for official datasets only.
 * @param {string} customMql Optional custom MQL query to use directly.
 *
 * @returns {Promise<{ results: Dataset[], mqlQuery: string }>} A promise that resolves with an array of datasets and the MQL query.
 */
export async function searchDataSets(query: string, category: string, tab: string, officialOnly: boolean, customMql?: string, signal?: AbortSignal): Promise<{ results: Dataset[], mqlQuery: string }> {
  try {
    const sanitizedQuery = sanitizeMQLQuery(query);
    // Don't sanitize custom MQL queries to preserve quotes and syntax
    const sanitizedMql = customMql ? customMql.trim().slice(0, 2000) : undefined;

    const response = await axios.post<ApiResponse<Dataset>>(`${API_URL}/queryDatasets`,
      { query: sanitizedQuery, category, tab, officialOnly, customMql: sanitizedMql },
      {
        timeout: API_TIMEOUT,
        withCredentials: true,  // send the CILogon session cookie
        signal  // abort the in-flight request when the caller cancels
      }
    );

    if (!response.data.success) {
      throw new Error(response.data.message || 'Search failed');
    }

    return {
      results: normalizeResults(response.data.results),
      mqlQuery: response.data.mqlQuery || ''
    };
  } catch (error) {
    // Aborted (superseded search / navigation) and timeouts must reach the
    // caller so it can react — ignore the abort, but show a timeout message.
    // Returning empty results here would masquerade as "no datasets found".
    if (isAbortError(error) || isTimeoutError(error)) throw error;
    return {
      results: [],
      mqlQuery: ''
    };
  }
}

/**
 * Searches for files matching the given namespace and name.
 *
 * This function sends a POST request to the API with the given `name` and `namespace`
 * parameters. The API responds with a JSON object that contains the search results.
 *
 * @param {string} namespace The namespace to search in.
 * @param {string} name The name to search for.
 * @returns {Promise<{ files: File[], mqlQuery: string }>}A promise that resolves with an array of files and the MQL query.
 */
export async function searchFiles(namespace: string, name: string, signal?: AbortSignal): Promise<{ files: File[], mqlQuery: string }> {
  try {
    const response = await axios.post<ApiResponse<File>>(`${API_URL}/queryFiles`,
      { name, namespace },
      {
        timeout: API_TIMEOUT,
        withCredentials: true,  // send the CILogon session cookie
        signal  // abort the in-flight request when the caller cancels
      }
    );

    // Ensure the response is valid and has a success status
    if (!response.data.success) {
      throw new Error(response.data.message || 'Search failed');
    }

    // Normalize results, ensuring we always have an array
    const normalizedFiles = normalizeResults(response.data.results)
      .filter(file => file.fid && file.name) // Additional filtering to ensure valid files
      .map(file => ({
        ...file,
        updated: file.updated || 0,
        created: file.created || 0,
        size: file.size || 0
      }));
    return {
      files: normalizedFiles,
      mqlQuery: response.data.mqlQuery || ''
    };
  } catch (error) {
    // An aborted request (dialog closed / navigation) is expected — surface
    // it so the caller can ignore it instead of showing an empty file list.
    if (isAbortError(error)) throw error;
    // Log the error for debugging
    console.error('Error searching files:', error);
    if (axios.isAxiosError(error)) {
      console.error('API Error Details:', {
        status: error.response?.status,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data
        }
      });
    }
    // Return an empty array in case of error to prevent breaking the UI
    return {
      files: [],
      mqlQuery: ''
    };
  }
}

// Store user's location in memory
let cachedUserLocation: string | null = null;

/**
 * Retrieves the user's location and returns it as a string in the format "City, State".
 * The location is cached in memory for future calls to this function.
 * If the user's location cannot be determined, the function returns "Unknown Location".
 *
 * This function uses the Geolocation API to get the user's latitude and longitude,
 * and then uses the Nominatim API to reverse geocode those coordinates into a human-readable location.
 *
 * @returns A string representing the user's location
 */
export async function getUserLocation(): Promise<string> {
    // Return cached location if available
    if (cachedUserLocation) {
        return cachedUserLocation;
    }

    try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });

        const { latitude, longitude } = position.coords;
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
        );
        const data = await response.json();

        // Extract city and state from the address
        const address = data.address;
        let location = '';
        
        if (address.city || address.county) {
            location = address.city || address.county;
            if (address.state) {
                location += `, ${address.state}`;
            }
        } else if (address.state) {
            location = address.state;
        } else {
            location = 'Unknown Location';
        }

        // Cache the location
        cachedUserLocation = location;
        return location;
    } catch (error) {
        console.error('Error getting location:', error);
        return 'Unknown Location';
    }
}

/**
 * Record dataset access via backend
 * 
 * @param namespace The namespace of the dataset
 * @param name The name of the dataset
 */
export async function recordDatasetAccess(namespace: string, name: string, signal?: AbortSignal): Promise<void> {
  try {
    const location = await getUserLocation();
    await axios.post(`${API_URL}/recordDatasetAccess`,
      { namespace, name, location },
      {
        timeout: API_TIMEOUT,
        withCredentials: true,  // send the CILogon session cookie
        signal
      }
    );
  } catch (error) {
    if (isAbortError(error)) return;  // dialog closed before it recorded — fine
    console.error('Error recording dataset access:', error);
  }
}

/**
 * Fetches full details for a single file: metadata, checksums,
 * provenance (parents/children), and containing datasets.
 * Requires the user to be logged in (session cookie is sent).
 */
export async function getFileDetails(namespace: string, name: string, signal?: AbortSignal): Promise<FileDetails> {
  const response = await axios.post<ApiResponse<FileDetails>>(
    `${API_URL}/fileDetails`,
    { namespace, name },
    {
      timeout: API_TIMEOUT,
      withCredentials: true,  // send the CILogon session cookie
      signal  // abort if the user navigates away before it loads
    }
  );
  if (!response.data.success || !response.data.results) {
    throw new Error(response.data.message || 'Failed to load file details');
  }
  return response.data.results as FileDetails;
}

/**
 * Fetches total sizes (bytes) for a batch of datasets (max 25).
 * Returns a map keyed by "namespace:name".
 */
export async function getDatasetSizes(
  datasets: { namespace: string; name: string }[],
  signal?: AbortSignal
): Promise<Record<string, number>> {
  const response = await axios.post<ApiResponse<Record<string, number>>>(
    `${API_URL}/datasetSizes`,
    { datasets },
    {
      // Generous but finite: sizes can take minutes, but must never hang
      // forever. Callers also abort via `signal` on page/result change.
      timeout: SIZE_REQUEST_TIMEOUT,
      withCredentials: true,  // send the CILogon session cookie
      signal
    }
  );
  if (!response.data.success || !response.data.results) {
    throw new Error(response.data.message || 'Failed to load dataset sizes');
  }
  return response.data.results as Record<string, number>;
}

// --- Conditions DB (issue #9, Phase 1) --------------------------------------

export interface CondbFolder {
  folder: string;
  label: string;
  namespace?: string;
}

export interface CondbFieldMeta {
  label: string;
  unit: string | null;
  description: string | null;
}

export interface CondbPreviewEntry {
  label: string;
  unit: string | null;
  value: string | number | boolean | null;
  raw_key: string;
}

export interface RunConditions {
  results: Record<string, string | number | boolean | Record<string, unknown> | null>;
  preview: Record<string, CondbPreviewEntry>;
  fieldMetadata: Record<string, CondbFieldMeta>;
  folder: string;
  namespace: string | null;
}

export async function getCondbFolders(signal?: AbortSignal): Promise<{ folders: CondbFolder[]; default: string }> {
  const response = await axios.get<{ folders: CondbFolder[]; default: string }>(
    `${API_URL}/runConditions/folders`,
    { timeout: API_TIMEOUT, withCredentials: true, signal }
  );
  return response.data;
}

export interface RunSearchCondition {
  field: string;
  op: '<' | '<=' | '=' | '!=' | '>=' | '>';
  value: number | string;
}

export interface RunSearchResult {
  results: Record<string, unknown>;
  preview: Record<string, CondbPreviewEntry>;
}

export async function searchRuns(
  conditions: RunSearchCondition[],
  folder?: string,
  signal?: AbortSignal
): Promise<{ runs: RunSearchResult[]; truncated: boolean; fieldMetadata: Record<string, CondbFieldMeta> }> {
  try {
    const response = await axios.post<{
      success: boolean;
      runs: RunSearchResult[];
      truncated: boolean;
      field_metadata: Record<string, CondbFieldMeta>;
    }>(
      `${API_URL}/searchRuns`,
      { folder, conditions },
      { timeout: API_TIMEOUT, withCredentials: true, signal }
    );
    if (!response.data.success) {
      throw new Error('Search failed');
    }
    return {
      runs: response.data.runs,
      truncated: response.data.truncated,
      fieldMetadata: response.data.field_metadata ?? {},
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (axios.isAxiosError(error) && error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw error;
  }
}

export async function getRunConditions(run: number, folder?: string, signal?: AbortSignal): Promise<RunConditions> {
  try {
    const response = await axios.post<{
      success: boolean;
      results?: Record<string, unknown>;
      preview?: RunConditions['preview'];
      field_metadata?: RunConditions['fieldMetadata'];
      folder: string;
      namespace: string | null;
    }>(
      `${API_URL}/runConditions`,
      { run, folder },
      { timeout: API_TIMEOUT, withCredentials: true, signal }
    );
    if (!response.data.success || !response.data.results) {
      throw new Error('Failed to load run conditions');
    }
    return {
      results: response.data.results as RunConditions['results'],
      preview: response.data.preview ?? {},
      fieldMetadata: response.data.field_metadata ?? {},
      folder: response.data.folder,
      namespace: response.data.namespace,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (axios.isAxiosError(error) && error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw error;
  }
}
