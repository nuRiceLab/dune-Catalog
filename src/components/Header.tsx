import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { ThemeToggle} from "@/components/ThemeToggle";
import Image from "next/image";

export function Header() {
    return (
        <header className="flex justify-between items-center p-4 bg-headfoot-background transition-colors duration-200">
            <div className="flex-1">
                <Image
                    src="/dune-horiz-logo.png"
                    alt="DUNE Logo"
                    width={300}
                    height={0}
                    className="mr-2"
                />
            </div>
            <div className="flex items-center">
                <ThemeToggle />
                <Link href="/account">
                    <Button variant="link">MetaCat Account</Button>
                </Link>
            </div>
        </header>
    )
}