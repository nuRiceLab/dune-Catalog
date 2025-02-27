'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isUserAdmin } from '@/lib/auth';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Users, 
  LayoutDashboard,
  BarChart4, 
  HelpCircle, 
  Settings,
  Save,
  PlusCircle,
  X,
  Loader2
} from "lucide-react";
import dynamic from 'next/dynamic';
import AdminSidebar from '@/components/AdminSidebar';
import { getConfigData, saveConfigData, listConfigFiles, CONFIG_FILES } from '@/lib/adminApi';

// Dynamically import the JSON editor to avoid SSR issues
const JsonEditor = dynamic(() => import('@/components/JsonEditor'), { ssr: false });

export default function AdminsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [admins, setAdmins] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [jsonContent, setJsonContent] = useState('');

  // Redirect non-admin users
  if (typeof window !== 'undefined' && !isUserAdmin()) {
    router.push('/');
    return null;
  }

  useEffect(() => {
    // Fetch admins data using the unified API
    getConfigData(CONFIG_FILES.ADMINS)
      .then(data => {
        if (data.admins && Array.isArray(data.admins)) {
          setAdmins(data.admins);
          setJsonContent(JSON.stringify({ admins: data.admins }, null, 2));
        } else if (Array.isArray(data)) {
          // Handle case where API returns array directly
          setAdmins(data);
          setJsonContent(JSON.stringify({ admins: data }, null, 2));
        }
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error loading admins:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load admin users. Please try again."
        });
        setIsLoading(false);
      });
  }, [toast]);

  const handleAddAdmin = () => {
    if (!newAdmin.trim()) return;
    
    if (admins.includes(newAdmin.trim())) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "This user is already an admin."
      });
      return;
    }

    setAdmins([...admins, newAdmin.trim()]);
    setNewAdmin('');
  };

  const handleRemoveAdmin = (admin: string) => {
    setAdmins(admins.filter(a => a !== admin));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let dataToSave;
      
      if (isJsonMode) {
        // Use the JSON content
        try {
          dataToSave = JSON.parse(jsonContent);
          if (!dataToSave.admins || !Array.isArray(dataToSave.admins)) {
            throw new Error('Invalid admins format');
          }
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Invalid JSON",
            description: "The JSON content is not valid. Please check your format."
          });
          setIsSaving(false);
          return;
        }
      } else {
        // Use the form data
        dataToSave = { admins };
      }
      
      // Save using the unified API
      await saveConfigData(CONFIG_FILES.ADMINS, dataToSave);
      
      toast({
        title: "Success",
        description: "Admin list has been updated successfully."
      });
    } catch (error) {
      console.error('Error saving admin list:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save changes. Please try again."
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleJsonMode = () => {
    if (isJsonMode) {
      // Switching from JSON to form
      try {
        const parsedData = JSON.parse(jsonContent);
        if (parsedData.admins && Array.isArray(parsedData.admins)) {
          setAdmins(parsedData.admins);
          setIsJsonMode(false);
        } else {
          toast({
            title: 'Invalid JSON',
            description: 'JSON must contain an "admins" array',
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Invalid JSON',
          description: 'Please correct the JSON format before switching to form mode.',
          variant: 'destructive',
        });
      }
    } else {
      // Switching from form to JSON
      setJsonContent(JSON.stringify({ admins }, null, 2));
      setIsJsonMode(true);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <AdminSidebar activePage="users" />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Admin Users</h1>
              <p className="text-muted-foreground">
                Manage Admins
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
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mr-2" />
              <span>Loading admin users...</span>
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
                      if (parsed.admins && Array.isArray(parsed.admins)) {
                        setAdmins(parsed.admins);
                      }
                    } catch (error) {
                      // Invalid JSON, just update the jsonContent
                    }
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Admin Users</CardTitle>
                  <CardDescription>
                    Edit the list of users who have admin access
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6">
                    <div className="font-medium mb-2">Current Admins</div>
                    {admins.length > 0 ? (
                      <div className="space-y-2">
                        {admins.map(admin => (
                          <div key={admin} className="flex items-center justify-between p-2 bg-secondary rounded-md">
                            <span>{admin}</span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleRemoveAdmin(admin)}
                              disabled={admins.length === 1}
                              title={admins.length === 1 ? "Cannot remove the last admin" : "Remove admin"}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">No admins found. Add an admin below.</div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="newAdmin">Add New Admin</Label>
                      <div className="flex mt-1.5">
                        <Input 
                          id="newAdmin"
                          value={newAdmin}
                          onChange={(e) => setNewAdmin(e.target.value)}
                          className="flex-1 mr-2"
                          placeholder="Enter username"
                        />
                        <Button onClick={handleAddAdmin}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
