'use client'

/**
 * File detail page — /file/[namespace]/[name]
 *
 * Shows a file's full metadata, size, timestamps, checksums, and file ID,
 * plus its provenance (parent files, child files, containing datasets) as
 * clickable links, so analysers can drill through lineage without leaving
 * the catalog (issue #10).
 *
 * Save as: src/app/file/[namespace]/[name]/page.tsx
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { getFileDetails, FileDetails, FileRef } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Copy, CheckCircle, ExternalLink } from 'lucide-react'

const METACAT_GUI_BASE = 'https://metacat.fnal.gov:9443/dune_meta_prod/app/gui'

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/** Renders a list of parent/child file references as clickable chips. */
function FileRefList({ refs, emptyText }: {
  refs: FileRef[]
  emptyText: string
}) {
  if (!refs.length) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {refs.map((r) =>
        r.namespace && r.name ? (
          <Link
            key={r.fid}
            href={`/file/${encodeURIComponent(r.namespace)}/${encodeURIComponent(r.name)}`}
            className="w-fit break-all text-sm text-blue-500 hover:underline"
          >
            {r.namespace}:{r.name}
          </Link>
        ) : (
          <span key={r.fid} className="w-fit break-all text-sm text-muted-foreground">
            fid {r.fid} (name unavailable)
          </span>
        )
      )}
    </div>
  )
}

export default function FileDetailPage() {
  const params = useParams<{ namespace: string; name: string }>()
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const namespace = decodeURIComponent(params.namespace ?? '')
  const name = decodeURIComponent(params.name ?? '')

  const [details, setDetails] = useState<FileDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [metaFilter, setMetaFilter] = useState('')

  useEffect(() => {
    if (authLoading || !isAuthenticated || !namespace || !name) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetails(null)
    getFileDetails(namespace, name)
      .then((d) => { if (!cancelled) setDetails(d) })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load file details')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [namespace, name, isAuthenticated, authLoading])

  const did = `${namespace}:${name}`
  const handleCopyDid = () => {
    navigator.clipboard.writeText(did).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  /* ---------- auth / loading / error states ---------- */
  if (authLoading) {
    return <main className="container mx-auto p-4"><div className="h-24" /></main>
  }
  if (!isAuthenticated) {
    return (
      <main className="container mx-auto p-4">
        <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Viewing file details requires signing in. Use the Login button in
            the upper-right corner.
          </p>
        </div>
      </main>
    )
  }

  const metadataEntries = details
    ? Object.entries(details.metadata).filter(([k]) =>
        k.toLowerCase().includes(metaFilter.toLowerCase())
      )
    : []

  return (
    <main className="container mx-auto flex flex-col gap-6 p-4">
      {/* Top bar: back + external link */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {details?.fid && (
          <a
            href={`${METACAT_GUI_BASE}/show_file?fid=${encodeURIComponent(details.fid)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-1.5">
              View in MetaCat GUI <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        )}
      </div>

      {/* Title + DID copy */}
      <div>
        <h1 className="break-all text-xl font-semibold">{name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <span className="break-all text-sm text-muted-foreground">{did}</span>
          <Button variant="ghost" size="sm" onClick={handleCopyDid} className="h-7 gap-1 px-2">
            {copied
              ? <><CheckCircle className="h-3.5 w-3.5 text-green-500" /> Copied</>
              : <><Copy className="h-3.5 w-3.5" /> Copy DID</>}
          </Button>
        </div>
      </div>

      {loading && <div>Loading file details…</div>}
      {error && (
        <div className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {details && (
        <>
          {/* Summary */}
          <section className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Size</p>
              <p>{formatFileSize(details.size)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Created</p>
              <p>{details.created || 'n/a'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Updated</p>
              <p>{details.updated || 'n/a'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">File ID</p>
              <p className="break-all">{details.fid}</p>
            </div>
            {Object.entries(details.checksums).map(([algo, value]) => (
              <div key={algo} className="col-span-2 sm:col-span-4">
                <p className="text-muted-foreground">Checksum ({algo})</p>
                <p className="break-all font-mono text-xs">{value}</p>
              </div>
            ))}
          </section>

          {/* Metadata */}
          <section className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">
                Metadata ({Object.keys(details.metadata).length})
              </h2>
              <Input
                placeholder="Filter keys…"
                value={metaFilter}
                onChange={(e) => setMetaFilter(e.target.value)}
                className="h-8 max-w-56"
              />
            </div>
            {metadataEntries.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">Key</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metadataEntries.map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell className="break-all align-top font-mono text-xs">{key}</TableCell>
                      <TableCell className="break-all font-mono text-xs">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                {Object.keys(details.metadata).length
                  ? 'No metadata keys match the filter.'
                  : 'This file has no metadata.'}
              </p>
            )}
          </section>
          {/* Provenance */}
          <section className="rounded-lg border p-4">
            <h2 className="mb-3 text-lg font-semibold">Provenance</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm font-medium">
                  Parent files ({details.total_parents})
                  {details.total_parents > details.parents.length &&
                    ` — showing first ${details.parents.length} only`}
                </h3>
                <FileRefList
                  refs={details.parents}
                  emptyText="No recorded parents."
                />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-medium">
                  Child files ({details.total_children})
                  {details.total_children > details.children.length &&
                    ` — showing first ${details.children.length} only`}
                </h3>
                <FileRefList
                  refs={details.children}
                  emptyText="No recorded children."
                />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-medium">
                In dataset{details.datasets.length === 1 ? '' : 's'} ({details.datasets.length})
              </h3>
              {details.datasets.length ? (
                <div className="flex flex-col gap-1">
                  {details.datasets.map((d) => (
                    <a
                      key={`${d.namespace}:${d.name}`}
                      href={`${METACAT_GUI_BASE}/dataset?namespace=${encodeURIComponent(d.namespace)}&name=${encodeURIComponent(d.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-fit break-all text-sm text-blue-500 hover:underline"
                      title="Open dataset in MetaCat GUI"
                    >
                      {d.namespace}:{d.name}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not a member of any dataset.</p>
              )}
            </div>
          </section>

        </>
      )}
    </main>
  )
}
