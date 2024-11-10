import Link from 'next/link'
import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header className="flex justify-between items-center p-4 bg-gray-100">
      <Link href="/">
        <Button variant="link">DUNE Catalog</Button>
      </Link>
      <Link href="/account">
        <Button variant="link">Account</Button>
      </Link>
    </header>
  )
}