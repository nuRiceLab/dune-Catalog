import { ThemeToggle} from "@/components/ThemeToggle"
import { useState } from "react";
import Image from "next/image"
import { LoginModal } from "./LoginModal"

export function Header() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
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
            <div className="flex items-center">
                <ThemeToggle />
                <LoginModal isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}/>
            </div>
        </header>
    )
}