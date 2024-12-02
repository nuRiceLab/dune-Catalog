import axios from 'axios';
import { getStoredToken } from './auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
 * @returns {Promise<Dataset[]>} A promise that resolves with an array of datasets.
 */
export async function searchDataSets(query: string, category: string, tab: string, officialOnly: boolean): Promise<Dataset[]> {
  try {
    // Log the API request
    console.log('API Request:', { query, category, tab, officialOnly });

    // Get the authentication token
    const token = getStoredToken();

    // Make the API request
    const response = await axios.post(`${API_URL}/queryDatasets`,
      { query, category, tab, officialOnly }
      ,{ headers: { Authorization: `Bearer ${token}` }}
    );

    // Log the API response
    console.log('API Response:', response.data);

    // Return the search results
    return response.data.results;
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
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
 * @returns {Promise<File[]>} A promise that resolves with an array of files.
 */
export async function searchFiles(namespace: string, name: string): Promise<File[]> {
  try {
    console.log('File Request:', { namespace, name });

    // Get the authentication token
    const token = getStoredToken();

    // Make the API request
    const response = await axios.post(`${API_URL}/queryFiles`,
      { name, namespace }
        , { headers: { Authorization: `Bearer ${token}` } }
    );

    // Log the API response
    console.log('API Response:', response.data);

    // Return the search results
    return response.data.files;
  } catch (error) {
    // Log the error
    console.error('Search failed:', error);

    // Throw the error
    throw error;
  }
}