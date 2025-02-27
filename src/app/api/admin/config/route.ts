import { NextRequest, NextResponse } from "next/server";
import { 
  isAuthorized, 
  unauthorizedResponse,
  readConfigFile,
  writeConfigFile,
  listConfigFiles
} from '@/lib/adminConfigServer';

/**
 * GET handler - Retrieve configuration data
 * 
 * Usage:
 * - /api/admin/config?file=config.json - Returns specific config file
 * - /api/admin/config?list=true - Lists all available config files
 */
export async function GET(request: NextRequest) {
  console.log('GET request received for config endpoint');
  
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
    console.error('Error handling config GET request:', error);
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
 * - /api/admin/config?file=config.json - Updates specific config file
 */
export async function POST(request: NextRequest) {
  console.log('POST request received for config endpoint');
  
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
    
    // Get request body
    const data = await request.json();
    
    // Update the configuration file
    console.log(`Updating config file: ${fileParam}`);
    const success = await writeConfigFile(fileParam, data);
    
    if (!success) {
      return NextResponse.json(
        { error: `Failed to update configuration file: ${fileParam}` }, 
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error handling config POST request:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}
