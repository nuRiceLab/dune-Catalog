import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from 'fs';
import path from 'path';
import { isUserAdmin } from '@/lib/auth';

/**
 * Path to the configuration directory
 */
export const CONFIG_PATH = path.join(process.cwd(), 'src', 'config');

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
 * Reads a configuration file from the config directory
 * @param filename - Name of the configuration file
 * @returns The parsed JSON content or null if not found
 */
export async function readConfigFile(filename: string) {
  try {
    const filePath = path.join(CONFIG_PATH, filename);
    console.log('Reading config file from:', filePath);
    
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
    const filePath = path.join(CONFIG_PATH, filename);
    console.log('Writing config file to:', filePath);
    
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
 * Lists all configuration files in the config directory
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
