import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from 'fs';
import path from 'path';
import { isUserAdmin, getCurrentUser } from '@/lib/auth';

/**
 * Path to the configuration directory
 */
export const CONFIG_PATH = path.join(process.cwd(), 'src', 'config');

/**
 * Common config filenames for convenience
 */
export const CONFIG_FILES = {
  APP_CONFIG: 'config.json',
  ADMINS: 'admins.json',
  DATASET_ACCESS: 'dataset_access.json',
  HELP_CONTENT: 'help_content.json'
};

/**
 * Validates if the request is from an authorized admin user
 * @param request - The incoming request object
 * @returns boolean indicating if the user is authorized
 */
export function isAuthorized(request: NextRequest): boolean {
  // Get username from headers (supporting both header formats)
  const username = request.headers.get('X-Username') || request.headers.get('username');
  
  if (!username) {
    console.log('No username provided in headers');
    return false;
  }
  
  // Check if user is admin using the username from headers
  return isUserAdmin(username);
}

/**
 * Creates a standard unauthorized response
 * @returns NextResponse with 401 status
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Unauthorized' }, 
    { status: 401 }
  );
}

/**
 * Get the absolute path to a config file
 */
function getConfigPath(filename: string): string {
  // Ensure the filename has .json extension
  const file = filename.endsWith('.json') ? filename : `${filename}.json`;
  return path.join(CONFIG_PATH, file);
}

/**
 * Read and parse a JSON config file
 */
export async function readConfigFile(filename: string) {
  try {
    const filePath = getConfigPath(filename);
    console.log('Reading config file:', filePath);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      console.error('File not found:', filePath);
      return null;
    }
    
    // Read and parse file
    const fileContent = await fs.readFile(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading config file:', error);
    return null;
  }
}

/**
 * Writes data to a configuration file
 * @param filename - Name of the configuration file
 * @param data - The data to write (will be stringified)
 * @returns boolean indicating success or failure
 */
export async function writeConfigFile(filename: string, data: any): Promise<boolean> {
  try {
    const filePath = getConfigPath(filename);
    console.log('Writing config file:', filePath);
    
    // Create backup of existing file if it exists
    try {
      const backupPath = `${filePath}.bak`;
      await fs.copyFile(filePath, backupPath);
    } catch (error) {
      console.log('No existing file to backup');
    }
    
    // Write new data
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing config file:', error);
    return false;
  }
}

/**
 * List all configuration files in the config directory
 * @returns Array of filenames or null if error
 */
export async function listConfigFiles(): Promise<string[] | null> {
  try {
    console.log('Listing config files from:', CONFIG_PATH);
    const files = await fs.readdir(CONFIG_PATH);
    return files.filter(file => file.endsWith('.json'));
  } catch (error) {
    console.error('Error listing config files:', error);
    return null;
  }
}

/**
 * Frontend API Functions
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
