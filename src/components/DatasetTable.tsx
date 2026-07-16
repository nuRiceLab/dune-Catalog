import { useEffect, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Dataset, getDatasetSizes } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { Pagination } from './Pagination';
import { DatasetDialog } from './DatasetDialog';

interface ResultsTableProps {
    results: Dataset[];
}

const SIZE_BATCH = 5;           // small parallel batches: one huge dataset delays at most 4 others

const dsKey = (d: Dataset) => `${d.namespace}:${d.name}`;

export function DatasetTable({ results }: ResultsTableProps) {
    const [sortColumn, setSortColumn] = useState<keyof Dataset>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sizeMap, setSizeMap] = useState<Record<string, number>>({});
    const requestedRef = useRef<Set<string>>(new Set());


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

    // Fetch sizes only for the datasets on the current page (each size is a
    // real aggregate query on MetaCat, so fetching all results is too costly).
    // Batches run in parallel and are retried once, and results are merged
    // whenever they arrive — a size that takes minutes to compute still shows
    // up when ready (sizeMap is keyed by dataset, so late answers are always
    // safe to apply).
    useEffect(() => {
        const missing = paginatedResults
            .filter((r) => !r.size && !requestedRef.current.has(dsKey(r)));
        if (!missing.length) return;
        missing.forEach((r) => requestedRef.current.add(dsKey(r)));

        const chunks: { namespace: string; name: string }[][] = [];
        for (let i = 0; i < missing.length; i += SIZE_BATCH) {
            chunks.push(
                missing.slice(i, i + SIZE_BATCH)
                    .map(({ namespace, name }) => ({ namespace, name }))
            );
        }
        chunks.forEach(async (chunk) => {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const sizes = await getDatasetSizes(chunk);
                    setSizeMap((prev) => ({ ...prev, ...sizes }));
                    return;
                } catch {
                    if (attempt === 0) {
                        // Brief pause, then one retry (transient failure or a
                        // proxy cutoff); the backend caches finished
                        // computations, so the retry is usually instant.
                        await new Promise((res) => setTimeout(res, 3000));
                    }
                }
            }
            // Both attempts failed: show '—' rather than a permanent spinner.
            setSizeMap((prev) => {
                const next = { ...prev };
                chunk.forEach((d) => { next[`${d.namespace}:${d.name}`] ??= 0; });
                return next;
            });
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, currentPage, pageSize, sortColumn, sortDirection]);

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
                                {formatSize(effectiveSize(result))}
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
