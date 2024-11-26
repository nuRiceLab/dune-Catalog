import axios from 'axios';
import { getStoredToken } from './auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export interface Result {
  name: string;
  creator: string;
  created: number; // unix timestamp
  files: number;
}

export async function searchData(query: string, category: string, tab: string): Promise<Result[]> {
  try {
    console.log('API Request:', { query, category, tab });
    const token = getStoredToken();
    const response = await axios.post(`${API_URL}/query`,
        { query, category, tab },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('API Response:', response.data);
    return response.data.results;
  } catch (error) {
    // console.error('Search failed:', error);
    throw error;
  }
}