import { useState, useEffect } from "react";
import { ThemeToggle } from './ThemeToggle'
import { LoginModal } from './LoginModal'
import Image from 'next/image'
import { HelpDialog } from './HelpDialog'
import { isLoggedIn } from '@/lib/auth'

export function Header() {
    const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);

    useEffect(() => {
        // Check login state on mount and after any storage events
        const checkLoginState = () => {
            setIsUserLoggedIn(isLoggedIn());
        };

        // Initial check
        checkLoginState();

        // Listen for storage events (in case login state changes in another tab)
        window.addEventListener('storage', checkLoginState);
        
        return () => {
            window.removeEventListener('storage', checkLoginState);
        };
    }, []);

    return (
        <header className="flex justify-between items-center p-4 bg-headfoot-background transition-colors duration-200">
            <div className="flex-1">
                <Image
                    src="/dune-horiz-logo.png"
                    alt="DUNE Logo"
                    width={300}
                    height={100}
                    priority={true}
                    style={{height: 'auto', width: 'auto' }}
                    className="mr-2"
                />
            </div>
            <div className="flex items-center gap-2">
                <HelpDialog />
                <ThemeToggle />
                <LoginModal isLoggedIn={isUserLoggedIn} setIsLoggedIn={setIsUserLoggedIn}/>
            </div>
        </header>
    )
}