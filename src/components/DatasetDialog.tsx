import React, { useState, useEffect } from 'react';
import { Dataset, searchFiles, File, recordDatasetAccess } from '@/lib/api';
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
import config from '@/config/config.json';
import { Copy, CheckCircle } from 'lucide-react';

interface ResultDialogProps {
    result: Dataset;
    className?: string;
}

export function DatasetDialog({ result, className }: ResultDialogProps) {
    const [files, setFiles] = useState<File[]>([]);    
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [open, setOpen] = useState(false);
    const [mqlQuery, setMqlQuery] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const metacatUrl = `https://metacat.fnal.gov:9443/dune_meta_prod/app/gui/dataset?namespace=${encodeURIComponent(result.namespace)}&name=${encodeURIComponent(result.name)}`;

    useEffect(() => {
        async function fetchFiles() {
            if (!open) return;
            setIsLoadingFiles(true);
            try {
                console.log('Fetching files for:', { 
                    namespace: result.namespace, 
                    name: result.name,
                    open: open 
                });

                // Record dataset access
                recordDatasetAccess(result.namespace, result.name);
                
                const response = await searchFiles(result.namespace, result.name);
                console.log('File search response:', response);
                
                // Additional check to ensure files are being set
                if (response.files && response.files.length > 0) {
                    console.log(`Loaded ${response.files.length} files`);
                    setFiles(response.files);
                } else {
                    console.warn('No files found or empty response');
                    setFiles([]);
                }
                
                setMqlQuery(response.mqlQuery);
            } catch (error) {
                console.error('Error fetching files:', error);
                setFiles([]);
            } finally {
                setIsLoadingFiles(false);
            }
        }
        fetchFiles();
    }, [open, result.namespace, result.name]);

    const handleCopyQuery = () => {
        navigator.clipboard.writeText(mqlQuery).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

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
            <DialogContent className="w-fit max-w-[95vw] min-w-[80vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader className="pt-4">
                    <DialogTitle className="text-xl break-words hyphens-auto leading-relaxed">
                        {result.name}
                    </DialogTitle>
                </DialogHeader>
                <Separator className="my-4" />
                <div className="flex justify-between items-center mb-4 w-full">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full">
                        <p><strong>Category:</strong> {result.namespace}</p>
                        <p><strong>Creator:</strong> {result.creator}</p>
                        <p><strong>Created:</strong> {new Date(result.created).toLocaleDateString()}</p>
                        <p><strong>Files:</strong> {result.files}</p>
                    </div>
                    <Button asChild className="ml-4">
                        <a href={metacatUrl} target="_blank" rel="noopener noreferrer" title="You may need to sign in to Metacat when redirected">
                            View in Metacat GUI
                        </a>
                    </Button>
                </div>
                <Separator className="my-4" />
                {mqlQuery && (
                    <div className="mb-4 w-full">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-semibold">MetaCat Query:</h3>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleCopyQuery}
                                className="flex items-center gap-2"
                            >
                                {copied ? (
                                    <>
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-4 w-4" />
                                        Copy
                                    </>
                                )}
                            </Button>
                        </div>
                        <div className="bg-muted p-4 rounded-lg w-full">
                            <pre className="whitespace-pre-wrap break-words text-sm font-mono">
                                <code>{mqlQuery}</code>
                            </pre>
                        </div>
                    </div>
                )}
                <div className="w-full">
                    <h3 className="text-lg font-semibold mb-2">Files in this dataset (DUNE Catalog is only able to display the first {config.app.files.maxToShow} files):</h3>
                    <FilesTable files={files} isLoading={isLoadingFiles} totalCount={result.files} />
                </div>
            </DialogContent>
        </Dialog>
    );
}