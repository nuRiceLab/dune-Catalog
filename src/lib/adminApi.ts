import { getStoredToken } from '@/lib/auth';

/**
 * Helper functions to interact with the unified admin config API
 */

/**
 * Get configuration data from the admin API
 * @param filename The configuration file to retrieve
 * @returns The configuration data
 */
export async function getConfigData(filename: string) {
  const token = getStoredToken();
  
  if (!token) {
    throw new Error('Authentication required');
  }
  
  // Use the backend endpoint instead of Next.js API route
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const response = await fetch(`${apiUrl}/admin/config?file=${filename}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
      // No need to send X-Username header as the server will extract it from the token
    }
  });
  
  if (!response.ok) {
    throw new Error(`Error loading configuration: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.data; // The backend returns data inside a data property
}

/**
 * Save configuration data to the admin API
 * @param filename The configuration file to update
 * @param data The data to save
 * @returns The API response
 */
export async function saveConfigData(filename: string, data: Record<string, unknown>) {
  const token = getStoredToken();
  
  if (!token) {
    throw new Error('Authentication required');
  }
  
  // Use the backend endpoint instead of Next.js API route
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const response = await fetch(`${apiUrl}/admin/config?file=${filename}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ data }) // Wrap data in a data property as expected by the backend
  });
  
  if (!response.ok) {
    throw new Error(`Error saving configuration: ${response.statusText}`);
  }
  
  const responseData = await response.json();
  return responseData;
}

/**
 * Get a list of all available configuration files
 * @returns Array of configuration filenames
 */
export async function listConfigFiles() {
  const token = getStoredToken();
  
  if (!token) {
    throw new Error('Authentication required');
  }
  
  // Use the backend endpoint instead of Next.js API route
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const response = await fetch(`${apiUrl}/admin/config?list=true`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
      // No need to send X-Username header as the server will extract it from the token
    }
  });
  
  if (!response.ok) {
    throw new Error(`Error listing configuration files: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.configFiles;
}

// Common config filenames for convenience
export const CONFIG_FILES = {
  APP_CONFIG: 'config.json',
  ADMINS: 'admins.json',
  DATASET_ACCESS: 'dataset_access_stats.json',
  HELP_CONTENT: 'helpContent.json'
};
