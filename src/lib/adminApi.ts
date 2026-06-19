import { apiClient } from '@/lib/apiClient';

/**
 * Helper functions to interact with the unified admin config API.
 *
 * Admin endpoints are gated by the CILogon session cookie (email allowlist) on
 * the backend. `apiClient` sends that cookie automatically via
 * `withCredentials`, so no token handling is needed here.
 */

/**
 * Get configuration data from the admin API
 * @param filename The configuration file to retrieve
 * @returns The configuration data
 */
export async function getConfigData(filename: string) {
  const response = await apiClient.get(`/admin/config`, {
    params: { file: filename },
  });
  return response.data.data; // The backend returns data inside a data property
}

/**
 * Save configuration data to the admin API
 * @param filename The configuration file to update
 * @param data The data to save
 * @returns The API response
 */
export async function saveConfigData(filename: string, data: Record<string, unknown>) {
  const response = await apiClient.post(
    `/admin/config`,
    { data }, // Wrap data in a data property as expected by the backend
    { params: { file: filename } }
  );
  return response.data;
}

/**
 * Get a list of all available configuration files
 * @returns Array of configuration filenames
 */
export async function listConfigFiles() {
  const response = await apiClient.get(`/admin/config`, {
    params: { list: true },
  });
  return response.data.configFiles;
}

// Common config filenames for convenience
export const CONFIG_FILES = {
  APP_CONFIG: 'config.json',
  ADMINS: 'admins.json',
  DATASET_ACCESS: 'dataset_access_stats.json',
  HELP_CONTENT: 'helpContent.json'
};
