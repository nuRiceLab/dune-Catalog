declare module '@/config/config.json' {
  interface Category {
    name: string;
    namespace: string;
  }

  interface TabConfig {
    categories: Category[];
  }

  interface SavedSearch {
    name: string;
    tab: string;
    category: string;
    query: string;
    officialOnly: boolean;
  }

  interface AppConfig {
    search: {
      cooldownTime: number;
    };
    files: {
      maxToShow: number;
    };
    api: {
      timeout: number;
    };
    info: {
      lastUpdated: string;
    };
  }

  const config: {
    app: AppConfig;
    savedSearches: SavedSearch[];
    tabs: {
      [tabName: string]: TabConfig;
    };
  };

  export default config;
}
