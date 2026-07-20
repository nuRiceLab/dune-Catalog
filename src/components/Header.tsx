'use client';

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ThemeToggle } from './ThemeToggle'
import { HelpDialog } from './HelpDialog'
import FeedbackDialog from "@/components/FeedbackDialog";
import Image from 'next/image'
import Link from 'next/link'
import { Button } from "@/components/ui/button";
import { LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Human-readable messages for the `auth_error` query param the backend appends
// when the CILogon flow fails (see src/backend/auth.py).
const AUTH_ERROR_MESSAGES: Record<string, string> = {
    access_denied: 'Login was cancelled at CILogon.',
    invalid_state: 'Login session expired. Please try again.',
    token_exchange_failed: 'Could not complete login with CILogon. Please try again.',
    missing_subject: 'CILogon did not return a user identifier.',
    not_configured: 'CILogon login is not configured on the server.',
};

export function Header() {
    const { isAuthenticated, isAdmin, login, logout } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Surface CILogon errors that come back as ?auth_error=... then strip the
    // param so a refresh doesn't replay the toast.
    useEffect(() => {
        const err = searchParams.get('auth_error');
        if (!err) return;
        toast({
            variant: "destructive",
            title: "Login Failed",
            description: AUTH_ERROR_MESSAGES[err] ?? `Login failed: ${err}`,
        });
        const params = new URLSearchParams(searchParams.toString());
        params.delete('auth_error');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, [searchParams, pathname, router, toast]);

    return (
        <header className="w-full bg-headfoot-background text-headfoot-foreground p-4">
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
                    <FeedbackDialog />
                    <HelpDialog />
                    <ThemeToggle />
                    {isAdmin && (
                        <Link href="/admin">
                            <Button
                                variant="outline"
                                className="text-headfoot-foreground hover:text-headfoot-foreground hover:bg-headfoot-foreground/10"
                            >
                                Admin
                            </Button>
                        </Link>
                    )}
                    {isAuthenticated ? (
                        <Button
                            variant="outline"
                            onClick={() => logout()}
                            className="flex items-center gap-2 text-headfoot-foreground hover:text-headfoot-foreground hover:bg-headfoot-foreground/10"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => login()}
                            className="flex items-center gap-2 text-headfoot-foreground hover:text-headfoot-foreground hover:bg-headfoot-foreground/10"
                        >
                            <LogIn className="w-4 h-4" />
                            Login with CILogon
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
}
