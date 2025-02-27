import { getCurrentUser } from '@/lib/auth';

/**
 * Helper functions to interact with the unified admin config API
 */

/**
 * Get configuration data from the admin API
 * @param filename The configuration file to retrieve
 * @returns The configuration data
 */
export async function getConfigData(filename: string) {
  const username = getCurrentUser();
  
  const response = await fetch(`/api/admin/config?file=${filename}`, {
    method: 'GET',
    headers: {
      'X-Username': username || ''
    }
  });
  
  if (!response.ok) {
    throw new Error(`Error loading configuration: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Save configuration data to the admin API
 * @param filename The configuration file to update
 * @param data The data to save
 * @returns The API response
 */
export async function saveConfigData(filename: string, data: any) {
  const username = getCurrentUser();
  
  const response = await fetch(`/api/admin/config?file=${filename}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Username': username || ''
    },
    body: JSON.stringify(data)
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
  const username = getCurrentUser();
  
  const response = await fetch('/api/admin/config?list=true', {
    method: 'GET',
    headers: {
      'X-Username': username || ''
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
