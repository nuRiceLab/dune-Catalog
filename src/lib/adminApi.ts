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
  
  console.log(`[adminApi:isAuthorized] Checking authorization for username: ${username}`);
  
  if (!username) {
    console.log('[adminApi:isAuthorized] No username provided in headers');
    return false;
  }
  
  // Check if user is admin using the username from headers
  const isAdmin = isUserAdmin(username);
  console.log(`[adminApi:isAuthorized] User ${username} is admin: ${isAdmin}`);
  return isAdmin;
}

/**
 * Creates a standard unauthorized response
 * @returns NextResponse with 401 status
 */
export function unauthorizedResponse() {
  console.log('[adminApi:unauthorizedResponse] Returning 401 Unauthorized response');
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
  console.log(`[adminApi:readConfigFile] Reading config file: ${filename}`);
  try {
    const filePath = path.join(CONFIG_PATH, filename);
    console.log(`[adminApi:readConfigFile] Full file path: ${filePath}`);
    
    // Check if file exists
    try {
      await fs.access(filePath);
      console.log(`[adminApi:readConfigFile] File exists: ${filePath}`);
    } catch (error) {
      console.log(`[adminApi:readConfigFile] File ${filename} not found:`, error);
      return null;
    }
    
    // Read and parse the file
    const fileContent = await fs.readFile(filePath, 'utf-8');
    console.log(`[adminApi:readConfigFile] File content length: ${fileContent.length} bytes`);
    
    try {
      const parsedData = JSON.parse(fileContent);
      console.log(`[adminApi:readConfigFile] Successfully parsed JSON data`);
      return parsedData;
    } catch (parseError) {
      console.error(`[adminApi:readConfigFile] Error parsing JSON from ${filename}:`, parseError);
      return null;
    }
  } catch (error) {
    console.error(`[adminApi:readConfigFile] Error reading config file ${filename}:`, error);
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
  console.log(`[adminApi:writeConfigFile] Writing to config file: ${filename}`);
  try {
    const filePath = path.join(CONFIG_PATH, filename);
    console.log(`[adminApi:writeConfigFile] Full file path: ${filePath}`);
    
    // Create a backup first
    try {
      const existingContent = await fs.readFile(filePath, 'utf-8');
      const backupPath = `${filePath}.bak`;
      await fs.writeFile(backupPath, existingContent, 'utf-8');
      console.log(`[adminApi:writeConfigFile] Created backup at: ${backupPath}`);
    } catch (error) {
      // If file doesn't exist yet, no need for backup
      console.log(`[adminApi:writeConfigFile] No backup created for ${filename} (likely new file)`);
    }
    
    // Write the new content
    const jsonString = JSON.stringify(data, null, 2);
    console.log(`[adminApi:writeConfigFile] Stringified JSON length: ${jsonString.length} bytes`);
    await fs.writeFile(filePath, jsonString, 'utf-8');
    console.log(`[adminApi:writeConfigFile] Successfully wrote to ${filePath}`);
    return true;
  } catch (error) {
    console.error(`[adminApi:writeConfigFile] Error writing config file ${filename}:`, error);
    return false;
  }
}

/**
 * Lists all configuration files in the config directory
 * @returns Array of filenames or null if error
 */
export async function listConfigFiles(): Promise<string[] | null> {
  console.log(`[adminApi:listConfigFiles] Listing config files in: ${CONFIG_PATH}`);
  try {
    const files = await fs.readdir(CONFIG_PATH);
    console.log(`[adminApi:listConfigFiles] Found ${files.length} files in directory`);
    
    // Filter to only include .json files
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    console.log(`[adminApi:listConfigFiles] Filtered to ${jsonFiles.length} JSON files:`, jsonFiles);
    
    return jsonFiles;
  } catch (error) {
    console.error(`[adminApi:listConfigFiles] Error listing config files:`, error);
    return null;
  }
}
