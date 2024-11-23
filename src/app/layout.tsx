"use client"

import { ThemeProvider } from "next-themes"
import { JetBrains_Mono, Poppins, Inter } from 'next/font/google'
import './globals.css'

// const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'] })
const poppins = Poppins({ weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'] })
// const inter = Inter({ weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], subsets: ['latin'] })
const font = poppins
export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
        <body className={font.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
        </ThemeProvider>
        </body>
        </html>
    )
}