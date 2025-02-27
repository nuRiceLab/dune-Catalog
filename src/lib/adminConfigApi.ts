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
  console.log(`[adminConfigApi] Requesting config file: ${filename}`);
  const username = getCurrentUser();
  console.log(`[adminConfigApi] Current user: ${username}`);
  
  const response = await fetch(`/api/admin/config?file=${filename}`, {
    method: 'GET',
    headers: {
      'X-Username': username || ''
    }
  });
  
  console.log(`[adminConfigApi] Response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    console.error(`[adminConfigApi] Error loading configuration: ${response.statusText}`);
    throw new Error(`Error loading configuration: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`[adminConfigApi] Received data:`, data);
  return data;
}

/**
 * Save configuration data to the admin API
 * @param filename The configuration file to update
 * @param data The data to save
 * @returns The API response
 */
export async function saveConfigData(filename: string, data: any) {
  console.log(`[adminConfigApi] Saving config file: ${filename}`, data);
  const username = getCurrentUser();
  console.log(`[adminConfigApi] Current user: ${username}`);
  
  const response = await fetch(`/api/admin/config?file=${filename}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Username': username || ''
    },
    body: JSON.stringify(data)
  });
  
  console.log(`[adminConfigApi] Save response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    console.error(`[adminConfigApi] Error saving configuration: ${response.statusText}`);
    throw new Error(`Error saving configuration: ${response.statusText}`);
  }
  
  const responseData = await response.json();
  console.log(`[adminConfigApi] Save response data:`, responseData);
  return responseData;
}

/**
 * Get a list of all available configuration files
 * @returns Array of configuration filenames
 */
export async function listConfigFiles() {
  console.log(`[adminConfigApi] Listing all config files`);
  const username = getCurrentUser();
  console.log(`[adminConfigApi] Current user: ${username}`);
  
  const response = await fetch('/api/admin/config?list=true', {
    method: 'GET',
    headers: {
      'X-Username': username || ''
    }
  });
  
  console.log(`[adminConfigApi] List response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    console.error(`[adminConfigApi] Error listing configuration files: ${response.statusText}`);
    throw new Error(`Error listing configuration files: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`[adminConfigApi] List of config files:`, data.configFiles);
  return data.configFiles;
}

// Common config filenames for convenience
export const CONFIG_FILES = {
  APP_CONFIG: 'config.json',
  ADMINS: 'admins.json',
  DATASET_ACCESS: 'dataset_access_stats.json',
  HELP_CONTENT: 'helpContent.json'
};
