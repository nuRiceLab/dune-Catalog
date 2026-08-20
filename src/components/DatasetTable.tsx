import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Dataset, getDatasetSizes, isAbortError } from '@/lib/api';
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

const SIZE_BATCH = 5;           // small parallel batches: one huge dataset delays at most 4 others

const dsKey = (d: Dataset) => `${d.namespace}:${d.name}`;

export function DatasetTable({ results, mode = 'dataset', hasSearched = true }: ResultsTableProps) {
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
    // safe to apply). Skipped entirely in 'file' mode -- individual files
    // already carry their own size, there's no dataset size to compute.
    //
    // When the page/results change or the table unmounts, the effect aborts
    // its in-flight requests: this stops the backend size queries mid-flight
    // (no wasted MetaCat load) and, critically, suppresses the one-shot retry
    // below so an abandoned page never issues a *second* round of queries.
    useEffect(() => {
        if (mode === 'file') return;
        const missing = paginatedResults
            .filter((r) => !r.size && !requestedRef.current.has(dsKey(r)));
        if (!missing.length) return;
        missing.forEach((r) => requestedRef.current.add(dsKey(r)));

        const controller = new AbortController();
        const { signal } = controller;

        const chunks: { namespace: string; name: string }[][] = [];
        for (let i = 0; i < missing.length; i += SIZE_BATCH) {
            chunks.push(
                missing.slice(i, i + SIZE_BATCH)
                    .map(({ namespace, name }) => ({ namespace, name }))
            );
        }
        chunks.forEach(async (chunk) => {
            const chunkKeys = chunk.map((d) => `${d.namespace}:${d.name}`);
            // Aborted requests must not stay marked as "requested", or the
            // sizes would never be fetched again if the page is revisited.
            const releaseKeys = () =>
                chunkKeys.forEach((k) => requestedRef.current.delete(k));

            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const sizes = await getDatasetSizes(chunk, signal);
                    if (!signal.aborted) {
                        setSizeMap((prev) => ({ ...prev, ...sizes }));
                    }
                    return;
                } catch (error) {
                    // User navigated away / changed page: stop cleanly. No
                    // retry — issuing another request here is exactly the
                    // extra MetaCat call we're trying to avoid.
                    if (isAbortError(error) || signal.aborted) {
                        releaseKeys();
                        return;
                    }
                    if (attempt === 0) {
                        // Brief pause, then one retry (transient failure or a
                        // proxy cutoff); the backend caches finished
                        // computations, so the retry is usually instant.
                        await new Promise((res) => setTimeout(res, 3000));
                        if (signal.aborted) {   // aborted during the pause
                            releaseKeys();
                            return;
                        }
                    }
                }
            }
            // Both attempts failed: show '—' rather than a permanent spinner.
            if (!signal.aborted) {
                setSizeMap((prev) => {
                    const next = { ...prev };
                    chunk.forEach((d) => { next[`${d.namespace}:${d.name}`] ??= 0; });
                    return next;
                });
            }
        });

        return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results, currentPage, pageSize, sortColumn, sortDirection, mode]);

    const toggleSort = (column: keyof Dataset) => {
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
            <Table>
                <TableHeader>
                    <TableRow>
                        {headers.map((header) => (
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
                                                ? 'This dataset is too large to summarize in less than 5 minutes — try again later.'
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
                onPageSizeChange={setPageSize}
            />
        </div>
    );
}
