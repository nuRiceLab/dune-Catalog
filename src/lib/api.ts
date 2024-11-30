import axios from 'axios';
import { getStoredToken } from './auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export interface Dataset {
  name: string;
  creator: string;
  created: number; // unix timestamp
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


export async function searchDataSets(query: string, category: string, tab: string, officialOnly: boolean): Promise<Dataset[]> {
  try {
    console.log('API Request:', { query, category, tab, officialOnly });
    const token = getStoredToken();
    const response = await axios.post(`${API_URL}/queryDatasets`,
        { query, category, tab, officialOnly },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('API Response:', response.data);
    return response.data.results;
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}

export async function searchFiles(namespace: string, name: string): Promise<File[]> {
  try {
    console.log('File Request:', { namespace, name });
    const token = getStoredToken();
    const response = await axios.post(`${API_URL}/queryFiles`,
        { name, namespace },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('API Response:', response.data);
    return response.data.files;
  } catch (error) {
    // console.error('Search failed:', error);
    throw error;
  }
}