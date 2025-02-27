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
  const response = await fetch(`/api/admin/configs?file=${filename}`, {
    method: 'GET',
    headers: {
      'X-Username': getCurrentUser() || '',
      'Accept': 'application/json'
    },
    credentials: 'same-origin'
  });
  
  if (!response.ok) {
    console.error('Failed to load config:', await response.text());
    throw new Error(`Error loading configuration: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Save configuration data to the admin API
 * @param filename The configuration file to update
 * @param data The new configuration data
 * @returns The API response
 */
export async function saveConfigData(filename: string, data: any) {
  const response = await fetch(`/api/admin/configs?file=${filename}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Username': getCurrentUser() || '',
      'Accept': 'application/json'
    },
    credentials: 'same-origin',
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    console.error('Failed to save config:', await response.text());
    throw new Error(`Error saving configuration: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Get a list of all available configuration files
 * @returns Array of configuration filenames
 */
export async function listConfigFiles() {
  const response = await fetch(`/api/admin/configs?list=true`, {
    method: 'GET',
    headers: {
      'X-Username': getCurrentUser() || '',
      'Accept': 'application/json'
    },
    credentials: 'same-origin'
  });
  
  if (!response.ok) {
    console.error('Failed to list configs:', await response.text());
    throw new Error(`Error listing configurations: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.configFiles;
}

// Common config filenames for convenience
export const CONFIG_FILES = {
  APP_CONFIG: 'config.json',
  ADMINS: 'admins.json',
  DATASET_ACCESS: 'dataset_access.json',
  HELP_CONTENT: 'help_content.json'
};
