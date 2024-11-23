
interface LoginCredentials {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  message?: string;
}

const mockLogin = async (credentials: LoginCredentials): Promise<LoginResponse> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // For simulation, let's consider any non-empty username and password as valid
  if (credentials.username.trim() && credentials.password.trim()) {
    return {
      success: true,
      token: 'mock-jwt-token',
      message: 'Login successful'
    };
  } else {
    return {
      success: false,
      message: 'Invalid username or password'
    };
  }
};

export { mockLogin };