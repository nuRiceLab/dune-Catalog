import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from 'fs';
import path from 'path';
import { isUserAdmin } from '@/lib/auth';

/**
 * Path to the configuration directory
 */
export const CONFIG_PATH = process.env.NODE_ENV === 'production'
  ? path.join('/opt/dune_catalog', 'src', 'config')  // Production path
  : path.join(process.cwd(), 'src', 'config');       // Development path

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
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      console.log(`File ${filename} not found:`, error);
      return null;
    }
    
    // Read and parse the file
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading config file ${filename}:`, error);
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
    
    // Create a backup first
    try {
      const existingContent = await fs.readFile(filePath, 'utf-8');
      const backupPath = `${filePath}.bak`;
      await fs.writeFile(backupPath, existingContent, 'utf-8');
    } catch (error) {
      // If file doesn't exist yet, no need for backup
      console.log(`No backup created for ${filename} (likely new file)`);
    }
    
    // Write the new content
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Error writing config file ${filename}:`, error);
    return false;
  }
}

/**
 * Lists all configuration files in the config directory
 * @returns Array of filenames or null if error
 */
export async function listConfigFiles(): Promise<string[] | null> {
  try {
    const files = await fs.readdir(CONFIG_PATH);
    return files
      .filter(file => file.endsWith('.json'))
      .filter(file => !file.endsWith('.bak') && !file.endsWith('~')); // Exclude backup files
  } catch (error) {
    console.error('Error reading config directory:', error);
    return null;
  }
}
