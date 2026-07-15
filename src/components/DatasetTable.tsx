import { useEffect, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Dataset, getDatasetSizes } from '@/lib/api';
import { Pagination } from './Pagination';
import { DatasetDialog } from './DatasetDialog';

interface ResultsTableProps {
    results: Dataset[];
}

const SIZE_BATCH = 25;          // matches the backend per-request cap
const SIZE_FETCH_LIMIT = 500;   // don't hammer MetaCat for huge result sets

function formatDatasetSize(bytes: number | undefined): string {
    if (bytes === undefined) return '…';   // still loading
    if (!bytes) return '—';                // unknown / zero
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const dsKey = (d: Dataset) => `${d.namespace}:${d.name}`;

export function DatasetTable({ results }: ResultsTableProps) {
    const [sortColumn, setSortColumn] = useState<keyof Dataset>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sizeMap, setSizeMap] = useState<Record<string, number>>({});
    const requestedRef = useRef<Set<string>>(new Set());

    // Fetch dataset sizes in batches after results arrive. Datasets whose
    // record already carries a size (result.size > 0) are skipped.
    useEffect(() => {
        let cancelled = false;
        const missing = results
            .filter((r) => !r.size && !requestedRef.current.has(dsKey(r)))
            .slice(0, SIZE_FETCH_LIMIT);
        if (!missing.length) return;
        missing.forEach((r) => requestedRef.current.add(dsKey(r)));

        (async () => {
            for (let i = 0; i < missing.length && !cancelled; i += SIZE_BATCH) {
                const chunk = missing
                    .slice(i, i + SIZE_BATCH)
                    .map(({ namespace, name }) => ({ namespace, name }));
                try {
                    const sizes = await getDatasetSizes(chunk);
                    if (!cancelled) setSizeMap((prev) => ({ ...prev, ...sizes }));
                } catch {
                    // Leave these as unknown; cells fall back to '—'
                    if (!cancelled) {
                        setSizeMap((prev) => {
                            const next = { ...prev };
                            chunk.forEach((d) => { next[`${d.namespace}:${d.name}`] ??= 0; });
                            return next;
                        });
                    }
                }
            }
        })();
        return () => { cancelled = true; };
    }, [results]);

    /** Effective size: from the dataset record if present, else the fetched map. */
    const effectiveSize = (r: Dataset): number | undefined =>
        r.size ? r.size : sizeMap[dsKey(r)];

    const sortedResults = [...results].sort((a, b) => {
        const av = sortColumn === 'size' ? (effectiveSize(a) ?? 0) : a[sortColumn];
        const bv = sortColumn === 'size' ? (effectiveSize(b) ?? 0) : b[sortColumn];
        if (av < bv) return sortDirection === 'asc' ? -1 : 1;
        if (av > bv) return sortDirection === 'asc' ? 1 : -1;
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
                        {['Name', 'Creator', 'Created', 'Files', 'Size'].map((header) => (
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
                                <DatasetDialog result={result} />
                            </TableCell>
                            <TableCell>{result.creator}</TableCell>
                            <TableCell>{new Date(result.created).toLocaleDateString()}</TableCell>
                            <TableCell>{result.files}</TableCell>
                            <TableCell className="whitespace-nowrap">
                                {formatDatasetSize(effectiveSize(result))}
                            </TableCell>
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
