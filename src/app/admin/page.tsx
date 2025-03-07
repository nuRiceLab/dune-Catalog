'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isUserAdmin } from '@/lib/auth';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Users, 
  BarChart4, 
  HelpCircle, 
  Settings, 
  ChevronRight 
} from 'lucide-react';
import AdminSidebar from '@/components/AdminSidebar';

export default function AdminDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status and redirect non-admin users
  useEffect(() => {
    const checkAdminStatus = async () => {
      // Always verify with backend for security
      const adminStatus = await isUserAdmin();
      if (!adminStatus) {
        toast({
          title: "Access Denied",
          description: "You don't have admin privileges to access this page.",
          variant: "destructive"
        });
        router.push('/');
      } else {
        setIsAdmin(true);
      }
    };
    
    checkAdminStatus();
  }, [router, toast]);
  
  // Don't render admin content until we've verified admin status
  if (!isAdmin && typeof window !== 'undefined') {
    return <div className="flex h-screen items-center justify-center">Verifying admin access...</div>;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <AdminSidebar activePage="dashboard" />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
          <p className="text-muted-foreground mb-8">
            
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Admins Card */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="mr-2 h-5 w-5" />
                  Admins
                </CardTitle>
                <CardDescription>Manage admin users</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Edit the list of users who have admin access.</p>
              </CardContent>
              <CardFooter>
                <Link href="/admin/users">
                  <Button variant="secondary" className="w-full flex items-center justify-between">
                    <span>Configure</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Dataset Access Card */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart4 className="mr-2 h-5 w-5" />
                  Dataset Access
                </CardTitle>
                <CardDescription>View dataset access statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <p>View dataset access statistics and access locations.</p>
              </CardContent>
              <CardFooter>
                <Link href="/admin/dataset-access">
                  <Button variant="secondary" className="w-full flex items-center justify-between">
                    <span>View Statistics</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Help Content Card */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <HelpCircle className="mr-2 h-5 w-5" />
                  Help Content
                </CardTitle>
                <CardDescription>Manage help documentation</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Edit the content displayed in the help section.</p>
              </CardContent>
              <CardFooter>
                <Link href="/admin/help-content">
                  <Button variant="secondary" className="w-full flex items-center justify-between">
                    <span>Edit Content</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* App Configuration Card */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="mr-2 h-5 w-5" />
                  App Configuration
                </CardTitle>
                <CardDescription>Manage general app settings</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Manage settings, saved searches, and tab configurations.</p>
              </CardContent>
              <CardFooter>
                <Link href="/admin/app-config">
                  <Button variant="secondary" className="w-full flex items-center justify-between">
                    <span>Configure</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
