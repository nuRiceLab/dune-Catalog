// src/lib/rucio.ts
// Frontend helpers for the read-only Rucio replica feature + FNAL connect flow.
import axios from 'axios';
import { apiClient } from '@/lib/apiClient';

export interface ReplicaPfn {
    protocol: string; // "root" | "davs" | ...
    pfn: string;
}
export interface ReplicaSite {
    rse: string;
    type: 'disk' | 'tape' | 'unknown';
    pfns: ReplicaPfn[];
}
export interface ReplicasResponse {
    scope: string;
    name: string;
    sites: ReplicaSite[];
}

/** Thrown when the user's FNAL session has expired / not yet established. */
export class ReauthRequired extends Error {
    constructor() {
        super('reauth_required');
        this.name = 'ReauthRequired';
    }
}

function isReauth(e: unknown): boolean {
    return (
        axios.isAxiosError(e) &&
        e.response?.status === 401 &&
        (e.response?.data as { detail?: { error?: string } })?.detail?.error === 'reauth_required'
    );
}

/** GET /rucio/replicas — per-site PFNs for a file DID. */
export async function getReplicas(scope: string, name: string): Promise<ReplicasResponse> {
    try {
        const res = await apiClient.get<ReplicasResponse>('/rucio/replicas', {
            params: { scope, name },
        });
        return res.data;
    } catch (e) {
        if (isReauth(e)) throw new ReauthRequired();
        throw e;
    }
}

/**
 * Run the one-time "Connect to FNAL" flow: open the CILogon popup and poll
 * until the backend has stored the vault token. Resolves when connected.
 */
export async function connectToFnal(): Promise<void> {
    const start = await apiClient.post<{ login_id: string; auth_url: string }>('/rucio/login/start');
    const { login_id, auth_url } = start.data;

    const popup = window.open(auth_url, 'fnal_login', 'width=600,height=800');
    if (!popup) {
        throw new Error('Popup blocked — allow popups to connect to FNAL.');
    }

    const deadline = Date.now() + 3 * 60 * 1000; // 3 min
    while (true) {
        await new Promise((r) => setTimeout(r, 3000));
        if (Date.now() > deadline) {
            try { popup.close(); } catch { /* ignore */ }
            throw new Error('Timed out waiting for FNAL login.');
        }
        const poll = await apiClient.get<{ status: 'pending' | 'complete' }>('/rucio/login/poll', {
            params: { login_id },
        });
        if (poll.data.status === 'complete') {
            try { popup.close(); } catch { /* ignore */ }
            return;
        }
    }
}
