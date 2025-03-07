import axios from 'axios';
import { getStoredToken } from './auth';
import config from '@/config/config.json';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const API_TIMEOUT = config.app.api.timeout; 

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
  namespace: string;
}
export interface File {
  fid: string;
  name: string;
  updated: number;
  created: number;
  size: number;
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
 *
 * @returns {Promise<{ results: Dataset[], mqlQuery: string }>} A promise that resolves with an array of datasets and the MQL query.
 */
export async function searchDataSets(query: string, category: string, tab: string, officialOnly: boolean): Promise<{ results: Dataset[], mqlQuery: string }> {
  try {
    const token = getStoredToken();
    const sanitizedQuery = sanitizeMQLQuery(query);

    const response = await axios.post<ApiResponse<Dataset>>(`${API_URL}/queryDatasets`, 
      { query: sanitizedQuery, category, tab, officialOnly },
      { 
        headers: { Authorization: `Bearer ${token}` },
        timeout: API_TIMEOUT
      }
    );

    if (!response.data.success) {
      throw new Error(response.data.message || 'Search failed');
    }

    return {
      results: normalizeResults(response.data.results),
      mqlQuery: response.data.mqlQuery || ''
    };
  } catch {
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
export async function searchFiles(namespace: string, name: string): Promise<{ files: File[], mqlQuery: string }> {
  try {
    // Prepare to send file search request
    const token = getStoredToken();

    const response = await axios.post<ApiResponse<File>>(`${API_URL}/queryFiles`,
      { name, namespace },
      { 
        headers: { Authorization: `Bearer ${token}` },
        timeout: API_TIMEOUT
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
export async function recordDatasetAccess(namespace: string, name: string): Promise<void> {
  try {
    const location = await getUserLocation();
    await axios.post(`${API_URL}/recordDatasetAccess`, 
      { namespace, name, location },
      { 
        headers: { Authorization: `Bearer ${getStoredToken()}` },
        timeout: API_TIMEOUT
      }
    );
  } catch (error) {
    console.error('Error recording dataset access:', error);
  }
}
