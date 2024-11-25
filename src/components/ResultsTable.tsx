// In src/components/ResultsTable.tsx

import { useState } from 'react';
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
import { Button } from "@/components/ui/button"
import { ChevronUp, ChevronDown } from 'lucide-react'

interface ResultsTableProps {
    results: Result[];
}

export function ResultsTable({ results }: ResultsTableProps) {
    const [sortBy, setSortBy] = useState<keyof Result>('title');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const sortedResults = [...results].sort((a, b) => {
        if (a[sortBy] < b[sortBy]) return sortOrder === 'asc' ? -1 : 1;
        if (a[sortBy] > b[sortBy]) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const toggleSort = (column: keyof Result) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const SortIcon = ({ column }: { column: keyof Result }) => {
        if (sortBy !== column) return null;
        return sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>
                        <Button variant="ghost" onClick={() => toggleSort('title')}>
                            Title <SortIcon column="title" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => toggleSort('date')}>
                            Date <SortIcon column="date" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => toggleSort('size')}>
                            Size <SortIcon column="size" />
                        </Button>
                    </TableHead>
                    <TableHead>Tags</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {sortedResults.map((result) => (
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