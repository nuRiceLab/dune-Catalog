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

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  try {
    const response = await axios.post(`${API_URL}/login`, credentials);
    const token = response.data.token;
    localStorage.setItem('metacatToken', token);
    return { success: true, token };
  } catch (error: unknown) {
    console.error('Login failed:', error);

    if (isAxiosError(error)) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        switch (error.response.status) {
          case 400:
            return { success: false, message: 'Invalid credentials. Please check your username and password.' };
          case 401:
            return { success: false, message: 'Unauthorized. Please check your credentials.' };
          case 403:
            return { success: false, message: 'Access forbidden. You may not have the necessary permissions.' };
          case 404:
            return { success: false, message: 'Login service not found. Please try again later.' };
          case 500:
            return { success: false, message: 'Internal server error. Please try again later.' };
          default:
            return { success: false, message: `Server responded with error: ${error.response.data?.detail || error.message}` };
        }
      } else if (error.request) {
        // The request was made but no response was received
        return { success: false, message: 'No response received from server. Please check your internet connection.' };
      } else {
        // Something happened in setting up the request that triggered an Error
        return { success: false, message: `Error setting up the request: ${error.message}` };
      }
    } else if (error instanceof Error) {
      return { success: false, message: `An unexpected error occurred: ${error.message}` };
    } else {
      return { success: false, message: 'An unknown error occurred during login.' };
    }
  }
}

export function logout(): void {
  localStorage.removeItem('metacatToken');
}

export function getStoredToken(): string | null {
  return localStorage.getItem('metacatToken');
}

export function isLoggedIn(): boolean {
  return !!getStoredToken();
}