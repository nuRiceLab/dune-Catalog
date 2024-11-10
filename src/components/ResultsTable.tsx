import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Result } from "@/lib/api"

interface ResultsGridProps {
  results: Result[];
}

export function ResultsTable({ results }: ResultsGridProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Tags</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.id}>
            <TableCell>
              <Link href={`/result/${result.id}`} className="text-blue-500 hover:underline">
                {result.title}
              </Link>
            </TableCell>
            <TableCell>{new Date(result.date).toLocaleDateString()}</TableCell>
            <TableCell>{result.size}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <span className="px-2 py-1 rounded-full text-xs bg-blue-200 text-blue-800">
                  {result.tab}
                </span>
                <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-800">
                  {result.category}
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}