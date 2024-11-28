// src/components/ResultsTable.tsx
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Dataset } from '@/lib/api';
import { Pagination } from './Pagination';
import { ResultDialog } from './ResultDialog';

interface ResultsTableProps {
    results: Dataset[];
}

export function ResultsTable({ results }: ResultsTableProps) {
    const [sortColumn, setSortColumn] = useState<keyof Dataset>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const sortedResults = [...results].sort((a, b) => {
        if (a[sortColumn] < b[sortColumn]) return sortDirection === 'asc' ? -1 : 1;
        if (a[sortColumn] > b[sortColumn]) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(sortedResults.length / pageSize);
    const paginatedResults = sortedResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const toggleSort = (column: keyof Dataset) => {
        if (column === sortColumn) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    if (results.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <p className="text-2xl font-semibold text-gray-500">No results found.</p>
            </div>
        );
    }

    return (
        <div>
            <Table>
                <TableHeader>
                    <TableRow>
                        {['Name', 'Creator', 'Created', 'Files'].map((header) => (
                            <TableHead key={header}>
                                <Button
                                    variant="ghost"
                                    onClick={() => toggleSort(header.toLowerCase() as keyof Dataset)}
                                >
                                    {header}
                                    {sortColumn === header.toLowerCase() && (
                                        sortDirection === 'asc' ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />
                                    )}
                                </Button>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedResults.map((result, index) => (
                        <TableRow key={index}>
                            <TableCell className="max-w-[200px] break-words">
                                <ResultDialog result={result} />
                            </TableCell>
                            <TableCell>{result.creator}</TableCell>
                            <TableCell>{new Date(result.created).toLocaleDateString()}</TableCell>
                            <TableCell>{result.files}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalResults={results.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
            />
        </div>
    );
}