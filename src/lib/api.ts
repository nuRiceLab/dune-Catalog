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
  sortBy: string,
  sortOrder: 'asc' | 'desc'
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
  const filteredResults = data.filter((result: Result) =>
    (result.tab === tab) &&
    (result.title.toLowerCase().includes(query.toLowerCase()) ||
     result.category.toLowerCase().includes(query.toLowerCase())) &&
    (category === '' || result.category === category)
  );

// Sort the results
  filteredResults.sort((a: Result, b: Result) => {
    let comparison = 0;
    switch (sortBy) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'date':
        comparison = new Date(b.date).getTime() - new Date(a.date).getTime();
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      default:
        comparison = a.id.localeCompare(b.id); // Default to sort by id
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return filteredResults;
}