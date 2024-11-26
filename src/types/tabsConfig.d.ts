declare module '@/config/tabsConfig.json' {
  interface Category {
    name: string;
    namespace: string;
  }

  interface TabConfig {
    categories: Category[];
  }

  const config: {
    [tabName: string]: TabConfig;
  };

  export default config;
}