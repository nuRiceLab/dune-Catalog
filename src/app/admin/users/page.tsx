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
import { Save, PlusCircle, X, Loader2 } from "lucide-react";
import dynamic from 'next/dynamic';
import AdminSidebar from '@/components/AdminSidebar';
import { getConfigData, saveConfigData, CONFIG_FILES } from '@/lib/adminApi';
import { z } from 'zod';

const adminEmailSchema = z.string().trim().toLowerCase().email();
const adminConfigSchema = z.object({ admins: z.array(adminEmailSchema).min(1) });

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
  const [jsonError, setJsonError] = useState<string | null>(null);

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

  useEffect(() => {
    // Fetch admins data using the unified API
    getConfigData(CONFIG_FILES.ADMINS)
      .then(data => {
        const parsed = adminConfigSchema.parse(data);
        setAdmins(parsed.admins);
        setJsonContent(JSON.stringify(parsed, null, 2));
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
    const parsed = adminEmailSchema.safeParse(newAdmin);
    if (!parsed.success) {
      toast({ variant: 'destructive', title: 'Invalid email',
        description: 'Enter an administrator email address.' });
      return;
    }
    const email = parsed.data;
    
    if (admins.includes(email)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "This user is already an admin."
      });
      return;
    }

    setAdmins([...admins, email]);
    setNewAdmin('');
  };

  const handleRemoveAdmin = (admin: string) => {
    setAdmins(admins.filter(a => a !== admin));
  };

  const readJsonAdmins = (): string[] | null => {
    try {
      const parsed = adminConfigSchema.parse(JSON.parse(jsonContent));
      setJsonError(null);
      return parsed.admins;
    } catch (error) {
      setJsonError(error instanceof SyntaxError
        ? 'Enter valid JSON for the administrator list.'
        : 'Each administrator must be an email address. Keep at least one administrator.');
      return null;
    }
  };

  const handleSave = async () => {
    const records = isJsonMode ? readJsonAdmins() : admins;
    if (!records) return;
    setIsSaving(true);
    try {
      // Save using the unified API
      await saveConfigData(CONFIG_FILES.ADMINS, { admins: records });
      
      toast({
        title: "success",
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
      const records = readJsonAdmins();
      if (records) {
        setAdmins(records);
        setIsJsonMode(false);
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
                {jsonError && <p role="alert" className="mb-3 text-sm text-destructive">{jsonError}</p>}
                <JsonEditor
                  value={jsonContent}
                  onChange={(value) => {
                    if (typeof value === 'string') {
                      setJsonContent(value);
                      setJsonError(null);
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
                    Add administrators by the email address they use to sign in.
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
                          type="email"
                          placeholder="admin@example.org"
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
