import { useState, useEffect } from "react";
import { ThemeToggle } from './ThemeToggle'
import { LoginModal } from './LoginModal'
import { HelpDialog } from './HelpDialog'
import Image from 'next/image'
import { isLoggedIn, isUserAdmin } from '@/lib/auth'
import Link from 'next/link'
import { Button } from "@/components/ui/button";

export function Header() {
    const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    // Check admin status whenever login state changes
    useEffect(() => {
        const checkAdminStatus = async () => {
            if (isUserLoggedIn) {
                // Always verify with backend for security
                const adminStatus = await isUserAdmin();
                setIsAdmin(adminStatus);
            } else {
                setIsAdmin(false);
            }
        };
        
        checkAdminStatus();
    }, [isUserLoggedIn]);

    useEffect(() => {
        // Check login state on mount and after any storage events
        const checkLoginState = () => {
            const loggedIn = isLoggedIn();
            setIsUserLoggedIn(loggedIn);
        };

        // Initial check
        checkLoginState();

        // Listen for storage events (e.g., when another tab logs in/out)
        window.addEventListener('storage', checkLoginState);

        return () => {
            window.removeEventListener('storage', checkLoginState);
        };
    }, []);

    return (
        <header className="w-full bg-headfoot-background text-white p-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <Image
                            src="/dunecatalog/dune-horiz-logo.png"
                            alt="DUNE Logo"
                            width={300}
                            height={100}
                            priority
                        />
                    </Link>
                </div>
                <div className="flex items-center gap-2">
                    <HelpDialog />
                    <ThemeToggle />
                    {isAdmin && (
                        <Link href="/admin">
                            <Button 
                                variant="outline" 
                                className="text-white hover:text-white hover:bg-gray-700"
                            >
                                Admin
                            </Button>
                        </Link>
                    )}
                    <LoginModal isLoggedIn={isUserLoggedIn} setIsLoggedIn={setIsUserLoggedIn}/>
                </div>
            </div>
        </header>
    );
}