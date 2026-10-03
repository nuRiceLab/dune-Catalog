import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Dataset, getDatasetSizes, isAbortError, isAuthError } from '@/lib/api';
import { formatSize } from '@/lib/format';
import { Pagination } from './Pagination';
import { DatasetDialog } from './DatasetDialog';

interface ResultsTableProps {
    results: Dataset[];
    /** 'file' when the underlying query returned files rather than datasets
     *  (e.g. a custom "files from ..." MQL query on the Other tab) -- files
     *  have no meaningful Files/Size columns and open the file detail page
     *  on click instead of the dataset dialog. Defaults to 'dataset'. */
    mode?: 'dataset' | 'file';
    /** Whether a search has actually run and settled. When false (e.g. the
     *  landing state right after login, before the user has searched), an
     *  empty result set renders nothing instead of "No results found." so the
     *  message only appears when a real search came back empty. Defaults to
     *  true so the component shows the empty state on its own. */
    hasSearched?: boolean;
}

const SIZE_BATCH = 5; // Keep a visible page below the shared size-job admission limit.

const dsKey = (d: Pick<Dataset, 'namespace' | 'name'>) => `${d.namespace}:${d.name}`;

export function DatasetTable({ results, mode = 'dataset', hasSearched = true }: ResultsTableProps) {
    const [sortColumn, setSortColumn] = useState<keyof Dataset>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sizeMap, setSizeMap] = useState<Record<string, number>>({});
    const { refresh } = useAuth();
    useEffect(() => {
        setCurrentPage(1);
        setSortColumn('name');
    }, [results]);


    /** Effective size: from the dataset record if present, else the fetched map. */
    const effectiveSize = (r: Dataset): number | undefined =>
        r.size ?? sizeMap[dsKey(r)];
    const canSortSize = results.every(result => {
        const size = effectiveSize(result);
        return size !== undefined && size >= 0;
    });
    const activeSortColumn = sortColumn === 'size' && !canSortSize ? 'name' : sortColumn;

    const sortedResults = [...results].sort((a, b) => {
        const av = activeSortColumn === 'size' ? effectiveSize(a)! : (a[activeSortColumn] ?? '');
        const bv = activeSortColumn === 'size' ? effectiveSize(b)! : (b[activeSortColumn] ?? '');
        if (av < bv) return sortDirection === 'asc' ? -1 : 1;
        if (av > bv) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(sortedResults.length / pageSize);
    const paginatedResults = sortedResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Only the visible page needs expensive aggregates. Aborting discards its
    // pending batches; revisiting the page can retry any still-missing sizes.
    useEffect(() => {
        if (mode === 'file') return;
        const missing = paginatedResults.filter(r => {
            const size = effectiveSize(r);
            return size === undefined || size < 0;
        });
        if (!missing.length) return;
        const controller = new AbortController();
        const { signal } = controller;
        async function fetchSizes() {
            for (let i = 0; i < missing.length; i += SIZE_BATCH) {
                if (signal.aborted) return;
                const chunk = missing.slice(i, i + SIZE_BATCH)
                    .map(({ namespace, name }) => ({ namespace, name }));
                try {
                    const sizes = await getDatasetSizes(chunk, signal);
                    if (!signal.aborted) setSizeMap(prev => ({ ...prev, ...sizes }));
                } catch (error) {
                    if (isAbortError(error) || signal.aborted) return;
                    if (isAuthError(error)) {
                        void refresh();
                        return;
                    }
                    setSizeMap(prev => ({ ...prev,
                        ...Object.fromEntries(chunk.map(dataset => [dsKey(dataset), -1])) }));
                }
            }
        }
        void fetchSizes();
        return () => controller.abort();
    // Retry failures on user actions, not on size arrivals (which would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, currentPage, pageSize, sortColumn, sortDirection, mode, refresh]);

    const toggleSort = (column: keyof Dataset) => {
        if (column === 'size' && !canSortSize) return;
        setCurrentPage(1);
        if (column === sortColumn) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    if (results.length === 0) {
        // Before any search has run (e.g. the landing state after login),
        // stay blank rather than claiming there are no results.
        if (!hasSearched) return null;
        return (
            <div className="flex justify-center items-center h-64">
                <p className="text-2xl font-semibold text-gray-500">No results found.</p>
            </div>
        );
    }

    const headers = mode === 'file' ? ['Name', 'Creator', 'Created'] : ['Name', 'Creator', 'Created', 'Files', 'Size'];

    return (
        <div>
            {mode === 'dataset' && !canSortSize && (
                <p className="mb-2 text-xs text-muted-foreground">
                    Size sorting is available when every result has a known size.
                </p>
            )}
            <Table>
                <TableHeader>
                    <TableRow>
                        {headers.map((header) => (
                            <TableHead key={header}>
                                <Button
                                    variant="ghost"
                                    disabled={header === 'Size' && !canSortSize}
                                    onClick={() => toggleSort(header.toLowerCase() as keyof Dataset)}
                                >
                                    {header}
                                    {activeSortColumn === header.toLowerCase() && (
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
                                {mode === 'file' ? (
                                    <Link
                                        href={`/file/${encodeURIComponent(result.namespace)}/${encodeURIComponent(result.name)}`}
                                        className="text-blue-500 hover:underline"
                                    >
                                        {result.name}
                                    </Link>
                                ) : (
                                    <DatasetDialog result={result} />
                                )}
                            </TableCell>
                            <TableCell>{result.creator}</TableCell>
                            <TableCell>{new Date(result.created).toLocaleDateString()}</TableCell>
                            {mode !== 'file' && (
                                <>
                                    <TableCell>{result.files}</TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        {(() => {
                                            const s = effectiveSize(result);
                                            const pending = s === undefined;
                                            const unavailable = s !== undefined && s !== null && s < 0;
                                            const title = pending
                                                ? 'Computing size… (large datasets can take a few minutes)'
                                                : unavailable
                                                ? 'Size is unavailable. Try the search again later.'
                                                : undefined;
                                            return <span title={title}>{formatSize(s)}</span>;
                                        })()}
                                    </TableCell>
                                </>
                            )}
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
                onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
            />
        </div>
    );
}
