import axios from 'axios';
import { getStoredToken } from './auth';
import appConfigs from '@/config/appConfigs.json';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Add timeout configuration
const API_TIMEOUT = appConfigs.api.timeout || 10000; // Default to 10 seconds if not specified

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
// Add query sanitization function
function sanitizeMQLQuery(query: string): string {
  // Remove any potentially harmful characters or SQL injection attempts
  return query.replace(/[;'"\\]/g, '');
}

export async function searchDataSets(query: string, category: string, tab: string, officialOnly: boolean): Promise<{ results: Dataset[], mqlQuery: string }> {
  try {
    const token = getStoredToken();

    const response = await axios.post<ApiResponse<Dataset>>(`${API_URL}/queryDatasets`, 
      { query, category, tab, officialOnly },
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
  } catch (error) {
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
 * @returns {Promise<{ files: File[], mqlQuery: string }>} A promise that resolves with an array of files and the MQL query.
 */
export async function searchFiles(namespace: string, name: string): Promise<{ files: File[], mqlQuery: string }> {
  try {
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
    // Return an empty array in case of error to prevent breaking the UI
    return {
      files: [],
      mqlQuery: ''
    };
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
    await axios.post(`${API_URL}/recordDatasetAccess`, 
      { namespace, name },
      { 
        headers: { Authorization: `Bearer ${getStoredToken()}` },
        timeout: API_TIMEOUT
      }
    );
  } catch (error) {
    console.error('Error recording dataset access:', error);
  }
}

/**
 * Retrieve dataset access statistics from backend
 * 
 * @returns An object containing dataset access statistics
 */
export async function getDatasetAccessStats(): Promise<{ [key: string]: { timesAccessed: number; lastAccessed: string } }> {
  try {
    const response = await axios.get(`${API_URL}/getDatasetAccessStats`, {
      headers: { Authorization: `Bearer ${getStoredToken()}` },
      timeout: API_TIMEOUT
    });

    return response.data.success ? response.data.stats : {};
  } catch (error) {
    console.error('Error retrieving dataset access stats:', error);
    return {};
  }
}