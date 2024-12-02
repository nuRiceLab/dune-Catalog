import axios, { isAxiosError} from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface LoginCredentials {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  message?: string;
  token?: string;
}

/**
 * Logs a user in to the MetaCat server.
 *
 * @param credentials - The username and password of the user to log in.
 * @returns A promise that resolves with an object containing a success flag,
 *          a message, and optionally a token. The success flag is true if the
 *          login was successful, and false otherwise. The message is a human-readable
 *          string describing the result of the login attempt. If the login was
 *          successful, the token is the JWT token that can be used to authenticate
 *          further requests to the MetaCat server.
 */
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  try {
    const response = await axios.post(`${API_URL}/login`, credentials);
    const { token } = response.data;
    localStorage.setItem('metacatToken', token);
    return { success: true, token };
  } catch (error: unknown) {

    if (isAxiosError(error)) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (error.response) {
        return {
          success: false,
          message: getErrorMessageFromResponseStatus(error.response.status),
        };
      } else if (error.request) {
        // The request was made but no response was received
        return { success: false, message: 'No response received from server. Please check your internet connection.' };
      } else {
        // Something happened in setting up the request that triggered an Error
        return {
          success: false,
          message: `Error setting up the request: ${error.message}`,
        };
      }
    } else if (error instanceof Error) {
      return {
        success: false,
        message: `An unexpected error occurred: ${error.message}`,
      };
    } else {
      return {
        success: false,
        message: 'An unknown error occurred during login.',
      };
    }
  }
}

/**
 * Maps a status code to a human-readable error message.
 *
 * @param status - The status code from the server.
 * @returns A human-readable error message.
 */
function getErrorMessageFromResponseStatus(status: number): string {
  switch (status) {
    case 400:
    case 401:
      return 'Invalid credentials. Please check your username and password.';
    case 403:
      return 'Access forbidden. You may not have the necessary permissions.';
    case 404:
      return 'Login service not found. Please try again later.';
    case 500:
      return 'Internal server error. Please try again later.';
    default:
      return `Server responded with error: ${status}`;
  }
}

/**
 * Removes the stored token from local storage.
 */
export function logout(): void {
  // Remove the stored token from local storage
  localStorage.removeItem('metacatToken');
}

/**
 * Retrieves the stored token from local storage.
 *
 * @returns The stored token, or null if no token is stored.
 */
export function getStoredToken(): string | null {
  return localStorage.getItem('metacatToken');
}

/**
 * Checks if the user is logged in.
 *
 * @returns True if the user is logged in, false otherwise.
 */
export function isLoggedIn(): boolean {
  return !!getStoredToken();
}