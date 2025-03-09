import React, { useState } from 'react';
import { Pagination } from './Pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { File } from '@/lib/api';
import config from '@/config/config.json';
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle } from 'lucide-react';

interface FilesTableProps {
    files: File[] | undefined;
    isLoading: boolean;
    totalCount: number
}

export function FilesTable({ files, isLoading, totalCount }: FilesTableProps) {

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [copied, setCopied] = useState(false);

    if (totalCount > config.app.files.maxToShow) {
        totalCount = config.app.files.maxToShow
    }
    if (isLoading) {
        return <div>Loading files...</div>;
    }

    if (!files || files.length === 0) {
        return <div>No files found in this dataset.</div>;
    }
    const totalPages = Math.ceil(( totalCount  || files.length) / pageSize);
    const paginatedFiles = files.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handleCopyFileNames = () => {
        const fileNames = files.map(file => file.name).join('\n');
        navigator.clipboard.writeText(fileNames).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCopyFileNames}
                    className="flex items-center gap-2"
                >
                    {copied ? (
                        <>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Copied All File Names
                        </>
                    ) : (
                        <>
                            <Copy className="h-4 w-4" />
                            Copy All File Names
                        </>
                    )}
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>File ID</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedFiles.map((file) => (
                        <TableRow key={file.fid}>
                            <TableCell className="max-w-[200px] break-words">
                                {file.name}
                            </TableCell>
                            <TableCell>{formatFileSize(file.size)}</TableCell>
                            <TableCell>{file.created}</TableCell>
                            <TableCell>{file.updated}</TableCell>
                            <TableCell>{file.fid}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalResults={ totalCount || files.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
            />
        </div>
    );
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}