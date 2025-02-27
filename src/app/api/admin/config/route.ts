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
  console.log('[API:GET] Request received for unified config endpoint');
  
  try {
    // Validate admin permissions
    const isAdmin = isAuthorized(request);
    console.log(`[API:GET] Authorization check result: ${isAdmin}`);
    
    if (!isAdmin) {
      console.log('[API:GET] Unauthorized access attempt');
      return unauthorizedResponse();
    }
    
    // Check if we're listing all config files
    const { searchParams } = new URL(request.url);
    const listMode = searchParams.get('list') === 'true';
    const filename = searchParams.get('file');
    
    console.log(`[API:GET] Request params - listMode: ${listMode}, filename: ${filename}`);
    
    if (listMode) {
      // List all config files
      console.log('[API:GET] Listing all config files');
      const files = await listConfigFiles();
      console.log(`[API:GET] Found ${files?.length || 0} config files:`, files);
      
      return NextResponse.json({ 
        success: true, 
        configFiles: files 
      });
    }
    
    // Get specific config file
    if (!filename) {
      console.log('[API:GET] Missing filename parameter');
      return NextResponse.json(
        { error: 'Missing filename parameter' },
        { status: 400 }
      );
    }
    
    // Add .json extension if not present
    const filenameWithExt = filename.endsWith('.json') ? filename : `${filename}.json`;
    console.log(`[API:GET] Retrieving config file: ${filenameWithExt}`);
    
    // Read the config file
    const configData = await readConfigFile(filenameWithExt);
    
    if (configData === null) {
      console.log(`[API:GET] Config file not found: ${filenameWithExt}`);
      return NextResponse.json(
        { error: `Config file not found: ${filenameWithExt}` },
        { status: 404 }
      );
    }
    
    console.log(`[API:GET] Successfully retrieved config file: ${filenameWithExt}`);
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
 * - /api/admin/configs?file=config.json - Updates specific config file
 */
export async function POST(request: NextRequest) {
  console.log('[API:POST] Request received for unified config endpoint');
  
  try {
    // Validate admin permissions
    const isAdmin = isAuthorized(request);
    console.log(`[API:POST] Authorization check result: ${isAdmin}`);
    
    if (!isAdmin) {
      console.log('[API:POST] Unauthorized access attempt');
      return unauthorizedResponse();
    }
    
    // Get filename from query params
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('file');
    
    console.log(`[API:POST] Request param - filename: ${filename}`);
    
    if (!filename) {
      console.log('[API:POST] Missing filename parameter');
      return NextResponse.json(
        { error: 'Missing filename parameter' },
        { status: 400 }
      );
    }
    
    // Add .json extension if not present
    const filenameWithExt = filename.endsWith('.json') ? filename : `${filename}.json`;
    console.log(`[API:POST] Updating config file: ${filenameWithExt}`);
    
    // Parse request body
    let data;
    try {
      data = await request.json();
      console.log(`[API:POST] Received data for ${filenameWithExt}:`, data);
    } catch (error) {
      console.error('[API:POST] Invalid JSON data:', error);
      return NextResponse.json(
        { error: 'Invalid JSON data' },
        { status: 400 }
      );
    }
    
    // Write data to config file
    const success = await writeConfigFile(filenameWithExt, data);
    
    if (!success) {
      console.log(`[API:POST] Failed to write config file: ${filenameWithExt}`);
      return NextResponse.json(
        { error: `Failed to write config file: ${filenameWithExt}` },
        { status: 500 }
      );
    }
    
    console.log(`[API:POST] Successfully updated config file: ${filenameWithExt}`);
    return NextResponse.json({ 
      success: true,
      message: `Config file ${filenameWithExt} updated successfully` 
    });
    
  } catch (error) {
    console.error('[API:POST] Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
