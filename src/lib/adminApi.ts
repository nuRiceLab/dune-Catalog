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
    return false;
  }
  
  // Check if user is admin using the username from headers
  const isAdmin = isUserAdmin(username);
  return isAdmin;
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
      return null;
    }
    
    // Read and parse the file
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    try {
      const parsedData = JSON.parse(fileContent);
      return parsedData;
    } catch (parseError) {
      return null;
    }
  } catch (error) {
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
    }
    
    // Write the new content
    const jsonString = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonString, 'utf-8');
    return true;
  } catch (error) {
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
    
    // Filter to only include .json files
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    return jsonFiles;
  } catch (error) {
    return null;
  }
}
