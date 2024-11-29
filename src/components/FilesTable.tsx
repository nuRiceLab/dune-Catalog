import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { File } from '@/lib/api';

interface FilesTableProps {
    files: File[] | undefined;
    isLoading: boolean;
}

export function FilesTable({ files, isLoading }: FilesTableProps) {
    if (isLoading) {
        return <div>Loading files...</div>;
    }

    if (!files || files.length === 0) {
        return <div>No files found in this dataset.</div>;
    }

    return (
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
                {files.map((file) => (
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
    );
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}