import { NextRequest, NextResponse } from "next/server";
import { 
  isAuthorized, 
  unauthorizedResponse,
  readConfigFile,
  writeConfigFile,
  listConfigFiles
} from '@/lib/adminApi';

/**
 * GET handler - Retrieve configuration data
 * 
 * Usage:
 * - /api/admin/configs?file=config.json - Returns specific config file
 * - /api/admin/configs?list=true - Lists all available config files
 */
export async function GET(request: NextRequest) {
  console.log('GET request received for unified config endpoint');
  
  try {
    // Validate admin permissions
    if (!isAuthorized(request)) {
      console.log('User not authorized for config access');
      return unauthorizedResponse();
    }
    
    // Parse URL parameters
    const url = new URL(request.url);
    const listParam = url.searchParams.get('list');
    const fileParam = url.searchParams.get('file');
    
    // If list parameter is provided, return the list of config files
    if (listParam === 'true') {
      console.log('Listing all config files');
      const configFiles = await listConfigFiles();
      
      if (configFiles === null) {
        return NextResponse.json(
          { error: 'Failed to read configuration directory' }, 
          { status: 500 }
        );
      }
      
      return NextResponse.json({ configFiles });
    }
    
    // If no file specified, return 400 error
    if (!fileParam) {
      console.log('No file parameter specified');
      return NextResponse.json(
        { error: 'Missing file parameter. Use ?file=filename.json' },
        { status: 400 }
      );
    }
    
    // Get the configuration file
    console.log(`Retrieving config file: ${fileParam}`);
    const configData = await readConfigFile(fileParam);
    
    if (configData === null) {
      return NextResponse.json(
        { error: `Configuration file not found: ${fileParam}` }, 
        { status: 404 }
      );
    }
    
    return NextResponse.json(configData);
  } catch (error) {
    console.error('Error handling unified config GET request:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}

/**
 * POST handler - Update configuration data
 * 
 * Usage:
 * - /api/admin/configs?file=config.json - Updates specific config file
 */
export async function POST(request: NextRequest) {
  console.log('POST request received for unified config endpoint');
  
  try {
    // Validate admin permissions
    if (!isAuthorized(request)) {
      console.log('User not authorized for config update');
      return unauthorizedResponse();
    }
    
    // Parse URL parameters
    const url = new URL(request.url);
    const fileParam = url.searchParams.get('file');
    
    // If no file specified, return 400 error
    if (!fileParam) {
      console.log('No file parameter specified for update');
      return NextResponse.json(
        { error: 'Missing file parameter. Use ?file=filename.json' },
        { status: 400 }
      );
    }
    
    // Parse request body
    let configData;
    try {
      configData = await request.json();
    } catch (error) {
      console.log('Invalid JSON in config request body:', error);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    // Validate data format (basic validation)
    if (!configData || typeof configData !== 'object') {
      console.log('Invalid config data format:', configData);
      return NextResponse.json(
        { error: 'Invalid configuration data format. Expected JSON object or array.' }, 
        { status: 400 }
      );
    }
    
    // Write to file
    console.log(`Updating config file: ${fileParam}`);
    const success = await writeConfigFile(fileParam, configData);
    
    if (!success) {
      return NextResponse.json(
        { error: `Failed to write configuration to ${fileParam}` }, 
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Configuration updated successfully in ${fileParam}` 
    });
  } catch (error) {
    console.error('Error handling unified config POST request:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}
