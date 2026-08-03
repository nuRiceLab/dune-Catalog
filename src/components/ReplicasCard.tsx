import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle } from 'lucide-react';
import {
    getReplicas,
    connectToFnal,
    ReauthRequired,
    type ReplicaSite,
} from '@/lib/rucio';

interface ReplicasCardProps {
    scope: string; // the file's namespace
    name: string;  // the file name
}

type State =
    | { kind: 'loading' }
    | { kind: 'reauth' }
    | { kind: 'connecting' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; sites: ReplicaSite[] };

export function ReplicasCard({ scope, name }: ReplicasCardProps) {
    const [state, setState] = useState<State>({ kind: 'loading' });
    const [hidden, setHidden] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    const load = useCallback(async () => {
        setState({ kind: 'loading' });
        try {
            const { sites } = await getReplicas(scope, name);
            setState({ kind: 'ready', sites });
        } catch (e) {
            if (e instanceof ReauthRequired) {
                setState({ kind: 'reauth' });
            } else {
                setState({ kind: 'error', message: (e as Error).message || 'Failed to load replicas.' });
            }
        }
    }, [scope, name]);

    useEffect(() => {
        if (scope && name) load();
    }, [scope, name, load]);

    const connect = async () => {
        setState({ kind: 'connecting' });
        try {
            await connectToFnal();
            await load();
        } catch (e) {
            setState({ kind: 'error', message: (e as Error).message || 'Could not connect to FNAL.' });
        }
    };

    const handleCopyPfn = (pfn: string) => {
        navigator.clipboard.writeText(pfn).then(() => {
            setCopied(pfn);
            setTimeout(() => setCopied((c) => (c === pfn ? null : c)), 2000);
        });
    };

    const siteCount = state.kind === 'ready' ? state.sites.length : 0;

    return (
        <div className="overflow-hidden rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Replicas
                    {state.kind === 'ready' && (
                        <span className="ml-2 font-normal normal-case tracking-normal">
                            · {siteCount} {siteCount === 1 ? 'site' : 'sites'}
                        </span>
                    )}
                </span>
                {state.kind === 'ready' && (
                    <Button variant="outline" size="sm" onClick={() => setHidden((h) => !h)}>
                        {hidden ? 'Show' : 'Hide'}
                    </Button>
                )}
            </div>

            {!hidden && (
                <div>
                    {state.kind === 'loading' && (
                        <div className="px-4 py-6 text-sm text-muted-foreground">Loading replicas...</div>
                    )}

                    {state.kind === 'connecting' && (
                        <div className="px-4 py-6 text-sm text-muted-foreground">Waiting for FNAL login...</div>
                    )}

                    {state.kind === 'reauth' && (
                        <div className="flex flex-col items-start gap-3 px-4 py-6">
                            <p className="text-sm text-muted-foreground">
                                Connect to FNAL to see where this file is stored.
                            </p>
                            <Button variant="outline" size="sm" onClick={connect}>
                                Connect to FNAL
                            </Button>
                        </div>
                    )}

                    {state.kind === 'error' && (
                        <div className="flex flex-col items-start gap-3 px-4 py-6">
                            <p className="text-sm text-red-500">{state.message}</p>
                            <Button variant="outline" size="sm" onClick={load}>
                                Retry
                            </Button>
                        </div>
                    )}

                    {state.kind === 'ready' && state.sites.length === 0 && (
                        <div className="px-4 py-6 text-sm text-muted-foreground">
                            No replicas found for this file.
                        </div>
                    )}

                    {state.kind === 'ready' &&
                        state.sites.map((site) => (
                            <div key={site.rse} className="border-t px-4 py-3 first:border-t-0">
                                <div className="flex items-center gap-2">
                                    <span className="break-all font-mono text-sm font-semibold">{site.rse}</span>
                                    <StorageBadge type={site.type} />
                                </div>

                                <div className="mt-2 space-y-1.5">
                                    {site.pfns.map((p) => (
                                        <div key={p.pfn} className="group flex items-start gap-2.5">
                                            <span className="mt-[3px] shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                {p.protocol}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleCopyPfn(p.pfn)}
                                                title="Click to copy"
                                                className="flex items-start gap-1.5 break-all text-left font-mono text-xs hover:underline sm:text-sm"
                                            >
                                                <span>{p.pfn}</span>
                                                {copied === p.pfn ? (
                                                    <CheckCircle className="mt-[2px] h-4 w-4 shrink-0 text-green-500" />
                                                ) : (
                                                    <Copy className="mt-[2px] h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                </div>
            )}
        </div>
    );
}

function StorageBadge({ type }: { type: 'disk' | 'tape' | 'unknown' }) {
    const styles =
        type === 'disk'
            ? 'bg-green-100 text-green-700'
            : type === 'tape'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-muted text-muted-foreground';
    const label = type === 'disk' ? 'on disk' : type === 'tape' ? 'on tape' : 'unknown';
    return (
        <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}
        >
            {label}
        </span>
    );
}
