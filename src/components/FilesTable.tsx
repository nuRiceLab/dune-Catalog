import React, { useState } from 'react';
import { Pagination } from './Pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { File } from '@/lib/api';
import config from '@/config/config.json';

interface FilesTableProps {
    files: File[] | undefined;
    isLoading: boolean;
    totalCount: number
}

export function FilesTable({ files, isLoading, totalCount }: FilesTableProps) {

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

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

    return (
        <div>
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