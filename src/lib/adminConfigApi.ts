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
  console.log('Fetching config file:', filename);
  
  // Use app directory route path
  const path = './api/admin/configs';
  const url = `${path}?file=${encodeURIComponent(filename)}`;
  
  console.log('Request URL:', url);
  console.log('Current user:', getCurrentUser());
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Username': getCurrentUser() || '',
      'Accept': 'application/json'
    }
  });
  
  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to load config:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      url
    });
    throw new Error(`Error loading configuration: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('Config data loaded successfully');
  return data;
}

/**
 * Save configuration data to the admin API
 * @param filename The configuration file to update
 * @param data The new configuration data
 * @returns The API response
 */
export async function saveConfigData(filename: string, data: any) {
  console.log('Saving config file:', filename);
  
  // Use app directory route path
  const path = './api/admin/configs';
  const url = `${path}?file=${encodeURIComponent(filename)}`;
  
  console.log('Request URL:', url);
  console.log('Request data:', data);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Username': getCurrentUser() || '',
      'Accept': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  console.log('Response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to save config:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      url
    });
    throw new Error(`Error saving configuration: ${response.statusText}`);
  }
  
  const result = await response.json();
  console.log('Config saved successfully');
  return result;
}

/**
 * Get a list of all available configuration files
 * @returns Array of configuration filenames
 */
export async function listConfigFiles() {
  console.log('Listing config files');
  
  // Use app directory route path
  const path = './api/admin/configs';
  const url = `${path}?list=true`;
  
  console.log('Request URL:', url);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Username': getCurrentUser() || '',
      'Accept': 'application/json'
    }
  });
  
  console.log('Response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to list configs:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      url
    });
    throw new Error(`Error listing configurations: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('Config list loaded successfully:', data.configFiles);
  return data.configFiles;
}

// Common config filenames for convenience
export const CONFIG_FILES = {
  APP_CONFIG: 'config.json',
  ADMINS: 'admins.json',
  DATASET_ACCESS: 'dataset_access.json',
  HELP_CONTENT: 'help_content.json'
};
