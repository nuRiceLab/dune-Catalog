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
 * - /api/admin/config?file=config.json - Returns specific config file
 * - /api/admin/config?list=true - Lists all available config files
 */
export async function GET(request: NextRequest) {
  try {
    // Validate admin permissions
    const isAdmin = isAuthorized(request);
    
    if (!isAdmin) {
      return unauthorizedResponse();
    }
    
    // Check if we're listing all config files
    const { searchParams } = new URL(request.url);
    const listMode = searchParams.get('list') === 'true';
    const filename = searchParams.get('file');
    
    if (listMode) {
      // List all config files
      const files = await listConfigFiles();
      
      return NextResponse.json({ 
        success: true, 
        configFiles: files 
      });
    }
    
    // Get specific config file
    if (!filename) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing filename parameter' 
      }, { status: 400 });
    }
    
    // Add .json extension if not present
    const filenameWithExt = filename.endsWith('.json') ? filename : `${filename}.json`;
    
    // Read the config file
    const configData = await readConfigFile(filenameWithExt);
    
    if (configData === null) {
      return NextResponse.json(
        { error: `Config file not found: ${filenameWithExt}` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(configData);
    
  } catch (error) {
    console.error('[API:GET] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
  try {
    // Validate admin permissions
    const isAdmin = isAuthorized(request);
    
    if (!isAdmin) {
      return unauthorizedResponse();
    }
    
    // Get filename from query params
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('file');
    
    if (!filename) {
      return NextResponse.json(
        { error: 'Missing filename parameter' },
        { status: 400 }
      );
    }
    
    // Add .json extension if not present
    const filenameWithExt = filename.endsWith('.json') ? filename : `${filename}.json`;
    
    // Parse request body
    let data;
    try {
      data = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON data' },
        { status: 400 }
      );
    }
    
    // Write data to config file
    const success = await writeConfigFile(filenameWithExt, data);
    
    if (!success) {
      return NextResponse.json(
        { error: `Failed to write config file: ${filenameWithExt}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: `Config file ${filenameWithExt} updated successfully` 
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
