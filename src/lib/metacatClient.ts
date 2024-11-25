import axios, { AxiosInstance } from 'axios';

class MetaCatClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_METACAT_API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await this.client.get('/auth/auth', {
        params: { method: 'digest' },
        auth: { username, password },
      });

      if (response.status === 200 && response.headers['set-cookie']) {
        this.token = response.headers['set-cookie'][0];
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  private async authenticatedRequest(method: string, url: string, data?: any): Promise<any> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }
    try {
      const response = await this.client.request({
        method,
        url,
        data,
        headers: {
          'Cookie': this.token,
        },
      });
      return response.data;
    } catch (error) {
      console.error(`Request failed: ${method} ${url}`, error);
      throw error;
    }
  }

  async getDatasets(): Promise<any> {
    return this.authenticatedRequest('GET', '/data/datasets?with_file_counts=yes');
  }

  async getDataset(dataset: string): Promise<any> {
    return this.authenticatedRequest('GET', `/data/dataset?dataset=${encodeURIComponent(dataset)}`);
  }

  async query(query: string, options: {
    namespace?: string,
    withMeta?: boolean,
    withProvenance?: boolean,
    addTo?: string,
    saveAs?: string,
  } = {}): Promise<any> {
    const params = new URLSearchParams({ query });
    if (options.namespace) params.append('namespace', options.namespace);
    if (options.withMeta) params.append('with_meta', 'yes');
    if (options.withProvenance) params.append('with_provenance', 'yes');
    if (options.addTo) params.append('add_to', options.addTo);
    if (options.saveAs) params.append('save_as', options.saveAs);

    return this.authenticatedRequest('GET', `/data/query?${params.toString()}`);
  }
}

export const metacatClient = new MetaCatClient();