import Link from 'next/link';
import { 
  LayoutDashboard, 
  Users, 
  BarChart4, 
  HelpCircle, 
  Settings,
  Home
} from 'lucide-react';

interface AdminSidebarProps {
  activePage: 'dashboard' | 'users' | 'dataset-access' | 'help-content' | 'app-config';
}

export default function AdminSidebar({ activePage }: AdminSidebarProps) {
  return (
    <div className="w-48 bg-card border-r h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Admin Panel</h2>
      </div>
      <nav className="p-2">
        <ul className="space-y-1">
          <li>
            <Link 
              href="/admin" 
              className={`flex items-center p-2 rounded-md ${
                activePage === 'dashboard' 
                  ? 'bg-accent text-accent-foreground' 
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </Link>
          </li>
          <li>
            <Link 
              href="/admin/users" 
              className={`flex items-center p-2 rounded-md ${
                activePage === 'users' 
                  ? 'bg-accent text-accent-foreground' 
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Users className="mr-2 h-4 w-4" />
              <span>Admins</span>
            </Link>
          </li>
          <li>
            <Link 
              href="/admin/dataset-access" 
              className={`flex items-center p-2 rounded-md ${
                activePage === 'dataset-access' 
                  ? 'bg-accent text-accent-foreground' 
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <BarChart4 className="mr-2 h-4 w-4" />
              <span>Dataset Access</span>
            </Link>
          </li>
          <li>
            <Link 
              href="/admin/help-content" 
              className={`flex items-center p-2 rounded-md ${
                activePage === 'help-content' 
                  ? 'bg-accent text-accent-foreground' 
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <HelpCircle className="mr-2 h-4 w-4" />
              <span>Help Content</span>
            </Link>
          </li>
          <li>
            <Link 
              href="/admin/app-config" 
              className={`flex items-center p-2 rounded-md ${
                activePage === 'app-config' 
                  ? 'bg-accent text-accent-foreground' 
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>App Config</span>
            </Link>
          </li>
        </ul>
      </nav>
      
      {/* Spacer to push Home link to bottom */}
      <div className="flex-grow"></div>
      
      {/* Main page link at the bottom */}
      <div className="p-2 border-t">
        <Link 
          href="/" 
          className="flex items-center p-2 rounded-md text-primary hover:bg-accent hover:text-accent-foreground"
        >
          <Home className="mr-2 h-4 w-4" />
          <span>Home</span>
        </Link>
      </div>
    </div>
  );
}
