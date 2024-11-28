import React, { useState, useEffect } from 'react';
import { Dataset, searchFiles } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { FilesTable } from './FilesTable'
import { cn } from "@/lib/utils"

interface ResultDialogProps {
    result: Dataset;
    className?: string;
}

export function ResultDialog({ result, className }: ResultDialogProps) {
    const [files, setFiles] = useState([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [open, setOpen] = useState(false);
    const metacatUrl = `https://metacat.fnal.gov:9443/dune_meta_prod/app/gui/dataset?namespace=${encodeURIComponent(result.namespace)}&name=${encodeURIComponent(result.name)}`;
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchFiles() {
            if (!open) return;
            setIsLoadingFiles(true);
            setError(null);
            try {
                const fetchedFiles = await searchFiles(result.namespace, result.name);
                setFiles(fetchedFiles);
            } catch (error) {
                console.error('Error fetching files:', error);
                setError('Failed to fetch files. Please try again later.');
                setFiles([]);
            } finally {
                setIsLoadingFiles(false);
            }
        }

        fetchFiles();
    }, [open, result.namespace, result.name]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <span
                    className={cn(
                        "cursor-pointer text-primary hover:underline break-words",
                        className
                    )}
                >
                    {result.name}
                </span>
            </DialogTrigger>
            <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl break-all hyphens-auto overflow-wrap-anywhere leading-relaxed">
                        {result.name}
                    </DialogTitle>
                </DialogHeader>
                <Separator className="my-4" />
                <div className="flex justify-between items-center mb-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <p><strong>Category:</strong> {result.namespace}</p>
                        <p><strong>Creator:</strong> {result.creator}</p>
                        <p><strong>Created:</strong> {new Date(result.created).toLocaleDateString()}</p>
                        <p><strong>Files:</strong> {result.files}</p>
                    </div>
                    <Button asChild>
                        <a href={metacatUrl} target="_blank" rel="noopener noreferrer">
                            View in Metacat GUI
                        </a>
                    </Button>
                </div>
                <Separator className="my-4" />
                <div>
                    <h3 className="text-lg font-semibold mb-2">Files in this dataset:</h3>
                    <FilesTable files={files} isLoading={isLoadingFiles} />
                </div>
            </DialogContent>
        </Dialog>
    );
}