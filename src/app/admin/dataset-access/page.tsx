'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isUserAdmin } from '@/lib/auth';
import { useToast } from "@/hooks/use-toast";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Loader2,
  Save
} from "lucide-react";
import dynamic from 'next/dynamic';
import AdminSidebar from '@/components/AdminSidebar';
import { getConfigData, saveConfigData, CONFIG_FILES } from '@/lib/adminApi';

// Dynamically import chart component to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });
const JsonEditor = dynamic(() => import('@/components/JsonEditor'), { ssr: false });

interface DatasetAccessStats {
  [key: string]: {
    timesAccessed: number;
    lastAccessed: string;
    lastLocation?: string;
    locations?: string[];
  };
}

export default function DatasetAccessPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [accessStats, setAccessStats] = useState<DatasetAccessStats>({});
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Redirect non-admin users
  if (typeof window !== 'undefined' && !isUserAdmin()) {
    router.push('/');
    return null;
  }

  useEffect(() => {
    // Fetch dataset access statistics
    const fetchStats = async () => {
      try {
        const data = await getConfigData(CONFIG_FILES.DATASET_ACCESS);
        setAccessStats(data);
        setJsonContent(JSON.stringify(data, null, 2));
      } catch (error) {
        console.error('Error fetching dataset statistics:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load dataset access statistics."
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [toast]);

  // Prepare chart data
  const getChartOptions = () => {
    const datasets = Object.keys(accessStats);
    const accessCounts = datasets.map(ds => accessStats[ds].timesAccessed);
    
    return {
      chart: {
        type: "bar" as const,
        height: 350,
        toolbar: {
          show: false
        },
        foreColor: 'var(--foreground)' // Use CSS variable for text color
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%',
          borderRadius: 4
        },
      },
      dataLabels: {
        enabled: false
      },
      stroke: {
        show: true,
        width: 2,
        colors: ['transparent']
      },
      xaxis: {
        categories: datasets,
        labels: {
          style: {
            colors: 'var(--foreground)' // Use CSS variable for text color
          }
        }
      },
      yaxis: {
        title: {
          text: 'Access Count',
          style: {
            color: 'var(--foreground)' // Use CSS variable for text color
          }
        },
        labels: {
          style: {
            colors: 'var(--foreground)' // Use CSS variable for text color
          }
        }
      },
      fill: {
        opacity: 1,
        colors: ['var(--primary)'] // Use CSS variable for bar color
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: function (val: number) {
            return val + " accesses"
          }
        }
      }
    };
  };

  const getChartSeries = () => {
    const datasets = Object.keys(accessStats);
    const accessCounts = datasets.map(ds => accessStats[ds].timesAccessed);
    
    return [{
      name: 'Access Count',
      data: accessCounts
    }];
  };

  const toggleJsonMode = () => {
    if (isJsonMode) {
      // Switching from JSON to form
      try {
        const parsedData = JSON.parse(jsonContent);
        setAccessStats(parsedData);
        setIsJsonMode(false);
      } catch (error) {
        toast({
          title: 'Invalid JSON',
          description: 'Please correct the JSON format before switching to form mode.',
          variant: 'destructive',
        });
      }
    } else {
      // Switching from form to JSON
      setJsonContent(JSON.stringify(accessStats, null, 2));
      setIsJsonMode(true);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let dataToSave;
      if (isJsonMode) {
        try {
          dataToSave = JSON.parse(jsonContent);
        } catch (error) {
          toast({
            title: 'Invalid JSON',
            description: 'Please correct the JSON format before saving.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      } else {
        dataToSave = accessStats;
      }
      
      await saveConfigData(CONFIG_FILES.DATASET_ACCESS, dataToSave);
      toast({
        title: "Success",
        description: "Dataset access statistics saved successfully."
      });
      
      // Refresh the data
      setAccessStats(dataToSave);
    } catch (error) {
      console.error('Error saving dataset statistics:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save dataset access statistics."
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <AdminSidebar activePage="dataset-access" />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Dataset Access Statistics</h1>
              <p className="text-muted-foreground">
                View and manage statistics about dataset access patterns
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
                onClick={handleSave} 
                disabled={isSaving || isLoading}
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
              <span className="ml-2">Loading statistics...</span>
            </div>
          ) : isJsonMode ? (
            <Card>
              <CardContent className="pt-6">
                <JsonEditor
                  value={jsonContent}
                  onChange={(value) => {
                    setJsonContent(value);
                    try {
                      const parsed = JSON.parse(value);
                      setAccessStats(parsed);
                    } catch (error) {
                      // Invalid JSON, just update the jsonContent
                    }
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Dataset Access Visualization</CardTitle>
                  <CardDescription>
                    Visual representation of dataset access frequency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.keys(accessStats).length > 0 ? (
                    <div className="h-[400px]">
                      {typeof window !== 'undefined' && (
                        <Chart
                          options={getChartOptions()}
                          series={getChartSeries()}
                          type="bar"
                          height={350}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No dataset access data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Access Sources Summary</CardTitle>
                  <CardDescription>
                    Detailed information about dataset access
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.keys(accessStats).length > 0 ? (
                    <div className="space-y-6">
                      {Object.entries(accessStats).map(([dataset, stats]) => (
                        <div key={dataset} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <h3 className="font-semibold text-lg mb-2">{dataset}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-muted-foreground">Times Accessed:</p>
                              <p className="font-medium">{stats.timesAccessed}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Last Accessed:</p>
                              <p className="font-medium">{new Date(stats.lastAccessed).toLocaleString()}</p>
                            </div>
                            {stats.lastLocation && (
                              <div>
                                <p className="text-muted-foreground">Last Location:</p>
                                <p className="font-medium">{stats.lastLocation}</p>
                              </div>
                            )}
                            {stats.locations && stats.locations.length > 0 && (
                              <div className="col-span-2">
                                <p className="text-muted-foreground mb-1">Access Locations:</p>
                                <div className="flex flex-wrap gap-2">
                                  {stats.locations.map((location, idx) => (
                                    <span key={idx} className="bg-secondary px-2 py-1 rounded-md text-sm text-secondary-foreground">
                                      {location}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No dataset access data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
