'use client'

/**
 * ConditionsDbPanel — conditions DB box for the Other search tab.
 *
 * Three modes, sharing one folder picker:
 *  - Run number: fetch one run's full record (issue #9, Phase 1).
 *  - Beam momentum: find runs with momentum in a range.
 *  - Start / stop time: find runs starting/stopping within a UTC date range.
 */

import { useEffect, useRef, useState } from 'react'
import {
  getCondbFolders, getRunConditions, searchRuns,
  CondbFolder, RunConditions, RunSearchResult, isAbortError,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, ChevronDown, ChevronUp, Copy, CheckCircle } from 'lucide-react'

type Mode = 'run' | 'momentum' | 'time'

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function formatUnixTime(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!n || Number.isNaN(n)) return '—'
  return new Date(n * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

function formatNumber(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (v === null || v === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

/** Parses "mm/dd/yyyy" as a UTC date; returns Unix seconds at 00:00:00 UTC,
 *  or at 23:59:59 UTC if `endOfDay` is set (so a "stop date" filter includes
 *  the whole day). Returns null if the string doesn't match the format. */
function parseUtcDate(input: string, endOfDay = false): number | null {
  const m = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  const ms = endOfDay
    ? Date.UTC(+yyyy, +mm - 1, +dd, 23, 59, 59)
    : Date.UTC(+yyyy, +mm - 1, +dd, 0, 0, 0)
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / 1000)
}

export function ConditionsDbPanel() {
  const [mode, setMode] = useState<Mode>('run')
  const [folders, setFolders] = useState<CondbFolder[]>([])
  const [folder, setFolder] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mode: run number
  const [runInput, setRunInput] = useState('')
  const [conditions, setConditions] = useState<RunConditions | null>(null)
  const [showFullRecord, setShowFullRecord] = useState(false)
  const [queryCopied, setQueryCopied] = useState(false)

  // Mode: beam momentum
  const [momentumMin, setMomentumMin] = useState('')
  const [momentumMax, setMomentumMax] = useState('')

  // Mode: start/stop time
  const [startDate, setStartDate] = useState('')
  const [stopDate, setStopDate] = useState('')

  // Shared: results of a range search (momentum or time mode)
  const [searchResults, setSearchResults] = useState<RunSearchResult[] | null>(null)
  const [searchTruncated, setSearchTruncated] = useState(false)

  // Tracks the current in-flight conditions-DB request. Starting a new lookup
  // aborts the previous one, so rapid successive lookups don't pile up
  // concurrent queries against ConDB/MetaCat; unmounting aborts as well.
  const inFlightRef = useRef<AbortController | null>(null)

  /** Abort any in-flight request and return a fresh signal for a new one. */
  function beginRequest(): AbortSignal {
    inFlightRef.current?.abort()
    const controller = new AbortController()
    inFlightRef.current = controller
    return controller.signal
  }

  useEffect(() => {
    const controller = new AbortController()
    getCondbFolders(controller.signal)
      .then(({ folders, default: def }) => {
        setFolders(folders)
        setFolder(def)
      })
      .catch(() => { /* folder picker is a convenience; default still works */ })
    return () => { controller.abort() }
  }, [])

  // Abort whatever is in flight if the panel unmounts.
  useEffect(() => () => { inFlightRef.current?.abort() }, [])

  function resetResults() {
    setConditions(null)
    setSearchResults(null)
    setError(null)
  }

  function switchMode(next: Mode) {
    setMode(next)
    resetResults()
  }

  const handleLookup = async () => {
    const run = parseInt(runInput, 10)
    if (!run || run <= 0) {
      setError('Enter a valid run number.')
      return
    }
    const signal = beginRequest()
    setLoading(true)
    setError(null)
    setConditions(null)
    try {
      const result = await getRunConditions(run, folder || undefined, signal)
      if (!signal.aborted) setConditions(result)
    } catch (e) {
      if (isAbortError(e) || signal.aborted) return
      setError(e instanceof Error ? e.message : 'Failed to load run conditions')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }

  const handleMomentumSearch = async () => {
    const min = parseFloat(momentumMin)
    const max = parseFloat(momentumMax)
    if (Number.isNaN(min) || Number.isNaN(max)) {
      setError('Enter both a minimum and maximum momentum.')
      return
    }
    const signal = beginRequest()
    setLoading(true)
    setError(null)
    setSearchResults(null)
    try {
      const { runs, truncated } = await searchRuns(
        [
          { field: 'beam_momentum_set', op: '>=', value: min },
          { field: 'beam_momentum_set', op: '<=', value: max },
        ],
        folder || undefined,
        signal
      )
      if (signal.aborted) return
      setSearchResults(runs)
      setSearchTruncated(truncated)
    } catch (e) {
      if (isAbortError(e) || signal.aborted) return
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }

  const handleTimeSearch = async () => {
    const start = parseUtcDate(startDate)
    const stop = parseUtcDate(stopDate, true)
    if (start === null || stop === null) {
      setError('Enter both dates as mm/dd/yyyy (UTC).')
      return
    }
    const signal = beginRequest()
    setLoading(true)
    setError(null)
    setSearchResults(null)
    try {
      const { runs, truncated } = await searchRuns(
        [
          { field: 'start_time', op: '>=', value: start },
          { field: 'start_time', op: '<=', value: stop },
        ],
        folder || undefined,
        signal
      )
      if (signal.aborted) return
      setSearchResults(runs)
      setSearchTruncated(truncated)
    } catch (e) {
      if (isAbortError(e) || signal.aborted) return
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }

  /** Clicking a search-result row loads that run's full record (mode: run). */
  const handleResultClick = (row: RunSearchResult) => {
    const tv = row.preview['run_number']?.value ?? row.results['tv']
    if (tv === undefined || tv === null) return
    const signal = beginRequest()
    setRunInput(String(tv))
    setMode('run')
    setSearchResults(null)
    setLoading(true)
    setError(null)
    getRunConditions(Number(tv), folder || undefined, signal)
      .then((c) => { if (!signal.aborted) setConditions(c) })
      .catch((e) => {
        if (isAbortError(e) || signal.aborted) return
        setError(e instanceof Error ? e.message : 'Failed to load run conditions')
      })
      .finally(() => { if (!signal.aborted) setLoading(false) })
  }

  const run = parseInt(runInput, 10)
  const runType = conditions ? conditions.preview['run_type']?.value : null

  const startTime = conditions?.preview['start_time']?.value
  const stopTime = conditions?.preview['stop_time']?.value
  const durationHours = (() => {
    const start = typeof startTime === 'number' ? startTime : parseFloat(String(startTime))
    const stop = typeof stopTime === 'number' ? stopTime : parseFloat(String(stopTime))
    if (!start || !stop || Number.isNaN(start) || Number.isNaN(stop)) return null
    return ((stop - start) / 3600).toFixed(2)
  })()
  const beamMomentum = conditions?.preview['beam_momentum_set']
  const beamPolarity = conditions?.preview['beam_polarity']?.value
  const beamText = beamMomentum?.value
    ? `${formatValue(beamMomentum.value)} ${beamMomentum.unit ?? ''}${beamPolarity ? ` (${beamPolarity})` : ''}`
    : '—'
  const detectorHv = conditions?.preview['detector_hv_set']

  const suggestedQuery = conditions?.namespace
    ? `filter dune_runshistdb() (files from ${conditions.namespace}:${conditions.namespace}_${run})` +
      (runType ? ` where runs_history.run_type = ${runType}` : '')
    : null

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <Label>Conditions database</Label>

      {/* Mode + folder selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {([
            ['run', 'Run number'],
            ['momentum', 'Beam momentum'],
            ['time', 'Start / stop time'],
          ] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded px-2 py-1 text-xs ${
                mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {folders.length > 1 && (
          <Select value={folder} onValueChange={(v) => { setFolder(v); resetResults() }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {folders.map((f) => (
                <SelectItem key={f.folder} value={f.folder}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Mode-specific inputs */}
      {mode === 'run' && (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={runInput}
            onChange={(e) => setRunInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookup() } }}
            placeholder="Run number, e.g. 28650"
            className="w-44"
          />
          <Button type="button" size="sm" onClick={handleLookup} disabled={loading || !runInput}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
          </Button>
        </div>
      )}

      {mode === 'momentum' && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Min (GeV/c)</span>
            <Input
              type="text" inputMode="decimal" value={momentumMin}
              onChange={(e) => setMomentumMin(e.target.value)}
              placeholder="e.g. 4" className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Max (GeV/c)</span>
            <Input
              type="text" inputMode="decimal" value={momentumMax}
              onChange={(e) => setMomentumMax(e.target.value)}
              placeholder="e.g. 5" className="w-28"
            />
          </div>
          <Button type="button" size="sm" onClick={handleMomentumSearch} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>
      )}

      {mode === 'time' && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Start (UTC, mm/dd/yyyy)</span>
            <Input
              type="text" value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="06/25/2024" className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Stop (UTC, mm/dd/yyyy)</span>
            <Input
              type="text" value={stopDate}
              onChange={(e) => setStopDate(e.target.value)}
              placeholder="06/26/2024" className="w-32"
            />
          </div>
          <Button type="button" size="sm" onClick={handleTimeSearch} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ---------- Run-number mode: single record ---------- */}
      {mode === 'run' && conditions && (
        <div className="flex flex-col gap-2 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex gap-1"><span className="w-24 shrink-0 text-muted-foreground">Start:</span><span>{formatUnixTime(startTime)}</span></div>
            <div className="flex gap-1"><span className="w-24 shrink-0 text-muted-foreground">Stop:</span><span>{formatUnixTime(stopTime)}</span></div>
            <div className="flex gap-1"><span className="w-24 shrink-0 text-muted-foreground">Duration:</span><span>{durationHours ? `${durationHours} h` : '—'}</span></div>
            <div className="flex gap-1"><span className="w-24 shrink-0 text-muted-foreground">Run type:</span><span>{formatValue(runType)}</span></div>
            <div className="flex gap-1"><span className="w-24 shrink-0 text-muted-foreground">Stream:</span><span>{formatValue(conditions.preview['data_stream']?.value)}</span></div>
            <div className="flex gap-1"><span className="w-24 shrink-0 text-muted-foreground">Beam:</span><span>{beamText}</span></div>
            <div className="flex gap-1"><span className="w-24 shrink-0 text-muted-foreground">Detector HV:</span><span>{detectorHv?.value ? `${formatNumber(detectorHv.value)} ${detectorHv.unit ?? ''}` : '—'}</span></div>
            <div className="flex gap-1"><span className="w-24 shrink-0 text-muted-foreground">Software:</span><span>{formatValue(conditions.preview['software_version']?.value)}</span></div>
          </div>

          <button
            type="button"
            onClick={() => setShowFullRecord((v) => !v)}
            className="flex w-fit items-center gap-1 text-xs text-blue-500 hover:underline"
          >
            {showFullRecord ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showFullRecord ? 'Hide' : 'Show'} full record ({Object.keys(conditions.results).length} fields)
          </button>

          {showFullRecord && (
            <div className="max-h-64 overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(conditions.results).map(([key, value]) => {
                    const meta = conditions.fieldMetadata[key]
                    return (
                      <tr key={key} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-2 py-1 align-top">
                          <div className="text-muted-foreground">{meta?.label ?? key}</div>
                          {meta?.label && (
                            <div className="font-mono text-[10px] text-muted-foreground/60">{key}</div>
                          )}
                        </td>
                        <td className="whitespace-pre-wrap break-all px-2 py-1 font-mono">
                          {formatValue(value)}{meta?.unit ? ` ${meta.unit}` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {suggestedQuery ? (
            <div className="flex flex-col gap-1.5">
              <code className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                {suggestedQuery}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(suggestedQuery).then(() => {
                    setQueryCopied(true)
                    setTimeout(() => setQueryCopied(false), 2000)
                  })
                }}
              >
                {queryCopied
                  ? <><CheckCircle className="h-3.5 w-3.5 text-green-500" /> Copied</>
                  : <><Copy className="h-3.5 w-3.5" /> Copy query</>}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No MetaCat namespace configured for this folder yet, so a suggested
              query can&apos;t be built.
            </p>
          )}
        </div>
      )}

      {/* ---------- Momentum / time modes: results table ---------- */}
      {(mode === 'momentum' || mode === 'time') && searchResults && (
        <div className="flex flex-col gap-1.5 text-sm">
          {searchResults.length === 0 ? (
            <p className="text-muted-foreground">No matching runs found.</p>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">Run</th>
                      <th className="px-2 py-1 text-left">Run type</th>
                      <th className="px-2 py-1 text-left">
                        {mode === 'momentum' ? 'Beam momentum' : 'Start'}
                      </th>
                      <th className="px-2 py-1 text-left">Stream</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((row) => {
                      const tv = row.preview['run_number']?.value ?? row.results['tv']
                      return (
                        <tr
                          key={String(tv)}
                          onClick={() => handleResultClick(row)}
                          className="cursor-pointer border-b last:border-0 hover:bg-accent"
                        >
                          <td className="px-2 py-1 font-mono">{formatValue(tv)}</td>
                          <td className="px-2 py-1">{formatValue(row.preview['run_type']?.value)}</td>
                          <td className="px-2 py-1">
                            {mode === 'momentum'
                              ? formatValue(row.preview['beam_momentum_set']?.value)
                              : formatUnixTime(row.preview['start_time']?.value)}
                          </td>
                          <td className="px-2 py-1">{formatValue(row.preview['data_stream']?.value)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                {searchResults.length} run{searchResults.length === 1 ? '' : 's'} found
                {searchTruncated ? ' (showing first 200 — narrow the range for a complete list)' : ''}.
                Click a row for the full record.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
