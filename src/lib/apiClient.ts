import axios from 'axios';

/**
 * Shared axios instance for talking to the FastAPI backend.
 *
 * `withCredentials: true` ensures the httpOnly CILogon session cookie
 * (`dunecat_token`) is sent with every request, which is how the backend
 * authenticates the user (see src/backend/auth.py). Anonymous endpoints
 * (dataset/file search) work fine through this client too.
 */
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});
