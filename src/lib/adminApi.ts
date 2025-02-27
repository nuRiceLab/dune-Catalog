import { getCurrentUser } from '@/lib/auth';

// Common config filenames for convenience
export const CONFIG_FILES = {
  APP_CONFIG: 'config.json',
  ADMINS: 'admins.json',
  DATASET_ACCESS: 'dataset_access.json',
  HELP_CONTENT: 'help_content.json'
};

/**
 * Frontend API Functions for Admin Configuration
 */

/**
 * Get configuration data from the admin API
 */
export async function getConfigData(filename: string) {
  console.log('Fetching config file:', filename);
  
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const url = `${baseUrl}/api/admin/config?file=${encodeURIComponent(filename)}`;
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
 */
export async function saveConfigData(filename: string, data: any) {
  console.log('Saving config file:', filename);
  
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const url = `${baseUrl}/api/admin/config?file=${encodeURIComponent(filename)}`;
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
 * List all available configuration files
 */
export async function listConfigFiles() {
  console.log('Listing config files');
  
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const url = `${baseUrl}/api/admin/config?list=true`;
  console.log('Request URL:', url);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Username': getCurrentUser() || '',
      'Accept': 'application/json'
    }
  });
  
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
