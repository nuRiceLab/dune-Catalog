'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';  
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import JsonEditor from '@/components/JsonEditor';
import { isUserAdmin } from '@/lib/auth';
import AdminSidebar from '@/components/AdminSidebar';
import { getConfigData, saveConfigData, CONFIG_FILES } from '@/lib/adminApi';

interface AppConfig {
  app: {
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
  };
  savedSearches: {
    name: string;
    tab: string;
    category: string;
    query: string;
    officialOnly: boolean;
  }[];
  tabs: {
    [key: string]: {
      categories: {
        name: string;
        namespace: string;
      }[];
    };
  };
}

export default function AppConfigPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState('app');
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [newTabName, setNewTabName] = useState('');

  // Check admin status on component mount
  useEffect(() => {
    const checkAdminStatus = async () => {
      const isAdmin = await isUserAdmin();
      if (!isAdmin) {
        toast({
          title: "Access Denied",
          description: "You don't have admin privileges to access this page.",
          variant: "destructive"
        });
        router.push('/');
      }
    };
    
    checkAdminStatus();
  }, [router, toast]);

  // Load config data
  const loadConfigData = async () => {
    setIsLoading(true);
    try {
      // Use the unified API endpoint
      const data = await getConfigData(CONFIG_FILES.APP_CONFIG);
      setAppConfig(data);
      setJsonContent(JSON.stringify(data, null, 2));
      setIsLoading(false);
    } catch (error) {
      toast({
        title: "Error Loading Configuration",
        description: "Failed to load configuration data. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    loadConfigData();
  }, []);

  // Save config data
  const saveConfig = async () => {
    if (!appConfig) return;
    
    setSaving(true);
    try {
      // Prepare the config data
      const configData = isJsonMode ? JSON.parse(jsonContent) : appConfig;
      
      // Send to unified API
      await saveConfigData(CONFIG_FILES.APP_CONFIG, configData);
      
      // Update last updated timestamp
      if (!isJsonMode && configData.app && configData.app.info) {
        const updatedConfig = {
          ...configData,
          app: {
            ...configData.app,
            info: {
              ...configData.app.info,
              lastUpdated: new Date().toISOString()
            }
          }
        };
        setAppConfig(updatedConfig);
      }
      
      toast({
        title: "success",
        description: "Configuration saved successfully!",
      });
      setSaving(false);
    } catch (error) {
      toast({
        title: "Error Saving Configuration",
        description: "Failed to save configuration data. Please check your JSON and try again.",
        variant: "destructive",
      });
      setSaving(false);
    }
  };

  // Toggle between form and JSON editor
  const toggleJsonMode = () => {
    if (isJsonMode) {
      // Switching from JSON to form
      try {
        const parsedConfig = JSON.parse(jsonContent);
        setAppConfig(parsedConfig);
        setIsJsonMode(false);
      } catch (error) {
        toast({
          title: 'Invalid JSON',
          description: 'Please correct the JSON format before switching to form mode.',
          variant: 'destructive',
        });
        return;
      }
    } else {
      // Switching from form to JSON
      setJsonContent(JSON.stringify(appConfig, null, 2));
      setIsJsonMode(true);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <AdminSidebar activePage="app-config" />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">App Configuration</h1>
              <p className="text-muted-foreground">
                Manage general settings and default configurations
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                onClick={toggleJsonMode}
              >
                {isJsonMode ? 'Form View' : 'JSON View'}
              </Button>
              <Button 
                variant="default"
                onClick={saveConfig}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading configuration...</span>
            </div>
          ) : (
            <>
              {isJsonMode ? (
                <Card>
                  <CardHeader>
                    <CardTitle>JSON Configuration</CardTitle>
                    <CardDescription>
                      Edit the raw JSON configuration.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <JsonEditor
                      value={jsonContent}
                      onChange={(value) => {
                        setJsonContent(value);
                        try {
                          const parsedConfig = JSON.parse(value);
                          setAppConfig(parsedConfig);
                        } catch (error) {
                          setAppConfig(null);
                        }
                      }}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Tabs defaultValue="app" value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="app">App Settings</TabsTrigger>
                    <TabsTrigger value="searches">Saved Searches</TabsTrigger>
                    <TabsTrigger value="tabs">Tab Configuration</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="app">
                    <Card>
                      <CardHeader>
                        <CardTitle>App Settings</CardTitle>
                        <CardDescription>
                          Configure general application settings
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {appConfig && (
                          <>
                            <div className="space-y-3">
                              <Label htmlFor="cooldownTime">Search Cooldown Time (seconds)</Label>
                              <Input
                                id="cooldownTime"
                                type="number"
                                value={appConfig.app.search.cooldownTime}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value);
                                  setAppConfig({
                                    ...appConfig,
                                    app: {
                                      ...appConfig.app,
                                      search: {
                                        ...appConfig.app.search,
                                        cooldownTime: value
                                      }
                                    }
                                  });
                                }}
                              />
                            </div>
                            
                            <div className="space-y-3">
                              <Label htmlFor="maxToShow">Max Files to Show</Label>
                              <Input
                                id="maxToShow"
                                type="number"
                                value={appConfig.app.files.maxToShow}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value);
                                  setAppConfig({
                                    ...appConfig,
                                    app: {
                                      ...appConfig.app,
                                      files: {
                                        ...appConfig.app.files,
                                        maxToShow: value
                                      }
                                    }
                                  });
                                }}
                              />
                            </div>
                            
                            <div className="space-y-3">
                              <Label htmlFor="apiTimeout">API Timeout (ms)</Label>
                              <Input
                                id="apiTimeout"
                                type="number"
                                value={appConfig.app.api.timeout}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value);
                                  setAppConfig({
                                    ...appConfig,
                                    app: {
                                      ...appConfig.app,
                                      api: {
                                        ...appConfig.app.api,
                                        timeout: value
                                      }
                                    }
                                  });
                                }}
                              />
                            </div>
                            
                            <div className="space-y-3">
                              <Label htmlFor="lastUpdated">Last Updated</Label>
                              <Input
                                id="lastUpdated"
                                value={appConfig.app.info.lastUpdated}
                                onChange={(e) => {
                                  setAppConfig({
                                    ...appConfig,
                                    app: {
                                      ...appConfig.app,
                                      info: {
                                        ...appConfig.app.info,
                                        lastUpdated: e.target.value
                                      }
                                    }
                                  });
                                }}
                              />
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="searches">
                    <Card>
                      <CardHeader>
                        <CardTitle>Saved Searches</CardTitle>
                        <CardDescription>
                          Manage saved searches that appear on the catalog
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {appConfig && (
                          <div className="space-y-4">
                            {appConfig.savedSearches.map((search, index) => (
                              <Card key={index} className="border border-border">
                                <CardHeader className="pb-2">
                                  <div className="flex items-center justify-between">
                                    <CardTitle className="text-base">{search.name}</CardTitle>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        const newSavedSearches = [...appConfig.savedSearches];
                                        newSavedSearches.splice(index, 1);
                                        setAppConfig({
                                          ...appConfig,
                                          savedSearches: newSavedSearches
                                        });
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-3 pt-0">
                                  <div className="space-y-1">
                                    <Label htmlFor={`search-name-${index}`}>Name</Label>
                                    <Input
                                      id={`search-name-${index}`}
                                      value={search.name}
                                      onChange={(e) => {
                                        const newSavedSearches = [...appConfig.savedSearches];
                                        newSavedSearches[index].name = e.target.value;
                                        setAppConfig({
                                          ...appConfig,
                                          savedSearches: newSavedSearches
                                        });
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor={`search-tab-${index}`}>Tab</Label>
                                    <Input
                                      id={`search-tab-${index}`}
                                      value={search.tab}
                                      onChange={(e) => {
                                        const newSavedSearches = [...appConfig.savedSearches];
                                        newSavedSearches[index].tab = e.target.value;
                                        setAppConfig({
                                          ...appConfig,
                                          savedSearches: newSavedSearches
                                        });
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor={`search-category-${index}`}>Category</Label>
                                    <Input
                                      id={`search-category-${index}`}
                                      value={search.category}
                                      onChange={(e) => {
                                        const newSavedSearches = [...appConfig.savedSearches];
                                        newSavedSearches[index].category = e.target.value;
                                        setAppConfig({
                                          ...appConfig,
                                          savedSearches: newSavedSearches
                                        });
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor={`search-query-${index}`}>Query</Label>
                                    <Input
                                      id={`search-query-${index}`}
                                      value={search.query}
                                      onChange={(e) => {
                                        const newSavedSearches = [...appConfig.savedSearches];
                                        newSavedSearches[index].query = e.target.value;
                                        setAppConfig({
                                          ...appConfig,
                                          savedSearches: newSavedSearches
                                        });
                                      }}
                                    />
                                  </div>
                                  <div className="flex items-center space-x-2 pt-2">
                                    <Switch
                                      id={`search-official-${index}`}
                                      checked={search.officialOnly}
                                      onCheckedChange={(checked) => {
                                        const newSavedSearches = [...appConfig.savedSearches];
                                        newSavedSearches[index].officialOnly = checked;
                                        setAppConfig({
                                          ...appConfig,
                                          savedSearches: newSavedSearches
                                        });
                                      }}
                                    />
                                    <Label htmlFor={`search-official-${index}`}>Official Only</Label>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                            
                            <Button 
                              variant="outline" 
                              className="mt-4 w-full"
                              onClick={() => {
                                if (!appConfig) return;
                                
                                setAppConfig({
                                  ...appConfig,
                                  savedSearches: [
                                    ...appConfig.savedSearches,
                                    {
                                      name: "New Saved Search",
                                      tab: "Tab Name",
                                      category: "Category",
                                      query: "",
                                      officialOnly: false
                                    }
                                  ]
                                });
                              }}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add Saved Search
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="tabs">
                    <Card>
                      <CardHeader>
                        <CardTitle>Tab Configuration</CardTitle>
                        <CardDescription>
                          Configure application tabs and their categories (You may need to restart the application to see changes)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="mt-4 mb-4">
                                <div className="flex gap-2">
                                  <Input 
                                    placeholder="New Tab Name"
                                    id="new-tab-name"
                                    value={newTabName || ''}
                                    onChange={(e) => setNewTabName(e.target.value)}
                                  />
                                  <Button 
                                    variant="outline"
                                    onClick={() => {
                                      if (!appConfig || !newTabName?.trim()) return;
                                      
                                      const newTabs = {...appConfig.tabs};
                                      newTabs[newTabName] = {
                                        categories: []
                                      };
                                      
                                      setAppConfig({
                                        ...appConfig,
                                        tabs: newTabs
                                      });
                                      
                                      setNewTabName('');
                                    }}
                                    disabled={!newTabName?.trim()}
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Tab
                                  </Button>
                                </div>
                              </div>
                        {appConfig && (
                          <div className="space-y-4">
                            {Object.entries(appConfig.tabs).map(([tabName, tabConfig], tabIndex) => (
                              <Card key={tabName} className="border border-border">
                                <CardHeader className="pb-2">
                                  <div className="flex items-center justify-between">
                                    <CardTitle className="text-base">{tabName}</CardTitle>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        const newTabs = {...appConfig.tabs};
                                        delete newTabs[tabName];
                                        setAppConfig({
                                          ...appConfig,
                                          tabs: newTabs
                                        });
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                  <div className="space-y-1">
                                    <Label>Categories</Label>
                                    {tabConfig.categories.map((category, catIndex) => (
                                      <div key={catIndex} className="flex flex-col space-y-2 border p-3 rounded-md mt-2">
                                        <div className="flex justify-between items-center">
                                          <span className="font-medium">{category.name}</span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                              const newTabs = {...appConfig.tabs};
                                              const newCategories = [...newTabs[tabName].categories];
                                              newCategories.splice(catIndex, 1);
                                              newTabs[tabName].categories = newCategories;
                                              setAppConfig({
                                                ...appConfig,
                                                tabs: newTabs
                                              });
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                        <div className="space-y-2">
                                          <div className="space-y-1">
                                            <Label htmlFor={`cat-name-${tabIndex}-${catIndex}`}>Name</Label>
                                            <Input
                                              id={`cat-name-${tabIndex}-${catIndex}`}
                                              value={category.name}
                                              onChange={(e) => {
                                                const newTabs = {...appConfig.tabs};
                                                newTabs[tabName].categories[catIndex].name = e.target.value;
                                                setAppConfig({
                                                  ...appConfig,
                                                  tabs: newTabs
                                                });
                                              }}
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <Label htmlFor={`cat-namespace-${tabIndex}-${catIndex}`}>Namespace</Label>
                                            <Input
                                              id={`cat-namespace-${tabIndex}-${catIndex}`}
                                              value={category.namespace}
                                              onChange={(e) => {
                                                const newTabs = {...appConfig.tabs};
                                                newTabs[tabName].categories[catIndex].namespace = e.target.value;
                                                setAppConfig({
                                                  ...appConfig,
                                                  tabs: newTabs
                                                });
                                              }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                    <Button 
                                      variant="outline" 
                                      className="mt-2 w-full"
                                      onClick={() => {
                                        const newTabs = {...appConfig.tabs};
                                        newTabs[tabName].categories.push({
                                          name: "New Category",
                                          namespace: "namespace"
                                        });
                                        setAppConfig({
                                          ...appConfig,
                                          tabs: newTabs
                                        });
                                      }}
                                    >
                                      <Plus className="h-4 w-4 mr-2" />
                                      Add Category
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
