import mockData from './MockData.json';

export interface Result {
  id: string;
  title: string;
  date: string;
  category: string;
  size: number;
  tab: string;
}

export async function searchData(
    tab: string,
    query: string,
    category: string,
): Promise<Result[]> {
  // Simulate API call delay
  async function fetchMockData(endpoint: string): Promise<Result[]> {
    console.log(`Fetching data from ${endpoint}...`);

    // Simulate network delay
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockData);
      }, 150); // 1 second delay
    });
  }
  const data = await fetchMockData(tab);
  return data.filter((result: Result) =>
      (result.tab === tab) &&
      (result.title.toLowerCase().includes(query.toLowerCase()) ||
          result.category.toLowerCase().includes(query.toLowerCase())) &&
      (category === '' || result.category === category)
  );
}